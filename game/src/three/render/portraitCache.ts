import type * as THREE from 'three';
import type { TruckPaint } from '../../data/chassis';
import type { Vehicle } from '../../sim/types';
import { messageOf } from '../idb-connection';
import { CorruptPictureError, type PictureStore } from '../picture-store';
import { keyOf, type BuildPortrait, type KeepPixels, type Portrait, type PortraitBuild, type PortraitPixels, type PortraitWait } from './truckPortrait';

export type StartPortrait = (renderer: THREE.WebGLRenderer, pristine: Vehicle, playerPaint: TruckPaint, keep: KeepPixels) => PortraitBuild;

export type RestorePortrait = (pristine: Vehicle, pixels: PortraitPixels) => Portrait;

export type PortraitRecord = { width: number; height: number; gzip: ArrayBuffer };

const RGBA_BYTES = 4;
const ID_BYTES = 2;
const PIXEL_BYTES = 2 * RGBA_BYTES + 2 * ID_BYTES;

function bytesOf(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

async function through(stream: CompressionStream | DecompressionStream, bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const piped = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

export async function packPixels(pixels: PortraitPixels): Promise<PortraitRecord> {
  const { width, height } = pixels.size;
  const raw = new Uint8Array(width * height * PIXEL_BYTES);
  let at = 0;
  for (const array of [pixels.lit, pixels.parts, pixels.ids, pixels.cells]) {
    raw.set(bytesOf(array), at);
    at += array.byteLength;
  }
  const zipped = await through(new CompressionStream('gzip'), raw);
  return { width, height, gzip: zipped.buffer };
}

function isCount(n: unknown): boolean {
  return Number.isInteger(n) && (n as number) > 0;
}

function recordOf(key: string, value: unknown): PortraitRecord {
  const record = value as Partial<PortraitRecord> | null;
  if (record && isCount(record.width) && isCount(record.height) && record.gzip instanceof ArrayBuffer) return record as PortraitRecord;
  throw new CorruptPictureError('portrait', key, 'it is not a portrait record');
}

async function unzipped(key: string, gzip: ArrayBuffer): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return await through(new DecompressionStream('gzip'), new Uint8Array(gzip));
  } catch (cause) {
    throw new CorruptPictureError('portrait', key, `it does not unzip: ${messageOf(cause)}`);
  }
}

export async function unpackPixels(key: string, value: unknown): Promise<PortraitPixels> {
  const { width, height, gzip } = recordOf(key, value);
  const raw = await unzipped(key, gzip);
  const count = width * height;
  if (raw.length !== count * PIXEL_BYTES) throw new CorruptPictureError('portrait', key, `it holds ${raw.length} bytes, expected ${count * PIXEL_BYTES}`);
  const colorBytes = count * RGBA_BYTES;
  return {
    size: { width, height },
    lit: new Uint8ClampedArray(raw.buffer, 0, colorBytes),
    parts: new Uint8ClampedArray(raw.buffer, colorBytes, colorBytes),
    ids: new Uint16Array(raw.buffer, 2 * colorBytes, count),
    cells: new Uint16Array(raw.buffer, 2 * colorBytes + count * ID_BYTES, count),
  };
}

async function stored(pictures: PictureStore, key: string): Promise<PortraitPixels | null> {
  const [record] = await pictures.readMany([{ kind: 'portrait', key }]);
  if (record === undefined) return null;
  try {
    return await unpackPixels(key, record);
  } catch (error) {
    if (!(error instanceof CorruptPictureError)) throw error;
    pictures.discard('portrait', key);
    pictures.onError(error);
    return null;
  }
}

export function cachedPortraits(pictures: PictureStore, start: StartPortrait, restore: RestorePortrait): BuildPortrait {
  return (renderer, pristine, playerPaint) => {
    const key = keyOf(pristine, playerPaint);
    let live: PortraitBuild | null = null;
    function* steps(): Generator<PortraitWait, Portrait, void> {
      const found: { pixels: PortraitPixels | null } = { pixels: null };
      yield stored(pictures, key).then((pixels) => {
        found.pixels = pixels;
      });
      if (found.pixels) return restore(pristine, found.pixels);
      live = start(renderer, pristine, playerPaint, (pixels) => pictures.save('portrait', key, packPixels(pixels)));
      return yield* live.steps;
    }
    return { steps: steps(), dispose: () => live?.dispose() };
  };
}
