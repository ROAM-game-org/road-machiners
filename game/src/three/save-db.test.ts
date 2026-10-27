import { defaultSetup } from '../sim/settings';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startKit } from '../data/start';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf, writeSave } from './save';
import { DatabaseLost, IDB_OPEN_MS, idbBackend, memoryBackend, openSaves, SaveSlots, storageBackend, type SaveBackend } from './save-db';
import { allSlots, slotKey, type SlotId } from './save-slots';

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

describe('SaveSlots after the database is lost', () => {
  const KEY = 'roam.save';
  const lost = () => new DatabaseLost(KEY, new DOMException('A mutation operation was attempted on a database that did not allow mutations.', 'InvalidStateError'));
  const lostBackend = (): SaveBackend => ({ ...memoryBackend(), put: () => Promise.reject(lost()), remove: () => Promise.reject(lost()), appendLog: () => Promise.reject(lost()) });
  const stored = (storage: Storage, slot: SlotId) => JSON.parse(storage.getItem(slotKey(KEY, slot)) ?? 'null');

  function lostSlots(backend: SaveBackend, mirror: [SlotId, unknown][], storage: Storage) {
    const slots = new SaveSlots(backend, new Map(mirror), { backend: storageBackend(storage, KEY, SLOTS), slots: SLOTS });
    const errors: unknown[] = [];
    slots.onError = (err) => errors.push(err);
    return { slots, errors };
  }

  it('moves every mirrored save to local storage, drops what the mirror lacks, and warns once without the save note', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = makeStorage();
    storage.setItem(slotKey(KEY, 'slot2'), JSON.stringify({ savedAt: 1 }));
    const { slots, errors } = lostSlots(lostBackend(), [['day', { savedAt: 2 }], ['slot1', { savedAt: 3 }]], storage);

    slots.put('auto', { savedAt: 4 });
    await slots.flush();
    slots.put('slot1', { savedAt: 5 });
    slots.remove('day');
    await slots.flush();

    expect(errors).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('Saves go to local storage for this session.');
    expect([stored(storage, 'auto'), stored(storage, 'day'), stored(storage, 'slot1'), stored(storage, 'slot2')]).toEqual([{ savedAt: 4 }, null, { savedAt: 5 }, null]);
    warn.mockRestore();
  });

  it('keeps the newer save when a write started on the lost database fails after the switch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = makeStorage();
    let failLate = () => {};
    const backend: SaveBackend = {
      ...lostBackend(),
      put: (_slot, envelope) => ((envelope as { savedAt: number }).savedAt === 1 ? new Promise((_resolve, reject) => { failLate = () => reject(lost()); }) : Promise.reject(lost())),
    };
    const { slots, errors } = lostSlots(backend, [], storage);

    slots.put('auto', { savedAt: 1 });
    slots.put('auto', { savedAt: 2 });
    await new Promise((resolve) => setTimeout(resolve));
    failLate();
    await slots.flush();

    expect(stored(storage, 'auto')).toEqual({ savedAt: 2 });
    expect(errors).toEqual([]);
    warn.mockRestore();
  });

  it('is moved back into the database on the next boot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = makeStorage();
    const { slots } = lostSlots(lostBackend(), [['day', { savedAt: 2 }]], storage);
    slots.put('auto', { savedAt: 3 });
    await slots.flush();

    const database = memoryBackend();
    const next = await SaveSlots.open(database, storage, KEY, SLOTS);

    expect([next.get('auto'), next.get('day')]).toEqual([{ savedAt: 3 }, { savedAt: 2 }]);
    expect(storage.length).toBe(0);
    warn.mockRestore();
  });

  it('shows the save note when local storage refuses the moved saves too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = makeStorage();
    storage.setItem = () => { throw new Error('Quota exceeded'); };
    const { slots, errors } = lostSlots(lostBackend(), [], storage);

    slots.put('auto', { savedAt: 3 });
    await slots.flush();

    expect(errors.map((e) => (e as Error).message)).toEqual(['Quota exceeded']);
    expect(slots.get('auto')).toEqual({ savedAt: 3 });
    warn.mockRestore();
  });

  it('sends a lost database to onError when it has nowhere to fall back', async () => {
    const slots = new SaveSlots(lostBackend(), new Map());
    const errors: unknown[] = [];
    slots.onError = (err) => errors.push(err);

    slots.put('auto', { savedAt: 3 });
    await slots.flush();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(DatabaseLost);
  });

  it('moves the run log to memory with the saves', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = makeStorage();
    const { slots, errors } = lostSlots(lostBackend(), [], storage);

    await expect(slots.appendLog('run', [{ kind: 'a', turn: 1 }])).rejects.toBeInstanceOf(DatabaseLost);
    await slots.appendLog('run', [{ kind: 'b', turn: 2 }]);
    await slots.flush();

    expect((await slots.readLog('run')).map((r) => r.kind)).toEqual(['b']);
    expect(errors).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('idbBackend writes', () => {
  afterEach(() => vi.unstubAllGlobals());

  const FIREFOX_LOST = 'A mutation operation was attempted on a database that did not allow mutations.';

  type Call = 'transaction' | 'objectStore' | 'put' | 'delete' | 'add' | 'openCursor' | 'getAll' | 'getAllKeys';
  type Failure = { call: Call; error: DOMException } | { abort: DOMException | null };

  type StubDb = {
    index: number;
    puts: unknown[];
    closing: boolean;
    closes: number;
    fail: Failure | null;
    onclose?: () => void;
    onversionchange?: () => void;
    transaction: (...args: unknown[]) => unknown;
    close: () => void;
  };

  type StubOptions = {
    transactionArgs?: unknown[][];
    closedAtOpen?: (index: number) => boolean;
    failAt?: (index: number) => Failure | null;
    refuseOpen?: (index: number) => boolean;
  };

  function stubIndexedDb({ transactionArgs = [], closedAtOpen = () => false, failAt = () => null, refuseOpen = () => false }: StubOptions = {}) {
    const dbs: StubDb[] = [];
    const saves = new Map<unknown, unknown>();
    const log: { seq: number }[] = [];
    const failing = (db: StubDb, call: Call) => {
      if (db.fail && 'call' in db.fail && db.fail.call === call) throw db.fail.error;
    };
    const makeTx = (db: StubDb) => {
      let open = 0;
      let finished = false;
      const staged: (() => void)[] = [];
      const tx: { error: DOMException | null; oncomplete?: () => void; onabort?: () => void; onerror?: () => void; objectStore: () => unknown; abort: () => void } = {
        error: null,
        objectStore: () => { failing(db, 'objectStore'); return store; },
        abort: () => finish(new DOMException('The transaction was aborted.', 'AbortError')),
      };
      const finish = (abort: DOMException | null | undefined) => {
        if (finished) return;
        finished = true;
        if (abort === undefined) {
          staged.forEach((commit) => commit());
          tx.oncomplete?.();
        } else {
          tx.error = abort;
          tx.onabort?.();
        }
      };
      const settle = () => setTimeout(() => {
        if (open > 0) return;
        finish(db.fail && 'abort' in db.fail ? db.fail.abort : undefined);
      });
      const request = <T>(call: Call, result: T, commit?: () => void) => {
        failing(db, call);
        open += 1;
        const req: { result: T; onsuccess?: () => void } = { result };
        setTimeout(() => {
          if (commit) staged.push(commit);
          if (!finished) req.onsuccess?.();
          open -= 1;
          settle();
        });
        return req;
      };
      const store = {
        put: (envelope: unknown, key: unknown) => request('put', undefined, () => { db.puts.push(envelope); saves.set(key, envelope); }),
        delete: (key: unknown) => request('delete', undefined, () => saves.delete(key)),
        add: (record: { seq: number }) => request('add', undefined, () => log.push(record)),
        openCursor: () => request('openCursor', log.length > 0 ? { value: log[log.length - 1] } : null),
        getAll: () => request('getAll', [...saves.values()]),
        getAllKeys: () => request('getAllKeys', [...saves.keys()]),
      };
      settle();
      return tx;
    };
    const makeDb = (index: number): StubDb => {
      const db: StubDb = {
        index,
        puts: [],
        closing: closedAtOpen(index),
        closes: 0,
        fail: failAt(index),
        close: () => { db.closing = true; db.closes += 1; },
        transaction: (...args: unknown[]) => {
          transactionArgs.push(args);
          if (args.length > 2) throw new Error('This browser aborts a transaction with options');
          if (db.closing) throw new DOMException('The database connection is closing.', 'InvalidStateError');
          failing(db, 'transaction');
          return makeTx(db);
        },
      };
      return db;
    };
    const open = vi.fn(() => {
      const index = open.mock.calls.length - 1;
      const refused = refuseOpen(index);
      const db = makeDb(index);
      if (!refused) dbs.push(db);
      const request: { result: unknown; error: unknown; onsuccess?: () => void; onerror?: () => void } = {
        result: db,
        error: new DOMException('The operation failed for reasons unrelated to the database itself.', 'UnknownError'),
      };
      setTimeout(() => (refused ? request.onerror?.() : request.onsuccess?.()));
      return request;
    });
    vi.stubGlobal('indexedDB', { open });
    vi.stubGlobal('IDBKeyRange', { bound: () => ({}) });
    return { dbs, open, saves, log };
  }

  it('opens each write transaction with the default options', async () => {
    const transactionArgs: unknown[][] = [];
    stubIndexedDb({ transactionArgs });
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

  it('a closed connection rejects instead of throwing, and names the database lost', async () => {
    const { open, dbs } = stubIndexedDb({ closedAtOpen: () => true });
    const backend = await idbBackend('roam-test');

    let promise: Promise<void> | undefined;
    expect(() => { promise = backend.put('auto', {}); }).not.toThrow();
    await expect(promise).rejects.toBeInstanceOf(DatabaseLost);
    await expect(promise).rejects.toThrow('The database connection is closing.');
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
    const { dbs, open } = stubIndexedDb();
    const backend = await idbBackend('roam-test');
    dbs[0].closing = true;
    expect(await backend.readAll()).toEqual(new Map());
    dbs[1].closing = true;
    expect(await backend.readLog('run')).toEqual([]);
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('reopens when the put itself says the database no longer allows mutations, and keeps the new connection', async () => {
    const lost = new DOMException(FIREFOX_LOST, 'InvalidStateError');
    const { dbs, open } = stubIndexedDb({ failAt: (index) => (index === 0 ? { call: 'put', error: lost } : null) });
    const backend = await idbBackend('roam-test');

    await backend.put('auto', { turn: 5 });
    await backend.put('auto', { turn: 6 });

    expect(open).toHaveBeenCalledTimes(2);
    expect(dbs[0].closes).toBe(1);
    expect(dbs[0].puts).toEqual([]);
    expect(dbs[1].puts).toEqual([{ turn: 5 }, { turn: 6 }]);
  });

  const lostAt: { call: Call; operation: (backend: SaveBackend) => Promise<unknown> }[] = [
    { call: 'objectStore', operation: (backend) => backend.put('auto', { turn: 1 }) },
    { call: 'delete', operation: (backend) => backend.remove('auto') },
    { call: 'openCursor', operation: (backend) => backend.appendLog('run', [{ kind: 'a', turn: 1 }]) },
    { call: 'add', operation: (backend) => backend.appendLog('run', [{ kind: 'a', turn: 1 }]) },
    { call: 'getAllKeys', operation: (backend) => backend.readAll() },
    { call: 'getAll', operation: (backend) => backend.readAll() },
    { call: 'getAll', operation: (backend) => backend.readLog('run') },
  ];

  it.each(lostAt)('reruns the whole operation on a fresh connection when $call reports the connection lost', async ({ call, operation }) => {
    const { dbs, open } = stubIndexedDb({ failAt: (index) => (index === 0 ? { call, error: new DOMException(FIREFOX_LOST, 'InvalidStateError') } : null) });
    const backend = await idbBackend('roam-test');

    await expect(operation(backend)).resolves.not.toThrow();

    expect(open).toHaveBeenCalledTimes(2);
    expect(dbs[0].closes).toBe(1);
  });

  it('numbers log records once when the add is rerun after a lost connection', async () => {
    const { log } = stubIndexedDb({ failAt: (index) => (index === 0 ? { call: 'add', error: new DOMException('Internal error.', 'UnknownError') } : null) });
    const backend = await idbBackend('roam-test');

    await backend.appendLog('run', [{ kind: 'a', turn: 1 }, { kind: 'b', turn: 1 }]);
    await backend.appendLog('run', [{ kind: 'c', turn: 2 }]);

    expect(log.map((r) => r.seq)).toEqual([0, 1, 2]);
  });

  it.each([
    { name: 'no error', abort: null },
    { name: 'AbortError', abort: new DOMException('The transaction was aborted.', 'AbortError') },
    { name: 'UnknownError', abort: new DOMException('Internal error.', 'UnknownError') },
  ])('reruns a write whose transaction aborts with $name', async ({ abort }) => {
    const { dbs, open, saves } = stubIndexedDb({ failAt: (index) => (index === 0 ? { abort } : null) });
    const backend = await idbBackend('roam-test');

    await backend.put('auto', { turn: 7 });

    expect(open).toHaveBeenCalledTimes(2);
    expect(dbs[1].puts).toEqual([{ turn: 7 }]);
    expect(saves.get('auto')).toEqual({ turn: 7 });
  });

  it('rejects a full quota at once, with no reopen, and keeps the old save', async () => {
    const quota = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    const { open, saves, dbs } = stubIndexedDb();
    const backend = await idbBackend('roam-test');
    await backend.put('auto', { turn: 1 });
    dbs[0].fail = { abort: quota };

    await expect(backend.put('auto', { turn: 2 })).rejects.toBe(quota);

    expect(open).toHaveBeenCalledTimes(1);
    expect(dbs[0].closes).toBe(0);
    expect(saves.get('auto')).toEqual({ turn: 1 });
  });

  it('rejects a log add that throws inside the cursor callback instead of throwing from the handler', async () => {
    const clone = new DOMException('The object could not be cloned.', 'DataCloneError');
    const { open, log } = stubIndexedDb({ failAt: () => ({ call: 'add', error: clone }) });
    const backend = await idbBackend('roam-test');

    await expect(backend.appendLog('run', [{ kind: 'a', turn: 1 }])).rejects.toBe(clone);

    expect(open).toHaveBeenCalledTimes(1);
    expect(log).toEqual([]);
  });

  it('names the database lost when the fresh connection fails the same way', async () => {
    const { open, dbs } = stubIndexedDb({ failAt: () => ({ call: 'put', error: new DOMException(FIREFOX_LOST, 'InvalidStateError') }) });
    const backend = await idbBackend('roam-test');

    const write = backend.put('auto', { turn: 8 });

    await expect(write).rejects.toBeInstanceOf(DatabaseLost);
    await expect(write).rejects.toThrow(FIREFOX_LOST);
    expect(open).toHaveBeenCalledTimes(2);
    expect(dbs.map((db) => db.closes)).toEqual([1, 1]);
  });

  it('names the database lost when the browser refuses to open it again', async () => {
    const { dbs, open } = stubIndexedDb({ refuseOpen: (index) => index > 0 });
    const backend = await idbBackend('roam-test');
    dbs[0].onclose?.();

    await expect(backend.put('auto', { turn: 9 })).rejects.toBeInstanceOf(DatabaseLost);

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

  function stubOpen(refusals: number, lostReads = false): { opens: () => number; saved: Map<string, unknown> } {
    let opens = 0;
    const saved = new Map<string, unknown>();
    const db = {
      close: () => {},
      transaction: () => {
        let open = 0;
        const tx: { oncomplete?: () => void; objectStore: () => typeof store } = { objectStore: () => store };
        const settle = () => setTimeout(() => { if (open === 0) tx.oncomplete?.(); });
        const fire = <T>(result: () => T) => {
          open += 1;
          const req: { result?: T; onsuccess?: () => void } = {};
          setTimeout(() => {
            req.result = result();
            req.onsuccess?.();
            open -= 1;
            settle();
          });
          return req;
        };
        const store = {
          getAllKeys: () => fire(() => [...saved.keys()]),
          getAll: () => {
            if (lostReads) throw new DOMException('A mutation operation was attempted on a database that did not allow mutations.', 'InvalidStateError');
            return fire(() => [...saved.values()]);
          },
          put: (value: unknown, key: string) => fire(() => saved.set(key, value)),
          delete: (key: string) => fire(() => saved.delete(key)),
        };
        settle();
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

  it('falls back to local storage when the database opens but loses its first read twice', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stub = stubOpen(0, true);
    const storage = makeStorage();
    storage.setItem(slotKey(KEY, 'auto'), JSON.stringify({ savedAt: 2 }));
    const opening = openSaves(KEY, storage, SLOTS);
    await vi.runAllTimersAsync();
    const slots = await opening;
    vi.useRealTimers();
    expect(stub.opens()).toBe(2);
    expect(warn).toHaveBeenCalledOnce();
    expect(slots.get('auto')).toEqual({ savedAt: 2 });
    slots.put('slot1', { savedAt: 7 });
    await slots.flush();
    expect(JSON.parse(storage.getItem(slotKey(KEY, 'slot1')) ?? 'null')).toEqual({ savedAt: 7 });
    expect(stub.saved.size).toBe(0);
    warn.mockRestore();
  });
});
