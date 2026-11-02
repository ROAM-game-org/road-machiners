import { reportError } from './crash';
import { Connection, DatabaseLost } from './idb-connection';

export type PictureKind = 'portrait' | 'body' | 'sprite';

export type PictureRef = { kind: PictureKind; key: string };

type StoredKey = readonly [version: string, kind: PictureKind, key: string];

export type PictureBackend = {
  getMany(keys: readonly StoredKey[]): Promise<unknown[]>;
  put(key: StoredKey, record: unknown): Promise<void>;
  remove(key: StoredKey): Promise<void>;
  dropOtherVersions(version: string): Promise<void>;
};

export class CorruptPictureError extends Error {
  constructor(kind: PictureKind, key: string, why: string) {
    super(`The stored ${kind} picture ${key} is corrupt: ${why}`);
    this.name = 'CorruptPictureError';
  }
}

declare const __SAVE_SCOPE__: string;

export const PICTURE_DB = __SAVE_SCOPE__ === '' ? 'roam.pictures' : `roam.pictures.${__SAVE_SCOPE__}`;

const PICTURES = 'pictures';

const PICTURE_SCHEMA = {
  version: 1,
  upgrade(db: IDBDatabase): void {
    db.createObjectStore(PICTURES);
  },
};

export function idbPictureBackend(name: string): PictureBackend {
  const connection = new Connection(name, PICTURE_SCHEMA);
  return {
    getMany: (keys) => (keys.length === 0 ? Promise.resolve([]) : connection.run(PICTURES, 'readonly', (store, finish, guard) => {
      const gets = keys.map((key) => store.get([...key]));
      gets[gets.length - 1].onsuccess = guard(() => finish(gets.map((get) => get.result)));
    })),
    put: (key, record) => connection.run(PICTURES, 'readwrite', (store) => { store.put(record, [...key]); }),
    remove: (key) => connection.run(PICTURES, 'readwrite', (store) => { store.delete([...key]); }),
    dropOtherVersions: (version) => connection.run(PICTURES, 'readwrite', (store, _finish, guard) => {
      const cursor = store.openKeyCursor();
      cursor.onsuccess = guard(() => {
        const at = cursor.result;
        if (!at) return;
        if ((at.key as unknown as StoredKey)[0] !== version) store.delete(at.primaryKey);
        at.continue();
      });
    }),
  };
}

export function memoryPictureBackend(): PictureBackend {
  const records = new Map<string, unknown>();
  const slot = (key: StoredKey) => JSON.stringify(key);
  return {
    getMany: async (keys) => keys.map((key) => structuredClone(records.get(slot(key)))),
    put: async (key, record) => { records.set(slot(key), structuredClone(record)); },
    remove: async (key) => { records.delete(slot(key)); },
    dropOtherVersions: async (version) => {
      for (const slotKey of [...records.keys()]) if ((JSON.parse(slotKey) as StoredKey)[0] !== version) records.delete(slotKey);
    },
  };
}

export class PictureStore {
  onError: (err: unknown) => void = reportError;
  private opening: Promise<void> | null = null;
  private lostDatabase = false;
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly backend: PictureBackend, private readonly version: string) {}

  readMany(wanted: readonly PictureRef[]): Promise<unknown[]> {
    return this.unlessLost(wanted.map(() => undefined), async () => {
      await this.open();
      return this.backend.getMany(wanted.map((ref) => this.stored(ref)));
    });
  }

  save(kind: PictureKind, key: string, record: Promise<unknown>): void {
    this.track(async () => {
      const made = await record;
      await this.unlessLost(undefined, async () => {
        await this.open();
        await this.backend.put(this.stored({ kind, key }), made);
      });
    });
  }

  discard(kind: PictureKind, key: string): void {
    this.track(() => this.unlessLost(undefined, async () => {
      await this.open();
      await this.backend.remove(this.stored({ kind, key }));
    }));
  }

  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending);
  }

  private stored(ref: PictureRef): StoredKey {
    return [this.version, ref.kind, ref.key];
  }

  private open(): Promise<void> {
    this.opening ??= this.backend.dropOtherVersions(this.version);
    return this.opening;
  }

  private async unlessLost<T>(whenLost: T, run: () => Promise<T>): Promise<T> {
    if (this.lostDatabase) return whenLost;
    try {
      return await run();
    } catch (err) {
      if (!(err instanceof DatabaseLost)) throw err;
      this.lose(err);
      return whenLost;
    }
  }

  private lose(err: DatabaseLost): void {
    if (this.lostDatabase) return;
    this.lostDatabase = true;
    this.onError(err);
  }

  private track(work: () => Promise<void>): void {
    const done = Promise.resolve().then(work).catch((err) => this.onError(err)).finally(() => this.pending.delete(done));
    this.pending.add(done);
  }
}
