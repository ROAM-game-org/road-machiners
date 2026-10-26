import { mkdirSync, writeFileSync } from 'node:fs';
import { makeOldSpotPicks } from '../src/sim/salvage.ts';
import { makeSurveySites } from '../src/sim/survey.ts';
import { bakeClaimClues } from '../src/sim/claims.ts';
import { makeHuntingSpots, preyTraffic } from '../src/sim/hunting-spots-bake.ts';
import { divideTurf, turfClaimants } from '../src/sim/turf.ts';
import { newWorld } from '../src/sim/world.ts';
import { defaultSetup } from '../src/sim/settings.ts';
import { TYPE_IDS } from '../src/sim/terrain.ts';
import { START_KITS } from '../src/data/start.ts';
import { TEST_MAP } from '../src/test/map.ts';
import { paintDisc, paintMap } from './map-preview.mjs';
import { encodePng } from './png.mjs';

const FILE = 'src/data/old-spots.json';
const SURVEY_FILE = 'src/data/survey-sites.json';
const CLUES_FILE = 'src/data/claim-clues.json';
const HUNTING_FILE = 'src/data/hunting-spots.json';
const HUNTING_PICTURE = 'tmp/map/hunting-spots.png';
const start = performance.now();
const picks = makeOldSpotPicks(TEST_MAP);
writeFileSync(FILE, `${JSON.stringify({ mapHash: TEST_MAP.hash, picks }, null, 1)}\n`);
const sites = makeSurveySites(TEST_MAP);
writeFileSync(SURVEY_FILE, `${JSON.stringify({ mapHash: TEST_MAP.hash, sites }, null, 1)}\n`);
const world = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
const clues = bakeClaimClues(world);
writeFileSync(CLUES_FILE, `${JSON.stringify(clues, null, 1)}\n`);
const hunting = makeHuntingSpots(world, preyTraffic(world, (line) => console.log(line)));
writeFileSync(HUNTING_FILE, `${JSON.stringify({ mapHash: TEST_MAP.hash, ...hunting })}\n`);
drawHuntingSpots(hunting.spots);
console.log(`Wrote claim clues for ${Object.keys(clues.wrecks).length} claim wrecks. Run this twice when the picks or clues changed.`);
console.log(`Wrote ${picks.length} old spots, ${sites.length} survey sites and ${hunting.spots.length} hunting spots of map ${TEST_MAP.hash}, ${Math.round(performance.now() - start)} ms`);

function drawHuntingSpots(spots) {
  const PX = 2;
  const COLORS = { scrapjaw: 0x22dd44, kiln: 0xff2a2a };
  const FREE = 0x888888;
  const grid = { size: TEST_MAP.terrain.size, heights: TEST_MAP.terrain.heights, types: Uint8Array.from(TEST_MAP.terrain.types, (t) => TYPE_IDS.indexOf(t)), props: TEST_MAP.props };
  const area = { x: 0, y: 0, w: grid.size, h: grid.size };
  const pic = paintMap(grid, area, PX);
  const claimants = turfClaimants();
  const turf = divideTurf(spots, claimants);
  const ownerOf = (p) => claimants.find((c) => turf.get(c.id).includes(p));
  for (const c of claimants) paintDisc(pic, area, PX, c.home, c.reach, COLORS[c.id], c.reach - 1.5);
  for (const p of spots) {
    const color = COLORS[ownerOf(p)?.id] ?? FREE;
    paintDisc(pic, area, PX, p, 20, color, 19);
    paintDisc(pic, area, PX, p, 4, color, 0);
  }
  mkdirSync('tmp/map', { recursive: true });
  writeFileSync(HUNTING_PICTURE, encodePng(pic.width, pic.height, pic.rgba));
  const split = claimants.map((c) => `${c.id} ${turf.get(c.id).length}`).join(', ');
  console.log(`Hunting turf: ${split}, free ${spots.filter((p) => !ownerOf(p)).length}. Picture in ${HUNTING_PICTURE}`);
}
