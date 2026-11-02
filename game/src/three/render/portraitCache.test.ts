import type * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PAINT } from '../../data/chassis';
import { emptyWorld } from '../../sim/testkit';
import { CorruptPicture, memoryPictureBackend, PictureStore, type PictureBackend } from '../picture-store';
import { cachedPortraits, packPixels, unpackPixels, type RestorePortrait, type StartPortrait } from './portraitCache';
import { keyOf, pristineOf, TruckPortraits, type Portrait, type PortraitPixels, type PortraitWait } from './truckPortrait';

const RENDERER = {} as THREE.WebGLRenderer;

function pixels(): PortraitPixels {
  const size = { width: 5, height: 3 };
  const count = size.width * size.height;
  return {
    size,
    lit: Uint8ClampedArray.from({ length: count * 4 }, (_, i) => (i % 4 === 3 ? 37 + i : (i * 7) % 256)),
    parts: Uint8ClampedArray.from({ length: count * 4 }, (_, i) => (i * 13) % 256),
    ids: Uint16Array.from({ length: count }, (_, i) => i * 300),
    cells: Uint16Array.from({ length: count }, (_, i) => 65535 - i),
  };
}

const SHOWN = { width: 7, has: () => true, release() {} } as unknown as Portrait;

function storeOver(backend: PictureBackend): { pictures: PictureStore; errors: unknown[] } {
  const pictures = new PictureStore(backend, 'v1');
  const errors: unknown[] = [];
  pictures.onError = (err) => errors.push(err);
  return { pictures, errors };
}

function rendering(saved?: PortraitPixels): { start: StartPortrait; started: string[]; disposed: string[] } {
  const fake = { started: [] as string[], disposed: [] as string[], start: undefined as unknown as StartPortrait };
  fake.start = (_renderer, pristine, _paint, keep) => {
    fake.started.push(pristine.id);
    function* steps(): Generator<PortraitWait, Portrait, void> {
      yield;
      if (saved) keep(saved);
      return SHOWN;
    }
    return { steps: steps(), dispose: () => fake.disposed.push(pristine.id) };
  };
  return fake;
}

const restoring = (): RestorePortrait => vi.fn(() => SHOWN);

function lookOf() {
  const v = emptyWorld().vehicles[0];
  return { v, key: keyOf(pristineOf(v), PAINT.standard) };
}

async function until(portraits: TruckPortraits, vehicleId: string): Promise<void> {
  await vi.waitFor(() => {
    portraits.step(0, false);
    expect(portraits.settled(vehicleId)).toBe(true);
  });
}

describe('stored portrait pixels', () => {
  it('give back the same raw arrays, including semi-transparent values', async () => {
    const original = pixels();

    const back = await unpackPixels('k', await packPixels(original));

    expect(back).toEqual(original);
    expect(back.lit).toBeInstanceOf(Uint8ClampedArray);
    expect(back.ids).toBeInstanceOf(Uint16Array);
  });

  it('are smaller than the arrays when the picture repeats itself', async () => {
    const flat = { ...pixels(), size: { width: 64, height: 64 }, lit: new Uint8ClampedArray(64 * 64 * 4), parts: new Uint8ClampedArray(64 * 64 * 4), ids: new Uint16Array(64 * 64), cells: new Uint16Array(64 * 64) };

    const record = await packPixels(flat);

    expect(record.gzip.byteLength).toBeLessThan(flat.lit.byteLength);
  });

  it.each([
    ['a value that is no record', 7],
    ['a record with no bytes', { width: 5, height: 3 }],
    ['a record with a bad size', { width: 0, height: 3, gzip: new ArrayBuffer(4) }],
    ['bytes that are no gzip', { width: 5, height: 3, gzip: new Uint8Array([1, 2, 3, 4, 5]).buffer }],
  ])('throw a corrupt picture for %s', async (_name, record) => {
    await expect(unpackPixels('k', record)).rejects.toBeInstanceOf(CorruptPicture);
  });

  it('throw a corrupt picture when the bytes do not fit the size', async () => {
    const record = await packPixels(pixels());

    await expect(unpackPixels('k', { ...record, width: record.width + 1 })).rejects.toThrow(/expected/);
  });
});

describe('portraits over the picture store', () => {
  it('starts no render job for a look the store holds, and shows what restore builds from the stored arrays', async () => {
    const { v, key } = lookOf();
    const { pictures } = storeOver(memoryPictureBackend());
    pictures.save('portrait', key, packPixels(pixels()));
    await pictures.flush();
    const fake = rendering();
    const restore = restoring();
    const portraits = new TruckPortraits(RENDERER, cachedPortraits(pictures, fake.start, restore));

    portraits.want([], [v], null, PAINT.standard);
    await until(portraits, v.id);

    expect(fake.started).toEqual([]);
    expect(restore).toHaveBeenCalledWith(expect.objectContaining({ id: v.id }), pixels());
    expect(portraits.shown(v, PAINT.standard)).toBe(SHOWN);
  });

  it('treats a pending read as a job in progress, so no second read and no render start meanwhile', async () => {
    const { v } = lookOf();
    let answer: () => void = () => {};
    const gate = new Promise<void>((resolve) => (answer = resolve));
    const getMany = vi.fn(() => gate.then(() => [undefined]));
    const { pictures } = storeOver({ ...memoryPictureBackend(), getMany });
    const fake = rendering();
    const portraits = new TruckPortraits(RENDERER, cachedPortraits(pictures, fake.start, restoring()));
    portraits.want([], [v], null, PAINT.standard);

    for (let i = 0; i < 5; i++) {
      portraits.step(1e9, false);
      portraits.want([], [v], null, PAINT.standard);
      await Promise.resolve();
    }
    await vi.waitFor(() => expect(getMany).toHaveBeenCalledTimes(1));
    expect(fake.started).toEqual([]);
    answer();
    await until(portraits, v.id);

    expect(getMany).toHaveBeenCalledTimes(1);
    expect(fake.started).toEqual([v.id]);
  });

  it('renders a missing look once, saves its raw arrays, and a later session restores them without rendering', async () => {
    const { v } = lookOf();
    const backend = memoryPictureBackend();
    const first = storeOver(backend);
    const fake = rendering(pixels());
    const portraits = new TruckPortraits(RENDERER, cachedPortraits(first.pictures, fake.start, restoring()));
    portraits.want([], [v], null, PAINT.standard);
    await until(portraits, v.id);
    await first.pictures.flush();

    const later = storeOver(backend);
    const again = rendering();
    const restore = restoring();
    const reloaded = new TruckPortraits(RENDERER, cachedPortraits(later.pictures, again.start, restore));
    reloaded.want([], [v], null, PAINT.standard);
    await until(reloaded, v.id);

    expect(fake.started).toEqual([v.id]);
    expect(again.started).toEqual([]);
    expect(restore).toHaveBeenCalledWith(expect.anything(), pixels());
    expect([first.errors, later.errors]).toEqual([[], []]);
  });

  it('misses a look stored by another game version', async () => {
    const { v, key } = lookOf();
    const backend = memoryPictureBackend();
    const old = new PictureStore(backend, 'v0');
    old.save('portrait', key, packPixels(pixels()));
    await old.flush();
    const fake = rendering();
    const portraits = new TruckPortraits(RENDERER, cachedPortraits(storeOver(backend).pictures, fake.start, restoring()));

    portraits.want([], [v], null, PAINT.standard);
    await until(portraits, v.id);

    expect(fake.started).toEqual([v.id]);
  });

  it('reports a corrupt entry, deletes it and renders the look again', async () => {
    const { v, key } = lookOf();
    const { pictures, errors } = storeOver(memoryPictureBackend());
    pictures.save('portrait', key, Promise.resolve({ width: 5, height: 3, gzip: new Uint8Array([9, 9, 9]).buffer }));
    await pictures.flush();
    const fake = rendering();
    const portraits = new TruckPortraits(RENDERER, cachedPortraits(pictures, fake.start, restoring()));

    portraits.want([], [v], null, PAINT.standard);
    await until(portraits, v.id);
    await pictures.flush();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(CorruptPicture);
    expect(fake.started).toEqual([v.id]);
    expect(await pictures.readMany([{ kind: 'portrait', key }])).toEqual([undefined]);
  });

  it('throws a failed read from step once and does not render or retry that look', async () => {
    const { v } = lookOf();
    const refused = new Error('The read was refused');
    const { pictures } = storeOver({ ...memoryPictureBackend(), getMany: () => Promise.reject(refused) });
    const fake = rendering();
    const portraits = new TruckPortraits(RENDERER, cachedPortraits(pictures, fake.start, restoring()));
    portraits.want([], [v], null, PAINT.standard);

    await vi.waitFor(() => expect(() => portraits.step(0, false)).toThrow(refused));

    expect(() => portraits.step(0, false)).not.toThrow();
    expect(fake.started).toEqual([]);
  });

  it('disposes the render it started', async () => {
    const { v } = lookOf();
    const { pictures } = storeOver(memoryPictureBackend());
    const fake = rendering();
    const portraits = new TruckPortraits(RENDERER, cachedPortraits(pictures, fake.start, restoring()));
    portraits.want([], [v], null, PAINT.standard);
    await until(portraits, v.id);

    expect(fake.disposed).toEqual([v.id]);
  });

  it('has no render to dispose for a restored look', async () => {
    const { v, key } = lookOf();
    const { pictures } = storeOver(memoryPictureBackend());
    pictures.save('portrait', key, packPixels(pixels()));
    await pictures.flush();
    const fake = rendering();
    const portraits = new TruckPortraits(RENDERER, cachedPortraits(pictures, fake.start, restoring()));
    portraits.want([], [v], null, PAINT.standard);
    await until(portraits, v.id);

    expect(fake.disposed).toEqual([]);
  });
});
