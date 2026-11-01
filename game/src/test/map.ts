import { MAPGEN } from '../data/terrain';
import { withRoutes } from '../sim/nav/layer';
import { decodeMap, routesFile, type BakedMap } from '../sim/terrain';

const FILES = {
  ...import.meta.glob<string>('/public/maps/*.bin', { query: '?url&inline', import: 'default', eager: true }),
  ...import.meta.glob<string>('/public/drafts/*.bin', { query: '?url&inline', import: 'default', eager: true }),
};
const DATA_URL = 'data:application/octet-stream;base64,';

function readFile(file: string, bake: string): Uint8Array {
  const url = FILES[`/public/${file}`];
  if (url === undefined) throw new Error(`File public/${file} is missing. Run ${bake}.`);
  if (!url.startsWith(DATA_URL)) throw new Error(`File public/${file} did not inline as base64 data`);
  return Uint8Array.from(atob(url.slice(DATA_URL.length)), (c) => c.charCodeAt(0));
}

export const TEST_MAP: BakedMap = withRoutes(decodeMap(readFile(MAPGEN.file, 'npm run map:bake')), readFile(routesFile(MAPGEN.file), 'npm run routes:bake'));
