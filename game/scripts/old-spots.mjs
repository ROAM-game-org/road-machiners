import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { makeOldSpotPicks } from '../src/sim/salvage.ts';
import { makeSurveySites } from '../src/sim/survey.ts';
import { bakeClaimClues } from '../src/sim/claims.ts';
import { makeHuntingSpots, preyTraffic } from '../src/sim/hunting-spots-bake.ts';
import { divideTurf, turfClaimants } from '../src/sim/hunting-spots.ts';
import { newWorld } from '../src/sim/world.ts';
import { defaultSetup } from '../src/sim/settings.ts';
import { TYPE_IDS } from '../src/sim/terrain.ts';
import { START_KITS } from '../src/data/start.ts';
import { DRAFT, draftName, MAP_DRAFT } from '../src/data/region.ts';
import CLAIM_CLUES_FILE from '../src/data/claim-clues.json';
import { MAPGEN } from '../src/data/terrain.ts';
import { decodeMap } from '../src/sim/terrain.ts';
import { paintDisc, paintMap } from './map-preview.mjs';
import { encodePng } from './png.mjs';

const FILES = { oldSpots: 'src/data/old-spots.json', surveySites: 'src/data/survey-sites.json', claimClues: 'src/data/claim-clues.json', huntingSpots: 'src/data/hunting-spots.json' };
const DRAFT_FILE = MAP_DRAFT === null ? null : `src/data/drafts/${draftName(MAP_DRAFT)}.json`;

function write(kind, value, indent = 1) {
  if (DRAFT_FILE === null) {
    writeFileSync(FILES[kind], `${JSON.stringify(value, null, indent)}\n`);
    return;
  }
  const draft = JSON.parse(readFileSync(DRAFT_FILE, 'utf8'));
  writeFileSync(DRAFT_FILE, `${JSON.stringify({ ...draft, [kind]: value }, null, 1)}\n`);
}

const BAKED_MAP = decodeMap(new Uint8Array(readFileSync(`public/${MAPGEN.file}`)));
const HUNTING_PICTURE = 'tmp/map/hunting-spots.png';
const start = performance.now();
const picks = makeOldSpotPicks(BAKED_MAP);
write('oldSpots', { mapHash: BAKED_MAP.hash, picks });
const sites = makeSurveySites(BAKED_MAP);
write('surveySites', { mapHash: BAKED_MAP.hash, sites });
if ((DRAFT?.claimClues ?? CLAIM_CLUES_FILE).mapHash !== BAKED_MAP.hash) {
  write('claimClues', { mapHash: BAKED_MAP.hash, wrecks: {} });
  console.log(`Wrote ${picks.length} old spots and ${sites.length} survey sites of the new map ${BAKED_MAP.hash}. The claim clues need a world on them, so the next run bakes the clues.`);
  process.exit(0);
}
const world = newWorld(1, START_KITS.standard, BAKED_MAP, defaultSetup('roaming'), false);
const clues = bakeClaimClues(world);
write('claimClues', clues);
const hunting = makeHuntingSpots(world, preyTraffic(world, (line) => console.log(line)));
write('huntingSpots', { mapHash: BAKED_MAP.hash, ...hunting }, 0);
drawHuntingSpots(hunting.spots);
console.log(`Wrote claim clues for ${Object.keys(clues.wrecks).length} claim wrecks. Run this twice when the picks or clues changed.`);
console.log(`Wrote ${picks.length} old spots, ${sites.length} survey sites and ${hunting.spots.length} hunting spots of map ${BAKED_MAP.hash}, ${Math.round(performance.now() - start)} ms`);

function drawHuntingSpots(spots) {
  const PX = 2;
  const COLORS = { scrapjaw: 0x22dd44, kiln: 0xff2a2a };
  const FREE = 0x888888;
  const grid = { size: BAKED_MAP.terrain.size, heights: BAKED_MAP.terrain.heights, types: Uint8Array.from(BAKED_MAP.terrain.types, (t) => TYPE_IDS.indexOf(t)), props: BAKED_MAP.props };
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
