
import { PHYSICS } from '../data/physics';
import { TERRAIN } from '../data/terrain';
import { TIME } from '../data/time';
import type { Contact, Obstacle, Vehicle, World } from './types';
import { heightAt, heightNear, type Terrain } from './terrain';
import { boxDistance, propReach, reachableBoxes, stretchCrossesBox } from './mapgen';
import { isCheapMeeting, isHeadless } from './fidelity';
import { propsAlong, propsAround } from './prop-index';
import { sunAt } from './sun';
import { weatherOn } from './weather';
import { dist, segmentDist, type Vec } from './vec';
import { playerVehicle } from './damage';
import { cloudsSeenBy, contactDifficulty, contactsOf } from './detect';
import { litAt, litFlares } from './hazards';
import { practice, skillEffect, vehicleHasPerk } from './progress';
import { sightFactor } from './chassis-features';
import { PERK_NUMBERS } from '../data/skills';

function propsNear(world: World, a: Vec, b: Vec): Obstacle[] {
  return propsAlong(world, 'sight', a, b, 0);
}

type Screen = { pos: Vec; r: number };

export function sightRadius(world: World, viewer: Vehicle, lit = false): number {
  const night = nightFactor(world, viewer, lit);
  const weather = vehicleHasPerk(world, viewer, 'stormRider') ? 1 : weatherOn(world, viewer).sight;
  const skill = 1 + skillEffect(world, viewer, 'perception', 'sight');
  return TERRAIN.vision.radius * weather * night * skill * sightFactor(viewer.chassisId);
}

export function farSightRadius(world: World, viewer: Vehicle): number {
  return sightRadius(world, viewer) * TERRAIN.vision.farFactor;
}

function nightFactor(world: World, viewer: Vehicle, lit: boolean): number {
  return lit || sunAt(world.turn) || vehicleHasPerk(world, viewer, 'nightEyes') ? 1 : TIME.nightSight;
}

export function grayRadius(world: World): number {
  return sightRadius(world, playerVehicle(world)) * TERRAIN.vision.grayFactor;
}

export function visibleTiles(world: World, from: Vec): Set<number> {
  const out = new Set<number>();
  const disks = sightDisks(world, from);
  const look = isHeadless() ? () => true : tileLook(world, from, Math.max(...disks.map((d) => d.reach)));
  for (const disk of disks) forDiskTiles(world, from, disk, (idx, tile) => { if (look(tile)) out.add(idx); });
  return out;
}

type Disk = { pos: Vec; r: number };
type SightDisk = Disk & { reach: number };

function sightDisks(world: World, from: Vec): SightDisk[] {
  const me = playerVehicle(world);
  const r = sightRadius(world, me);
  const lit = sightRadius(world, me, true);
  const flares = lit > r ? litFlares(world).filter((f) => dist(from, f.pos) - f.r < lit) : [];
  return [{ pos: from, r, reach: r }, ...flares.map((f) => ({ pos: f.pos, r: f.r, reach: lit }))];
}

export function seenPropTiles(world: World, from: Vec, visible: ReadonlySet<number>): number[] {
  const disks = sightDisks(world, from);
  const reach = Math.max(...disks.map((d) => d.reach));
  const out = new Set<number>();
  for (const o of propsAround(world, 'sight', from, reach)) {
    const tiles = footprintTiles(world, o);
    if (!propIsSeen(world, from, o, tiles, disks, visible)) continue;
    for (const idx of tiles) out.add(idx);
  }
  return [...out].sort((a, b) => a - b);
}

function propIsSeen(world: World, from: Vec, o: Obstacle, tiles: readonly number[], disks: readonly SightDisk[], visible: ReadonlySet<number>): boolean {
  if (tiles.some((idx) => visible.has(idx))) return true;
  if (!disks.some((d) => dist(from, o.pos) <= d.reach && dist(d.pos, o.pos) <= d.r)) return false;
  if (isHeadless()) return true;
  return inPlainView(world, from, o.pos, propsNear(world, from, o.pos).filter((c) => c !== o), []);
}

function footprintTiles(world: World, o: Obstacle): number[] {
  const size = world.size;
  const reach = propReach(o);
  const lo = { x: Math.max(0, Math.floor(o.pos.x - reach)), y: Math.max(0, Math.floor(o.pos.y - reach)) };
  const hi = { x: Math.min(size - 1, Math.ceil(o.pos.x + reach)), y: Math.min(size - 1, Math.ceil(o.pos.y + reach)) };
  const out: number[] = [];
  for (let x = lo.x; x <= hi.x; x++) {
    for (let y = lo.y; y <= hi.y; y++) if (dist(o.pos, { x: x + 0.5, y: y + 0.5 }) <= reach) out.push(y * size + x);
  }
  return out;
}

function forDiskTiles(world: World, from: Vec, disk: SightDisk, seen: (idx: number, tile: Vec) => void): void {
  const size = world.size;
  const lo = { x: Math.max(0, Math.floor(disk.pos.x - disk.r)), y: Math.max(0, Math.floor(disk.pos.y - disk.r)) };
  const hi = { x: Math.min(size - 1, Math.ceil(disk.pos.x + disk.r)), y: Math.min(size - 1, Math.ceil(disk.pos.y + disk.r)) };
  for (let x = lo.x; x <= hi.x; x++) {
    for (let y = lo.y; y <= hi.y; y++) {
      const tile = { x: x + 0.5, y: y + 0.5 };
      if (dist(from, tile) <= disk.reach && dist(disk.pos, tile) <= disk.r) seen(y * size + x, tile);
    }
  }
}

type Eye = { at: Vec; z: number };
type Horizons = { rays: number; steps: number; slopes: Float64Array };
type NearProp = { o: Obstacle; near: number };

type Height = (x: number, y: number) => number;
type Look = { terrain: Terrain; eye: Eye; height: Height; horizons: Horizons; props: readonly NearProp[][] };

function tileLook(world: World, from: Vec, reach: number): (tile: Vec) => boolean {
  const height = heightNear(world.terrain, from, reach);
  const eye = { at: from, z: height(from.x, from.y) + TERRAIN.vision.eyeHeight };
  const horizons = horizonRays(height, eye, reach);
  const look = { terrain: world.terrain, eye, height, horizons, props: propBuckets(world, from, reach, horizons.rays) };
  return (tile) => tileSeen(look, tile);
}

function horizonRays(height: Height, eye: Eye, reach: number): Horizons {
  const rays = Math.ceil(2 * Math.PI * reach * TERRAIN.vision.raysPerRimTile);
  const steps = Math.ceil(reach * TERRAIN.vision.samplesPerTile);
  const slopes = new Float64Array(rays * (steps + 1));
  for (let k = 0; k < rays; k++) walkRay(height, eye, (2 * Math.PI * k) / rays, slopes.subarray(k * (steps + 1), (k + 1) * (steps + 1)));
  return { rays, steps, slopes };
}

function walkRay(height: Height, eye: Eye, angle: number, slopes: Float64Array): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let top = -Infinity;
  slopes[0] = top;
  for (let j = 1; j < slopes.length; j++) {
    const d = j / TERRAIN.vision.samplesPerTile;
    top = Math.max(top, (height(eye.at.x + dx * d, eye.at.y + dy * d) - eye.z) / d);
    slopes[j] = top;
  }
}

function rayOf(rays: number, from: Vec, p: Vec): number {
  const k = Math.round((Math.atan2(p.y - from.y, p.x - from.x) * rays) / (2 * Math.PI));
  return ((k % rays) + rays) % rays;
}

function propBuckets(world: World, from: Vec, reach: number, rays: number): NearProp[][] {
  const buckets: NearProp[][] = Array.from({ length: rays }, () => []);
  for (const o of propsAround(world, 'sight', from, reach)) for (const k of propRays(from, o, rays)) buckets[k].push({ o, near: dist(from, o.pos) - propReach(o) });
  return buckets;
}

function propRays(from: Vec, o: Obstacle, rays: number): number[] {
  const d = dist(from, o.pos);
  const reach = propReach(o);
  const all = Array.from({ length: rays }, (_, k) => k);
  if (reach >= d) return all;
  const half = ((Math.asin(reach / d) + Math.PI / rays) * rays) / (2 * Math.PI);
  const mid = (Math.atan2(o.pos.y - from.y, o.pos.x - from.x) * rays) / (2 * Math.PI);
  const lo = Math.floor(mid - half);
  const hi = Math.ceil(mid + half);
  if (hi - lo + 1 >= rays) return all;
  return Array.from({ length: hi - lo + 1 }, (_, i) => (((lo + i) % rays) + rays) % rays);
}

function tileSeen(look: Look, tile: Vec): boolean {
  const { eye, horizons } = look;
  const d = dist(eye.at, tile);
  if (d <= TERRAIN.vision.closeRadius) return true;
  const to = look.height(tile.x, tile.y) + TERRAIN.vision.eyeHeight;
  const k = rayOf(horizons.rays, eye.at, tile);
  const before = Math.min(Math.ceil(d * TERRAIN.vision.samplesPerTile) - 1, horizons.steps);
  if (horizons.slopes[k * (horizons.steps + 1) + before] > (to - eye.z) / d) return false;
  const line = { a: eye.at, b: tile, from: eye.z, to };
  return look.props[k].every((p) => p.near >= d || !propHides(look.terrain, p.o, line));
}

export function canVehicleSee(world: World, observer: Vehicle, position: Vec): boolean {
  if (observer.id === world.player.vehicleId) return playerSees(world, position);
  const target = position;
  if (dist(observer.pos, target) > sightRadius(world, observer, litAt(world, target))) return false;
  return isCheapMeeting(world, observer.pos, target) || inPlainView(world, observer.pos, target, propsNear(world, observer.pos, target), dustScreens(world));
}

function dustScreens(world: World): Screen[] {
  return world.dustClouds.filter((c) => c.screen).map((c) => ({ pos: c.pos, r: PERK_NUMBERS.dustScreen.radius }));
}

function inPlainView(world: World, a: Vec, b: Vec, props: readonly Obstacle[], screens: readonly Screen[]): boolean {
  if (dist(a, b) <= TERRAIN.vision.closeRadius) return true;
  const line = sightLine(world.terrain, a, b);
  return hasLineOfSight(world.terrain, line, props, screens) && clearOverTerrain(world.terrain, line);
}

export function hasLineOfFire(world: World, a: Vec, b: Vec): boolean {
  const line = sightLine(world.terrain, a, b);
  return hasLineOfSight(world.terrain, line, propsNear(world, a, b), []) && clearOverTerrain(world.terrain, line);
}

export function hasLineOfSight(terrain: Terrain, line: SightLine, props: readonly Obstacle[], screens: readonly Screen[]): boolean {
  const { a, b } = line;
  const targetDist = dist(a, b);
  return props.every((o) => !propHides(terrain, o, line)) && screens.every((o) => dist(a, o.pos) >= targetDist || segmentDist(o.pos, a, b) >= o.r);
}

export type SightLine = { a: Vec; b: Vec; from: number; to: number };

export function sightLine(terrain: Terrain, a: Vec, b: Vec): SightLine {
  const eye = TERRAIN.vision.eyeHeight;
  return { a, b, from: heightAt(terrain, a.x, a.y) + eye, to: heightAt(terrain, b.x, b.y) + eye };
}

function propHides(terrain: Terrain, o: Obstacle, line: SightLine): boolean {
  if (segmentDist(o.pos, line.a, line.b) >= propReach(o)) return false;
  const { base, boxes } = reachableBoxes(o, terrain);
  return boxes.some((box) => {
    const lo = base + box.z0 / PHYSICS.metersPerTile;
    const hi = base + box.z1 / PHYSICS.metersPerTile;
    return stretchCrossesBox(box, line.a, line.b, enterHeights(line, lo, hi), leaveHeights(line, lo, hi)) && boxDistance(box, line.b) > 0;
  });
}

function enterHeights(line: SightLine, lo: number, hi: number): number {
  const rise = line.to - line.from;
  if (rise === 0) return line.from >= lo && line.from <= hi ? 0 : 1;
  return Math.max(0, Math.min((lo - line.from) / rise, (hi - line.from) / rise));
}

function leaveHeights(line: SightLine, lo: number, hi: number): number {
  const rise = line.to - line.from;
  if (rise === 0) return line.from >= lo && line.from <= hi ? 1 : 0;
  return Math.min(1, Math.max((lo - line.from) / rise, (hi - line.from) / rise));
}

export function clearOverTerrain(terrain: Terrain, line: SightLine): boolean {
  const { a, b, from, to } = line;
  const n = Math.ceil(dist(a, b) * TERRAIN.vision.samplesPerTile);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const ground = heightAt(terrain, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    if (ground > from + (to - from) * t) return false;
  }
  return true;
}

export function playerVisible(world: World): Set<number> {
  const v = world.vehicles.find((x) => x.id === world.player.vehicleId);
  return v ? visibleTiles(world, v.pos) : new Set<number>();
}

export function refreshVision(world: World): Contact[] {
  const seen = playerVisible(world);
  world.player.visible = [...seen].sort((a, b) => a - b);
  for (const idx of seen) world.player.explored[idx] = 1;
  world.player.marked = world.player.marked.filter((m) => world.turn <= m.until);
  const me = world.vehicles.find((x) => x.id === world.player.vehicleId);
  const known = new Set(world.player.contacts.map((c) => c.vehicleId));
  world.player.contacts = me ? contactsOf(world, me, Infinity) : [];
  world.player.clouds = me ? cloudsSeenBy(world, me).map((c) => c.id) : [];
  return world.player.contacts.filter((c) => !known.has(c.vehicleId));
}

export function practiceContacts(world: World, fresh: readonly Contact[]): void {
  for (const c of fresh) practice(world, 'contact', 1, contactDifficulty(world, playerVehicle(world), c), c.vehicleId);
}

export function tileCenter(world: World, idx: number): Vec {
  return { x: (idx % world.size) + 0.5, y: Math.floor(idx / world.size) + 0.5 };
}

export function tileOf(world: World, p: Vec): number {
  const x = Math.min(world.size - 1, Math.max(0, Math.floor(p.x)));
  const y = Math.min(world.size - 1, Math.max(0, Math.floor(p.y)));
  return y * world.size + x;
}

export function playerSees(world: World, p: Vec): boolean {
  return world.player.visible.includes(tileOf(world, p));
}

export function playerExplored(world: World, p: Vec): boolean {
  return world.player.explored[tileOf(world, p)] === 1;
}
