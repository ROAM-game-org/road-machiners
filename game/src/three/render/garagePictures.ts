import { CorruptPicture, type PictureKind } from '../picture-store';
import type { GarageBody, GaragePivot, GarageSprite } from './garageRender';

type SpriteRecord = { left: number; top: number; width: number; height: number; pivot: GaragePivot | null; png: Blob | null };
type SpriteEntry = { loose: string; sprite: SpriteRecord };
type BodyEntry = { chassisId: string; image: SpriteRecord; cores: [string, SpriteRecord][] };

export type RestoredSprite = { loose: string; sprite: GarageSprite };
export type RestoredBody = { chassisId: string; body: GarageBody };

async function pngOf(sprite: GarageSprite): Promise<Blob | null> {
  if (sprite.png) return sprite.png;
  if (sprite.url === '') return null;
  if (!sprite.url.startsWith('data:')) throw new Error(`The garage sprite ${sprite.url} has no PNG to keep`);
  return (await fetch(sprite.url)).blob();
}

async function spriteRecord(sprite: GarageSprite): Promise<SpriteRecord> {
  const { left, top, width, height } = sprite;
  return { left, top, width, height, pivot: sprite.pivot ?? null, png: await pngOf(sprite) };
}

export async function spriteEntry(loose: string, sprite: GarageSprite): Promise<SpriteEntry> {
  return { loose, sprite: await spriteRecord(sprite) };
}

export async function bodyEntry(chassisId: string, body: GarageBody): Promise<BodyEntry> {
  const cores = await Promise.all([...body.cores].map(async ([partId, sprite]): Promise<[string, SpriteRecord]> => [partId, await spriteRecord(sprite)]));
  return { chassisId, image: await spriteRecord(body.image), cores };
}

function isNumber(n: unknown): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}

function isPivot(p: unknown): boolean {
  return p === null || (typeof p === 'object' && isNumber((p as GaragePivot).x) && isNumber((p as GaragePivot).y));
}

function isPng(p: unknown): boolean {
  return p === null || (p instanceof Blob && p.size > 0);
}

function checkedSprite(kind: PictureKind, key: string, value: unknown): SpriteRecord {
  const record = value as SpriteRecord | null;
  if (record && [record.left, record.top, record.width, record.height].every(isNumber) && isPivot(record.pivot) && isPng(record.png)) return record;
  throw new CorruptPicture(kind, key, 'a sprite in it is malformed');
}

function spriteOf(record: SpriteRecord): GarageSprite {
  const { left, top, width, height } = record;
  const sprite: GarageSprite = { url: record.png ? URL.createObjectURL(record.png) : '', left, top, width, height };
  return record.pivot ? { ...sprite, pivot: record.pivot } : sprite;
}

export function restoredSprite(key: string, value: unknown): RestoredSprite {
  const entry = value as Partial<SpriteEntry> | null;
  if (!entry || typeof entry.loose !== 'string') throw new CorruptPicture('sprite', key, 'it is not a sprite record');
  return { loose: entry.loose, sprite: spriteOf(checkedSprite('sprite', key, entry.sprite)) };
}

function checkedCore(key: string, pair: unknown): [string, SpriteRecord] {
  if (!Array.isArray(pair) || typeof pair[0] !== 'string') throw new CorruptPicture('body', key, 'a core in it is malformed');
  return [pair[0], checkedSprite('body', key, pair[1])];
}

export function restoredBody(key: string, value: unknown): RestoredBody {
  const entry = value as Partial<BodyEntry> | null;
  if (!entry || typeof entry.chassisId !== 'string' || !Array.isArray(entry.cores)) throw new CorruptPicture('body', key, 'it is not a body record');
  const image = checkedSprite('body', key, entry.image);
  const cores = entry.cores.map((pair) => checkedCore(key, pair));
  return { chassisId: entry.chassisId, body: { image: spriteOf(image), cores: new Map(cores.map(([partId, record]) => [partId, spriteOf(record)])) } };
}
