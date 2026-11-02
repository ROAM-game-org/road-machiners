import { REGION } from '../src/data/region';
import { sitePads } from '../src/sim/sites';
import { dist } from '../src/sim/vec';
import { skipToHour, spawnNear, teleport, toggleGod } from '../src/sim/cheats';
import { standardWorld } from '../src/test/world-cache';
import { buildDrive, captureDrive, freeDrive, initPhysics } from '../src/phys/drive';
import { computeTurn } from '../src/phys/turn';
import { perfSnapshot } from '../src/perf';

const mode = process.argv[2] ?? 'drive';
const turns = Number(process.argv[3] ?? 8);
await initPhysics();
const base = standardWorld(1);
const towns = REGION.towns.flatMap((def) => {
  const pad = sitePads(def)[0];
  return pad ? [{ def, pad }] : [];
});
const props = (t) => base.obstacles.filter((o) => dist(o.pos, t.pad) <= 40).length;
const town = towns.reduce((a, b) => (props(b) > props(a) ? b : a));
const clamp = (v) => Math.max(1, Math.min(base.size - 1, v));
const outside = teleport(skipToHour(base, 12), { x: clamp(town.def.pos.x + town.def.radius + 25), y: clamp(town.def.pos.y) });
let world = mode === 'fight' ? ['buggy', 'gunwagon', 'buggy'].reduce((w, t) => spawnNear(w, t, true), toggleGod(outside)) : outside;
const me = world.vehicles.find((v) => v.id === world.player.vehicleId);
const dest = mode === 'fight' ? { x: clamp(me.pos.x + 10), y: clamp(me.pos.y + 6) } : { x: clamp(me.pos.x + 150), y: me.pos.y };
world = { ...world, vehicles: world.vehicles.map((v) => (v.id === me.id ? { ...v, order: { kind: 'through', dest } } : v)) };
console.log(mode, 'town', town.def.id, 'vehicles', world.vehicles.length);
if (process.env.WARM) {
  const { campWarmSteps } = await import('../src/sim/camp-warm');
  campWarmSteps(world).forEach((step, i) => {
    const started = performance.now();
    step();
    console.log(`warm step ${i} ${(performance.now() - started).toFixed(0)} ms`);
  });
}
for (let i = 0; i < turns; i++) {
  const drive = buildDrive(world);
  const { terrain, ...state } = world;
  const before = perfSnapshot();
  const t = performance.now();
  const prepared = computeTurn({ world: structuredClone(state), drive: captureDrive(drive), questLanguage: 'en', tailSteps: 11, fastTravel: false }, terrain);
  const ms = performance.now() - t;
  freeDrive(drive);
  const after = perfSnapshot();
  const steps = Object.entries(after)
    .map(([k, v]) => [k, v.total - (before[k]?.total ?? 0)])
    .filter(([, v]) => v > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k} ${v.toFixed(0)}`);
  console.log(`turn ${i} ${ms.toFixed(0)} ms (${steps.join(', ')})`);
  world = { ...prepared.world, terrain };
}
