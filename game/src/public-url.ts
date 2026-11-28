import { PUBLIC_HASHES, PUBLIC_PACKS } from './config';
import { AssetRefused, BROWSER_NET, fetchAssetBody, type AssetBody, type AssetNet } from './fetch-asset';

export type PublicFiles = { hashes: Record<string, string>; base: string; dev: boolean };

export const BUILD_FILES: PublicFiles = { hashes: PUBLIC_HASHES, base: import.meta.env.BASE_URL, dev: import.meta.env.DEV };

export function publicHash(file: string, files: PublicFiles = BUILD_FILES): string | null {
  const hash = files.hashes[file];
  if (hash !== undefined) return hash;
  if (files.dev) return null;
  throw new Error(`Public file ${file} is not in this build`);
}

export function publicUrl(file: string, files: PublicFiles = BUILD_FILES): string {
  const hash = publicHash(file, files);
  return hash === null ? `${files.base}${file}` : `${files.base}${file}?v=${hash}`;
}

export type PackSlice = { pack: string; offset: number; length: number };

export type PublicPacks = { slices: Record<string, PackSlice>; base: string };

export const BUILD_PACKS: PublicPacks = { slices: PUBLIC_PACKS, base: import.meta.env.BASE_URL };

export class PackRangeRefused extends AssetRefused {
  constructor(file: string, detail: string) {
    super(`The host refused the slice of ${file}: ${detail}`);
    this.name = 'PackRangeRefused';
  }
}

function rangeOf(slice: PackSlice): string {
  return `bytes=${slice.offset}-${slice.offset + slice.length - 1}`;
}

function rangeNet(net: AssetNet, file: string): AssetNet {
  return {
    ...net,
    fetch: async (url, init) => {
      const response = await net.fetch(url, init);
      if (response.status === 206 || response.status === 200 || !response.ok) return response;
      await response.body?.cancel();
      throw new PackRangeRefused(file, `HTTP ${response.status} instead of 206`);
    },
  };
}

type PackState = { kind: 'probing'; done: Promise<unknown> } | { kind: 'ranges' } | { kind: 'whole'; body: AssetBody; unserved: Set<string> };

const packStates = new WeakMap<AssetNet, Map<string, PackState>>();

function statesOf(net: AssetNet): Map<string, PackState> {
  let states = packStates.get(net);
  if (states === undefined) {
    states = new Map();
    packStates.set(net, states);
  }
  return states;
}

function membersOf(packs: PublicPacks, pack: string): string[] {
  return Object.keys(packs.slices).filter((file) => packs.slices[file].pack === pack);
}

function packSize(packs: PublicPacks, members: string[]): number {
  return members.reduce((size, file) => Math.max(size, packs.slices[file].offset + packs.slices[file].length), 0);
}

function sliceOf(whole: AssetBody, slice: PackSlice): AssetBody {
  return { response: whole.response, bytes: whole.bytes.slice(slice.offset, slice.offset + slice.length) };
}

async function rangedRead(label: string, file: string, slice: PackSlice, init: RequestInit | undefined, packs: PublicPacks, net: AssetNet): Promise<AssetBody> {
  const headers = new Headers(init?.headers);
  headers.set('Range', rangeOf(slice));
  const body = await fetchAssetBody(label, `${packs.base}${slice.pack}`, { ...init, headers }, rangeNet(net, file));
  if (body.response.status === 200) {
    const size = packSize(packs, membersOf(packs, slice.pack));
    if (body.bytes.byteLength !== size) throw new PackRangeRefused(file, `${body.bytes.byteLength} bytes instead of the pack's ${size}`);
    return body;
  }
  if (body.bytes.byteLength !== slice.length) throw new PackRangeRefused(file, `${body.bytes.byteLength} bytes instead of ${slice.length}`);
  return body;
}

function serveWhole(states: Map<string, PackState>, pack: string, state: Extract<PackState, { kind: 'whole' }>, file: string, slice: PackSlice): AssetBody {
  state.unserved.delete(file);
  if (state.unserved.size === 0 && states.get(pack) === state) states.delete(pack);
  return sliceOf(state.body, slice);
}

async function probe(label: string, file: string, slice: PackSlice, init: RequestInit | undefined, packs: PublicPacks, net: AssetNet, states: Map<string, PackState>): Promise<AssetBody> {
  const read = rangedRead(label, file, slice, init, packs, net);
  states.set(slice.pack, { kind: 'probing', done: read });
  try {
    const body = await read;
    if (body.response.status !== 200) {
      states.set(slice.pack, { kind: 'ranges' });
      return body;
    }
    const members = membersOf(packs, slice.pack);
    console.warn(`Host ignored Range for ${slice.pack}, reading the whole ${body.bytes.byteLength} bytes`);
    const state = { kind: 'whole' as const, body, unserved: new Set(members) };
    states.set(slice.pack, state);
    return serveWhole(states, slice.pack, state, file, slice);
  } catch (error) {
    states.delete(slice.pack);
    throw error;
  }
}

async function packedBytes(label: string, file: string, slice: PackSlice, init: RequestInit | undefined, packs: PublicPacks, net: AssetNet): Promise<AssetBody> {
  const states = statesOf(net);
  if (init?.cache === 'reload') states.delete(slice.pack);
  for (;;) {
    const state = states.get(slice.pack);
    if (state === undefined) return probe(label, file, slice, init, packs, net, states);
    if (state.kind === 'whole') return serveWhole(states, slice.pack, state, file, slice);
    if (state.kind === 'ranges') return rangedRead(label, file, slice, init, packs, net);
    await state.done.catch(() => undefined);
  }
}

export function publicBytes(label: string, file: string, init?: RequestInit, packs: PublicPacks = BUILD_PACKS, net: AssetNet = BROWSER_NET): Promise<AssetBody> {
  const slice = packs.slices[file];
  if (slice === undefined) return fetchAssetBody(label, publicUrl(file), init, net);
  return packedBytes(label, file, slice, init, packs, net);
}
