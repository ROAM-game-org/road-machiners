import { GEOLOGY, ROADSIDE, TERRAIN, type RoadsideBand } from '../data/terrain';
import { REGION } from '../data/region';
import { chance, hashRandom, randInt, randRange, type Rng } from '../sim/rng';
import { TYPE_IDS, type BakedProp } from '../sim/terrain';
import { dist, type Vec } from '../sim/vec';
import { tileSteepness, type MapDraft } from './bake';
import { BUILT_SCRUB } from './newworld';
import { onReservedGround } from './start-ground';
import { BUILT_FIELD, BUILT_NONE, BUILT_OLD_ROAD, RoadLine, clearGround, facing, offset, prop, roadJunctions, ruleRng, sideOf, stations, tileCenter, tileOf, tilesWithin } from './oldworld';

const R = ROADSIDE;
const HALF = REGION.roadWidth / 2;
const TURN = Math.PI * 2;
const BUCKET = 8;
const GAP = REGION.obstacles.gap;
const S_REACH = 8;
const WASH = GEOLOGY.ground.washFlow;
const SLOPE_LIMIT = TERRAIN.drive.maxSlope * R.slopeShare;
const OPEN_BUILT = [BUILT_NONE, BUILT_SCRUB];
const NEIGHBORS: readonly Vec[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

type Group = 'signs' | 'boards' | 'barrels' | 'heaps' | 'trees';
type Fit = { ground: 'dry' | 'bank' | 'free'; roadGap: number };

class Placer {
  readonly counts: Record<Group, number> = { signs: 0, boards: 0, barrels: 0, heaps: 0, trees: 0 };
  private readonly buckets = new Map<number, BakedProp[]>();
  private readonly added = new Map<string, BakedProp[]>();
  private readonly allowed: ReadonlySet<number>;
  private readonly widest: number;

  constructor(readonly d: MapDraft) {
    for (const p of d.props) this.index(p);
    this.widest = Math.max(...d.props.map((p) => p.r));
    this.allowed = new Set(R.groundTypes.map((id) => TYPE_IDS.indexOf(id)));
  }

  place(group: Group, p: BakedProp, fit: Fit): boolean {
    if (!this.fits(p, fit)) return false;
    this.d.props.push(p);
    this.index(p);
    this.added.set(p.kind, [...(this.added.get(p.kind) ?? []), p]);
    this.counts[group]++;
    return true;
  }

  private fits(p: BakedProp, fit: Fit): boolean {
    const d = this.d;
    if (!clearGround(d.size, p.pos, p.r, fit.roadGap) || onReservedGround(p.pos, p.r)) return false;
    return this.groundFits([tileOf(d.size, p.pos), ...tilesWithin(d.size, p.pos, p.r)], fit) && this.clearOfProps(p) && !this.formsRow(p);
  }

  private groundFits(tiles: readonly number[], fit: Fit): boolean {
    return this.openGround(tiles) && !this.tooSteep(tiles[0]) && this.onBank(tiles[0], fit);
  }

  private openGround(tiles: readonly number[]): boolean {
    return tiles.every((k) => OPEN_BUILT.includes(this.d.built[k]) && this.allowed.has(this.d.types[k]));
  }

  private tooSteep(tile: number): boolean {
    return tileSteepness(this.d.heights, this.d.size, tile) > SLOPE_LIMIT;
  }

  private clearOfProps(p: BakedProp): boolean {
    return this.around(p.pos, p.r + GAP + this.widest).every((o) => dist(o.pos, p.pos) >= o.r + p.r + GAP + R.propGapSlack);
  }

  private formsRow(p: BakedProp): boolean {
    const alike = (this.added.get(p.kind) ?? []).filter((o) => turnGap(o.yaw, p.yaw) <= R.rowGuard.turn);
    return alike.some((a, i) => alike.slice(i + 1).some((b) => turnGap(a.yaw, b.yaw) <= R.rowGuard.turn && lineGap(a.pos, b.pos, p.pos) <= R.rowGuard.line));
  }

  private onBank(tile: number, fit: Fit): boolean {
    const flow = tileFlow(this.d, tile);
    if (fit.ground === 'free') return true;
    if (fit.ground === 'bank') return isBank(this.d, tile);
    return flow < WASH;
  }

  private around(pos: Vec, reach: number): BakedProp[] {
    const out: BakedProp[] = [];
    const span = Math.ceil(reach / BUCKET);
    const cx = Math.floor(pos.x / BUCKET);
    const cy = Math.floor(pos.y / BUCKET);
    for (let y = cy - span; y <= cy + span; y++) for (let x = cx - span; x <= cx + span; x++) out.push(...(this.buckets.get(key(x, y)) ?? []));
    return out;
  }

  private index(p: BakedProp): void {
    const k = key(Math.floor(p.pos.x / BUCKET), Math.floor(p.pos.y / BUCKET));
    const list = this.buckets.get(k);
    if (list) list.push(p);
    else this.buckets.set(k, [p]);
  }
}

function turnGap(a: number, b: number): number {
  const d = (2 * (a - b)) % TURN;
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) / 2;
}

function lineGap(a: Vec, b: Vec, c: Vec): number {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / dist(a, b);
}

function key(x: number, y: number): number {
  return y * 4096 + x;
}

function tileFlow(d: MapDraft, tile: number): number {
  const w = d.size + 1;
  const k = Math.floor(tile / d.size) * w + (tile % d.size);
  return Math.max(d.flow[k], d.flow[k + 1], d.flow[k + w], d.flow[k + w + 1]);
}

export function roadsideLayer(seed: number, d: MapDraft): MapDraft {
  checkBands(placeRoadside(seed, d));
  return d;
}

export function placeRoadside(seed: number, d: MapDraft): Record<Group, number> {
  const placer = new Placer(d);
  const houses = d.props.filter((p) => R.barrels.houseLooks.includes(p.kind));
  const wrecks = d.props.filter((p) => p.kind === 'carWreck');
  const camps = d.props.filter((p) => p.kind === 'shack');
  const junk = d.props.filter((p) => p.kind === 'junk');
  const tanks = d.props.filter((p) => p.kind === 'tank');
  const yards = d.props.filter((p) => R.trees.yardLooks.includes(p.kind));
  roadSigns(seed, placer);
  routeBoards(seed, placer);
  barrels(seed, placer, [...wrecks.map((p) => ({ p, odds: R.barrels.wreckChance })), ...houses.map((p) => ({ p, odds: R.barrels.houseChance }))]);
  drumHeaps(seed, placer, [...camps.map((p) => ({ p, odds: R.heaps.campChance })), ...tanks.map((p) => ({ p, odds: R.heaps.tankChance })), ...junk.map((p) => ({ p, odds: R.heaps.junkChance }))]);
  openTrees(seed, placer, yards);
  return placer.counts;
}

function checkBands(counts: Record<Group, number>): void {
  for (const group of Object.keys(counts) as Group[]) {
    const [low, high] = R[group].band as RoadsideBand;
    if (counts[group] < low || counts[group] > high) throw new Error(`Roadside ${group} count ${counts[group]} is outside ${low} to ${high}`);
  }
}

function stream(seed: number, index: number): Rng {
  return ruleRng(seed, R.seedOffset + index);
}

function roadSigns(seed: number, p: Placer): void {
  const rng = stream(seed, 1);
  const S = R.signs;
  for (const road of REGION.roads) {
    const line = new RoadLine(road);
    let last = -Infinity;
    for (const s of stations(line.length, S.step)) {
      if (s - last < S.spacing || !chance(rng, S.chance)) continue;
      const out = sideOf(line.dirAt(s), chance(rng, 0.5) ? 1 : -1);
      const by = HALF + S.gap + S.radius + randRange(rng, 0, S.spread);
      const yaw = facing({ x: -out.x, y: -out.y }) + randRange(rng, -S.yawJitter, S.yawJitter);
      if (p.place('signs', prop('roadSign', offset(line.pointAt(s), out, by), S.radius, yaw), { ground: 'dry', roadGap: S.gap })) last = s;
    }
  }
  oldRoadSigns(seed, p);
}

function oldRoadSigns(seed: number, p: Placer): void {
  const d = p.d;
  const S = R.signs;
  const rng = stream(seed, 2);
  const placed: Vec[] = [];
  for (let tile = 0; tile < d.built.length; tile++) {
    if (d.built[tile] !== BUILT_OLD_ROAD || !chance(rng, S.oldRoadChance)) continue;
    const here = tileCenter(d.size, tile);
    for (const n of NEIGHBORS) {
      const edge = outsideRoad(d, here, n);
      if (!edge || placed.some((o) => dist(o, edge) < S.oldRoadSpacing)) continue;
      const yaw = facing({ x: -n.x, y: -n.y }) + randRange(rng, -S.yawJitter, S.yawJitter);
      if (p.place('signs', prop('roadSign', edge, S.radius, yaw), { ground: 'dry', roadGap: S.gap })) placed.push(edge);
    }
  }
}

function outsideRoad(d: MapDraft, from: Vec, step: Vec): Vec | null {
  for (let k = 1; k <= S_REACH; k++) {
    const at = { x: from.x + step.x * k, y: from.y + step.y * k };
    if (builtAt(d, tileOf(d.size, from), { x: step.x * k, y: step.y * k }) !== BUILT_OLD_ROAD) return k === 1 ? null : { x: at.x + step.x * R.signs.gap, y: at.y + step.y * R.signs.gap };
  }
  return null;
}

function routeBoards(seed: number, p: Placer): void {
  const rng = stream(seed, 3);
  const B = R.boards;
  const arms = [...roadJunctions().map((at) => ({ at, base: 0 })), ...REGION.towns.map((t) => ({ at: t.pos, base: t.radius }))];
  boardsAlong(rng, p);
  for (const { at: from, base } of arms) {
    for (const road of REGION.roads) {
      const line = armFrom(road, from);
      if (!line || !chance(rng, B.chance)) continue;
      const s = base + randRange(rng, B.along[0], B.along[1]);
      const out = sideOf(line.dirAt(s), chance(rng, 0.5) ? 1 : -1);
      const by = HALF + B.gap + B.radius + randRange(rng, 0, B.spread);
      const yaw = facing({ x: -out.x, y: -out.y }) + randRange(rng, -B.yawJitter, B.yawJitter);
      p.place('boards', prop('routeSign', offset(line.pointAt(s), out, by), B.radius, yaw), { ground: 'dry', roadGap: B.gap });
    }
  }
}

function boardsAlong(rng: Rng, p: Placer): void {
  const B = R.boards;
  for (const road of REGION.roads) {
    const line = new RoadLine(road);
    for (const s of stations(line.length, B.step)) {
      if (s === 0 || !chance(rng, B.stepChance)) continue;
      const out = sideOf(line.dirAt(s), chance(rng, 0.5) ? 1 : -1);
      const yaw = facing({ x: -out.x, y: -out.y }) + randRange(rng, -B.yawJitter, B.yawJitter);
      p.place('boards', prop('routeSign', offset(line.pointAt(s), out, HALF + B.gap + B.radius + randRange(rng, 0, B.spread)), B.radius, yaw), { ground: 'dry', roadGap: B.gap });
    }
  }
}

function armFrom(road: readonly Vec[], from: Vec): RoadLine | null {
  if (dist(road[0], from) < 0.01) return new RoadLine(road);
  if (dist(road[road.length - 1], from) < 0.01) return new RoadLine([...road].reverse());
  return null;
}

type Source = { p: BakedProp; odds: number };

function around(rng: Rng, from: BakedProp, r: number, reach: readonly [number, number]): Vec {
  const angle = randRange(rng, 0, TURN);
  const by = from.r + r + randRange(rng, reach[0], reach[1]);
  return { x: from.pos.x + Math.cos(angle) * by, y: from.pos.y + Math.sin(angle) * by };
}

function barrels(seed: number, p: Placer, sources: Source[]): void {
  const rng = stream(seed, 4);
  const B = R.barrels;
  for (const { p: from, odds } of sources) {
    if (!chance(rng, odds)) continue;
    const count = randInt(rng, 1, 2);
    for (let k = 0; k < count; k++) p.place('barrels', prop('barrel', around(rng, from, B.radius, B.reach), B.radius, randRange(rng, 0, TURN)), { ground: 'free', roadGap: GAP });
  }
}

function drumHeaps(seed: number, p: Placer, sources: Source[]): void {
  const rng = stream(seed, 5);
  const H = R.heaps;
  for (const { p: from, odds } of sources) {
    if (!chance(rng, odds)) continue;
    for (let k = 0; k < H.tries; k++) if (p.place('heaps', prop('drums', around(rng, from, H.radius, H.reach), H.radius, randRange(rng, 0, TURN)), { ground: 'free', roadGap: GAP })) break;
  }
}

function openTrees(seed: number, p: Placer, yards: BakedProp[]): void {
  const rng = stream(seed, 6);
  const T = R.trees;
  for (const yard of yards) if (chance(rng, T.yardChance)) grow(rng, p, around(rng, yard, T.radius, T.yardReach), 'free');
  const d = p.d;
  for (let tile = 0; tile < d.built.length; tile++) {
    const at = tileCenter(d.size, tile);
    if (isBank(d, tile)) {
      if (hashRandom(seed, R.seedOffset, 7, tile) < T.washChance) grow(rng, p, at, 'bank');
    } else if (d.built[tile] === BUILT_NONE && NEIGHBORS.some((n) => builtAt(d, tile, n) === BUILT_FIELD) && hashRandom(seed, R.seedOffset, 8, tile) < T.fieldChance) {
      grow(rng, p, at, 'dry');
    }
  }
}

function isBank(d: MapDraft, tile: number): boolean {
  const flow = tileFlow(d, tile);
  return flow >= WASH * R.trees.washBank && flow < WASH && d.types[tile] !== TYPE_IDS.indexOf('sand');
}

function builtAt(d: MapDraft, tile: number, step: Vec): number {
  const x = (tile % d.size) + step.x;
  const y = Math.floor(tile / d.size) + step.y;
  return x < 0 || y < 0 || x >= d.size || y >= d.size ? BUILT_NONE : d.built[y * d.size + x];
}

function grow(rng: Rng, p: Placer, at: Vec, ground: Fit['ground']): void {
  const T = R.trees;
  const count = randInt(rng, T.group[0], T.group[1]);
  for (let k = 0; k < count; k++) {
    const pos = k === 0 ? at : { x: at.x + randRange(rng, -T.groupSpread, T.groupSpread), y: at.y + randRange(rng, -T.groupSpread, T.groupSpread) };
    p.place('trees', prop('deadTree', pos, T.radius, randRange(rng, 0, TURN)), { ground, roadGap: GAP });
  }
}
