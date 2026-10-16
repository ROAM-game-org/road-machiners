import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fnv1a } from './file-hash';

function filesUnder(dir: string, prefix: string): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(dir, path) : [path];
  });
}

export function publicHashes(dir: string): Record<string, string> {
  return Object.fromEntries(filesUnder(dir, '').map((file) => [file, fnv1a(readFileSync(join(dir, file)))]));
}
