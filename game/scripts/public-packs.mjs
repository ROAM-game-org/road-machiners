import { readdirSync, readFileSync, renameSync, rmSync, statSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { fnv1a } from '../src/file-hash.ts';

export const PACKED_FOLDERS = ['models', 'sfx', 'sfx-m4a'];
export const PACK_DIR = 'packs';

export function isPacked(file) {
  return PACKED_FOLDERS.includes(file.split('/')[0]);
}

function membersOf(publicDir, folder) {
  const entries = readdirSync(join(publicDir, folder), { withFileTypes: true }).filter((entry) => entry.name !== '.DS_Store');
  const nested = entries.find((entry) => entry.isDirectory());
  if (nested) throw new Error(`Packed folder ${folder}/${nested.name} is nested, and packs hold only flat folders`);
  return entries.map((entry) => `${folder}/${entry.name}`).sort();
}

function folderLayout(publicDir, folder) {
  const members = membersOf(publicDir, folder);
  const hashes = members.map((file) => fnv1a(readFileSync(join(publicDir, file))));
  const pack = `${PACK_DIR}/${folder}.pack?v=${fnv1a(new TextEncoder().encode(hashes.join('')))}`;
  let offset = 0;
  return members.map((file) => {
    const length = statSync(join(publicDir, file)).size;
    const slice = [file, { pack, offset, length }];
    offset += length;
    return slice;
  });
}

export function packLayout(publicDir) {
  return Object.fromEntries(PACKED_FOLDERS.filter((folder) => statSync(join(publicDir, folder), { throwIfNoEntry: false })).flatMap((folder) => folderLayout(publicDir, folder)));
}

export function packFile(slice) {
  return slice.pack.split('?')[0];
}

function slicesByPack(layout) {
  const packs = new Map();
  for (const [file, slice] of Object.entries(layout)) packs.set(packFile(slice), [...(packs.get(packFile(slice)) ?? []), [file, slice]]);
  return packs;
}

function writePack(publicDir, outDir, pack, members) {
  const target = join(outDir, pack);
  const temp = `${target}.tmp`;
  const fd = openSync(temp, 'w');
  try {
    for (const [file, slice] of members) {
      const bytes = readFileSync(join(publicDir, file));
      if (bytes.length !== slice.length) throw new Error(`${file} is ${bytes.length} bytes, but the pack layout says ${slice.length}`);
      writeSync(fd, bytes, 0, bytes.length, slice.offset);
    }
  } finally {
    closeSync(fd);
  }
  const expected = members.reduce((sum, [, slice]) => sum + slice.length, 0);
  if (statSync(temp).size !== expected) throw new Error(`${pack} came out ${statSync(temp).size} bytes, not ${expected}`);
  renameSync(temp, target);
}

export function writePacks(publicDir, outDir, layout) {
  mkdirSync(join(outDir, PACK_DIR), { recursive: true });
  for (const [pack, members] of slicesByPack(layout)) writePack(publicDir, outDir, pack, members);
  for (const folder of PACKED_FOLDERS) rmSync(join(outDir, folder), { recursive: true, force: true });
}

export function packsIn(layout) {
  return [...slicesByPack(layout).keys()];
}
