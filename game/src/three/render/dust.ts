import * as THREE from 'three';
import { DETECT } from '../../data/detect';
import { PHYSICS } from '../../data/physics';
import { TERRAIN_TYPES, type TerrainTypeId } from '../../data/terrain';
import { PAL } from '../../render/palette';
import { hash2, valueNoise } from '../../render/noise';
import { tailReach } from '../../sim/rig';
import { dropClearance } from '../../sim/hazards';
import { heightAt, tileAt, type Terrain } from '../../sim/terrain';
import type { DustCloud, Vehicle, World } from '../../sim/types';
import { trailPassed, type TurnClock } from './hazards';
import type { VehicleView } from './vehicle';
import type { Card, FxCards } from './particles/cards';
import { CARD_SHAPES } from './particles/cards';

const S = PHYSICS.metersPerTile;

export const DUST_LOOK = {
  maxCards: 800,
  puffs: 7,
  spread: 0.5,
  spreadGrowth: 3,
  size: 1.8,
  birthSize: 0.5,
  buildTurns: 3,
  sizeGrowth: 2.5,
  opacity: 0.4,
  fadeIn: 2,
  wobble: 0.8,
  wobbleSeconds: 3.5,
  glideSeconds: 1.2,
  groundShare: 0.45,
  paleShare: 0.15,
  spinRange: Math.PI * 2,
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
    scatter: span * 0.4 * build,
    fade: smoothstep(Math.min(1, age / DUST_LOOK.fadeIn)) * (1 - life),
  };
}

function reachAt(age: number): number {
  const shape = plumeShape(age);
  return ((shape.span / 2 + shape.wobble) * Math.SQRT2 + (shape.size * LARGEST_BREATHE) / 2) * S;
}

export class DustCloudsView {
  readonly root = new THREE.Group();
  private cards: Card[] = [];
  private lastTurn = -1;
  private turnMs = 0;
  private lastWorld: World | null = null;
  private vehicles = new Map<string, Vehicle>();
  private readonly tints = new Map<string, THREE.Color>();

  draw(cards: FxCards): void {
    for (const card of this.cards) cards.lit.push(card);
  }

  update(world: World, terrain: Terrain, nowMs: number, views: ReadonlyMap<string, VehicleView> = new Map(), clock: TurnClock | null = null): void {
    if (world !== this.lastWorld) {
      this.lastWorld = world;
      this.vehicles = new Map(world.vehicles.map((v) => [v.id, v]));
    }
    if (world.turn !== this.lastTurn) {
      this.lastTurn = world.turn;
      this.turnMs = nowMs;
    }
    const glide = Math.min(1, (nowMs - this.turnMs) / 1000 / DUST_LOOK.glideSeconds);
    const shown = new Set(world.player.clouds);
    for (const c of world.dustClouds) if (c.source === world.player.vehicleId) shown.add(c.id);
    const clouds = world.dustClouds.filter((c) => shown.has(c.id) && this.revealed(c, clock)).slice(0, DUST_LOOK.maxCards);
    const puffs = puffsPerCloud(clouds.length);
    this.cards = [];
    for (const c of clouds) this.place(terrain, c, puffs, glide, nowMs / 1000, this.fitOf(c, glide, views));
  }

  private revealed(c: DustCloud, clock: TurnClock | null): boolean {
    if (!clock || clock.moved || c.age > 0) return true;
    const source = this.vehicles.get(c.source);
    return !source || trailPassed(source, c.pos, dropClearance(source, 0), clock.progress);
  }

  private fitOf(c: DustCloud, glide: number, views: ReadonlyMap<string, VehicleView>): number {
    const source = this.vehicles.get(c.source);
    const truck = views.get(c.source)?.center() ?? null;
    if (!source || !truck) return 1;
    const center = { x: (c.pos.x + c.vel.x * glide) * S, z: (c.pos.y + c.vel.y * glide) * S };
    return fitToTruck(center, truck, tailReach(source.chassisId) * S, reachAt(c.age + glide));
  }

  private place(terrain: Terrain, c: DustCloud, puffs: number, glide: number, seconds: number, fit: number): void {
    const age = c.age + glide;
    const x = c.pos.x + c.vel.x * glide;
    const y = c.pos.y + c.vel.y * glide;
    const shape = plumeShape(age);
    const cx = x * S;
    const cy = (heightAt(terrain, x, y) + age * DETECT.dust.riseHeight) * S;
    const cz = y * S;
    if (fit <= 0) return;
    const tint = this.tintOf(terrain.types[tileAt(terrain, c.pos)]);
    const seed = hashId(c.id);
    const span = shape.span * fit;
    const t = seconds / DUST_LOOK.wobbleSeconds;
    for (let i = 0; i < puffs; i++) {
      const k = seed + i * 17;
      const wx = (valueNoise(k * 0.13 + t, 1.7) - 0.5) * 2 * shape.wobble * fit;
      const wz = (valueNoise(4.3, k * 0.13 + t) - 0.5) * 2 * shape.wobble * fit;
      const breathe = 0.75 + 0.5 * valueNoise(k * 0.29 + t * 1.3, 8.1);
      this.cards.push({
        x: cx + ((hash2(k, 3) - 0.5) * span + wx) * S,
        y: cy + hash2(k, 7) * shape.scatter * fit * S,
        z: cz + ((hash2(k, 11) - 0.5) * span + wz) * S,
        size: shape.size * breathe * fit * S,
        spin: hash2(k, 19) * DUST_LOOK.spinRange,
        shape: Math.min(CARD_SHAPES - 1, Math.floor(hash2(k, 23) * CARD_SHAPES)),
        r: tint.r,
        g: tint.g,
        b: tint.b,
        alpha: DUST_LOOK.opacity * shape.fade * (0.6 + 0.8 * hash2(k, 13)),
        sx: 0,
        sy: 0,
        sz: 0,
      });
    }
  }

  private tintOf(type: TerrainTypeId): THREE.Color {
    let tint = this.tints.get(type);
    if (!tint) {
      tint = new THREE.Color(PAL.dustTrail).lerp(new THREE.Color(TERRAIN_TYPES[type].color), DUST_LOOK.groundShare);
      tint.lerp(new THREE.Color(0xffffff), DUST_LOOK.paleShare);
      this.tints.set(type, tint);
    }
    return tint;
  }
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
