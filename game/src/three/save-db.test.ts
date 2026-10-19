import { defaultSetup } from '../sim/settings';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startKit } from '../data/start';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf, writeSave } from './save';
import { IDB_OPEN_MS, idbBackend, memoryBackend, openSaves, SaveSlots, storageBackend, type SaveBackend } from './save-db';
import { allSlots, slotKey } from './save-slots';

const SLOTS = allSlots(3);

function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('SaveSlots.open', () => {
  it('moves every local storage save into the backend, loads it, and deletes the local storage key', async () => {
    const legacy = makeStorage();
    const world = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    legacy.setItem('roam.save', JSON.stringify({ ...saveOf(world), savedAt: 5 }));
    legacy.setItem('roam.save:slot2', JSON.stringify({ ...saveOf({ ...world, turn: 9 }), savedAt: 6 }));
    legacy.setItem('roam.tips', '[]');
    const backend = memoryBackend();

    const slots = await SaveSlots.open(backend, legacy, 'roam.save', SLOTS);

    expect(loadWorld(slots, 'auto', TEST_MAP)).toEqual(world);
    expect(loadWorld(slots, 'slot2', TEST_MAP)?.turn).toBe(9);
    expect([legacy.getItem('roam.save'), legacy.getItem('roam.save:slot2'), legacy.getItem('roam.tips')]).toEqual([null, null, '[]']);
    expect([...(await backend.readAll()).keys()].sort()).toEqual(['auto', 'slot2']);
  });

  it('keeps a newer database save over an older local storage one, and deletes the local storage key', async () => {
    const backend = memoryBackend();
    await backend.put('auto', { savedAt: 50, world: { turn: 9 } });
    const legacy = makeStorage();
    legacy.setItem('roam.save', JSON.stringify({ savedAt: 10, world: { turn: 3 } }));
    legacy.setItem('roam.save:day', JSON.stringify({ savedAt: 90, world: { turn: 4 } }));
    await backend.put('day', { savedAt: 60, world: { turn: 2 } });

    const slots = await SaveSlots.open(backend, legacy, 'roam.save', SLOTS);

    expect(slots.get('auto')).toEqual({ savedAt: 50, world: { turn: 9 } });
    expect(slots.get('day')).toEqual({ savedAt: 90, world: { turn: 4 } });
    expect([legacy.getItem('roam.save'), legacy.getItem('roam.save:day')]).toEqual([null, null]);
  });

  it('moves a local storage save that does not parse as its text', async () => {
    const legacy = makeStorage();
    legacy.setItem('roam.save:day', '{"format":');
    const slots = await SaveSlots.open(memoryBackend(), legacy, 'roam.save', SLOTS);
    expect(slots.get('day')).toBe('{"format":');
  });

  it('opens what an earlier session saved', async () => {
    const backend = memoryBackend();
    const world = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    const first = await SaveSlots.open(backend, makeStorage(), 'roam.save', SLOTS);
    writeSave(first, 'slot1', world, 'r', 1);
    await first.flush();

    const reopened = await SaveSlots.open(backend, makeStorage(), 'roam.save', SLOTS);

    expect(loadWorld(reopened, 'slot1', TEST_MAP)).toEqual(world);
  });
});

describe('SaveSlots', () => {
  it('hands out copies, so changing a loaded save leaves the slot as saved', () => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { world: { turn: 3 } });
    (slots.get('auto') as { world: { turn: number } }).world.turn = 99;
    expect(slots.get('auto')).toEqual({ world: { turn: 3 } });
  });

  it('flushes only once every write has landed', async () => {
    const backend = memoryBackend();
    let land = () => {};
    const slow: SaveBackend = { ...backend, put: (slot, envelope) => new Promise((resolve) => { land = () => resolve(backend.put(slot, envelope)); }) };
    const slots = new SaveSlots(slow, new Map());
    slots.put('auto', { world: { turn: 3 } });
    let flushed = false;
    const flush = slots.flush().then(() => { flushed = true; });
    await new Promise((resolve) => setTimeout(resolve));
    expect(flushed).toBe(false);
    land();
    await flush;
    expect((await backend.readAll()).get('auto')).toEqual({ world: { turn: 3 } });
  });

  it('sends a refused write to onError and keeps the backend as it was', async () => {
    const backend = memoryBackend();
    await backend.put('auto', { world: { turn: 3 } });
    const refusing: SaveBackend = { ...backend, put: () => Promise.reject(new Error('Quota exceeded')) };
    const slots = new SaveSlots(refusing, await backend.readAll());
    const errors: unknown[] = [];
    slots.onError = (err) => errors.push(err);

    slots.put('auto', { world: { turn: 4 } });
    await new Promise((resolve) => setTimeout(resolve));

    expect(errors.map((e) => (e as Error).message)).toEqual(['Quota exceeded']);
    expect((await backend.readAll()).get('auto')).toEqual({ world: { turn: 3 } });
  });
});

describe('SaveSlots with a backend that throws', () => {
  it('sends a synchronous throw to onError once and keeps the envelope', async () => {
    const throwing: SaveBackend = { ...memoryBackend(), put: () => { throw new Error('closing'); } };
    const slots = new SaveSlots(throwing, new Map());
    const errors: unknown[] = [];
    slots.onError = (err) => errors.push(err);

    expect(() => slots.put('auto', { turn: 5 })).not.toThrow();
    await slots.flush();

    expect(errors.map((e) => (e as Error).message)).toEqual(['closing']);
    expect(slots.get('auto')).toEqual({ turn: 5 });
  });
});

describe('idbBackend writes', () => {
  afterEach(() => vi.unstubAllGlobals());

  type StubDb = {
    index: number;
    puts: unknown[];
    closing: boolean;
    onclose?: () => void;
    onversionchange?: () => void;
    transaction: (...args: unknown[]) => unknown;
    close: () => void;
  };

  function stubIndexedDb(transactionArgs: unknown[][] = [], closedAtOpen = (_index: number) => false) {
    const dbs: StubDb[] = [];
    const store = (db: StubDb) => ({
      put: (envelope: unknown) => { db.puts.push(envelope); return {}; },
      add: () => ({}),
      delete: () => ({}),
      openCursor: () => ({}),
      getAll: () => {
        const req: { result: unknown[]; onsuccess?: () => void } = { result: [] };
        setTimeout(() => req.onsuccess?.());
        return req;
      },
      getAllKeys: () => {
        const req: { result: unknown[]; onsuccess?: () => void } = { result: [] };
        setTimeout(() => req.onsuccess?.());
        return req;
      },
    });
    const makeDb = (index: number): StubDb => {
      const db: StubDb = {
        index,
        puts: [],
        closing: closedAtOpen(index),
        close: () => { db.closing = true; },
        transaction: (...args: unknown[]) => {
          transactionArgs.push(args);
          if (args.length > 2) throw new Error('This browser aborts a transaction with options');
          if (db.closing) throw new DOMException('The database connection is closing.', 'InvalidStateError');
          const tx: { oncomplete?: () => void; objectStore: () => unknown } = { objectStore: () => store(db) };
          setTimeout(() => tx.oncomplete?.());
          return tx;
        },
      };
      return db;
    };
    const open = vi.fn(() => {
      const db = makeDb(dbs.length);
      dbs.push(db);
      const request: { result: unknown; onsuccess?: () => void } = { result: db };
      setTimeout(() => request.onsuccess?.());
      return request;
    });
    vi.stubGlobal('indexedDB', { open });
    return { dbs, open };
  }

  it('opens each write transaction with the default options', async () => {
    const transactionArgs: unknown[][] = [];
    stubIndexedDb(transactionArgs);
    const backend = await idbBackend('roam-test');

    await backend.put('auto', { world: { turn: 1 } });
    await backend.remove('auto');

    expect(transactionArgs).toEqual([['saves', 'readwrite'], ['saves', 'readwrite']]);
  });

  it('reopens and writes when the connection is closing', async () => {
    const { dbs, open } = stubIndexedDb();
    const backend = await idbBackend('roam-test');
    dbs[0].closing = true;

    await backend.put('auto', { world: { turn: 2 } });

    expect(open).toHaveBeenCalledTimes(2);
    expect(dbs[1].puts).toEqual([{ world: { turn: 2 } }]);
  });

  it('reopens after the browser closes the connection', async () => {
    const { dbs, open } = stubIndexedDb();
    const backend = await idbBackend('roam-test');
    dbs[0].onclose?.();

    await backend.put('auto', { world: { turn: 3 } });

    expect(open).toHaveBeenCalledTimes(2);
    expect(dbs[0].puts).toEqual([]);
    expect(dbs[1].puts).toEqual([{ world: { turn: 3 } }]);
  });

  it('a closed connection rejects instead of throwing', async () => {
    const { open, dbs } = stubIndexedDb([], () => true);
    const backend = await idbBackend('roam-test');

    let promise: Promise<void> | undefined;
    expect(() => { promise = backend.put('auto', {}); }).not.toThrow();
    await expect(promise).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(open).toHaveBeenCalledTimes(2);
    expect(dbs).toHaveLength(2);
  });

  it('writes during one reopen open once and keep their order', async () => {
    const { dbs, open } = stubIndexedDb();
    const backend = await idbBackend('roam-test');
    dbs[0].closing = true;

    await Promise.all([1, 2, 3].map((turn) => backend.put('auto', { turn })));

    expect(open).toHaveBeenCalledTimes(2);
    expect(dbs[1].puts).toEqual([{ turn: 1 }, { turn: 2 }, { turn: 3 }]);
  });

  it('a version change closes the connection and the next write reopens', async () => {
    const { dbs, open } = stubIndexedDb();
    const backend = await idbBackend('roam-test');
    dbs[0].onversionchange?.();

    await backend.put('auto', { turn: 4 });

    expect(dbs[0].closing).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
    expect(dbs[1].puts).toEqual([{ turn: 4 }]);
  });

  it('reads reopen too', async () => {
    vi.stubGlobal('IDBKeyRange', { bound: () => ({}) });
    const { dbs, open } = stubIndexedDb();
    const backend = await idbBackend('roam-test');
    dbs[0].closing = true;
    expect(await backend.readAll()).toEqual(new Map());
    dbs[1].closing = true;
    expect(await backend.readLog('run')).toEqual([]);
    expect(open).toHaveBeenCalledTimes(3);
  });
});

describe('storageBackend', () => {
  const KEY = 'roam.save';

  it('round trips a save and removes it', async () => {
    const storage = makeStorage();
    await storageBackend(storage, KEY, SLOTS).put('auto', { savedAt: 5, world: { turn: 1 } });
    expect((await storageBackend(storage, KEY, SLOTS).readAll()).get('auto')).toEqual({ savedAt: 5, world: { turn: 1 } });
    await storageBackend(storage, KEY, SLOTS).remove('auto');
    expect(storage.length).toBe(0);
  });

  it('reads text that does not parse as its text', async () => {
    const storage = makeStorage();
    storage.setItem(slotKey(KEY, 'auto'), '{broken');
    expect((await storageBackend(storage, KEY, SLOTS).readAll()).get('auto')).toBe('{broken');
  });

  it('reports a refused write and keeps the mirror', async () => {
    const storage = makeStorage();
    storage.setItem = () => { throw new Error('Quota exceeded'); };
    const slots = await SaveSlots.open(storageBackend(storage, KEY, SLOTS), null, KEY, SLOTS);
    const errors: unknown[] = [];
    slots.onError = (err) => errors.push(err);
    slots.put('auto', { savedAt: 1 });
    await slots.flush();
    expect(errors.map((e) => (e as Error).message)).toEqual(['Quota exceeded']);
    expect(slots.get('auto')).toEqual({ savedAt: 1 });
  });

  it('keeps the run log in memory', async () => {
    const storage = makeStorage();
    const backend = storageBackend(storage, KEY, SLOTS);
    await backend.appendLog('r', [{ kind: 'a', turn: 1, day: 1 }]);
    await backend.appendLog('r', [{ kind: 'b', turn: 2, day: 1 }]);
    expect((await backend.readLog('r')).map((r) => r.seq)).toEqual([0, 1]);
    expect(storage.length).toBe(0);
  });

  it('is moved into a database on a later boot, keeping the newer save', async () => {
    const storage = makeStorage();
    await storageBackend(storage, KEY, SLOTS).put('auto', { savedAt: 9 });
    const database = memoryBackend();
    await database.put('auto', { savedAt: 3 });
    const slots = await SaveSlots.open(database, storage, KEY, SLOTS);
    expect(slots.get('auto')).toEqual({ savedAt: 9 });
    expect(storage.length).toBe(0);
  });
});

describe('openSaves', () => {
  const KEY = 'roam.save';
  afterEach(() => vi.unstubAllGlobals());

  function stubOpen(refusals: number): { opens: () => number; saved: Map<string, unknown> } {
    let opens = 0;
    const saved = new Map<string, unknown>();
    const fire = <T>(result: T) => {
      const req: { result: T; onsuccess?: () => void } = { result };
      setTimeout(() => req.onsuccess?.());
      return req;
    };
    const store = {
      getAllKeys: () => fire([...saved.keys()]),
      getAll: () => fire([...saved.values()]),
      put: (value: unknown, key: string) => { saved.set(key, value); return {}; },
      delete: (key: string) => { saved.delete(key); return {}; },
    };
    const db = {
      transaction: () => {
        const tx: { oncomplete?: () => void; objectStore: () => typeof store } = { objectStore: () => store };
        setTimeout(() => tx.oncomplete?.());
        return tx;
      },
    };
    vi.stubGlobal('indexedDB', {
      open: () => {
        opens += 1;
        const refused = opens <= refusals;
        const open: { result: unknown; error: unknown; onsuccess?: () => void; onerror?: () => void } = {
          result: db,
          error: new DOMException('The operation was aborted.', 'AbortError'),
        };
        setTimeout(() => (refused ? open.onerror?.() : open.onsuccess?.()));
        return open;
      },
    });
    return { opens: () => opens, saved };
  }

  it('falls back to local storage when the open never answers, and closes a late connection', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const close = vi.fn();
    const requests: { result: unknown; onsuccess?: () => void }[] = [];
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request = { result: { close } };
        requests.push(request);
        return request;
      },
    });
    const storage = makeStorage();
    const opening = openSaves(KEY, storage, SLOTS);
    await vi.advanceTimersByTimeAsync(IDB_OPEN_MS * 2 + 1000);
    const slots = await opening;
    expect(requests).toHaveLength(2);
    expect(warn).toHaveBeenCalledOnce();
    requests[0].onsuccess?.();
    expect(close).toHaveBeenCalledOnce();
    slots.put('slot1', { savedAt: 9 });
    await slots.flush();
    vi.useRealTimers();
    expect(JSON.parse(storage.getItem(slotKey(KEY, 'slot1')) ?? 'null')).toEqual({ savedAt: 9 });
    warn.mockRestore();
  });

  it('falls back to local storage after two refusals and keeps legacy keys', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stub = stubOpen(2);
    const storage = makeStorage();
    storage.setItem(slotKey(KEY, 'auto'), JSON.stringify({ savedAt: 2 }));
    const opening = openSaves(KEY, storage, SLOTS);
    await vi.runAllTimersAsync();
    const slots = await opening;
    vi.useRealTimers();
    expect(stub.opens()).toBe(2);
    expect(warn).toHaveBeenCalledOnce();
    slots.put('slot1', { savedAt: 7 });
    await slots.flush();
    expect(JSON.parse(storage.getItem(slotKey(KEY, 'slot1')) ?? 'null')).toEqual({ savedAt: 7 });
    expect(storage.getItem(slotKey(KEY, 'auto'))).not.toBeNull();
    warn.mockRestore();
  });

  it('opens on the database after one refusal and moves legacy saves', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stub = stubOpen(1);
    const storage = makeStorage();
    storage.setItem(slotKey(KEY, 'auto'), JSON.stringify({ savedAt: 2 }));
    const opening = openSaves(KEY, storage, SLOTS);
    await vi.runAllTimersAsync();
    const slots = await opening;
    vi.useRealTimers();
    expect(stub.opens()).toBe(2);
    expect(warn).not.toHaveBeenCalled();
    expect(slots.get('auto')).toEqual({ savedAt: 2 });
    expect(stub.saved.get('auto')).toEqual({ savedAt: 2 });
    expect(storage.getItem(slotKey(KEY, 'auto'))).toBeNull();
    warn.mockRestore();
  });
});
