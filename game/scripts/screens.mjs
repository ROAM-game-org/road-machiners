import { mkdir } from 'node:fs/promises';

const GALLERY = 'docs/screens';
const names = process.argv.slice(2);
const url = process.env.SCREENS_URL ?? 'http://localhost:5173';

await mkdir(GALLERY, { recursive: true });
process.env.LAYOUT_GALLERY = GALLERY;
process.env.LAYOUT_LOCALES = 'en';
process.env.LAYOUT_SIZES = '1280x720';
if (names.length > 0) process.env.LAYOUT_STATES = names.join(',');
process.argv = [process.argv[0], process.argv[1], url];
await import('./layout-check.mjs');
