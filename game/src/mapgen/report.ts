import { REGION } from '../data/region';
import { CRASH, GEOLOGY, TERRAIN, type TerrainTypeId, type ZoneKind } from '../data/terrain';
import { macroHeight } from '../sim/relief-solve';
import { siteGap, siteGates } from '../sim/sites';
import { startPose } from '../sim/start-pose';
import { isTerritory, territoryEntries } from '../sim/territory';
import { TYPE_IDS } from '../sim/terrain';
import { zoneWeight } from '../sim/zones';
import { lerp, type Vec } from '../sim/vec';
import { tileSteepness, type MapDraft } from './bake';
import { DESCENT_LENGTH, descentBox, descentFrame } from './descent';
import { trappedFloors } from './exits';
import { ditchRises } from './farmbelt';

type Tally = { tiles: number[]; ring: number[] };

const STEP = 2;

const ZONE_CHECKS = {
  core: 0.7,
  ring: [0.05, 0.3] as [number, number],
  mountains: { heightRange: 40, cliffShare: 0.06 },
  desert: { ground: ['sand'] as TerrainTypeId[], share: 0.6, duneRelief: 0.5, spacing: { band: [25, 100] as [number, number], grid: 60, transect: 300, window: 10, prominence: 0.5 } },
  swamp: { ground: ['blackMud', 'dirtyWater', 'scrub'] as TerrainTypeId[], share: 0.6, sunk: 1 },
  farmBelt: { ground: ['field', 'track', 'canal', 'sand'] as TerrainTypeId[], share: 0.35, bedRise: 0.05 },
  crash: { ground: ['glass'] as TerrainTypeId[], share: 0.15 },
};

export function zoneReport(seed: number, d: MapDraft): string[] {
  const kinds: ZoneKind[] = ['mountains', 'desert', 'swamp', 'farmBelt', 'crash'];
  const misses = kinds.flatMap((kind) => checkZone(seed, d, kind, kind === 'crash' ? trailTally(d) : tally(d, kind)));
  const cut = unreachable(d);
  return [...misses, ...cut.map((id) => `${id} cannot be reached by driving from the player start`), ...trapMisses(d)];
}

function trapMisses(d: MapDraft): string[] {
  const traps = trappedFloors(d);
  console.log(`ravines: ${traps.length} floors further than their exit spacing from a way out`);
  return traps.map((p) => `a truck that drops into the floor at ${p.x.toFixed(0)}, ${p.y.toFixed(0)} drives further than its exit spacing to climb out`);
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
    desert: () => [...groundMiss(d, kind, t, ZONE_CHECKS.desert), ...duneMiss(seed, d, t), ...spacingMiss(seed, d, t)],
    swamp: () => [...groundMiss(d, kind, t, ZONE_CHECKS.swamp), ...sunkMiss(d, t)],
    farmBelt: () => [...groundMiss(d, kind, t, ZONE_CHECKS.farmBelt), ...ditchMiss(seed, d)],
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

function spacingMiss(seed: number, d: MapDraft, t: Tally): string[] {
  const spacing = duneSpacing(seed, d, t.tiles);
  const [lo, hi] = ZONE_CHECKS.desert.spacing.band;
  console.log(`desert: dune crests ${spacing.toFixed(1)} apart`);
  return spacing >= lo && spacing <= hi ? [] : [`desert dune crests lie ${spacing.toFixed(1)} apart, outside ${lo} to ${hi}`];
}

export function duneSpacing(seed: number, d: Pick<MapDraft, 'size' | 'heights'>, tiles: readonly number[]): number {
  const { grid, transect } = ZONE_CHECKS.desert.spacing;
  const wind = (GEOLOGY.wind.direction * Math.PI) / 180;
  const starts = tiles.filter((k) => (k % d.size) % grid === 0 && Math.floor(k / d.size) % grid === 0);
  const spacings = starts.map((k) => liftLine(seed, d, k, wind, transect)).filter((line) => line.length === transect).map((line) => line.length / Math.max(1, crestCount(line)));
  if (spacings.length === 0) throw new Error('The desert has no full transect to measure its dunes on');
  return spacings.sort((a, b) => a - b)[Math.floor(spacings.length / 2)];
}

function liftLine(seed: number, d: Pick<MapDraft, 'size' | 'heights'>, tile: number, wind: number, length: number): number[] {
  const x0 = tile % d.size;
  const y0 = Math.floor(tile / d.size);
  const line: number[] = [];
  for (let s = 0; s < length; s++) {
    const [x, y] = [x0 + Math.cos(wind) * s, y0 + Math.sin(wind) * s];
    if (x < 0 || y < 0 || x >= d.size - 1 || y >= d.size - 1) break;
    line.push(tileHeight(d, Math.floor(y) * d.size + Math.floor(x)) - macroHeight(seed, x, y));
  }
  return line;
}

function crestCount(line: readonly number[]): number {
  const { window, prominence } = ZONE_CHECKS.desert.spacing;
  let crests = 0;
  for (let i = window; i < line.length - window; i++) {
    const near = line.slice(i - window, i + window + 1);
    const around = line.slice(Math.max(0, i - 2 * window), i + 2 * window + 1);
    if (near.every((v) => v <= line[i]) && line[i] - Math.min(...around) >= prominence) crests++;
  }
  return crests;
}

function ditchMiss(seed: number, d: MapDraft): string[] {
  const worst = Math.max(...ditchRises(seed, d));
  console.log(`farm belt: ditch beds rise at most ${worst.toFixed(3)}`);
  return worst > ZONE_CHECKS.farmBelt.bedRise ? [`a farm belt ditch bed rises ${worst.toFixed(3)} along its length, over ${ZONE_CHECKS.farmBelt.bedRise}`] : [];
}

function sunkMiss(d: MapDraft, t: Tally): string[] {
  const mean = (tiles: readonly number[]): number => tiles.reduce((a, k) => a + tileHeight(d, k), 0) / Math.max(1, tiles.length);
  const sunk = mean(t.ring) - mean(t.tiles);
  console.log(`swamp: floor ${sunk.toFixed(2)} below its rim`);
  return sunk < ZONE_CHECKS.swamp.sunk ? [`swamp floor lies only ${sunk.toFixed(2)} below its rim, below ${ZONE_CHECKS.swamp.sunk}`] : [];
}

function tileHeight(d: Pick<MapDraft, 'size' | 'heights'>, tile: number): number {
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
