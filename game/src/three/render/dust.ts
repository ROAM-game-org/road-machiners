import * as THREE from 'three';
import { DETECT } from '../../data/detect';
import { PHYSICS } from '../../data/physics';
import { TERRAIN_TYPES, type TerrainTypeId } from '../../data/terrain';
import { PAL } from '../../render/palette';
import { hash2, valueNoise } from '../../render/noise';
import { tailReach } from '../../sim/rig';
import { heightAt, tileAt, type Terrain } from '../../sim/terrain';
import type { DustCloud, Vehicle, World } from '../../sim/types';
import type { Vec } from '../../sim/vec';
import { cutShare, type Cutaway, type TurnClock } from './hazards';
import { BeforeTurn, driftAt, turnShare } from './turn-blend';
import type { VehicleView } from './vehicle';
import type { Card, FxCards } from './particles/cards';
import { CARD_SHAPES, clumpShape } from './particles/cards';

const S = PHYSICS.metersPerTile;

export const DUST_LOOK = {
  maxCards: 800,
  puffs: 24,
  spread: 0.5,
  spreadGrowth: 3,
  across: 0.9,
  size: 1.4,
  birthSize: 0.5,
  buildTurns: 4,
  sizeGrowth: 2.5,
  opacity: 0.4,
  fadeIn: 1.5,
  fadePower: 1.5,
  riseCap: 0.6,
  scatterShare: 0.15,
  streak: 1.5,
  wobble: 0.8,
  wobbleSeconds: 3.5,
  groundShare: 0.45,
  spinRange: Math.PI * 2,
  soft: { share: 0.5, size: 1.35, alpha: 0.85 },
  grainy: { size: 0.85, alpha: 1.15, oldFade: 0.8 },
};

export function puffsPerCloud(shownClouds: number): number {
  if (shownClouds <= 0) return 0;
  return Math.min(DUST_LOOK.puffs, Math.floor(DUST_LOOK.maxCards / shownClouds));
}

const LARGEST_BREATHE = 1.25;

export function fitToTruck(center: { x: number; z: number }, truck: { x: number; z: number } | null, halfLength: number, reach: number): number {
  if (!truck) return 1;
  const room = Math.hypot(center.x - truck.x, center.z - truck.z) - halfLength;
  return Math.min(1, Math.max(0, room / reach));
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function plumeShape(age: number): { life: number; span: number; size: number; wobble: number; scatter: number; fade: number } {
  if (!Number.isFinite(age) || age < 0) throw new Error(`plume age must be a finite number of turns, got ${age}`);
  const life = Math.min(1, age / DETECT.dust.lifetime);
  const build = smoothstep(Math.min(1, age / DUST_LOOK.buildTurns));
  const span = DUST_LOOK.spread + DUST_LOOK.spreadGrowth * life;
  const grown = DUST_LOOK.size * (1 + (DUST_LOOK.sizeGrowth - 1) * life);
  return {
    life,
    span,
    size: DUST_LOOK.birthSize + (grown - DUST_LOOK.birthSize) * build,
    wobble: DUST_LOOK.wobble * build,
    scatter: span * DUST_LOOK.scatterShare * build,
    fade: smoothstep(Math.min(1, age / DUST_LOOK.fadeIn)) * (1 - life) ** DUST_LOOK.fadePower,
  };
}

function reachAt(age: number): number {
  const shape = plumeShape(age);
  return ((shape.span / 2 + shape.wobble) * Math.SQRT2 + (shape.size * DUST_LOOK.soft.size * LARGEST_BREATHE) / 2) * S;
}

type Drawn = { cloud: DustCloud; pos: Vec; drift: Vec; next: Vec | null; age: number; presence: number; tintFrom: TerrainTypeId; tintTo: TerrainTypeId; share: number };
type Run = { x: number; z: number; dirX: number; dirZ: number };
type Puffing = { terrain: Terrain; drawn: Drawn; run: Run; wobbleClock: number; fit: number; cuts: readonly Cutaway[] };

export class DustCloudsView {
  readonly root = new THREE.Group();
  private cards: Card[] = [];
  private lastWorld: World | null = null;
  private vehicles = new Map<string, Vehicle>();
  private readonly beforeClouds = new BeforeTurn<DustCloud>((w) => w.dustClouds);
  private seenAfter = new Set<string>();
  private seenBeforeOf: World | null = null;
  private seenBefore = new Set<string>();
  private readonly tints = new Map<string, THREE.Color>();
  private readonly blended = new THREE.Color();

  draw(cards: FxCards): void {
    for (const card of this.cards) cards.lit.push(card);
  }

  update(world: World, terrain: Terrain, nowMs: number, views: ReadonlyMap<string, VehicleView> = new Map(), clock: TurnClock | null = null, camera: THREE.Camera | null = null): void {
    this.noteWorld(world);
    const share = turnShare(clock);
    const seenAfter = this.seenAfter;
    const seenBefore = this.seenBeforeSet(clock);
    const shown = world.dustClouds.filter((c) => seenAfter.has(c.id) || (share < 1 && seenBefore.has(c.id)));
    const clouds = shown.slice(0, DUST_LOOK.maxCards);
    const puffs = puffsPerCloud(clouds.length);
    const cuts = cutawaysOf(views, camera);
    const trail = new Map(shown.map((c) => [trailKey(c.source, c.age), c]));
    this.cards = [];
    for (const c of clouds) {
      const younger = trail.get(trailKey(c.source, c.age - 1));
      const drawn = this.drawnOf(terrain, c, younger ? this.posOf(younger, clock, share) : null, clock, share, seenAfter.has(c.id), seenBefore.has(c.id));
      this.place(terrain, drawn, puffs, nowMs / 1000, this.fitOf(drawn, views), cutsNear(cuts, drawn));
    }
  }

  private noteWorld(world: World): void {
    if (world === this.lastWorld) return;
    this.lastWorld = world;
    this.vehicles = new Map(world.vehicles.map((v) => [v.id, v]));
    this.seenAfter = seenSet(world);
  }

  private seenBeforeSet(clock: TurnClock | null): ReadonlySet<string> {
    const before = clock?.before ?? null;
    if (before !== this.seenBeforeOf) {
      this.seenBeforeOf = before;
      this.seenBefore = before ? seenSet(before) : new Set();
    }
    return this.seenBefore;
  }

  private posOf(c: DustCloud, clock: TurnClock | null, share: number): Vec {
    const before = this.beforeClouds.of(clock, c.id);
    return before ? driftAt(before, c, share) : c.pos;
  }

  private drawnOf(terrain: Terrain, c: DustCloud, next: Vec | null, clock: TurnClock | null, share: number, seenAfter: boolean, seenBefore: boolean): Drawn {
    const before = this.beforeClouds.of(clock, c.id);
    const kept = seenAfter && (seenBefore || !before);
    const presence = kept ? 1 : seenAfter ? share : 1 - share;
    const tintTo = terrain.types[tileAt(terrain, c.pos)];
    const tintFrom = before ? terrain.types[tileAt(terrain, before.pos)] : tintTo;
    const drift = before ? { x: before.vel.x + (c.vel.x - before.vel.x) * share, y: before.vel.y + (c.vel.y - before.vel.y) * share } : c.vel;
    return { cloud: c, pos: this.posOf(c, clock, share), drift, next, age: c.age + share, presence, tintFrom, tintTo, share };
  }

  private fitOf(d: Drawn, views: ReadonlyMap<string, VehicleView>): number {
    const source = this.vehicles.get(d.cloud.source);
    const truck = views.get(d.cloud.source)?.center() ?? null;
    if (!source || !truck) return 1;
    const center = { x: d.pos.x * S, z: d.pos.y * S };
    return fitToTruck(center, truck, tailReach(source.chassisId) * S, reachAt(d.age));
  }

  private place(terrain: Terrain, d: Drawn, puffs: number, seconds: number, fit: number, cuts: readonly Cutaway[]): void {
    if (fit <= 0) return;
    const tint = this.blended.copy(this.tintOf(d.tintFrom)).lerp(this.tintOf(d.tintTo), d.share);
    const seed = hashId(d.cloud.id);
    const puffing: Puffing = { terrain, drawn: d, run: runOf(d), wobbleClock: seconds / DUST_LOOK.wobbleSeconds, fit, cuts };
    for (let i = 0; i < puffs; i++) this.placePuff(puffing, seed + i * 17, tint);
  }

  private placePuff(p: Puffing, k: number, tint: THREE.Color): void {
    const along = hash2(k, 3);
    const age = p.drawn.age - 1 - along;
    if (age <= 0) return;
    const shape = plumeShape(age);
    const soft = hash2(k, 29) < DUST_LOOK.soft.share;
    const { x, z } = puffSpot(p, k, along, shape);
    const breathe = 0.75 + 0.5 * valueNoise(k * 0.29 + p.wobbleClock * 1.3, 8.1);
    const size = shape.size * breathe * p.fit * S * (soft ? DUST_LOOK.soft.size : DUST_LOOK.grainy.size);
    const y = (heightAt(p.terrain, x / S, z / S) + Math.min(age * DETECT.dust.riseHeight, DUST_LOOK.riseCap) + hash2(k, 7) * shape.scatter * p.fit) * S;
    this.cards.push({
      x,
      y,
      z,
      size,
      spin: hash2(k, 19) * DUST_LOOK.spinRange,
      shape: soft ? Math.floor(hash2(k, 23) * CARD_SHAPES) : clumpShape(hash2(k, 23)),
      r: tint.r,
      g: tint.g,
      b: tint.b,
      alpha: DUST_LOOK.opacity * shape.fade * p.drawn.presence * (0.6 + 0.8 * hash2(k, 13)) * puffStrength(soft, shape.life) * clearOfTrucks(p.cuts, x, y, z, size / 2),
      sx: p.run.dirX * size * DUST_LOOK.streak * shape.life,
      sy: 0,
      sz: p.run.dirZ * size * DUST_LOOK.streak * shape.life,
    });
  }

  private tintOf(type: TerrainTypeId): THREE.Color {
    let tint = this.tints.get(type);
    if (!tint) {
      tint = new THREE.Color(PAL.dustTrail).lerp(new THREE.Color(TERRAIN_TYPES[type].color), DUST_LOOK.groundShare);
      this.tints.set(type, tint);
    }
    return tint;
  }
}

function trailKey(source: string, age: number): string {
  return `${source}:${age}`;
}

function runOf(d: Drawn): Run {
  const x = d.next ? d.next.x - d.pos.x : d.drift.x;
  const z = d.next ? d.next.y - d.pos.y : d.drift.y;
  const length = Math.hypot(x, z) || 1;
  return { x, z, dirX: x / length, dirZ: z / length };
}

function puffSpot(p: Puffing, k: number, along: number, shape: ReturnType<typeof plumeShape>): { x: number; z: number } {
  const d = p.drawn;
  const reachX = d.next ? along * p.run.x : (along - 0.5) * shape.span * p.fit * p.run.dirX;
  const reachZ = d.next ? along * p.run.z : (along - 0.5) * shape.span * p.fit * p.run.dirZ;
  const across = (hash2(k, 11) - 0.5) * shape.span * DUST_LOOK.across * p.fit;
  const wobbleX = (valueNoise(k * 0.13 + p.wobbleClock, 1.7) - 0.5) * 2 * shape.wobble * p.fit;
  const wobbleZ = (valueNoise(4.3, k * 0.13 + p.wobbleClock) - 0.5) * 2 * shape.wobble * p.fit;
  return { x: (d.pos.x + reachX - across * p.run.dirZ + wobbleX) * S, z: (d.pos.y + reachZ + across * p.run.dirX + wobbleZ) * S };
}

function puffStrength(soft: boolean, life: number): number {
  return soft ? DUST_LOOK.soft.alpha : DUST_LOOK.grainy.alpha * (1 - life * DUST_LOOK.grainy.oldFade);
}

const PUFF_SPOT = new THREE.Vector3();
const TRUCK_CUT_TILES = 2;

function cutawaysOf(views: ReadonlyMap<string, VehicleView>, camera: THREE.Camera | null): Cutaway[] {
  if (!camera) return [];
  const look = camera.getWorldDirection(new THREE.Vector3());
  return [...views.values()].map((view) => ({ at: new THREE.Vector3().copy(view.center()), look }));
}

function cutsNear(cuts: readonly Cutaway[], d: Drawn): readonly Cutaway[] {
  if (cuts.length === 0) return cuts;
  const runLength = d.next ? Math.hypot(d.next.x - d.pos.x, d.next.y - d.pos.y) : 0;
  const reach = reachAt(d.age) + (TRUCK_CUT_TILES + runLength) * S;
  return cuts.filter((cut) => Math.hypot(cut.at.x - d.pos.x * S, cut.at.z - d.pos.y * S) < reach);
}

function clearOfTrucks(cuts: readonly Cutaway[], x: number, y: number, z: number, half: number): number {
  let share = 1;
  for (const cut of cuts) share = Math.min(share, cutShare(cut, PUFF_SPOT.set(x, y, z), half));
  return share;
}

function seenSet(world: World): Set<string> {
  const seen = new Set(world.player.clouds);
  for (const c of world.dustClouds) if (c.source === world.player.vehicleId) seen.add(c.id);
  return seen;
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
