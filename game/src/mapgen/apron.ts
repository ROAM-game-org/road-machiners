import { OLD_PLACES } from '../data/salvage';
import { CRASH, DESCENT_PATH } from '../data/terrain';
import { FALLEN_SUN_POS, REGION } from '../data/region';
import { noiseAt } from '../sim/elevation';
import { ROAD_INDEX } from '../sim/road-index';
import { chance, randInt, randRange, type Rng } from '../sim/rng';
import { siteGap } from '../sim/sites';
import { territoryAt } from '../sim/territory';
import { clamp, dist, type Vec } from '../sim/vec';
import type { MapDraft } from './bake';
import { pickLook, place, prop, ruleRng } from './oldworld';

const APRON_SEED = 1;
const CACHE_SEED = 2;
const NOISE_SEEDS = 2 ** 31 - 1;
const CRATER = REGION.locations.find((l) => l.id === 'fallen-sun');

export function apronLayer(seed: number, d: MapDraft): MapDraft {
  for (const piece of apronDraws(seed)) if (territoryAt(piece.pos) === null) place(d, piece, 0);
  apronCaches(seed, (cache) => place(d, cache, 0));
  return d;
}

function apronNoiseSeed(seed: number): number {
  return randInt(ruleRng(seed, CRASH.seedOffset + APRON_SEED), 0, NOISE_SEEDS);
}

export function apronCaches(seed: number, keep: (cache: ReturnType<typeof prop>) => boolean): ReturnType<typeof prop>[] {
  const rng = ruleRng(seed, CRASH.seedOffset + CACHE_SEED);
  const noiseSeed = apronNoiseSeed(seed);
  const { count, apart, tries } = CRASH.apron.caches;
  const out: ReturnType<typeof prop>[] = [];
  for (let t = 0; t < tries && out.length < count; t++) {
    const cache = cacheDraw(rng);
    if (cacheSite(cache, noiseSeed) && apartFrom(out, cache, apart) && keep(cache)) out.push(cache);
  }
  return enough(out, count);
}

function enough(out: ReturnType<typeof prop>[], count: number): ReturnType<typeof prop>[] {
  if (out.length < count) throw new Error(`The apron found room for ${out.length} of ${count} caches`);
  return out;
}

function apartFrom(others: readonly ReturnType<typeof prop>[], cache: ReturnType<typeof prop>, apart: number): boolean {
  return others.every((o) => dist(o.pos, cache.pos) >= apart);
}

function cacheDraw(rng: Rng): ReturnType<typeof prop> {
  const angle = randRange(rng, 0, Math.PI * 2);
  const r = CRASH.apron.reach * Math.sqrt(randRange(rng, 0, 1));
  const pos = { x: FALLEN_SUN_POS.x + Math.cos(angle) * r, y: FALLEN_SUN_POS.y + Math.sin(angle) * r };
  return prop('shipCache', pos, randRange(rng, ...CRASH.apron.caches.radius), randRange(rng, 0, Math.PI * 2));
}

function cacheSite(cache: ReturnType<typeof prop>, noiseSeed: number): boolean {
  if (!CRATER) throw new Error('The map has no Fallen Sun for its apron');
  const { from, clump } = CRASH.apron.caches;
  const roadReach = REGION.roadWidth / 2 + OLD_PLACES.roadGap + cache.r;
  const off = ROAD_INDEX.nearestWithin(cache.pos.x, cache.pos.y, roadReach) === Infinity;
  return off && siteGap(CRATER, cache.pos) >= from && territoryAt(cache.pos) === null && apronClump(noiseSeed, cache.pos) >= clump;
}

export function apronDraws(seed: number): ReturnType<typeof prop>[] {
  if (!CRATER) throw new Error('The map has no Fallen Sun for its apron');
  const rng = ruleRng(seed, CRASH.seedOffset + APRON_SEED);
  const noiseSeed = randInt(rng, 0, NOISE_SEEDS);
  const heading = downrangeHeading();
  const { reach, density } = CRASH.apron;
  const tries = Math.round(density * Math.PI * reach * reach);
  const out: ReturnType<typeof prop>[] = [];
  for (let t = 0; t < tries; t++) {
    const angle = randRange(rng, 0, Math.PI * 2);
    const r = reach * Math.sqrt(randRange(rng, 0, 1));
    const pos = { x: FALLEN_SUN_POS.x + Math.cos(angle) * r, y: FALLEN_SUN_POS.y + Math.sin(angle) * r };
    const gap = siteGap(CRATER, pos);
    if (gap <= 0 || !chance(rng, apronShare(angle - heading) * apronThinning(gap, r) * apronClump(noiseSeed, pos))) continue;
    out.push(rubble(rng, pos, angle));
  }
  return out;
}

function downrangeHeading(): number {
  const [a, b] = DESCENT_PATH.slice(-2);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function apronShare(fromDownrange: number): number {
  const { bareBelow, bareEase, downrange } = CRASH.apron;
  const along = Math.cos(fromDownrange);
  const ramp = clamp((along - bareBelow) / bareEase, 0, 1);
  return ((1 + downrange * along) / (1 + downrange)) * ramp;
}

export function apronThinning(gap: number, fromCrater: number): number {
  const { edge, falloff, reach, taper } = CRASH.apron;
  const toEnd = clamp((reach - fromCrater) / (taper * reach), 0, 1);
  return (1 + gap / edge) ** -falloff * toEnd;
}

export function apronClump(noiseSeed: number, pos: Vec): number {
  const { broad, fine, fineShare, from, to } = CRASH.apron.clump;
  const n = (1 - fineShare) * noiseAt(noiseSeed, pos.x / broad, pos.y / broad) + fineShare * noiseAt(noiseSeed + 1, pos.x / fine, pos.y / fine);
  const s = clamp((n - from) / (to - from), 0, 1);
  return s * s * (3 - 2 * s);
}

function rubble(rng: Rng, pos: Vec, angle: number): ReturnType<typeof prop> {
  if (chance(rng, CRASH.apron.parts.share)) return shipPart(rng, pos, angle);
  if (chance(rng, CRASH.apron.shards)) return prop('hullShard', pos, randRange(rng, ...CRASH.apron.radius), angle + randRange(rng, -0.4, 0.4));
  return prop('rimRock', pos, randRange(rng, ...CRASH.apron.radius), randRange(rng, 0, Math.PI * 2));
}

function shipPart(rng: Rng, pos: Vec, angle: number): ReturnType<typeof prop> {
  const look = pickLook(rng, CRASH.apron.parts.looks);
  const yaw = look.aligned ? angle + randRange(rng, -0.4, 0.4) : randRange(rng, 0, Math.PI * 2);
  return prop(look.look, pos, randRange(rng, ...look.radius), yaw);
}
