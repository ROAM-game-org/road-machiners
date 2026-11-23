import * as THREE from 'three';
import { PHYSICS } from '../../data/physics';
import { groundPoint, type V3 } from '../../phys/frames';
import { PAL } from '../../render/palette';
import type { GameEvent, World } from '../../sim/types';
import { shutDownTurnsLeft } from '../../sim/utility';
import { playerSees } from '../../sim/vision';
import type { Terrain } from '../../sim/terrain';
import type { TurnClock } from './hazards';
import { coolInkShape, INK_DUST_LAYER, ROUND_SHAPE, type FxCards } from './particles/cards';
import { TUNING } from './inkTuning';
import type { VehicleView } from './vehicle';

const S = PHYSICS.metersPerTile;

const PULSE_ORDER = 906;
const PULSE_LOOK = {
  ms: 600,
  flash: 3.5,
  rise: 1.2,
  segments: 9,
  jitter: 0.9,
  strands: 2,
  sparks: 10,
  sparkSize: 0.12,
  sparkReach: 1.4,
  sparkHeight: 2.2,
  sparkStreak: 0.7,
  crackleMs: 90,
  strandSparks: [2, 4, 6],
  strandStreak: 0.5,
  maxZaps: 4,
  maxArcs: 4,
  maxShut: 6,
};
const ARC_INK = { widthM: 0.25, columns: [-1, -0.75, -0.75, -0.4, -0.4, 0.4, 0.4, 0.75, 0.75, 1] };
const ARC_COLORS = [PAL.pulse.rim, PAL.pulse.rim, PAL.pulse.arc, PAL.pulse.arc, PAL.pulse.core, PAL.pulse.core, PAL.pulse.arc, PAL.pulse.arc, PAL.pulse.rim, PAL.pulse.rim];

type PulseEvent = Extract<GameEvent, { t: 'pulse' }>;
type Ribbon = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
type Strand = { line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; ribbon: Ribbon; offsets: V3[]; live: boolean };
const NO_STREAK = new THREE.Vector3();
const SIDE = new THREE.Vector3();
const TANGENT = new THREE.Vector3();
const FROM = new THREE.Vector3();
const TO = new THREE.Vector3();
type Flash = { at: THREE.Vector3; size: number; alpha: number };
type Zap = { e: PulseEvent; flash: Flash; arcs: { to: string; strands: Strand[] }[]; startMs: number; nextJagMs: number };
type Crackle = { spots: { at: THREE.Vector3; streak: THREE.Vector3 }[]; nextMs: number };

const inked = () => TUNING.fxInk.value >= INK_DUST_LAYER;

export class PulseView {
  readonly root = new THREE.Group();
  private readonly zaps: Zap[] = [];
  private played = new Set<string>();
  private turn = -1;
  private readonly sparks = new Map<string, Crackle>();
  private readonly color = new THREE.Color();

  draw(cards: FxCards): void {
    for (const zap of this.zaps.slice(0, PULSE_LOOK.maxZaps)) {
      this.spark(cards, zap.flash.at, PAL.pulse.flash, zap.flash.size, zap.flash.alpha, NO_STREAK);
      for (const arc of zap.arcs.slice(0, PULSE_LOOK.maxArcs)) this.strandSparks(cards, arc.strands[0], zap.flash.alpha);
    }
    for (const crackle of [...this.sparks.values()].slice(0, PULSE_LOOK.maxShut)) {
      for (const spot of crackle.spots) this.spark(cards, spot.at, PAL.pulse.spark, PULSE_LOOK.sparkSize * S, 1, spot.streak);
    }
  }

  private strandSparks(cards: FxCards, strand: Strand, alpha: number): void {
    if (!strand.live) return;
    const at = strand.line.geometry.getAttribute('position');
    const point = new THREE.Vector3();
    const streak = new THREE.Vector3();
    for (const i of PULSE_LOOK.strandSparks) {
      point.fromBufferAttribute(at, i);
      streak.fromBufferAttribute(at, i + 1).sub(new THREE.Vector3().fromBufferAttribute(at, i - 1)).multiplyScalar(PULSE_LOOK.strandStreak);
      this.spark(cards, point, PAL.pulse.spark, PULSE_LOOK.sparkSize * S, alpha, streak);
    }
  }

  private spark(cards: FxCards, at: THREE.Vector3, hex: number, size: number, alpha: number, streak: THREE.Vector3): void {
    this.color.set(hex);
    const ink = inked();
    const batch = ink ? cards.lit : cards.glow;
    const shape = ink ? coolInkShape(ROUND_SHAPE) : ROUND_SHAPE;
    batch.push({ x: at.x, y: at.y, z: at.z, size, spin: 0, shape, r: this.color.r, g: this.color.g, b: this.color.b, alpha, sx: streak.x, sy: streak.y, sz: streak.z });
  }

  update(world: World, terrain: Terrain, views: ReadonlyMap<string, VehicleView>, nowMs: number, clock: TurnClock | null, camera: THREE.Camera): void {
    if (clock === null || clock.moved) this.startZaps(world, nowMs);
    const view = camera.getWorldDirection(new THREE.Vector3());
    for (const zap of [...this.zaps]) this.play(zap, terrain, views, nowMs, view);
    this.crackle(world, views, nowMs);
  }

  private startZaps(world: World, nowMs: number): void {
    if (world.turn !== this.turn) {
      this.turn = world.turn;
      this.played = new Set();
    }
    for (const e of world.events) {
      if (e.t !== 'pulse' || this.played.has(e.vehicle) || !pulseShown(world, e)) continue;
      this.played.add(e.vehicle);
      this.zaps.push(this.makeZap(e, nowMs));
    }
  }

  private makeZap(e: PulseEvent, nowMs: number): Zap {
    const flash = { at: new THREE.Vector3(), size: 0, alpha: 0 };
    const arcs = e.hit.map((to) => ({ to, strands: Array.from({ length: PULSE_LOOK.strands }, () => makeStrand()) }));
    this.root.add(...arcs.flatMap((a) => a.strands.flatMap((s) => [s.line, s.ribbon])));
    return { e, flash, arcs, startMs: nowMs, nextJagMs: -Infinity };
  }

  private play(zap: Zap, terrain: Terrain, views: ReadonlyMap<string, VehicleView>, nowMs: number, view: THREE.Vector3): void {
    const t = (nowMs - zap.startMs) / PULSE_LOOK.ms;
    if (t >= 1) return this.end(zap);
    const from = zapPoint(userPoint(zap.e, terrain, views));
    zap.flash.at.set(from.x, from.y, from.z);
    zap.flash.size = PULSE_LOOK.flash * S * (0.6 + 0.6 * t);
    zap.flash.alpha = 1 - t;
    const roll = nowMs >= zap.nextJagMs;
    if (roll) zap.nextJagMs = nowMs + PULSE_LOOK.crackleMs;
    const ink = inked();
    for (const arc of zap.arcs) {
      const target = views.get(arc.to);
      for (const strand of arc.strands) {
        if (roll) rollJag(strand);
        placeStrand(strand, from, target ? zapPoint(target.center()) : null, 1 - t, ink, view);
      }
    }
  }

  private end(zap: Zap): void {
    const strands = zap.arcs.flatMap((a) => a.strands);
    this.root.remove(...strands.flatMap((s) => [s.line, s.ribbon]));
    for (const s of strands) {
      for (const o of [s.line, s.ribbon]) {
        o.geometry.dispose();
        o.material.dispose();
      }
    }
    this.zaps.splice(this.zaps.indexOf(zap), 1);
  }

  private crackle(world: World, views: ReadonlyMap<string, VehicleView>, nowMs: number): void {
    const shut = shutDownViews(world, views);
    for (const id of this.sparks.keys()) if (!shut.has(id)) this.sparks.delete(id);
    for (const [id, view] of shut) {
      const crackle = this.sparks.get(id) ?? this.makeCrackle();
      this.sparks.set(id, crackle);
      if (nowMs >= crackle.nextMs) {
        jump(crackle, view.center());
        crackle.nextMs = nowMs + PULSE_LOOK.crackleMs;
      }
    }
  }

  private makeCrackle(): Crackle {
    const spots = Array.from({ length: PULSE_LOOK.sparks }, () => ({ at: new THREE.Vector3(), streak: new THREE.Vector3() }));
    return { spots, nextMs: -Infinity };
  }
}

function makeStrand(): Strand {
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PULSE_LOOK.segments * 3), 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: PAL.pulse.arc, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
  line.renderOrder = PULSE_ORDER;
  line.frustumCulled = false;
  line.visible = false;
  const offsets = Array.from({ length: PULSE_LOOK.segments }, () => ({ x: 0, y: 0, z: 0 }));
  return { line, ribbon: makeRibbon(), offsets, live: false };
}

function makeRibbon(): Ribbon {
  const rows = PULSE_LOOK.segments;
  const cols = ARC_INK.columns.length;
  const colors = new Float32Array(rows * cols * 3);
  const color = new THREE.Color();
  for (let i = 0; i < rows; i++) {
    ARC_COLORS.forEach((hex, j) => color.set(hex).toArray(colors, (i * cols + j) * 3));
  }
  const index: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      index.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(rows * cols * 3), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, depthWrite: false }));
  mesh.renderOrder = PULSE_ORDER;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

function rollJag(strand: Strand): void {
  const last = PULSE_LOOK.segments - 1;
  strand.offsets.forEach((o, i) => {
    const off = i === 0 || i === last ? 0 : PULSE_LOOK.jitter;
    o.x = (Math.random() - 0.5) * 2 * off;
    o.y = (Math.random() - 0.5) * 2 * off;
    o.z = (Math.random() - 0.5) * 2 * off;
  });
}

function placeStrand(strand: Strand, a: V3, b: V3 | null, remaining: number, ink: boolean, view: THREE.Vector3): void {
  strand.live = b !== null;
  strand.line.visible = b !== null && !ink;
  strand.ribbon.visible = b !== null && ink;
  if (!b) return;
  const at = strand.line.geometry.getAttribute('position');
  const last = PULSE_LOOK.segments - 1;
  strand.offsets.forEach((o, i) => {
    const t = i / last;
    at.setXYZ(i, a.x + (b.x - a.x) * t + o.x, a.y + (b.y - a.y) * t + o.y, a.z + (b.z - a.z) * t + o.z);
  });
  at.needsUpdate = true;
  strand.line.material.opacity = remaining;
  if (ink) placeRibbon(strand.ribbon, at, view, (ARC_INK.widthM / 2) * remaining);
}

function placeRibbon(ribbon: Ribbon, points: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, view: THREE.Vector3, halfWidth: number): void {
  const out = ribbon.geometry.getAttribute('position');
  const cols = ARC_INK.columns.length;
  const last = points.count - 1;
  for (let i = 0; i <= last; i++) {
    FROM.fromBufferAttribute(points, Math.max(0, i - 1));
    TO.fromBufferAttribute(points, Math.min(last, i + 1));
    SIDE.crossVectors(TANGENT.subVectors(TO, FROM), view).normalize();
    for (let j = 0; j < cols; j++) {
      const reach = halfWidth * ARC_INK.columns[j];
      out.setXYZ(i * cols + j, points.getX(i) + SIDE.x * reach, points.getY(i) + SIDE.y * reach, points.getZ(i) + SIDE.z * reach);
    }
  }
  out.needsUpdate = true;
}

function userPoint(e: PulseEvent, terrain: Terrain, views: ReadonlyMap<string, VehicleView>): V3 {
  const view = views.get(e.vehicle);
  return view ? view.center() : groundPoint(terrain, e.pos);
}

function zapPoint(p: V3): V3 {
  return { x: p.x, y: p.y + PULSE_LOOK.rise, z: p.z };
}

function shutDownViews(world: World, views: ReadonlyMap<string, VehicleView>): Map<string, VehicleView> {
  const shut = new Map<string, VehicleView>();
  for (const v of world.vehicles) {
    const view = views.get(v.id);
    if (view && shutDownTurnsLeft(world, v) > 0) shut.set(v.id, view);
  }
  return shut;
}

function pulseShown(world: World, e: PulseEvent): boolean {
  const me = world.player.vehicleId;
  if (e.vehicle === me || e.hit.includes(me) || playerSees(world, e.pos)) return true;
  return e.hit.some((id) => {
    const v = world.vehicles.find((x) => x.id === id);
    return v !== undefined && playerSees(world, v.pos);
  });
}

function jump(crackle: Crackle, at: { x: number; y: number; z: number }): void {
  for (const spot of crackle.spots) {
    const a = Math.random() * 2 * Math.PI;
    const r = Math.random() * PULSE_LOOK.sparkReach;
    spot.at.set(at.x + Math.cos(a) * r, at.y + PULSE_LOOK.sparkHeight * Math.random(), at.z + Math.sin(a) * r);
    const b = Math.random() * 2 * Math.PI;
    spot.streak.set(Math.cos(b), Math.random() - 0.3, Math.sin(b)).multiplyScalar(PULSE_LOOK.sparkStreak);
  }
}
