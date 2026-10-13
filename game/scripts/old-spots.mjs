import { writeFileSync } from 'node:fs';
import { makeOldSpotPicks } from '../src/sim/salvage.ts';
import { TEST_MAP } from '../src/test/map.ts';

const FILE = 'src/data/old-spots.json';
const start = performance.now();
const picks = makeOldSpotPicks(TEST_MAP);
writeFileSync(FILE, `${JSON.stringify({ mapHash: TEST_MAP.hash, picks }, null, 1)}\n`);
console.log(`Wrote ${picks.length} old spots of map ${TEST_MAP.hash} to ${FILE}, ${Math.round(performance.now() - start)} ms`);
