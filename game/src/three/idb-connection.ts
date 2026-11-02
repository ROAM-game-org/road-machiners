import { Stalled, withinMs } from '../stall';

export const IDB_OPEN_MS = 5000;

export type Guard = (handler: () => void) => () => void;

export type Unit<T> = (store: IDBObjectStore, finish: (value: T) => void, guard: Guard) => void;

export type Schema = { version: number; upgrade: (db: IDBDatabase) => void };

export class DatabaseLost extends Error {
  constructor(name: string, cause: unknown) {
    super(`The browser lost the database ${name}: ${messageOf(cause)}`, { cause });
    this.name = 'DatabaseLost';
  }
}

export class OpenRefused extends Error {
  constructor(name: string, cause: unknown) {
    super(`The browser refused the IndexedDB database ${name}: ${messageOf(cause)}`, { cause });
    this.name = 'OpenRefused';
  }
}

export class Connection {
  private held: Promise<IDBDatabase> | null = null;

  constructor(private readonly name: string, private readonly schema: Schema) {}

  current(): Promise<IDBDatabase> {
    if (this.held) return this.held;
    const opening = this.opened().then((db) => {
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

  private async opened(): Promise<IDBDatabase> {
    const open = indexedDB.open(this.name, this.schema.version);
    open.onupgradeneeded = () => this.schema.upgrade(open.result);
    try {
      return await withinMs(request(open), IDB_OPEN_MS, `indexedDB.open(${this.name})`);
    } catch (err) {
      if (err instanceof Stalled) open.onsuccess = () => open.result.close();
      throw new OpenRefused(this.name, err);
    }
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

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
