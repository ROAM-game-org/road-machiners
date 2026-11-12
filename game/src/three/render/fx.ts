import { setText } from '../../text/language';
import type { Msg } from '../../text/msg';
import * as THREE from 'three';
import { PHYSICS } from '../../data/physics';
import { TERRAIN_TYPES, type TerrainType } from '../../data/terrain';
import { ENGINE_HEAT } from '../../data/wear';
import { wheelMounts } from '../../phys/body';
import { headingOf, toMap, type V3, type VehicleFrame } from '../../phys/frames';
import { PAL } from '../../render/palette';
import { unitsOf } from '../../sim/body';
import { inOverdrive, isStranded, vehicleStats } from '../../sim/stats';
import { tileAt, type Terrain } from '../../sim/terrain';
import type { Vehicle, World } from '../../sim/types';
import { smokeAt, smokeSources, ventsOf, type SmokeSource, type TruckVents } from './smokePoints';
import type { CameraRig } from './camera';
import { tirePoints, Ruts } from './ruts';
import type { GroundAt } from './lines';
import { Casings, Projectiles, type Muzzle, type ProjectileSpec, type RoundPlan, type ShotCues, type TrailKind } from './projectiles';
import { CONFIG } from '../../config';
import { TUNING } from './inkTuning';
import { CARD_CLOCK, CARD_ORDER, CardBatch, createCardShapes, dustCardsOf, fireCardsOf, GLOW_IN_LIT, type FxCards } from './particles/cards';
import { InkLayer } from './inkLayer';
import { ChunkBatch } from './particles/chunks';
import { liveNear, Particles, type ParticleLook } from './particles/particles';
import { Blasts, type BlastGround } from './particles/blasts';
import { Emissions } from './particles/emissions';
import { moveTo } from '../../ui/dom';
import { layerPointOf } from '../../ui/ui-size';
import { overlayMaterial } from './overlay-material';

const MAX_TEXTS = 24;
const RISE_METERS = 1.5;
const LABEL_ROW_PX = 22;

const FLASH = {
  life: 0.07,
  endScale: 0.3,
  max: 48,
  order: CARD_ORDER.glow + 1,
};

type FloatText = { el: HTMLDivElement; pos: V3; anchor: (() => V3 | null) | null; rowPx: number; age: number; life: number; used: boolean };
type Flash = { mesh: THREE.Mesh; size: number; age: number };
type Pending = { left: number; run: () => void };

function flashGeometry(): THREE.BufferGeometry {
  const pts: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pts.push(...a, ...b, ...c);
  const half = 0.18;
  tri([0, 0, 0], [0.3, half, 0], [1, 0, 0]);
  tri([0, 0, 0], [1, 0, 0], [0.3, -half, 0]);
  tri([0, 0, 0], [0.3, 0, half], [1, 0, 0]);
  tri([0, 0, 0], [1, 0, 0], [0.3, 0, -half]);
  const points = 6;
  const outer = 0.32;
  const inner = 0.1;
  const x = 0.06;
  for (let i = 0; i < points * 2; i++) {
    const a0 = (i / (points * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (points * 2)) * Math.PI * 2;
    const r0 = i % 2 === 0 ? outer : inner;
    const r1 = i % 2 === 0 ? inner : outer;
    tri([x, 0, 0], [x, Math.cos(a0) * r0, Math.sin(a0) * r0], [x, Math.cos(a1) * r1, Math.sin(a1) * r1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

const X_AXIS = new THREE.Vector3(1, 0, 0);

class MuzzleFlashes {
  private flashes: Flash[] = [];
  private turn = new THREE.Quaternion();
  private roll = new THREE.Quaternion();
  private dir = new THREE.Vector3();
  private readonly material = overlayMaterial({ color: PAL.flash, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

  constructor(scene: THREE.Scene) {
    const geo = flashGeometry();
    for (let i = 0; i < FLASH.max; i++) {
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.renderOrder = FLASH.order;
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.flashes.push({ mesh, size: 0, age: 0 });
    }
  }

  show(m: Muzzle, length: number): void {
    const f = this.flashes.find((x) => !x.mesh.visible);
    if (!f) return;
    f.size = length;
    f.age = 0;
    f.mesh.visible = true;
    f.mesh.position.set(m.pos.x, m.pos.y, m.pos.z);
    this.turn.setFromUnitVectors(X_AXIS, this.dir.set(m.dir.x, m.dir.y, m.dir.z).normalize());
    this.roll.setFromAxisAngle(X_AXIS, Math.random() * Math.PI * 2);
    f.mesh.quaternion.copy(this.turn).multiply(this.roll);
    f.mesh.scale.setScalar(f.size);
  }

  tick(dt: number): void {
    this.material.blending = TUNING.fxInk.value >= 0.5 ? THREE.NormalBlending : THREE.AdditiveBlending;
    for (const f of this.flashes) {
      if (!f.mesh.visible) continue;
      f.age += dt;
      if (f.age >= FLASH.life) {
        f.mesh.visible = false;
        continue;
      }
      f.mesh.scale.setScalar(f.size * (1 - (1 - FLASH.endScale) * (f.age / FLASH.life)));
    }
  }
}

const AMMO_BLAST_RADIUS = 0.8;
const CLAYMORE_FX_RADIUS = 10;
const EXPLODE_RADIUS = 1.8;
const DUST = { color: 0xd8c098 };

const MAX_PARTICLES = 4000;
const MAX_GLOW_PARTICLES = 1000;
const MAX_VIEW_CARDS = 2000;
const MAX_CHUNKS = 600;
const INK_SORTED_FIRE = 0.5;

const HAZE_SPAWN_SCALE_MIN = 0.8;
const HAZE_SPAWN_SCALE_SPREAD = 0.4;
const HAZE_SPAWN_SCALE_MAX = HAZE_SPAWN_SCALE_MIN + HAZE_SPAWN_SCALE_SPREAD;

const SPRAY = {
  surfacePower: 2.5,
  dust: { perMeter: 7, minPerMeter: 2, groundShare: 0.45, life: 3, size: { from: 1.5, to: 3.6 }, alpha: { peak: 0.4, fadeIn: 0.02 }, drag: 1.6, gravity: -0.3 },
  wake: { along: { min: 1, spread: 1.5 }, aside: { min: 0.2, spread: 1.4 }, up: { min: 0.6, spread: 1 }, scale: { min: 0.35, spread: 0.65 }, fleck: { share: 0.35, speed: 2.2, scale: 0.22 } },
  haze: { perMeter: 0.35, minPerMeter: 0.12, life: 12, size: { from: 2.5, to: 9 }, alpha: { peak: 0.18, fadeIn: 0.08 }, drag: 0.8, gravity: -0.05, back: 1.2, spread: 0.8, rise: 0.3, lift: 0.8 },
  clods: { perMeter: 0.7, minMetersPerSecond: 2.5, back: { min: 0.15, spread: 0.3 }, up: { min: 1.2, spread: 2.6 }, aside: 1.4, lift: 0.15, size: { min: 0.1, spread: 0.2 }, life: 1.6, shade: 0.72 },
} as const;

export function hazeStartRadius(): number {
  return (SPRAY.haze.size.from * HAZE_SPAWN_SCALE_MAX * TUNING.dustSize.value) / 2;
}

export function sprayShare(ground: TerrainType): number {
  return ground.dust ** SPRAY.surfacePower;
}

type SprayCloud = { perMeter: number; minPerMeter: number; life: number; size: { from: number; to: number }; alpha: { peak: number; fadeIn: number }; drag: number; gravity: number };

export function sprayPuffsPerMeter(spray: SprayCloud, ground: TerrainType): number {
  return Math.max(spray.perMeter * sprayShare(ground), spray.minPerMeter);
}

export function sprayLook(spray: SprayCloud, ground: TerrainType, colors: number[]): ParticleLook {
  const fill = (spray.perMeter * sprayShare(ground)) / spray.minPerMeter;
  return { life: spray.life, size: spray.size, colors, alpha: { ...spray.alpha, peak: spray.alpha.peak * Math.min(1, fill) }, drag: spray.drag, gravity: spray.gravity, streak: 0, form: fill < 1 ? 'cloud' : 'clump' };
}

export type CardLights = { sun: THREE.DirectionalLight; sky: THREE.HemisphereLight };

export class Fx3D {
  private readonly shapes = createCardShapes(Math.random);
  readonly inkLayer = new InkLayer(this.shapes, { dust: MAX_PARTICLES + MAX_VIEW_CARDS, bank: MAX_VIEW_CARDS, fire: MAX_GLOW_PARTICLES + MAX_VIEW_CARDS }, CONFIG.fxFillScreens);
  readonly cards: FxCards = {
    lit: new CardBatch(MAX_PARTICLES + MAX_GLOW_PARTICLES + MAX_VIEW_CARDS, 'lit', this.shapes, CONFIG.fxFillScreens),
    glow: new CardBatch(MAX_GLOW_PARTICLES + MAX_VIEW_CARDS, 'glow', this.shapes, CONFIG.fxFillScreens),
    dust: this.inkLayer.dust,
    bank: this.inkLayer.bank,
    fire: this.inkLayer.fire,
  };
  private readonly nearby = liveNear(() => this.world());
  private readonly particles = new Particles(MAX_PARTICLES, this.nearby);
  private readonly glowParticles = new Particles(MAX_GLOW_PARTICLES, this.nearby);
  private readonly chunks = new ChunkBatch(MAX_CHUNKS, Math.random, this.nearby);
  private readonly emissions = new Emissions(this.particles, this.glowParticles);
  private readonly sprayLooks = new Map<TerrainType, { dust: ParticleLook; haze: ParticleLook; clod: THREE.Color }>();
  private readonly cardLight = { sunDir: new THREE.Vector3(), sun: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color() };
  private texts: FloatText[] = [];
  private projectiles: Projectiles;
  private pending: Pending[] = [];
  private flashes: MuzzleFlashes;
  private casings: Casings;
  readonly ruts: Ruts;
  private readonly blasts = new Blasts({ smoke: this.particles, glow: this.glowParticles, chunks: this.chunks });
  private terrain: Terrain | null = null;

  constructor(private scene: THREE.Scene, private overlay: HTMLElement, private rig: CameraRig, private readonly world: () => World, drawInkLayerThrough: (layer: InkLayer) => void) {
    drawInkLayerThrough(this.inkLayer);
    scene.add(this.cards.lit.mesh, this.cards.glow.mesh, ...this.chunks.meshes);
    this.glowParticles.handOff(this.particles);
    this.flashes = new MuzzleFlashes(scene);
    this.casings = new Casings(scene);
    this.ruts = new Ruts(scene);
    this.projectiles = new Projectiles(scene, (p, kind) => this.trail(p, kind));
    for (let i = 0; i < MAX_TEXTS; i++) {
      const el = document.createElement('div');
      el.className = 'float-text';
      overlay.appendChild(el);
      this.texts.push({ el, pos: { x: 0, y: 0, z: 0 }, anchor: null, rowPx: 0, age: 0, life: 1, used: false });
    }
  }

  shot(spec: ProjectileSpec, muzzle: () => Muzzle, plan: RoundPlan, blastRadius: number, cues: ShotCues, ground: GroundAt, turn: number): void {
    const onFire = (m: Muzzle) => {
      this.flashes.show(m, spec.flash);
      this.casings.eject(m, spec.casing, turn);
      this.blasts.muzzle(m.pos, m.dir, spec.flash);
      cues.fired(m);
    };
    const onLand = () => {
      if (plan.impact !== 'none' && !plan.impactRecorded) this.landing(plan, blastRadius, spec.look === 'shell');
      cues.landed();
    };
    this.projectiles.launch({ spec, muzzle, plan, onFire, onLand, ground });
  }

  clearShots(): void {
    this.projectiles.clearFlights();
  }

  projectileImpact(plan: RoundPlan, blastRadius: number, big: boolean): void {
    this.landing(plan, blastRadius, big);
  }

  private landing(plan: RoundPlan, blastRadius: number, big: boolean): void {
    if (blastRadius > 0) this.blast(plan.land, blastRadius);
    else this.impact(plan, big);
  }

  private impact(plan: RoundPlan, big: boolean): void {
    this.blasts.impact(plan.land, plan.impact === 'truck', big, this.groundAt(plan.land));
  }

  private blast(p: V3, radius: number): void {
    this.blasts.blast(p, radius, this.groundAt(p));
  }

  private groundAt(p: V3): BlastGround | null {
    if (!this.terrain) return null;
    const ground = TERRAIN_TYPES[this.terrain.types[tileAt(this.terrain, toMap(p))]];
    return { color: ground.color, dust: ground.dust };
  }

  ammoBlast(p: V3): void {
    this.blast(p, AMMO_BLAST_RADIUS);
  }

  airBurst(p: V3): void {
    this.blasts.airBurst(p);
  }

  fireBurst(p: V3): void {
    this.blasts.fireBurst(p);
  }

  private trail(p: V3, kind: TrailKind): void {
    if (kind === 'smoke') this.emissions.missile(p);
    else this.emissions.flamer(p);
  }

  later(delayMs: number, run: () => void): void {
    if (!(delayMs >= 0)) throw new Error(`A world effect waits a non-negative time, got ${delayMs} ms`);
    this.pending.push({ left: delayMs / 1000, run });
  }

  label(anchor: () => V3 | null, text: Msg, color: string, row: number, delayMs: number, readMs: number): void {
    this.later(delayMs, () => {
      const p = anchor();
      if (p) this.floatText(p, text, color, readMs, row * LABEL_ROW_PX, anchor);
    });
  }

  explode(p: V3): void {
    this.blast(p, EXPLODE_RADIUS);
  }

  claymoreBlast(p: V3): void {
    this.blast(p, CLAYMORE_FX_RADIUS);
  }

  crash(p: V3): void {
    this.blasts.crash(p, this.groundAt(p));
  }

  dust(p: V3): void {
    this.emissions.dust(p);
  }

  smoke(p: V3, damage = 0): void {
    this.emissions.hurt(p, damage);
  }

  light({ sun, sky }: CardLights): void {
    const l = this.cardLight;
    l.sunDir.copy(sun.position).sub(sun.target.position).normalize();
    l.sun.copy(sun.color).multiplyScalar(sun.intensity);
    l.sky.copy(sky.color).multiplyScalar(sky.intensity);
    l.ground.copy(sky.groundColor).multiplyScalar(sky.intensity);
    this.cards.lit.light(l);
    this.inkLayer.light(l);
    this.ruts.light(l.sunDir);
  }

  wheelDust(p: V3, back: V3, out: V3, ground: TerrainType): void {
    const w = SPRAY.wake;
    const along = w.along.min + Math.random() * w.along.spread;
    const aside = w.aside.min + Math.random() * w.aside.spread;
    const vel = { x: back.x * along + out.x * aside, y: w.up.min + Math.random() * w.up.spread, z: back.z * along + out.z * aside };
    const size = TUNING.dustSize.value;
    this.particles.spawn(p, vel, this.sprayOf(ground).dust, (w.scale.min + Math.random() * w.scale.spread) * size);
    if (Math.random() < w.fleck.share) this.particles.spawn(p, { x: vel.x * w.fleck.speed, y: vel.y * w.fleck.speed, z: vel.z * w.fleck.speed }, this.sprayOf(ground).dust, w.fleck.scale * size);
  }

  clod(p: V3, back: V3, out: V3, metersPerSecond: number, ground: TerrainType): void {
    const c = SPRAY.clods;
    const along = metersPerSecond * (c.back.min + Math.random() * c.back.spread);
    const aside = c.aside * (Math.random() - 0.3);
    const vel = { x: back.x * along + out.x * aside, y: c.up.min + Math.random() * c.up.spread, z: back.z * along + out.z * aside };
    const size = c.size.min + Math.random() * Math.random() * c.size.spread;
    this.chunks.spawn({ x: p.x, y: p.y + c.lift, z: p.z }, vel, size, c.life * (0.7 + Math.random() * 0.6), this.sprayOf(ground).clod);
  }

  dustHaze(p: V3, back: V3, ground: TerrainType): void {
    const h = SPRAY.haze;
    const vel = { x: back.x * h.back + (Math.random() - 0.5) * h.spread, y: h.rise * Math.random(), z: back.z * h.back + (Math.random() - 0.5) * h.spread };
    this.particles.spawn({ x: p.x, y: p.y + h.lift, z: p.z }, vel, this.sprayOf(ground).haze, (HAZE_SPAWN_SCALE_MIN + Math.random() * HAZE_SPAWN_SCALE_SPREAD) * TUNING.dustSize.value);
  }

  private sprayOf(ground: TerrainType): { dust: ParticleLook; haze: ParticleLook; clod: THREE.Color } {
    let look = this.sprayLooks.get(ground);
    if (!look) {
      const d = SPRAY.dust;
      const tint = new THREE.Color(DUST.color).lerp(new THREE.Color(ground.color), d.groundShare);
      const pale = tint.clone().lerp(new THREE.Color(0xffffff), 0.15);
      const colors = [tint.getHex(), pale.getHex()];
      look = {
        dust: { ...sprayLook(d, ground, colors), plume: true },
        haze: { ...sprayLook(SPRAY.haze, ground, colors), form: 'haze' },
        clod: new THREE.Color(ground.color).multiplyScalar(SPRAY.clods.shade),
      };
      this.sprayLooks.set(ground, look);
    }
    return look;
  }

  exhaust(p: V3, back: V3, scale: number): void {
    this.emissions.exhaust(p, back, scale);
  }

  steam(p: V3): void {
    this.emissions.steam(p);
  }

  douseSteam(p: V3): void {
    this.emissions.douse(p);
  }

  breakdownSmoke(p: V3, motion: V3): void {
    this.emissions.breakdown(p, motion);
  }

  floatText(p: V3, text: Msg, color: string, durationMs: number, rowPx = 0, anchor: (() => V3 | null) | null = null): void {
    const slot = this.texts.find((x) => !x.used) ?? this.texts.reduce((a, b) => (a.age > b.age ? a : b));
    slot.used = true;
    slot.age = 0;
    slot.life = durationMs / 1000;
    slot.rowPx = rowPx;
    slot.pos = { x: p.x, y: p.y, z: p.z };
    slot.anchor = anchor;
    setText(slot.el, text);
    slot.el.style.color = color;
    slot.el.style.display = 'block';
    slot.el.style.opacity = '1';
  }

  tick(playMs: number, realMs: number, world: World, combatMs: number): void {
    const dt = playMs / 1000;
    this.terrain = world.terrain;
    this.particles.tick(dt);
    this.glowParticles.tick(dt);
    this.chunks.tick(dt, world.terrain);
    const ink = TUNING.fxInk.value;
    const plumes = dustCardsOf(this.cards);
    this.particles.draw({ main: this.cards.lit, plumes, fire: fireCardsOf(this.cards, this.cards.lit) }, ink);
    if (ink >= INK_SORTED_FIRE) this.glowParticles.draw({ main: this.cards.lit, plumes, fire: fireCardsOf(this.cards, this.cards.lit) }, ink, GLOW_IN_LIT);
    else this.glowParticles.draw({ main: this.cards.glow, plumes, fire: fireCardsOf(this.cards, this.cards.glow) }, ink);
    this.cards.lit.flush(this.rig.camera);
    this.cards.glow.flush(this.rig.camera);
    this.cards.dust.flush(this.rig.camera);
    this.cards.bank.flush(this.rig.camera);
    this.cards.fire.flush(this.rig.camera);
    CARD_CLOCK.value += dt;
    this.flashes.tick(dt);
    this.casings.tick(dt, world.terrain, world.turn);
    this.ruts.tick(world.turn);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const job = this.pending[i];
      job.left -= dt;
      if (job.left > 0) continue;
      this.pending.splice(i, 1);
      job.run();
    }
    this.projectiles.tick(combatMs / 1000);
    this.floatTexts(realMs / 1000);
  }

  private floatTexts(dt: number): void {
    for (const slot of this.texts) {
      if (!slot.used) continue;
      slot.age += dt;
      if (slot.age >= slot.life) {
        slot.used = false;
        slot.el.style.display = 'none';
        continue;
      }
      const t = slot.age / slot.life;
      slot.pos = slot.anchor?.() ?? slot.pos;
      const screen = layerPointOf(this.rig.screenOf({ x: slot.pos.x, y: slot.pos.y + t * RISE_METERS, z: slot.pos.z }));
      moveTo(slot.el, screen.x, screen.y - slot.rowPx);
      slot.el.style.opacity = `${1 - t}`;
    }
  }
}

const MIN_DUST_SPEED = 0.5;
const FRONT_DUST = 0.5;
const EXHAUST_RATE = 14;
const EXHAUST_FULL_ACCEL = 3;
const CRUISE_SHARE = 0.8;
const CRUISE_RATE = 1.5;
const OVERDRIVE_RATE = 10;
const STEAM_RATE = 10;
const DOUSE_RATE = 60;
const DOUSE_SECONDS = 1.2;
const BREAKDOWN_RATE = 8;
const DAMAGE_RATE = 6;
const CREEP_METERS_PER_SECOND = 0.3;
const SPEED_JUMP = 1.5;
const TRAIL_SLACK = 3;
const TRAIL_SLACK_METERS = 1;

type Traits = { stranded: boolean; maxSpeed: number; smoke: SmokeSource[]; vents: TruckVents };
type Pose = { f: VehicleFrame; h: number };

export type TruckFxSink = Pick<Fx3D, 'smoke' | 'exhaust' | 'steam' | 'douseSteam' | 'breakdownSmoke' | 'dustHaze' | 'wheelDust' | 'clod'> & { ruts: Pick<Ruts, 'layTracks'> };

export class TruckFx {
  private world: World | null = null;
  private traits = new Map<string, Traits>();
  private readonly lastTires = new Map<string, V3[]>();
  private readonly lastPos = new Map<string, V3>();
  private douseLeft = 0;

  constructor(private fx: TruckFxSink) {}

  emit(world: World, v: Vehicle, f: VehicleFrame, moving: boolean, dt: number, seen: boolean): void {
    const traits = this.traitsOf(world, v);
    const pose: Pose = { f, h: headingOf(f.rot) };
    const metersPerSecond = this.groundSpeed(v.id, f.pos, dt, traits.maxSpeed * PHYSICS.metersPerTile);
    if (moving || metersPerSecond > CREEP_METERS_PER_SECOND) this.driving(world, v, pose, traits, seen, dt, metersPerSecond);
    if (v.id === world.player.vehicleId) {
      this.overdriveExhaust(world, v, traits, pose, dt);
      this.steam(world.player.engineHeat, traits, pose, dt);
      this.douseCloud(traits, pose, dt);
    }
    if (traits.stranded) this.puffs(BREAKDOWN_RATE, dt, () => this.fx.breakdownSmoke(smokeAt(traits.vents.engine, f), motionOf(v, pose.h, moving)));
    else for (const source of traits.smoke) this.puffs(DAMAGE_RATE, dt, () => this.fx.smoke(smokeAt(source, f), source.damage));
  }

  private groundSpeed(id: string, pos: V3, dt: number, topMetersPerSecond: number): number {
    const last = this.lastPos.get(id);
    this.lastPos.set(id, { ...pos });
    if (!last || !(dt > 0)) return 0;
    const metersPerSecond = Math.hypot(pos.x - last.x, pos.z - last.z) / dt;
    return metersPerSecond > topMetersPerSecond * SPEED_JUMP ? 0 : metersPerSecond;
  }

  private driving(world: World, v: Vehicle, pose: Pose, traits: Traits, seen: boolean, dt: number, metersPerSecond: number): void {
    const back = { x: -Math.cos(pose.h), y: 0, z: -Math.sin(pose.h) };
    this.wheels(world, v, traits, pose, back, seen, dt, metersPerSecond);
    if (traits.stranded) return;
    const along = -(pose.f.acc.x * back.x + pose.f.acc.z * back.z);
    const cruise = v.speed > traits.maxSpeed * CRUISE_SHARE ? CRUISE_RATE : 0;
    const rate = EXHAUST_RATE * Math.min(1, Math.max(0, along / EXHAUST_FULL_ACCEL)) + cruise;
    this.puffs(rate, dt, () => this.fx.exhaust(smokeAt(traits.vents.exhaust, pose.f), back, traits.vents.exhaustScale));
  }

  private overdriveExhaust(world: World, v: Vehicle, traits: Traits, pose: Pose, dt: number): void {
    if (!inOverdrive(world, v) || traits.stranded) return;
    const back = { x: -Math.cos(pose.h), y: 0, z: -Math.sin(pose.h) };
    this.puffs(OVERDRIVE_RATE, dt, () => this.fx.exhaust(smokeAt(traits.vents.exhaust, pose.f), back, traits.vents.exhaustScale));
  }

  private steam(heat: number, traits: Traits, pose: Pose, dt: number): void {
    if (heat < ENGINE_HEAT.warnAt) return;
    const share = (heat - ENGINE_HEAT.warnAt) / (1 - ENGINE_HEAT.warnAt);
    this.puffs((STEAM_RATE * (1 + 2 * share)) / 3, dt, () => this.fx.steam(smokeAt(traits.vents.engine, pose.f)));
  }

  douse(): void {
    this.douseLeft = DOUSE_SECONDS;
  }

  private douseCloud(traits: Traits, pose: Pose, dt: number): void {
    if (this.douseLeft <= 0) return;
    this.douseLeft -= dt;
    this.puffs(DOUSE_RATE, dt, () => this.fx.douseSteam(smokeAt(douseSpot(traits.vents.douse), pose.f)));
  }

  private wheels(world: World, v: Vehicle, traits: Traits, pose: Pose, back: V3, seen: boolean, dt: number, metersPerSecond: number): void {
    const dusty = metersPerSecond > MIN_DUST_SPEED * PHYSICS.metersPerTile;
    if (!seen && !dusty) return;
    const tires = tirePoints(world.terrain, v.chassisId, pose.f);
    if (seen) this.fx.ruts.layTracks(world, v, pose.f, tires);
    if (dusty) this.dust(world, v, traits, pose, back, tires, dt, metersPerSecond);
  }

  private dust(world: World, v: Vehicle, traits: Traits, pose: Pose, back: V3, tires: V3[], dt: number, metersPerSecond: number): void {
    const ground = TERRAIN_TYPES[world.terrain.types[tileAt(world.terrain, v.pos)]];
    const loose = sprayShare(ground);
    const rate = sprayPuffsPerMeter(SPRAY.dust, ground) * TUNING.dustAmount.value * metersPerSecond;
    const clodRate = metersPerSecond > SPRAY.clods.minMetersPerSecond ? SPRAY.clods.perMeter * metersPerSecond * loose : 0;
    const mounts = unitsOf(v.chassisId).flatMap((u) => wheelMounts(u.body, u.index));
    const before = this.trailedTires(v.id, tires, metersPerSecond * dt);
    for (const [i, tire] of tires.entries()) {
      const side = Math.sign(mounts[i].z);
      const out = { x: -Math.sin(pose.h) * side, y: 0, z: Math.cos(pose.h) * side };
      const front = i < 2 ? FRONT_DUST : 1;
      const along = () => between(before?.[i] ?? tire, tire, Math.random());
      this.puffs(rate * front, dt, () => this.fx.wheelDust(along(), back, out, ground));
      this.puffs(clodRate * front, dt, () => this.fx.clod(tire, back, out, metersPerSecond, ground));
    }
    const hazeRate = sprayPuffsPerMeter(SPRAY.haze, ground) * metersPerSecond;
    const [left, right] = tires.slice(-2);
    const behind = traits.vents.hazeBack + hazeStartRadius();
    const rear = { x: (left.x + right.x) / 2 + back.x * behind, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 + back.z * behind };
    this.puffs(hazeRate, dt, () => this.fx.dustHaze(rear, back, ground));
  }

  private trailedTires(id: string, tires: V3[], stepMeters: number): V3[] | null {
    const last = this.lastTires.get(id) ?? null;
    this.lastTires.set(id, tires.map((t) => ({ ...t })));
    if (!last || last.length !== tires.length) return null;
    const moved = Math.hypot(tires[0].x - last[0].x, tires[0].z - last[0].z);
    return moved <= stepMeters * TRAIL_SLACK + TRAIL_SLACK_METERS ? last : null;
  }

  private puffs(rate: number, dt: number, puff: () => void): void {
    for (let n = Math.floor(rate * dt + Math.random()); n > 0; n--) puff();
  }

  private traitsOf(world: World, v: Vehicle): Traits {
    if (world !== this.world) {
      this.world = world;
      this.traits.clear();
    }
    let t = this.traits.get(v.id);
    if (!t) {
      t = { stranded: isStranded(world, v), maxSpeed: vehicleStats(world, v).maxSpeed, smoke: smokeSources(v), vents: ventsOf(v) };
      this.traits.set(v.id, t);
    }
    return t;
  }
}

function motionOf(v: Vehicle, h: number, moving: boolean): V3 {
  const mps = moving ? v.speed * PHYSICS.metersPerTile : 0;
  return { x: Math.cos(h) * mps, y: 0, z: Math.sin(h) * mps };
}

function between(a: V3, b: V3, t: number): V3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function douseSpot(douse: TruckVents['douse']): TruckVents['douse'] {
  return { ...douse, x: douse.x + (Math.random() * 2 - 1) * douse.halfX, z: douse.z + (Math.random() * 2 - 1) * douse.halfZ };
}
