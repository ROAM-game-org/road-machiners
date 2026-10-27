import { readFileSync, writeFileSync } from 'node:fs';
import { makeOldSpotPicks } from '../src/sim/salvage.ts';
import { makeSurveySites } from '../src/sim/survey.ts';
import { bakeClaimClues } from '../src/sim/claims.ts';
import { newWorld } from '../src/sim/world.ts';
import { defaultSetup } from '../src/sim/settings.ts';
import { START_KITS } from '../src/data/start.ts';
import { draftName, MAP_DRAFT } from '../src/data/region.ts';
import { TEST_MAP } from '../src/test/map.ts';

const FILES = { oldSpots: 'src/data/old-spots.json', surveySites: 'src/data/survey-sites.json', claimClues: 'src/data/claim-clues.json' };
const DRAFT_FILE = MAP_DRAFT === null ? null : `src/data/drafts/${draftName(MAP_DRAFT)}.json`;

function write(kind, value) {
  if (DRAFT_FILE === null) {
    writeFileSync(FILES[kind], `${JSON.stringify(value, null, 1)}\n`);
    return;
  }
  const draft = JSON.parse(readFileSync(DRAFT_FILE, 'utf8'));
  writeFileSync(DRAFT_FILE, `${JSON.stringify({ ...draft, [kind]: value }, null, 1)}\n`);
}

const start = performance.now();
const picks = makeOldSpotPicks(TEST_MAP);
write('oldSpots', { mapHash: TEST_MAP.hash, picks });
const sites = makeSurveySites(TEST_MAP);
write('surveySites', { mapHash: TEST_MAP.hash, sites });
const world = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
const clues = bakeClaimClues(world);
write('claimClues', clues);
console.log(`Wrote claim clues for ${Object.keys(clues.wrecks).length} claim wrecks. Run this twice when the picks or clues changed.`);
console.log(`Wrote ${picks.length} old spots and ${sites.length} survey sites of map ${TEST_MAP.hash}, ${Math.round(performance.now() - start)} ms`);
