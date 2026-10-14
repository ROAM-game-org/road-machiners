import { writeFileSync } from 'node:fs';
import { makeOldSpotPicks } from '../src/sim/salvage.ts';
import { makeSurveySites } from '../src/sim/survey.ts';
import { TEST_MAP } from '../src/test/map.ts';

const FILE = 'src/data/old-spots.json';
const SURVEY_FILE = 'src/data/survey-sites.json';
const start = performance.now();
const picks = makeOldSpotPicks(TEST_MAP);
writeFileSync(FILE, `${JSON.stringify({ mapHash: TEST_MAP.hash, picks }, null, 1)}\n`);
const sites = makeSurveySites(TEST_MAP);
writeFileSync(SURVEY_FILE, `${JSON.stringify({ mapHash: TEST_MAP.hash, sites }, null, 1)}\n`);
console.log(`Wrote ${picks.length} old spots and ${sites.length} survey sites of map ${TEST_MAP.hash}, ${Math.round(performance.now() - start)} ms`);
