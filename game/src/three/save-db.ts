
import { reportError } from './crash';
import { slotKey, type SlotId } from './save-slots';
import { Stalled, withinMs } from '../stall';

export type LogEntry = { kind: string; turn: number } & Record<string, unknown>;

export type LogRecord = LogEntry & { runId: string; seq: number };

export type SaveBackend = {
  readAll(): Promise<Map<SlotId, unknown>>;
  put(slot: SlotId, envelope: unknown): Promise<void>;
  remove(slot: SlotId): Promise<void>;
  appendLog(runId: string, entries: readonly LogEntry[]): Promise<void>;
  readLog(runId: string): Promise<LogRecord[]>;
};

const SAVES = 'saves';
const LOG = 'log';

export class DatabaseLost extends Error {
  constructor(name: string, cause: unknown) {
    super(`The browser lost the save database ${name}: ${messageOf(cause)}`, { cause });
    this.name = 'DatabaseLost';
  }
}

export async function idbBackend(name: string): Promise<SaveBackend> {
  const connection = new Connection(name);
  await connection.current();
  return {
    readAll: () => connection.run(SAVES, 'readonly', (store, finish, guard) => {
      const keys = store.getAllKeys();
      const values = store.getAll();
      values.onsuccess = guard(() => finish(new Map(keys.result.map((key, i) => [key as SlotId, values.result[i]]))));
    }),
    put: (slot, envelope) => connection.run(SAVES, 'readwrite', (store) => { store.put(envelope, slot); }),
    remove: (slot) => connection.run(SAVES, 'readwrite', (store) => { store.delete(slot); }),
    appendLog: (runId, entries) => connection.run(LOG, 'readwrite', (store, _finish, guard) => {
      const last = store.openCursor(runRange(runId), 'prev');
      last.onsuccess = guard(() => {
        const next = last.result ? (last.result.value as LogRecord).seq + 1 : 0;
        entries.forEach((entry, i) => store.add({ ...entry, runId, seq: next + i }));
      });
    }),
    readLog: (runId) => connection.run(LOG, 'readonly', (store, finish, guard) => {
      const records = store.getAll(runRange(runId));
      records.onsuccess = guard(() => finish(records.result as LogRecord[]));
    }),
  };
}

type Guard = (handler: () => void) => () => void;

type Unit<T> = (store: IDBObjectStore, finish: (value: T) => void, guard: Guard) => void;

class Connection {
  private held: Promise<IDBDatabase> | null = null;

  constructor(private readonly name: string) {}

  current(): Promise<IDBDatabase> {
    if (this.held) return this.held;
    const opening = opened(this.name).then((db) => {
      db.onclose = () => this.drop(opening);
      db.onversionchange = () => {
        db.close();
        this.drop(opening);
      };
      return db;
    });
    this.held = opening;
    opening.catch(() => this.drop(opening));
    return opening;
  }

  async run<T>(store: string, mode: IDBTransactionMode, unit: Unit<T>): Promise<T> {
    const held = this.current();
    try {
      return await transacted(await held, store, mode, unit);
    } catch (err) {
      if (!isConnectionFailure(err)) throw err;
      this.drop(held);
    }
    const fresh = this.current();
    try {
      return await transacted(await fresh, store, mode, unit);
    } catch (err) {
      if (!isConnectionFailure(err)) throw err;
      this.drop(fresh);
      throw new DatabaseLost(this.name, err);
    }
  }

  private drop(connection: Promise<IDBDatabase>): void {
    if (this.held !== connection) return;
    this.held = null;
    connection.then((db) => db.close(), () => {});
  }
}

const CONNECTION_FAILURES = new Set(['InvalidStateError', 'UnknownError', 'AbortError']);

function isConnectionFailure(err: unknown): boolean {
  return err instanceof OpenRefused || (err instanceof DOMException && CONNECTION_FAILURES.has(err.name));
}

function transacted<T>(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, unit: Unit<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let value: T;
    let failure: unknown = null;
    let tx: IDBTransaction | null = null;
    const fail = (err: unknown) => {
      failure ??= err;
      reject(failure);
      abortQuietly(tx);
    };
    const guard: Guard = (handler) => () => {
      try {
        handler();
      } catch (err) {
        fail(err);
      }
    };
    try {
      tx = db.transaction(storeName, mode);
      const started = tx;
      started.oncomplete = () => resolve(value);
      started.onerror = (event) => { failure ??= (event.target as IDBRequest | null)?.error ?? null; };
      started.onabort = () => reject(started.error ?? failure ?? new DOMException(`The ${storeName} transaction was aborted`, 'AbortError'));
      unit(started.objectStore(storeName), (result) => { value = result; }, guard);
    } catch (err) {
      fail(err);
    }
  });
}

function abortQuietly(tx: IDBTransaction | null): void {
  try {
    tx?.abort();
  } catch {
    return;
  }
}

function runRange(runId: string): IDBKeyRange {
  return IDBKeyRange.bound([runId, -Infinity], [runId, Infinity]);
}

class OpenRefused extends Error {
  constructor(cause: unknown) {
    super(`The game keeps saves in IndexedDB, and this browser refused it: ${messageOf(cause)}`, { cause });
    this.name = 'OpenRefused';
  }
}

async function opened(name: string): Promise<IDBDatabase> {
  const open = indexedDB.open(name, 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore(SAVES);
    open.result.createObjectStore(LOG, { keyPath: ['runId', 'seq'] });
  };
  try {
    return await withinMs(request(open), IDB_OPEN_MS, `indexedDB.open(${name})`);
  } catch (err) {
    if (err instanceof Stalled) open.onsuccess = () => open.result.close();
    throw new OpenRefused(err);
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const IDB_OPEN_MS = 5000;
const IDB_RETRY_MS = 200;

export async function openSaves(name: string, storage: Storage, slots: readonly SlotId[]): Promise<SaveSlots> {
  const local = () => storageBackend(storage, name, slots);
  const idb = await idbBackendWithRetry(name);
  if (!idb) return SaveSlots.open(local(), null, name, slots);
  try {
    return await SaveSlots.open(idb, storage, name, slots, local());
  } catch (err) {
    if (!(err instanceof DatabaseLost)) throw err;
    warnLocalStorage(err);
    return SaveSlots.open(local(), null, name, slots);
  }
}

async function idbBackendWithRetry(name: string): Promise<SaveBackend | null> {
  try {
    return await idbBackend(name);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, IDB_RETRY_MS));
  }
  try {
    return await idbBackend(name);
  } catch (err) {
    warnLocalStorage(err);
    return null;
  }
}

function warnLocalStorage(err: unknown): void {
  console.warn(`${messageOf(err)}. Saves go to local storage for this session.`);
}

export function storageBackend(storage: Storage, base: string, slots: readonly SlotId[]): SaveBackend {
  const { appendLog, readLog } = memoryBackend();
  return {
    readAll: async () => {
      const saves = new Map<SlotId, unknown>();
      for (const slot of slots) {
        const raw = storage.getItem(slotKey(base, slot));
        if (raw !== null) saves.set(slot, parsedOrRaw(raw));
      }
      return saves;
    },
    put: async (slot, envelope) => { storage.setItem(slotKey(base, slot), JSON.stringify(envelope)); },
    remove: async (slot) => { storage.removeItem(slotKey(base, slot)); },
    appendLog,
    readLog,
  };
}

export function memoryBackend(): SaveBackend {
  const saves = new Map<SlotId, unknown>();
  const log: LogRecord[] = [];
  return {
    readAll: async () => new Map([...saves].map(([slot, envelope]) => [slot, structuredClone(envelope)])),
    put: async (slot, envelope) => { saves.set(slot, structuredClone(envelope)); },
    remove: async (slot) => { saves.delete(slot); },
    appendLog: async (runId, entries) => {
      const next = Math.max(-1, ...log.filter((r) => r.runId === runId).map((r) => r.seq)) + 1;
      log.push(...entries.map((entry, i) => structuredClone({ ...entry, runId, seq: next + i })));
    },
    readLog: async (runId) => log.filter((r) => r.runId === runId),
  };
}

type Fallback = { backend: SaveBackend; slots: readonly SlotId[] };

export class SaveSlots {
  onError: (err: unknown) => void = reportError;
  private pending = new Set<Promise<void>>();
  private lostDatabase = false;

  constructor(private backend: SaveBackend, private envelopes: Map<SlotId, unknown>, private fallback: Fallback | null = null) {}

  static async open(backend: SaveBackend, legacy: Storage | null, base: string, slots: readonly SlotId[], fallback: SaveBackend | null = null): Promise<SaveSlots> {
    if (legacy) await moveLegacySaves(backend, legacy, base, slots);
    return new SaveSlots(backend, await backend.readAll(), fallback ? { backend: fallback, slots } : null);
  }

  get(slot: SlotId): unknown {
    const envelope = this.envelopes.get(slot);
    return envelope === undefined ? null : structuredClone(envelope);
  }

  has(slot: SlotId): boolean {
    return this.envelopes.has(slot);
  }

  put(slot: SlotId, envelope: unknown): void {
    const copy = structuredClone(envelope);
    this.envelopes.set(slot, copy);
    this.track(() => this.backend.put(slot, copy));
  }

  remove(slot: SlotId): void {
    this.envelopes.delete(slot);
    this.track(() => this.backend.remove(slot));
  }

  async appendLog(runId: string, entries: readonly LogEntry[]): Promise<void> {
    try {
      await this.backend.appendLog(runId, entries);
    } catch (err) {
      if (err instanceof DatabaseLost) this.lose(err);
      throw err;
    }
  }

  async readLog(runId: string): Promise<LogRecord[]> {
    try {
      return await this.backend.readLog(runId);
    } catch (err) {
      if (err instanceof DatabaseLost) this.lose(err);
      throw err;
    }
  }

  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending);
  }

  private track(write: () => Promise<void>): void {
    const done = Promise.resolve().then(write).catch((err) => this.failed(err)).finally(() => this.pending.delete(done));
    this.pending.add(done);
  }

  private failed(err: unknown): void {
    if (err instanceof DatabaseLost) this.lose(err);
    else this.onError(err);
  }

  private lose(err: DatabaseLost): void {
    if (this.lostDatabase) return;
    if (!this.fallback) {
      this.onError(err);
      return;
    }
    const { backend, slots } = this.fallback;
    this.lostDatabase = true;
    this.fallback = null;
    this.backend = backend;
    warnLocalStorage(err);
    for (const slot of slots) {
      const envelope = this.envelopes.get(slot);
      this.track(() => (envelope === undefined ? backend.remove(slot) : backend.put(slot, envelope)));
    }
  }
}

async function moveLegacySaves(backend: SaveBackend, legacy: Storage, base: string, slots: readonly SlotId[]): Promise<void> {
  const stored = await backend.readAll();
  for (const slot of slots) {
    const key = slotKey(base, slot);
    const raw = legacy.getItem(key);
    if (raw === null) continue;
    const envelope = parsedOrRaw(raw);
    if (!stored.has(slot) || savedAtOf(envelope) > savedAtOf(stored.get(slot))) await backend.put(slot, envelope);
    legacy.removeItem(key);
  }
}

function savedAtOf(envelope: unknown): number {
  const savedAt = (envelope as { savedAt?: unknown } | null)?.savedAt;
  return typeof savedAt === 'number' ? savedAt : 0;
}

function parsedOrRaw(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
