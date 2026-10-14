import { readdirSync, statSync } from 'node:fs';
import { fallbackName, readLengths, saveLengths, SFX_DIR, writeFallback } from './sfx-lib.mjs';

const oggs = readdirSync(SFX_DIR).filter((f) => f.endsWith('.ogg'));
oggs.forEach(writeFallback);
const lengths = readLengths();
saveLengths(Object.fromEntries(oggs.map((f) => [f, lengths[f]])));
const bytes = oggs.reduce((sum, f) => sum + statSync(`${SFX_DIR}/${fallbackName(f)}`).size, 0);
console.log(`${oggs.length} fallbacks, ${(bytes / 1e6).toFixed(1)} MB`);
