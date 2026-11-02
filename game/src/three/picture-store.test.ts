import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseLost } from './idb-connection';
import { idbPictureBackend, memoryPictureBackend, PictureStore, type PictureBackend } from './picture-store';

function storeOver(backend: PictureBackend, version = 'v1'): { pictures: PictureStore; errors: unknown[] } {
  const pictures = new PictureStore(backend, version);
  const errors: unknown[] = [];
  pictures.onError = (err) => errors.push(err);
  return { pictures, errors };
}

describe('PictureStore', () => {
  it('gives back what it saved, equal, and a miss for what it never saw', async () => {
    const { pictures } = storeOver(memoryPictureBackend());
    const record = { width: 3, gzip: new Uint8Array([1, 2, 3]).buffer, nested: { a: [1, 2] } };
    pictures.save('portrait', 'truck-1', Promise.resolve(record));
    await pictures.flush();

    const found = await pictures.readMany([{ kind: 'portrait', key: 'truck-1' }, { kind: 'portrait', key: 'truck-2' }, { kind: 'body', key: 'truck-1' }]);

    expect(found).toEqual([record, undefined, undefined]);
  });

  it('misses every picture of an older version and deletes them when it opens', async () => {
    const backend = memoryPictureBackend();
    const old = storeOver(backend, 'v1');
    old.pictures.save('sprite', 'a', Promise.resolve({ n: 1 }));
    await old.pictures.flush();
    const fresh = storeOver(backend, 'v2');

    const missed = await fresh.pictures.readMany([{ kind: 'sprite', key: 'a' }]);
    const later = await storeOver(backend, 'v1').pictures.readMany([{ kind: 'sprite', key: 'a' }]);

    expect(missed).toEqual([undefined]);
    expect(later).toEqual([undefined]);
  });

  it('keeps the pictures of its own version when it opens again', async () => {
    const backend = memoryPictureBackend();
    const first = storeOver(backend);
    first.pictures.save('sprite', 'a', Promise.resolve({ n: 1 }));
    await first.pictures.flush();

    const again = await storeOver(backend).pictures.readMany([{ kind: 'sprite', key: 'a' }]);

    expect(again).toEqual([{ n: 1 }]);
  });

  it('forgets a discarded picture', async () => {
    const { pictures } = storeOver(memoryPictureBackend());
    pictures.save('sprite', 'a', Promise.resolve({ n: 1 }));
    await pictures.flush();
    pictures.discard('sprite', 'a');
    await pictures.flush();

    expect(await pictures.readMany([{ kind: 'sprite', key: 'a' }])).toEqual([undefined]);
  });

  it('reports a refused write to onError and keeps serving reads', async () => {
    const refused = new DOMException('The disk is full.', 'QuotaExceededError');
    const { pictures, errors } = storeOver({ ...memoryPictureBackend(), put: () => Promise.reject(refused) });

    pictures.save('sprite', 'a', Promise.resolve({ n: 1 }));
    await pictures.flush();

    expect(errors).toEqual([refused]);
    expect(await pictures.readMany([{ kind: 'sprite', key: 'a' }])).toEqual([undefined]);
  });

  it('reports a picture that failed to encode', async () => {
    const { pictures, errors } = storeOver(memoryPictureBackend());
    const failure = new Error('no PNG');

    pictures.save('sprite', 'a', Promise.reject(failure));
    await pictures.flush();

    expect(errors).toEqual([failure]);
  });

  it('rejects a read the database refused, so the caller sees it', async () => {
    const refused = new DOMException('The transaction was aborted.', 'AbortError');
    const { pictures } = storeOver({ ...memoryPictureBackend(), getMany: () => Promise.reject(refused) });

    await expect(pictures.readMany([{ kind: 'sprite', key: 'a' }])).rejects.toBe(refused);
  });

  it('reports a lost database once and then misses every read and drops every write', async () => {
    const lost = new DatabaseLost('roam.pictures', new DOMException('Closed.', 'InvalidStateError'));
    const put = vi.fn();
    const { pictures, errors } = storeOver({ getMany: () => Promise.reject(lost), put, remove: () => Promise.resolve(), dropOtherVersions: () => Promise.resolve() });

    const first = await pictures.readMany([{ kind: 'sprite', key: 'a' }]);
    const second = await pictures.readMany([{ kind: 'sprite', key: 'b' }]);
    pictures.save('sprite', 'c', Promise.resolve({}));
    await pictures.flush();

    expect([first, second]).toEqual([[undefined], [undefined]]);
    expect(errors).toEqual([lost]);
    expect(put).not.toHaveBeenCalled();
  });
});

type Row = { key: unknown[]; value: unknown };

function stubIndexedDb(): Map<string, Row> {
  const rows = new Map<string, Row>();
  const at = (key: unknown[]) => JSON.stringify(key);
  const db = {
    close: () => {},
    transaction: () => {
      let outstanding = 0;
      const tx: { oncomplete?: () => void; objectStore: () => unknown } = { objectStore: () => objectStore };
      const completeWhenIdle = () => setTimeout(() => { if (outstanding === 0) tx.oncomplete?.(); });
      const settle = <T>(request: { result?: T; onsuccess?: () => void }, result: T) => {
        outstanding++;
        setTimeout(() => {
          request.result = result;
          request.onsuccess?.();
          outstanding--;
          completeWhenIdle();
        });
      };
      const objectStore = {
        get: (key: unknown[]) => {
          const request: { result?: unknown; onsuccess?: () => void } = {};
          settle(request, structuredClone(rows.get(at(key))?.value));
          return request;
        },
        put: (value: unknown, key: unknown[]) => { rows.set(at(key), { key, value: structuredClone(value) }); },
        delete: (key: unknown[]) => { rows.delete(at(key)); },
        openKeyCursor: () => {
          const request: { result?: unknown; onsuccess?: () => void } = {};
          const keys = [...rows.values()].map((row) => row.key);
          let next = 0;
          const step = () => {
            const key = keys[next++];
            settle(request, key ? { key, primaryKey: key, continue: step } : null);
          };
          step();
          return request;
        },
      };
      completeWhenIdle();
      return tx;
    },
  };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request: { result: unknown; onsuccess?: () => void; onupgradeneeded?: () => void } = { result: { ...db, createObjectStore: () => {} } };
      setTimeout(() => request.onsuccess?.());
      return request;
    },
  });
  return rows;
}

describe('idbPictureBackend', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stores a record under its version, kind and key, reads several keys in one call and removes one', async () => {
    const rows = stubIndexedDb();
    const backend = idbPictureBackend('roam.pictures.test');

    await backend.put(['v1', 'sprite', 'a'], { n: 1 });
    await backend.put(['v1', 'body', 'a'], { n: 2 });
    const found = await backend.getMany([['v1', 'sprite', 'a'], ['v1', 'sprite', 'z'], ['v1', 'body', 'a']]);
    await backend.remove(['v1', 'body', 'a']);

    expect(found).toEqual([{ n: 1 }, undefined, { n: 2 }]);
    expect([...rows.values()].map((row) => row.key)).toEqual([['v1', 'sprite', 'a']]);
  });

  it('deletes every row of another version and keeps the rows of its own', async () => {
    const rows = stubIndexedDb();
    const backend = idbPictureBackend('roam.pictures.test');
    await backend.put(['v1', 'sprite', 'a'], { n: 1 });
    await backend.put(['v2', 'sprite', 'a'], { n: 2 });
    await backend.put(['v0', 'portrait', 'b'], { n: 3 });

    await backend.dropOtherVersions('v2');

    expect([...rows.values()].map((row) => row.key)).toEqual([['v2', 'sprite', 'a']]);
  });
});
