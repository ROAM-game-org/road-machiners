import { REGION } from '../src/data/region.ts';
import { startKit } from '../src/data/start.ts';
import { TEST_MAP } from '../src/test/map.ts';
import { newWorld } from '../src/sim/world.ts';
import { defaultSetup } from '../src/sim/settings.ts';
import { route, routeLength } from '../src/sim/path.ts';
import { heightAt, isCliff, tileAt } from '../src/sim/terrain.ts';
import { siteGap } from '../src/sim/sites.ts';
import { territoryGrounds } from '../src/sim/territory.ts';
import { isDriveObstacle } from '../src/sim/mapgen.ts';

const MIN_ROAD_GAP = Number(process.env.MIN_ROAD_GAP ?? 32);
const MIN_SITE_GAP = Number(process.env.MIN_SITE_GAP ?? 40);
const CRATER_REACH = [Number(process.env.CRATER_MIN ?? 60), Number(process.env.CRATER_MAX ?? 120)];
const FOOTPRINT = 8;
const STEP = 4;
const CHASSIS_RADIUS = 0.9;

const world = newWorld(1, startKit('standard'), TEST_MAP, defaultSetup('roaming'), false);
const terrain = world.terrain;
const fallenSun = REGION.locations.find((l) => l.id === 'fallen-sun');
const grounds = territoryGrounds(fallenSun);
const sites = [...REGION.towns, ...REGION.locations];
const drive = world.obstacles.filter(isDriveObstacle);

function segmentGap(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function roadGap(p) {
  return Math.min(...REGION.roads.flatMap((road) => road.slice(1).map((b, i) => segmentGap(p, road[i], b))));
}

function siteGapOf(p) {
  return Math.min(...sites.filter((s) => s.id !== 'fallen-sun').map((s) => siteGap(s, p)));
}

function footprintRelief(p) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let dy = -FOOTPRINT; dy <= FOOTPRINT; dy++) {
    for (let dx = -FOOTPRINT; dx <= FOOTPRINT; dx++) {
      if (dx * dx + dy * dy > FOOTPRINT * FOOTPRINT) continue;
      const q = { x: p.x + dx, y: p.y + dy };
      if (isCliff(terrain, tileAt(terrain, q))) return Infinity;
      const h = heightAt(terrain, q.x, q.y);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  }
  return hi - lo;
}

function hollowDepth(p) {
  const ring = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return heightAt(terrain, p.x + Math.cos(a) * (FOOTPRINT + 6), p.y + Math.sin(a) * (FOOTPRINT + 6));
  });
  return ring.reduce((s, h) => s + h, 0) / ring.length - heightAt(terrain, p.x, p.y);
}

function clearOfProps(p) {
  return drive.every((o) => Math.hypot(o.pos.x - p.x, o.pos.y - p.y) > o.r + FOOTPRINT);
}

const candidates = [];
for (let y = 20; y < terrain.size - 20; y += STEP) {
  for (let x = 20; x < terrain.size - 20; x += STEP) {
    const p = { x, y };
    const crater = Math.hypot(p.x - fallenSun.pos.x, p.y - fallenSun.pos.y);
    if (crater < CRATER_REACH[0] || crater > CRATER_REACH[1]) continue;
    const road = roadGap(p);
    if (road < MIN_ROAD_GAP) continue;
    const site = siteGapOf(p);
    if (site < MIN_SITE_GAP) continue;
    const relief = footprintRelief(p);
    if (relief > 1.2 || !clearOfProps(p)) continue;
    candidates.push({ p, crater, road, site, relief, depth: hollowDepth(p) });
  }
}
candidates.sort((a, b) => b.depth - a.depth);
const top = [];
for (const c of candidates) {
  if (top.length >= 8) break;
  const goal = grounds.reduce((a, b) => (Math.hypot(a.x - c.p.x, a.y - c.p.y) <= Math.hypot(b.x - c.p.x, b.y - c.p.y) ? a : b));
  const path = route(world, c.p, goal, CHASSIS_RADIUS, []);
  const end = path[path.length - 1];
  if (!end || Math.hypot(end.x - goal.x, end.y - goal.y) > 3) continue;
  top.push({ ...c, goal, drive: routeLength(c.p, path) });
}
console.log(`map ${TEST_MAP.hash}, ${candidates.length} candidates pass the gaps, relief and props`);
for (const c of top) {
  console.log(`(${c.p.x}, ${c.p.y}) depth ${c.depth.toFixed(2)} relief ${c.relief.toFixed(2)} road ${c.road.toFixed(0)} site ${c.site.toFixed(0)} crater ${c.crater.toFixed(0)} drive ${c.drive.toFixed(0)} tiles to (${c.goal.x.toFixed(0)}, ${c.goal.y.toFixed(0)})`);
}
