import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const TOOL = new URL('./', import.meta.url);

export function bakeSources() {
  const parts = readdirSync(new URL('parts/', TOOL)).filter((f) => f.endsWith('.js') && !f.endsWith('.overlay.js')).map((f) => `parts/${f}`);
  return ['core.js', 'kit.js', 'part.html', ...parts].sort();
}

export function sourceHash() {
  const hash = createHash('sha256');
  for (const file of bakeSources()) hash.update(`${file}\n`).update(readFileSync(new URL(file, TOOL)));
  return hash.digest('hex').slice(0, 16);
}
