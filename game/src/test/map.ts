
import { MAPGEN } from '../data/terrain';
import { decodeMap, type BakedMap } from '../sim/terrain';

const FILES = {
  ...import.meta.glob<string>('/public/maps/*.bin', { query: '?url&inline', import: 'default', eager: true }),
  ...import.meta.glob<string>('/public/drafts/*.bin', { query: '?url&inline', import: 'default', eager: true }),
};
const DATA_URL = 'data:application/octet-stream;base64,';

function readMap(): BakedMap {
  const url = FILES[`/public/${MAPGEN.file}`];
  if (url === undefined) throw new Error(`Map file public/${MAPGEN.file} is missing. Run npm run map:bake.`);
  if (!url.startsWith(DATA_URL)) throw new Error(`Map file public/${MAPGEN.file} did not inline as base64 data`);
  return decodeMap(Uint8Array.from(atob(url.slice(DATA_URL.length)), (c) => c.charCodeAt(0)));
}

export const TEST_MAP: BakedMap = readMap();
