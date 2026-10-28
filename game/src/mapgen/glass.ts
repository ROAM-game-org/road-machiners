
import { CHASSIS } from '../data/chassis';
import type { TerritoryDef } from '../data/region';
import { CRASH } from '../data/terrain';
import { icarusAtlas } from '../sim/atlas';
import { clearOfSites } from '../sim/mapgen';
import { DESCENT_LENGTH, descentBox, descentFrame } from './descent';
import type { BuildingGroup, GlassRules, TerritoryRules, WreckRules } from '../data/territory';
import { noiseAt } from '../sim/elevation';
import { chance, randInt, randRange, type Rng } from '../sim/rng';
import { siteGap } from '../sim/sites';
import { tableOfKind } from '../sim/territory';
import { BUILT_GLASS, BUILT_NONE, BUILT_SCRUB, type BakedProp } from '../sim/terrain';
import { clamp, dist, lerp, type Vec } from '../sim/vec';
import type { MapDraft } from './bake';
import { touchedTiles } from './farm';
import { steep } from './marks';
import { prop, tileCenter, tilesWithin } from './oldworld';
import { clearOf, draw } from './territory';

const NOISE_SEEDS = 2 ** 31 - 1;
const GLAZED = new Set([BUILT_NONE, BUILT_SCRUB]);
const FADE_SEED = 1;

export const SPIRE_LANE = 2 * Math.max(...Object.values(CHASSIS).map((c) => c.radius));

export function fillGlass(d: MapDraft, t: TerritoryDef, rules: TerritoryRules, glass: GlassRules, rng: Rng): void {
  checkGlass(t, glass);
  const noiseSeed = randInt(rng, 0, NOISE_SEEDS);
  markGlass(d, t, glass, keptProps(d, t, rules), noiseSeed);
  placeSpires(d, t, rules, glass, noiseSeed, rng);
}

function checkGlass(t: TerritoryDef, glass: GlassRules): void {
  if (!glass.cover.every((c) => c >= 0 && c <= 1)) throw new Error(`${t.id} glass cover ${glass.cover.join(' to ')} is not within 0 to 1`);
  if (!(glass.cell > 0)) throw new Error(`${t.id} glass cell ${glass.cell} is not positive`);
  const { band, warp, cell } = glass.fade;
  if (!(band > 0) || !(cell > 0) || warp < 0) throw new Error(`${t.id} glass fade band ${band}, warp ${warp} and cell ${cell} must be positive`);
}

export function markGlass(d: MapDraft, t: TerritoryDef, glass: GlassRules, keep: readonly BakedProp[], noiseSeed: number): void {
  for (const tile of tilesWithin(d.size, t.pos, t.radius)) if (glazes(d, t, glass, keep, noiseSeed, tile)) d.built[tile] = BUILT_GLASS;
}

function glazes(d: MapDraft, t: TerritoryDef, glass: GlassRules, keep: readonly BakedProp[], noiseSeed: number, tile: number): boolean {
  const c = tileCenter(d.size, tile);
  if (!GLAZED.has(d.built[tile]) || siteGap(t, c) >= 0 || steep(d, tile)) return false;
  if (keep.some((o) => dist(o.pos, c) <= o.r + glass.clear)) return false;
  return rippleNoise(noiseSeed, c, glass.cell) < lerp(glass.cover[0], glass.cover[1], dist(c, t.pos) / t.radius) * glassFade(t, glass, noiseSeed, c);
}

export function glassFade(t: TerritoryDef, glass: GlassRules, noiseSeed: number, c: Vec): number {
  const { band, warp, cell } = glass.fade;
  const bend = (noiseAt(noiseSeed + FADE_SEED, c.x / cell, c.y / cell) - 0.5) * 2 * warp;
  const s = clamp((-siteGap(t, c) + bend) / band, 0, 1);
  return s * s * (3 - 2 * s);
}

function rippleNoise(noiseSeed: number, c: Vec, cell: number): number {
  const frame = descentFrame(c);
  return noiseAt(noiseSeed, frame.along / (cell * CRASH.glassTrail.stretch), frame.across / cell);
}

export function fillGlassTrail(seed: number, d: MapDraft): MapDraft {
  const end = CRASH.glassTrail.share * DESCENT_LENGTH;
  const box = descentBox(end, Math.max(...CRASH.glassTrail.width), d.size);
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) {
    const tile = y * d.size + x;
    if (trailGlazes(seed, d, tile, end)) d.built[tile] = BUILT_GLASS;
  }
  return d;
}

function trailGlazes(seed: number, d: MapDraft, tile: number, end: number): boolean {
  const c = tileCenter(d.size, tile);
  const frame = descentFrame(c);
  if (frame.along > end || !GLAZED.has(d.built[tile]) || steep(d, tile) || !clearOfSites(icarusAtlas(), c, 0)) return false;
  const { width, cover, cell } = CRASH.glassTrail;
  const left = 1 - Math.abs(frame.across) / lerp(width[0], width[1], clamp(frame.along / end, 0, 1));
  return left > 0 && rippleNoise(seed + CRASH.seedOffset, c, cell) < cover * left;
}

function keptProps(d: MapDraft, t: TerritoryDef, rules: TerritoryRules): BakedProp[] {
  const looks = new Set(buildingGroups(rules).map((g) => g.look));
  const buildings = d.props.filter((p) => looks.has(p.kind) && siteGap(t, p.pos) < 0);
  return [...(rules.wreck ? wreckKept(t, rules.wreck) : []), ...buildings];
}

function wreckKept(t: TerritoryDef, wreck: WreckRules): BakedProp[] {
  const at = (v: Vec): Vec => ({ x: t.pos.x + v.x, y: t.pos.y + v.y });
  const pieces = wreck.pieces.map((p) => prop(p.look, at(p.at), p.r, p.yaw));
  return [...pieces, ...wreck.caches.map((c) => prop(wreck.cacheLook, at(c.at), wreck.cacheRadius, c.yaw))];
}

function buildingGroups(rules: TerritoryRules): BuildingGroup[] {
  return [...(rules.wreck?.buildings ?? []), ...(rules.farm?.buildings ?? [])];
}

function placeSpires(d: MapDraft, t: TerritoryDef, rules: TerritoryRules, glass: GlassRules, noiseSeed: number, rng: Rng): void {
  const spots = d.props.filter((p) => tableOfKind(rules, p.kind) !== null && siteGap(t, p.pos) < 0);
  const pick = (): Vec => {
    const a = randRange(rng, 0, Math.PI * 2);
    const r = t.radius * Math.sqrt(randRange(rng, 0, 1));
    return { x: t.pos.x + Math.cos(a) * r, y: t.pos.y + Math.sin(a) * r };
  };
  const onGlass = (pos: Vec, r: number): boolean => touchedTiles(d.size, pos, r).every((tile) => d.built[tile] === BUILT_GLASS);
  const spires: BakedProp[] = [];
  const ok = (pos: Vec, r: number): boolean =>
    siteGap(t, pos) < -r && onGlass(pos, r) && chance(rng, glassFade(t, glass, noiseSeed, pos)) && clearOf(spires, pos, r, SPIRE_LANE) && clearOf(d.props, pos, r, 0) && clearOf(spots, pos, r, rules.debrisGap);
  for (let i = 0; i < glass.spires.count; i++) {
    const spire = draw({ d, t, rules, rng }, glass.spires.look, 'on its glass', pick, glass.spires.radius, ok);
    spires.push(spire);
    d.props.push(spire);
  }
}
