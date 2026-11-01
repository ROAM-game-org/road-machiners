import { readFileSync, writeFileSync } from 'node:fs';
import { draftName, MAP_DRAFT, REGION, MAP_SCALE } from '../src/data/region.ts';
import { START_KITS } from '../src/data/start.ts';
import { TEST_MAP } from '../src/test/map.ts';
import { newWorld } from '../src/sim/world.ts';
import { defaultSetup } from '../src/sim/settings.ts';
import { route } from '../src/sim/path.ts';
import { startPose } from '../src/sim/start-pose.ts';
import { dist } from '../src/sim/vec.ts';

const START_UNITS = [24, 22, 26, 20, 28, 18, 30, 16, 32, 14, 34];
const ARRIVE_GAP = 40;
const TRUCK_RADIUS = 0.9;

if (MAP_DRAFT === null) throw new Error('Set MAP_DRAFT to the draft scale');
const file = `src/data/drafts/${draftName(MAP_DRAFT)}.json`;
const draft = JSON.parse(readFileSync(file, 'utf8'));
const save = (fields) => writeFileSync(file, `${JSON.stringify({ ...draft, ...fields }, null, 1)}\n`);
const mode = process.argv[2];

if (mode === 'hash') {
  const hash = TEST_MAP.hash;
  save({ mapHash: hash, oldSpots: { ...draft.oldSpots, mapHash: hash }, surveySites: { ...draft.surveySites, mapHash: hash }, claimClues: { ...draft.claimClues, mapHash: hash } });
  console.log(`map ${hash}`);
} else if (mode === 'start') {
  const world = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
  const towns = REGION.towns;
  const reaches = (pos) => towns.every((t) => { const points = route(world, pos, t.pos, TRUCK_RADIUS, []); return dist(points[points.length - 1], t.pos) < t.radius + ARRIVE_GAP; });
  const units = START_UNITS.find((u) => {
    REGION.playerStart.distance = u * MAP_SCALE;
    return reaches(startPose().pos);
  });
  if (units === undefined) throw new Error(`No start along road ${REGION.playerStart.road} reaches every town on draft ${MAP_DRAFT}`);
  save({ startDistance: units * MAP_SCALE });
  console.log(`start ${units} layout units along road ${REGION.playerStart.road}`);
} else throw new Error(`draft-place takes hash or start, got ${mode}`);
