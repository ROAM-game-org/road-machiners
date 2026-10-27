import { REGION } from '../data/region';
import { CRASH, TERRAIN, type TerrainTypeId, type ZoneKind } from '../data/terrain';
import { macroHeight } from '../sim/relief-solve';
import { siteGap, siteGates } from '../sim/sites';
import { startPose } from '../sim/start-pose';
import { isTerritory, territoryEntries } from '../sim/territory';
import { TYPE_IDS } from '../sim/terrain';
import { zoneWeight } from '../sim/zones';
import { lerp, type Vec } from '../sim/vec';
import { tileSteepness, type MapDraft } from './bake';
import { DESCENT_LENGTH, descentBox, descentFrame } from './descent';

type Tally = { tiles: number[]; ring: number[] };

const STEP = 2;

const ZONE_CHECKS = {
  core: 0.7,
  ring: [0.05, 0.3] as [number, number],
  mountains: { heightRange: 40, cliffShare: 0.06 },
  desert: { ground: ['sand'] as TerrainTypeId[], share: 0.6, duneRelief: 0.5 },
  swamp: { ground: ['blackMud', 'dirtyWater', 'scrub'] as TerrainTypeId[], share: 0.6, sunk: 1 },
  farmBelt: { ground: ['field', 'track', 'canal', 'sand'] as TerrainTypeId[], share: 0.35 },
  crash: { ground: ['glass'] as TerrainTypeId[], share: 0.15 },
};

export function zoneReport(seed: number, d: MapDraft): string[] {
  const kinds: ZoneKind[] = ['mountains', 'desert', 'swamp', 'farmBelt', 'crash'];
  const misses = kinds.flatMap((kind) => checkZone(seed, d, kind, kind === 'crash' ? trailTally(d) : tally(d, kind)));
  const cut = unreachable(d);
  return [...misses, ...cut.map((id) => `${id} cannot be reached by driving from the player start`)];
}

function tally(d: MapDraft, kind: ZoneKind): Tally {
  const out: Tally = { tiles: [], ring: [] };
  const [lo, hi] = ZONE_CHECKS.ring;
  for (let y = 0; y < d.size; y += STEP) for (let x = 0; x < d.size; x += STEP) {
    const w = zoneWeight(kind, x + 0.5, y + 0.5);
    if (w >= ZONE_CHECKS.core) out.tiles.push(y * d.size + x);
    else if (w >= lo && w <= hi) out.ring.push(y * d.size + x);
  }
  return out;
}

function trailTally(d: MapDraft): Tally {
  const end = CRASH.glassTrail.share * DESCENT_LENGTH;
  const flats = REGION.locations.find((l) => l.id === 'glass-flats');
  if (!flats) throw new Error('The region has no glass-flats territory');
  const box = descentBox(end, Math.max(...CRASH.glassTrail.width), d.size);
  const tiles: number[] = [];
  for (let y = box.y0; y < box.y1; y += STEP) for (let x = box.x0; x < box.x1; x += STEP) {
    const c = { x: x + 0.5, y: y + 0.5 };
    if (onTrail(c, end) && siteGap(flats, c) >= 0) tiles.push(y * d.size + x);
  }
  return { tiles, ring: [] };
}

function onTrail(c: Vec, end: number): boolean {
  const frame = descentFrame(c);
  const [wide, narrow] = CRASH.glassTrail.width;
  return frame.along >= 0 && frame.along <= end && Math.abs(frame.across) <= lerp(wide, narrow, frame.along / end) / 2;
}

function share(d: MapDraft, tiles: readonly number[], ground: readonly TerrainTypeId[]): number {
  const codes = new Set(ground.map((g) => TYPE_IDS.indexOf(g)));
  return tiles.filter((t) => codes.has(d.types[t])).length / Math.max(1, tiles.length);
}

function checkZone(seed: number, d: MapDraft, kind: ZoneKind, t: Tally): string[] {
  if (t.tiles.length === 0) return [`${kind} has no core tiles`];
  const checks: Record<ZoneKind, () => string[]> = {
    mountains: () => mountainMisses(d, t),
    desert: () => [...groundMiss(d, kind, t, ZONE_CHECKS.desert), ...duneMiss(seed, d, t)],
    swamp: () => [...groundMiss(d, kind, t, ZONE_CHECKS.swamp), ...sunkMiss(d, t)],
    farmBelt: () => groundMiss(d, kind, t, ZONE_CHECKS.farmBelt),
    crash: () => groundMiss(d, kind, t, ZONE_CHECKS.crash),
  };
  return checks[kind]();
}

function groundMiss(d: MapDraft, kind: ZoneKind, t: Tally, rule: { ground: readonly TerrainTypeId[]; share: number }): string[] {
  const got = share(d, t.tiles, rule.ground);
  console.log(`${kind}: ${(got * 100).toFixed(0)}% ${rule.ground.join(', ')}`);
  return got < rule.share ? [`${kind} is ${(got * 100).toFixed(0)}% ${rule.ground.join(', ')}, below ${rule.share * 100}%`] : [];
}

function mountainMisses(d: MapDraft, t: Tally): string[] {
  const heights = t.tiles.map((k) => tileHeight(d, k)).sort((a, b) => a - b);
  const range = heights[Math.floor(heights.length * 0.95)] - heights[Math.floor(heights.length * 0.05)];
  const cliffs = t.tiles.filter((k) => tileSteepness(d.heights, d.size, k) > TERRAIN.drive.maxSlope).length / t.tiles.length;
  console.log(`mountains: height range ${range.toFixed(1)}, cliffs ${(cliffs * 100).toFixed(1)}%`);
  const { heightRange, cliffShare } = ZONE_CHECKS.mountains;
  return [...(range < heightRange ? [`mountains rise only ${range.toFixed(1)}, below ${heightRange}`] : []), ...(cliffs < cliffShare ? [`mountains have ${(cliffs * 100).toFixed(1)}% cliffs, below ${cliffShare * 100}%`] : [])];
}

function duneMiss(seed: number, d: MapDraft, t: Tally): string[] {
  const lifts = t.tiles.map((k) => tileHeight(d, k) - macroHeight(seed, (k % d.size) + 0.5, Math.floor(k / d.size) + 0.5));
  const mean = lifts.reduce((a, b) => a + b, 0) / lifts.length;
  const spread = Math.sqrt(lifts.reduce((a, b) => a + (b - mean) ** 2, 0) / lifts.length);
  console.log(`desert: dune relief ${spread.toFixed(2)}`);
  return spread < ZONE_CHECKS.desert.duneRelief ? [`desert dunes stand only ${spread.toFixed(2)} high, below ${ZONE_CHECKS.desert.duneRelief}`] : [];
}

function sunkMiss(d: MapDraft, t: Tally): string[] {
  const mean = (tiles: readonly number[]): number => tiles.reduce((a, k) => a + tileHeight(d, k), 0) / Math.max(1, tiles.length);
  const sunk = mean(t.ring) - mean(t.tiles);
  console.log(`swamp: floor ${sunk.toFixed(2)} below its rim`);
  return sunk < ZONE_CHECKS.swamp.sunk ? [`swamp floor lies only ${sunk.toFixed(2)} below its rim, below ${ZONE_CHECKS.swamp.sunk}`] : [];
}

function tileHeight(d: MapDraft, tile: number): number {
  const n = d.size + 1;
  const k = Math.floor(tile / d.size) * n + (tile % d.size);
  return (d.heights[k] + d.heights[k + 1] + d.heights[k + n] + d.heights[k + n + 1]) / 4;
}

function unreachable(d: MapDraft): string[] {
  const reached = driveFlood(d, startPose().pos);
  const goals: { id: string; at: Vec }[] = [
    ...[...REGION.towns, ...REGION.locations.filter((l) => !isTerritory(l))].flatMap((s) => siteGates(s).map((at) => ({ id: s.id, at }))),
    ...REGION.locations.filter(isTerritory).flatMap((t) => territoryEntries(t).map((at) => ({ id: t.id, at }))),
  ];
  const cut = goals.filter((g) => !nearReached(d, reached, g.at)).map((g) => g.id);
  return [...new Set(cut)];
}

function nearReached(d: MapDraft, reached: Uint8Array, at: Vec): boolean {
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (reachedAt(d.size, reached, Math.floor(at.x) + dx, Math.floor(at.y) + dy)) return true;
  }
  return false;
}

function reachedAt(size: number, reached: Uint8Array, x: number, y: number): boolean {
  const inside = x >= 0 && y >= 0 && x < size && y < size;
  return inside && reached[y * size + x] === 1;
}

function driveFlood(d: MapDraft, from: Vec): Uint8Array {
  const reached = new Uint8Array(d.size * d.size);
  const start = Math.floor(from.y) * d.size + Math.floor(from.x);
  const queue = new Int32Array(d.size * d.size);
  let [head, tail] = [0, 0];
  reached[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const k = queue[head++];
    for (const m of sideTiles(d.size, k)) {
      if (reached[m] || tileSteepness(d.heights, d.size, m) > TERRAIN.drive.maxSlope) continue;
      reached[m] = 1;
      queue[tail++] = m;
    }
  }
  return reached;
}

function sideTiles(size: number, k: number): number[] {
  const x = k % size;
  return [x > 0 ? k - 1 : -1, x < size - 1 ? k + 1 : -1, k >= size ? k - size : -1, k < size * (size - 1) ? k + size : -1].filter((m) => m >= 0);
}
