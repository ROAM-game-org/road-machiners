import { BOATS, GEOLOGY, ROADSIDE, TERRAIN, type BoatKind, type RoadsideBand } from '../data/terrain';
import { REGION } from '../data/region';
import { chance, randInt, randRange, type Rng } from '../sim/rng';
import { TYPE_IDS, type BakedProp } from '../sim/terrain';
import { territoryAt } from '../sim/territory';
import { dist, polylineDist, type Vec } from '../sim/vec';
import { footprintRelief, tileSteepness, type MapDraft } from './bake';
import { BUILT_SCRUB } from './newworld';
import { BUILT_NONE, RoadLine, clearGround, offset, prop, ruleRng, sideOf, stations, tileCenter, tileOf, tilesWithin } from './oldworld';
import { lineGap, tileFlow, turnGap } from './roadside';
import { onReservedGround } from './start-ground';

type Rules = typeof BOATS;
type River = { path: Vec[]; width: number; bank: number };
type Counts = { river: number; wash: number; boats: number };

const TURN = Math.PI * 2;
const OPEN_BUILT = [BUILT_NONE, BUILT_SCRUB];
const SLOPE_LIMIT = TERRAIN.drive.maxSlope * ROADSIDE.slopeShare;
const PROP_GAP = REGION.obstacles.gap;

export function boatLayer(seed: number, d: MapDraft, rules: Rules = BOATS, river: River = TERRAIN.features.dryRiver): MapDraft {
  const rng = ruleRng(seed, rules.seedOffset);
  const counts: Counts = { river: 0, wash: 0, boats: 0 };
  const centers: Vec[] = [];
  const settle = (center: Vec, onFloor: boolean, kind: 'river' | 'wash'): void => {
    const boats = placeGroup(rng, d, rules, river, center, onFloor);
    if (boats.length === 0) return;
    centers.push(center);
    counts[kind]++;
    counts.boats += boats.length;
  };
  for (const center of riverGroups(rng, rules, river)) if (apart(centers, center, rules)) settle(center, true, 'river');
  for (const center of washGroups(d, rules, river)) {
    if (counts.wash >= rules.wash.groups) break;
    if (apart(centers, center, rules)) settle(center, false, 'wash');
  }
  checkBoatBands(counts, rules);
  return d;
}

function apart(centers: readonly Vec[], at: Vec, rules: Rules): boolean {
  return centers.every((c) => dist(c, at) >= rules.groupGap);
}

export function riverGroups(rng: Rng, rules: Rules, river: River): Vec[] {
  const line = new RoadLine(river.path);
  const out: Vec[] = [];
  for (const s of stations(line.length, rules.river.step)) {
    if (!chance(rng, rules.river.chance)) continue;
    const at = Math.min(Math.max(s + randRange(rng, -rules.river.jitter, rules.river.jitter), 0), line.length);
    const side = chance(rng, 0.5) ? 1 : -1;
    const by = river.width * randRange(rng, rules.river.bankShare[0], rules.river.bankShare[1]);
    out.push(offset(line.pointAt(at), sideOf(line.dirAt(at), side), by));
  }
  return out;
}

export function washGroups(d: MapDraft, rules: Rules, river: River): Vec[] {
  const wash = GEOLOGY.ground.washFlow;
  const open: { tile: number; flow: number }[] = [];
  for (let tile = 0; tile < d.built.length; tile++) {
    if (!OPEN_BUILT.includes(d.built[tile])) continue;
    const flow = tileFlow(d, tile);
    if (flow < wash * rules.wash.minFlow) continue;
    const away = polylineDist(tileCenter(d.size, tile), river.path);
    if (away > river.width + river.bank && away <= river.width + river.bank + rules.wash.reach) open.push({ tile, flow });
  }
  open.sort((a, b) => b.flow - a.flow || a.tile - b.tile);
  return open.map((o) => tileCenter(d.size, o.tile));
}

function placeGroup(rng: Rng, d: MapDraft, rules: Rules, river: River, center: Vec, onFloor: boolean): BakedProp[] {
  const boats: BakedProp[] = [];
  const count = randInt(rng, rules.group[0], rules.group[1]);
  for (let k = 0; k < count; k++) {
    const kind = pickKind(rng, rules, boats);
    for (let attempt = 0; attempt < rules.placeTries; attempt++) {
      const boat = prop(kind.kind, aroundCenter(rng, center, rules.groupReach * (k === 0 ? 0.3 : 1)), kind.radius, randRange(rng, 0, TURN));
      if (!fits(d, boat, rules, river, onFloor, boats)) continue;
      d.props.push(boat);
      boats.push(boat);
      break;
    }
  }
  return boats;
}

function aroundCenter(rng: Rng, center: Vec, reach: number): Vec {
  const angle = randRange(rng, 0, TURN);
  const by = reach * Math.sqrt(randRange(rng, 0, 1));
  return { x: center.x + Math.cos(angle) * by, y: center.y + Math.sin(angle) * by };
}

function pickKind(rng: Rng, rules: Rules, placed: readonly BakedProp[]): BoatKind {
  const barges = placed.filter((b) => b.kind === 'riverBarge').length;
  const pool = rules.kinds.filter((k) => k.kind !== 'riverBarge' || barges < rules.maxBarges);
  let pick = randRange(rng, 0, pool.reduce((sum, k) => sum + k.weight, 0));
  for (const kind of pool) {
    pick -= kind.weight;
    if (pick < 0) return kind;
  }
  return pool[pool.length - 1];
}

export function fits(d: MapDraft, p: BakedProp, rules: Rules, river: River, onFloor: boolean, group: readonly BakedProp[]): boolean {
  if (!clearGround(d.size, p.pos, p.r, rules.roadGap) || onReservedGround(p.pos, p.r) || territoryAt(p.pos) !== null) return false;
  if (!groundFits(d, p, rules)) return false;
  if (onFloor && !onRiverFloor(p, rules, river)) return false;
  return clearOfProps(d, p) && !formsRow(p, group.filter((b) => b.kind === p.kind));
}

function onRiverFloor(p: BakedProp, rules: Rules, river: River): boolean {
  const away = polylineDist(p.pos, river.path);
  return away <= river.width && away - p.r >= rules.passLane / 2;
}

function groundFits(d: MapDraft, p: BakedProp, rules: Rules): boolean {
  const allowed = new Set(rules.groundTypes.map((id) => TYPE_IDS.indexOf(id)));
  const tiles = [tileOf(d.size, p.pos), ...tilesWithin(d.size, p.pos, p.r)];
  const open = tiles.every((k) => OPEN_BUILT.includes(d.built[k]) && allowed.has(d.types[k]));
  return open && tileSteepness(d.heights, d.size, tiles[0]) <= SLOPE_LIMIT && footprintRelief(d.heights, d.size, p, false) <= rules.relief;
}

function clearOfProps(d: MapDraft, p: BakedProp): boolean {
  return d.props.every((o) => dist(o.pos, p.pos) >= o.r + p.r + PROP_GAP + ROADSIDE.propGapSlack);
}

function formsRow(p: BakedProp, alike: readonly BakedProp[]): boolean {
  const near = alike.filter((o) => turnGap(o.yaw, p.yaw) <= ROADSIDE.rowGuard.turn);
  return near.some((a, i) => near.slice(i + 1).some((b) => turnGap(a.yaw, b.yaw) <= ROADSIDE.rowGuard.turn && lineGap(a.pos, b.pos, p.pos) <= ROADSIDE.rowGuard.line));
}

export function checkBoatBands(counts: Counts, rules: Rules = BOATS): void {
  const bands: [string, number, RoadsideBand][] = [
    ['river groups', counts.river, rules.river.band],
    ['wash groups', counts.wash, rules.wash.band],
    ['boats', counts.boats, rules.boatBand],
  ];
  for (const [name, count, [low, high]] of bands) if (count < low || count > high) throw new Error(`Boat ${name} count ${count} is outside ${low} to ${high}`);
}
