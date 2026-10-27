import { DESERT, GEOLOGY } from '../data/terrain';
import { REGION } from '../data/region';
import { flattenFactor } from '../sim/elevation';
import { noise2, smooth } from '../sim/noise';
import { siteGap } from '../sim/sites';
import { zoneWeight } from '../sim/zones';
import { clamp, dist, lerp, type Vec } from '../sim/vec';
import type { MapDraft } from './bake';

const WIND = (GEOLOGY.wind.direction * Math.PI) / 180;
const DRY_WEIGHT = 0.02;
const TERRITORIES = REGION.locations.filter((l) => l.kind === 'territory');

export function desertLayer(seed: number, d: MapDraft): MapDraft {
  const n = d.size + 1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const supply = sandSupply(x, y);
    if (supply === 0) continue;
    const k = y * n + x;
    const lift = duneHeight(seed, { x, y }, supply) + starHeight({ x, y });
    d.heights[k] += lift;
    d.sand[k] += lift + DESERT.mantle * supply;
  }
  return d;
}

export function sandSupply(x: number, y: number): number {
  const w = zoneWeight('desert', x, y);
  if (w <= DRY_WEIGHT) return 0;
  const p = { x, y };
  const open = TERRITORIES.reduce((least, t) => Math.min(least, clamp(siteGap(t, p) / DESERT.keepOff, 0, 1)), 1);
  return w * open * (1 - flattenFactor(x, y));
}

export function duneHeight(seed: number, p: Vec, supply: number): number {
  const u = p.x * Math.cos(WIND) + p.y * Math.sin(WIND);
  const v = -p.x * Math.sin(WIND) + p.y * Math.cos(WIND);
  const length = lerp(...DESERT.wavelength, noise2(p.x * DESERT.wavelengthFrequency, p.y * DESERT.wavelengthFrequency, seed + DESERT.seedOffset));
  const warp = (noise2(p.x * DESERT.warp.frequency, p.y * DESERT.warp.frequency, seed + DESERT.seedOffset + 1) - 0.5) * 2 * DESERT.warp.reach;
  const phase = (u + warp) / length;
  const ridge = Math.floor(phase);
  const cover = lerp(...DESERT.cover, supply);
  const shape = ridgeShape(phase - ridge, cover);
  if (shape === 0) return 0;
  const crest = lerp(...DESERT.height, noise2(ridge * 3.7, v / DESERT.breaks.length, seed + DESERT.seedOffset + 2));
  const unbroken = smoothBetween(noise2(v / DESERT.breaks.length, ridge * 5.3, seed + DESERT.seedOffset + 3), DESERT.breaks.from, DESERT.breaks.to);
  return crest * supply * unbroken * shape;
}

export function ridgeShape(at: number, cover: number): number {
  if (at >= cover) return 0;
  const rise = cover * (1 - DESERT.leeShare);
  return at < rise ? smooth(at / rise) : 1 - smooth((at - rise) / (cover - rise));
}

function smoothBetween(value: number, from: number, to: number): number {
  return smooth(clamp((value - from) / (to - from), 0, 1));
}

function starHeight(p: Vec): number {
  const { at, radius, height, arms } = DESERT.star;
  const r = dist(p, at);
  if (r >= radius) return 0;
  const angle = Math.atan2(p.y - at.y, p.x - at.x);
  const reach = radius * (0.55 + 0.45 * Math.abs(Math.cos((arms * angle) / 2)));
  return r >= reach ? 0 : height * smooth(1 - r / reach);
}
