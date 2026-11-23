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
      if (response.status === 206 || !response.ok) return response;
      await response.body?.cancel();
      throw new PackRangeRefused(file, `HTTP ${response.status} instead of 206`);
    },
  };
}

async function packedBytes(label: string, file: string, slice: PackSlice, init: RequestInit | undefined, packs: PublicPacks, net: AssetNet): Promise<AssetBody> {
  const headers = new Headers(init?.headers);
  headers.set('Range', rangeOf(slice));
  const body = await fetchAssetBody(label, `${packs.base}${slice.pack}`, { ...init, headers }, rangeNet(net, file));
  if (body.bytes.byteLength !== slice.length) throw new PackRangeRefused(file, `${body.bytes.byteLength} bytes instead of ${slice.length}`);
  return body;
}

export function publicBytes(label: string, file: string, init?: RequestInit, packs: PublicPacks = BUILD_PACKS, net: AssetNet = BROWSER_NET): Promise<AssetBody> {
  const slice = packs.slices[file];
  if (slice === undefined) return fetchAssetBody(label, publicUrl(file), init, net);
  return packedBytes(label, file, slice, init, packs, net);
}
