import { REGION } from '../src/data/region.ts';
import { HOLLOW, hollowTurn } from '../src/data/sunward.ts';
import { TERRAIN } from '../src/data/terrain.ts';
import { SKILL_EFFECTS, MAX_RANK } from '../src/data/skills.ts';
import { PHYSICS } from '../src/data/physics.ts';
import { startKit } from '../src/data/start.ts';
import { TEST_MAP } from '../src/test/map.ts';
import { newWorld } from '../src/sim/world.ts';
import { defaultSetup } from '../src/sim/settings.ts';
import { route, routeLength } from '../src/sim/path.ts';
import { heightAt, isCliff, tileAt } from '../src/sim/terrain.ts';
import { siteGap } from '../src/sim/sites.ts';
import { atlasOf } from '../src/sim/atlas.ts';
import { fortressProps } from '../src/sim/fortress.ts';
import { clearOfDecks, clearOfSites, isDriveObstacle, overlapsAny } from '../src/sim/mapgen.ts';
import { isHollowObstacle } from '../src/sim/sunward.ts';
import { lightZone } from '../src/sim/sunward-crater.ts';

const SIGHT_MARGIN = 10;
const MAXED_DAY_SIGHT = TERRAIN.vision.radius * (1 + SKILL_EFFECTS.perception.sight * MAX_RANK);
const MIN_ROAD_GAP = Number(process.env.MIN_ROAD_GAP ?? MAXED_DAY_SIGHT + HOLLOW.sightReach + SIGHT_MARGIN);
const MIN_SITE_GAP = Number(process.env.MIN_SITE_GAP ?? TERRAIN.vision.radius * TERRAIN.vision.grayFactor + HOLLOW.radius);
const MIN_CRATER_GAP = Number(process.env.MIN_CRATER_GAP ?? 30);
const DRIVE_BAND = [Number(process.env.DRIVE_MIN ?? 0), Number(process.env.DRIVE_MAX ?? 280)];
const PICK = Number(process.env.PICK ?? 25);
const POST_RING = Number(process.env.POST_RING ?? 11);
const MAX_RELIEF = Number(process.env.MAX_RELIEF ?? 1.2);
const FOOTPRINT = HOLLOW.radius + 2;
const STEP = 4;
const CHASSIS_RADIUS = 0.9;
const CAMERA_REACH = 30;
const GRAZE = 0.816 / Math.SQRT2;
const TILE = PHYSICS.metersPerTile;

const baseBearing = Math.atan2(HOLLOW.site.gates[0].y - HOLLOW.pos.y, HOLLOW.site.gates[0].x - HOLLOW.pos.x);
moveHollowOffMap();
const world = newWorld(1, startKit('standard'), TEST_MAP, defaultSetup('roaming'), false);
world.obstacles = world.obstacles.filter((o) => !isHollowObstacle(o));
const terrain = world.terrain;
const atlas = atlasOf(terrain);
const fallenSun = REGION.locations.find((l) => l.id === 'fallen-sun');
const light = lightZone();
const sites = [...REGION.towns, ...REGION.locations];
const drive = world.obstacles.filter(isDriveObstacle);

function moveHollowOffMap() {
  const shift = { x: -10000 - HOLLOW.pos.x, y: -10000 - HOLLOW.pos.y };
  for (const p of [HOLLOW.pos, ...HOLLOW.site.gates]) {
    p.x += shift.x;
    p.y += shift.y;
  }
}

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

function turned(offset, by) {
  return { x: offset.x * Math.cos(by) - offset.y * Math.sin(by), y: offset.x * Math.sin(by) + offset.y * Math.cos(by) };
}

function layout(p, bearing) {
  const by = bearing - baseBearing;
  const at = (o) => {
    const q = turned(o, by);
    return { x: p.x + q.x, y: p.y + q.y };
  };
  const site = { ...HOLLOW.site, pos: p, turn: hollowTurn(bearing), gates: [{ x: p.x + Math.cos(bearing) * HOLLOW.radius, y: p.y + Math.sin(bearing) * HOLLOW.radius }] };
  const fort = fortressProps(site).map((o) => ({ pos: o.pos, r: o.r }));
  const inside = HOLLOW.pieces.map((o) => ({ pos: at(o.at), r: o.r }));
  return { site, pieces: [...fort, ...inside], bays: HOLLOW.bays.map(at) };
}

function hiddenFromCamera(spot) {
  const eye = heightAt(terrain, spot.x, spot.y) + 1;
  for (let d = 1; d < CAMERA_REACH; d += 0.5) {
    const k = d / Math.SQRT2;
    if (heightAt(terrain, spot.x + k, spot.y + k) > eye + d * TILE * GRAZE) return true;
  }
  return false;
}

function postToward(p) {
  const a = Math.atan2(p.y - light.pos.y, p.x - light.pos.x);
  return { x: light.pos.x + Math.cos(a) * POST_RING, y: light.pos.y + Math.sin(a) * POST_RING };
}

const candidates = [];
const rejected = { crater: 0, road: 0, site: 0, relief: 0, props: 0, bays: 0, camera: 0 };
for (let y = 20; y < terrain.size - 20; y += STEP) {
  for (let x = 20; x < terrain.size - 20; x += STEP) {
    const p = { x, y };
    const craterGap = siteGap(fallenSun, p);
    if (craterGap < MIN_CRATER_GAP || craterGap > DRIVE_BAND[1]) { rejected.crater++; continue; }
    const road = roadGap(p);
    if (road < MIN_ROAD_GAP) { rejected.road++; continue; }
    const site = siteGapOf(p);
    if (site < MIN_SITE_GAP) { rejected.site++; continue; }
    const relief = footprintRelief(p);
    if (relief > MAX_RELIEF) { rejected.relief++; continue; }
    const bearing = Math.atan2(light.pos.y - p.y, light.pos.x - p.x);
    const fort = layout(p, bearing);
    if (fort.pieces.some((o) => overlapsAny(drive, o.pos, o.r) || !clearOfSites(atlas, o.pos, o.r) || !clearOfDecks(atlas, o.pos, o.r))) { rejected.props++; continue; }
    if (fort.bays.some((b) => overlapsAny(drive, b, 1.5))) { rejected.bays++; continue; }
    const hidden = [...fort.bays, fort.site.gates[0]].filter(hiddenFromCamera).length;
    if (hidden > 0) { rejected.camera++; continue; }
    candidates.push({ p, bearing, craterGap, road, site, relief, gate: fort.site.gates[0] });
  }
}
candidates.sort((a, b) => a.craterGap - b.craterGap);
const picked = [];
let tried = 0;
for (const c of candidates) {
  if (tried++ >= PICK) break;
  if (process.env.VERBOSE) console.log(`try (${c.p.x}, ${c.p.y})`);
  const goal = postToward(c.p);
  const path = route(world, c.gate, goal, CHASSIS_RADIUS, []);
  const end = path[path.length - 1];
  if (!end || Math.hypot(end.x - goal.x, end.y - goal.y) > 3) continue;
  const length = routeLength(c.gate, path);
  if (process.env.VERBOSE) console.log(`(${c.p.x}, ${c.p.y}) drive ${length.toFixed(0)} crater edge ${c.craterGap.toFixed(0)} relief ${c.relief.toFixed(2)}`);
  if (length < DRIVE_BAND[0] || length > DRIVE_BAND[1]) continue;
  picked.push({ ...c, drive: length });
}
console.log(JSON.stringify(rejected));
console.log(`map ${TEST_MAP.hash}, ${candidates.length} candidates pass the gaps, relief, props and camera`);
picked.sort((a, b) => a.drive - b.drive);
for (const c of picked) {
  console.log(`(${c.p.x}, ${c.p.y}) gate bearing ${c.bearing.toFixed(2)} relief ${c.relief.toFixed(2)} road ${c.road.toFixed(0)} site ${c.site.toFixed(0)} crater edge ${c.craterGap.toFixed(0)} drive ${c.drive.toFixed(0)}`);
}
