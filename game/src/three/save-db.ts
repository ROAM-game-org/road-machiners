
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

export async function idbBackend(name: string): Promise<SaveBackend> {
  const connection = new Connection(name);
  await connection.current();
  return {
    readAll: async () => {
      const tx = await connection.transaction(SAVES, 'readonly');
      const [keys, values] = await Promise.all([request(tx.objectStore(SAVES).getAllKeys()), request(tx.objectStore(SAVES).getAll())]);
      return new Map(keys.map((key, i) => [key as SlotId, values[i]]));
    },
    put: (slot, envelope) => written(connection, SAVES, (store) => store.put(envelope, slot)),
    remove: (slot) => written(connection, SAVES, (store) => store.delete(slot)),
    appendLog: (runId, entries) => written(connection, LOG, (store) => {
      const last = store.openCursor(runRange(runId), 'prev');
      last.onsuccess = () => {
        const next = last.result ? (last.result.value as LogRecord).seq + 1 : 0;
        entries.forEach((entry, i) => store.add({ ...entry, runId, seq: next + i }));
      };
    }),
    readLog: async (runId) => {
      const tx = await connection.transaction(LOG, 'readonly');
      return request(tx.objectStore(LOG).getAll(runRange(runId)));
    },
  };
}

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

  async transaction(stores: string, mode: IDBTransactionMode): Promise<IDBTransaction> {
    const held = this.current();
    try {
      return (await held).transaction(stores, mode);
    } catch (err) {
      if (!isClosing(err)) throw err;
      this.drop(held);
      return (await this.current()).transaction(stores, mode);
    }
  }

  private drop(connection: Promise<IDBDatabase>): void {
    if (this.held === connection) this.held = null;
  }
}

function isClosing(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === 'InvalidStateError';
}

function runRange(runId: string): IDBKeyRange {
  return IDBKeyRange.bound([runId, -Infinity], [runId, Infinity]);
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
    throw new Error(`The game keeps saves in IndexedDB, and this browser refused it: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function written(connection: Connection, store: string, write: (store: IDBObjectStore) => void): Promise<void> {
  const tx = await connection.transaction(store, 'readwrite');
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error(`The ${store} write was aborted`));
  });
  write(tx.objectStore(store));
  return done;
}

export const IDB_OPEN_MS = 5000;
const IDB_RETRY_MS = 200;

export async function openSaves(name: string, storage: Storage, slots: readonly SlotId[]): Promise<SaveSlots> {
  const idb = await idbBackendWithRetry(name);
  if (idb) return SaveSlots.open(idb, storage, name, slots);
  return SaveSlots.open(storageBackend(storage, name, slots), null, name, slots);
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
    console.warn(`${err instanceof Error ? err.message : String(err)}. Saves go to local storage for this session.`);
    return null;
  }
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

export class SaveSlots {
  onError: (err: unknown) => void = reportError;
  private pending = new Set<Promise<void>>();

  constructor(readonly backend: SaveBackend, private envelopes: Map<SlotId, unknown>) {}

  static async open(backend: SaveBackend, legacy: Storage | null, base: string, slots: readonly SlotId[]): Promise<SaveSlots> {
    if (!legacy) return new SaveSlots(backend, await backend.readAll());
    const stored = await backend.readAll();
    for (const slot of slots) {
      const key = slotKey(base, slot);
      const raw = legacy.getItem(key);
      if (raw === null) continue;
      const envelope = parsedOrRaw(raw);
      if (!stored.has(slot) || savedAtOf(envelope) > savedAtOf(stored.get(slot))) await backend.put(slot, envelope);
      legacy.removeItem(key);
    }
    return new SaveSlots(backend, await backend.readAll());
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

  async flush(): Promise<void> {
    await Promise.all(this.pending);
  }

  private track(write: () => Promise<void>): void {
    const done = Promise.resolve().then(write).catch((err) => this.onError(err)).finally(() => this.pending.delete(done));
    this.pending.add(done);
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
