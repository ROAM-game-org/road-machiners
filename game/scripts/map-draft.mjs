import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const scale = process.env.MAP_DRAFT;
if (!scale) throw new Error('Set MAP_DRAFT to the map scale of the draft, as in MAP_DRAFT=15 npm run map:draft');
const file = `src/data/drafts/draft-${scale}.json`;
const HOLLOW_RIDE_TILES = 280;
const started = performance.now();

function step(name, script, args = [], env = {}) {
  const at = performance.now();
  const out = execFileSync('node_modules/.bin/vite-node', [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 1 << 26 });
  console.log(`${name}: ${Math.round((performance.now() - at) / 1000)} s`);
  return out;
}

function patch(fields) {
  writeFileSync(file, `${JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...fields }, null, 1)}\n`);
}

mkdirSync('src/data/drafts', { recursive: true });
mkdirSync('public/drafts', { recursive: true });
writeFileSync(file, `${JSON.stringify({ mapHash: '', oldSpots: { mapHash: '', picks: [] }, surveySites: { mapHash: '', sites: [] }, claimClues: { mapHash: '', wrecks: {} }, hollow: null, startDistance: null }, null, 1)}\n`);
step('bake', 'scripts/map-bake.mjs');
step('map hash', 'scripts/draft-place.mjs', ['hash']);
step('old spots', 'scripts/old-spots.mjs');
step('old spots again', 'scripts/old-spots.mjs');
const hollow = step('hollow', 'scripts/hollow-site.mjs', [], { PICK: '100000', DRIVE_MAX: String(HOLLOW_RIDE_TILES) });
const picks = [...hollow.matchAll(/^\((\d+), (\d+)\) gate bearing (-?[\d.]+) .* drive (\d+)$/gm)].map((m) => ({ pos: { x: Number(m[1]), y: Number(m[2]) }, gateBearing: Number(m[3]), drive: Number(m[4]) }));
if (picks.length === 0) throw new Error(`No Hollow spot on draft ${scale} within a ${HOLLOW_RIDE_TILES} tile ride of the Fallen Sun:\n${hollow}`);
const best = picks.reduce((a, b) => (b.drive > a.drive ? b : a));
patch({ hollow: { pos: best.pos, gateBearing: best.gateBearing } });
console.log(`hollow at (${best.pos.x}, ${best.pos.y}), a ${best.drive} tile ride`);
console.log(step('start', 'scripts/draft-place.mjs', ['start']).trim().split('\n').at(-1));
console.log(`draft ${scale} ready in ${Math.round((performance.now() - started) / 1000)} s. Run the sim with MAP_DRAFT=${scale} npm run sim.`);
