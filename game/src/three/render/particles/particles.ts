import * as THREE from 'three';
import { toMap, type V3 } from '../../../phys/frames';
import { WEATHER } from '../../../data/weather';
import { inLiveRange } from '../../../sim/fidelity';
import type { World } from '../../../sim/types';
import { count } from '../../../perf';
import { TUNING } from '../inkTuning';
import { CARD_SHAPES, clumpShape, HAZE_SHAPE, INK_DUST_LAYER, PLUME_SHAPE, ROUND_SHAPE, type CardBatch } from './cards';

export const OVERWRITE_COUNTER = 'fx.particles.overwritten';
export const FAR_COUNTER = 'fx.particles.far';

export type Nearby = (p: V3) => boolean;

export function liveNear(world: () => World): Nearby {
  return (p) => inLiveRange(world(), toMap(p));
}

export type ParticleLook = {
  life: number;
  size: { from: number; to: number };
  colors: readonly number[];
  alpha: { peak: number; fadeIn: number };
  drag: number;
  gravity: number;
  streak: number;
  form: 'cloud' | 'haze' | 'round' | 'clump';
  plume?: true;
  smoke?: true;
  onlyIn?: 'inkOff' | 'inkOn';
  burns?: true;
  inkScale?: number;
  becomes?: { look: ParticleLook; share: number; scale: number; spread: number; keepSpeed: number };
};

export type ParticleSink = Pick<Particles, 'spawn'>;

export type ParticleBatches = { main: CardBatch; plumes: CardBatch; fire: CardBatch };

export const BILLOW_AGE_TONE = { young: 0.8, old: 1.15 };

type Slot = {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  scale: number;
  spin: number;
  spinRate: number;
  shape: number;
  look: ParticleLook;
};

const SPIN_RATE = 1.2;

export const BREEZE = { toward: new THREE.Vector3(WEATHER.wind.x, 0, WEATHER.wind.y).normalize(), metersPerSecond: 1.2, riseSeconds: 1.5 };

export class Particles {
  private readonly slots: Slot[];
  private head = 0;
  private readonly colorKeys = new Map<ParticleLook, THREE.Color[]>();
  private readonly color = new THREE.Color();
  private readonly young = new THREE.Color();
  private next: ParticleSink | null = null;

  constructor(private readonly capacity: number, private readonly nearby: Nearby) {
    this.slots = Array.from({ length: capacity }, () => ({
      alive: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      age: 0,
      life: 1,
      scale: 1,
      spin: 0,
      spinRate: 0,
      shape: 0,
      look: null as never,
    }));
  }

  spawn(p: V3, vel: V3, look: ParticleLook, scale: number): void {
    if (inkShareOf(look, TUNING.fxInk.value) <= 0) return;
    if (!this.nearby(p)) {
      count(FAR_COUNTER);
      return;
    }
    const slot = this.slots[this.head];
    if (slot.alive) count(OVERWRITE_COUNTER);
    this.head = (this.head + 1) % this.capacity;
    slot.alive = true;
    slot.pos.set(p.x, p.y, p.z);
    slot.vel.set(vel.x, vel.y, vel.z);
    slot.age = 0;
    slot.life = look.life * (0.8 + Math.random() * 0.4);
    slot.scale = scale;
    slot.spin = Math.random() * Math.PI * 2;
    slot.spinRate = (Math.random() - 0.5) * 2 * SPIN_RATE;
    slot.shape = shapeOf(look.form);
    slot.look = look;
  }

  tick(dt: number): void {
    for (const s of this.slots) {
      if (!s.alive) continue;
      s.age += dt;
      if (s.age >= s.life) {
        this.retire(s);
        continue;
      }
      s.vel.multiplyScalar(Math.exp(-s.look.drag * dt));
      s.vel.y -= s.look.gravity * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.look.form === 'cloud') s.pos.addScaledVector(BREEZE.toward, BREEZE.metersPerSecond * Math.min(1, s.age / BREEZE.riseSeconds) * dt);
      s.spin += s.spinRate * dt;
    }
  }

  handOff(next: ParticleSink): void {
    this.next = next;
  }

  private retire(s: Slot): void {
    s.alive = false;
    const then = s.look.becomes;
    if (!then || !this.next || Math.random() >= then.share) return;
    const vary = 1 - then.spread / 2 + Math.random() * then.spread;
    this.next.spawn(s.pos, { x: s.vel.x * then.keepSpeed, y: s.vel.y * then.keepSpeed, z: s.vel.z * then.keepSpeed }, then.look, s.scale * then.scale * vary);
  }

  draw(to: ParticleBatches, ink: number, shapeFlag = 0): void {
    for (const s of this.slots) {
      if (!s.alive) continue;
      const t = s.age / s.life;
      this.toneOf(s.look, t, ink);
      const card = batchOf(s.look, to).slot();
      card.x = s.pos.x;
      card.y = s.pos.y;
      card.z = s.pos.z;
      card.size = sizeAt(s.look, t) * s.scale * inkSizeOf(s.look, ink);
      card.spin = s.spin;
      card.shape = drawnShape(s.shape, s.look, ink) + shapeFlag;
      card.r = this.color.r;
      card.g = this.color.g;
      card.b = this.color.b;
      card.alpha = alphaAt(s.look, t) * inkShareOf(s.look, ink);
      card.sx = s.vel.x * s.look.streak;
      card.sy = s.vel.y * s.look.streak;
      card.sz = s.vel.z * s.look.streak;
    }
  }

  private toneOf(look: ParticleLook, t: number, ink: number): void {
    const keys = this.keysOf(look);
    colorAt(keys, t, this.color);
    if (look.form !== 'cloud' || look.burns || ink <= 0) return;
    const shade = BILLOW_AGE_TONE.young + (BILLOW_AGE_TONE.old - BILLOW_AGE_TONE.young) * t;
    this.young.copy(keys[0]).multiplyScalar(shade);
    this.color.lerp(this.young, ink);
  }

  alive(): number {
    return this.slots.filter((s) => s.alive).length;
  }

  private keysOf(look: ParticleLook): THREE.Color[] {
    let keys = this.colorKeys.get(look);
    if (!keys) {
      if (look.colors.length === 0) throw new Error('A particle look needs at least one color');
      keys = look.colors.map((c) => new THREE.Color(c));
      this.colorKeys.set(look, keys);
    }
    return keys;
  }
}

function batchOf(look: ParticleLook, to: ParticleBatches): CardBatch {
  if (look.burns) return to.fire;
  return look.plume ? to.plumes : to.main;
}

function inkShareOf(look: ParticleLook, ink: number): number {
  if (look.onlyIn === 'inkOff') return 1 - ink;
  return look.onlyIn === 'inkOn' ? ink : 1;
}

export function inkSizeOf(look: Pick<ParticleLook, 'smoke' | 'inkScale'>, ink: number): number {
  const full = look.smoke ? TUNING.smokeSize.value : (look.inkScale ?? 1);
  return 1 + (full - 1) * ink;
}

function drawnShape(shape: number, look: ParticleLook, ink: number): number {
  return look.plume && ink >= INK_DUST_LAYER ? PLUME_SHAPE + (shape % CARD_SHAPES) : shape;
}

function shapeOf(form: ParticleLook['form']): number {
  if (form === 'round') return ROUND_SHAPE;
  if (form === 'clump') return clumpShape(Math.random());
  const lumps = Math.floor(Math.random() * CARD_SHAPES);
  return form === 'haze' ? HAZE_SHAPE + lumps : lumps;
}

export function sizeAt(look: ParticleLook, t: number): number {
  const grow = 1 - (1 - t) * (1 - t);
  return look.size.from + (look.size.to - look.size.from) * grow;
}

export function alphaAt(look: ParticleLook, t: number): number {
  const { peak, fadeIn } = look.alpha;
  if (t < fadeIn) return (peak * t) / fadeIn;
  const u = (t - fadeIn) / (1 - fadeIn);
  return peak * (1 - u * u * (3 - 2 * u));
}

export function colorAt(keys: readonly THREE.Color[], t: number, out: THREE.Color): THREE.Color {
  if (keys.length === 1) return out.copy(keys[0]);
  const at = Math.min(1, Math.max(0, t)) * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(at));
  return out.copy(keys[i]).lerp(keys[i + 1], at - i);
}
