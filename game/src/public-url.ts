import { PUBLIC_HASHES } from './config';

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
