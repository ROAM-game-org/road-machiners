
import * as THREE from 'three';
import { PHYSICS } from '../../data/physics';
import { WEATHER } from '../../data/weather';
import { PAL } from '../../render/palette';
import { hash2, valueNoise } from '../../render/noise';
import { heightAt, type Terrain } from '../../sim/terrain';
import type { Contact } from '../../sim/types';
import { dist, type Vec } from '../../sim/vec';
import { overlayMaterial } from './overlay-material';
import { TUNING } from './inkTuning';
import { INK_DUST_LAYER } from './particles/cards';

const S = PHYSICS.metersPerTile;
const RENDER_ORDER = 905;
const LIFT = 0.08;

const SHOW_SOUND_WAVES = false;

const WAVE = {
  points: 64,
  fronts: 3,
  speed: 24,
  reachPast: 1.3,
  brightness: 0.7,
  climbDrag: 3,
  shadowFade: 2.5,
  wind: 0.35,
  wobble: 0.06,
  wobbleScale: 3,
  originSpread: 0.7,
  stagger: 0.25,
  repeat: 14,
};

const BLIP = { radius: 0.7, dot: 0.25, opacity: 0.9 };

const INK_MARK = { core: 0.18, band: 0.3, strokeRadius: 0.58, strokeWidth: 0.14, strokeArc: (70 * Math.PI) / 180, strokes: 3, segments: 12 };

type MarkKind = 'radio' | 'flare';

function arcStrokes(): THREE.BufferGeometry {
  const { strokeRadius: r, strokeWidth: w, strokeArc: arc, strokes, segments } = INK_MARK;
  const gap = (Math.PI * 2) / strokes;
  const positions: number[] = [];
  const index: number[] = [];
  for (let s = 0; s < strokes; s++) {
    const start = s * gap - arc / 2;
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const a = start + arc * t;
      const half = (w / 2) * Math.sin(Math.PI * t);
      for (const radius of [r - half, r + half]) positions.push(Math.cos(a) * radius * S, 0, Math.sin(a) * radius * S);
    }
    for (let i = 0; i < segments; i++) {
      const k = base + i * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  return geo;
}

const INK_GEOMETRY = {
  core: new THREE.CircleGeometry(INK_MARK.core * S, 24).rotateX(-Math.PI / 2),
  band: new THREE.RingGeometry(INK_MARK.core * S * 0.9, INK_MARK.band * S, 32).rotateX(-Math.PI / 2),
  strokes: arcStrokes(),
};

function inkMaterial(color: number): THREE.MeshBasicMaterial {
  return overlayMaterial({ color, opacity: 1, depthTest: false, depthWrite: false });
}

const INK_MATERIALS: Record<MarkKind, { deep: THREE.MeshBasicMaterial; pale: THREE.MeshBasicMaterial }> = {
  radio: { deep: inkMaterial(PAL.contactMark.radio.deep), pale: inkMaterial(PAL.contactMark.radio.pale) },
  flare: { deep: inkMaterial(PAL.contactMark.flare.deep), pale: inkMaterial(PAL.contactMark.flare.pale) },
};

type Front = {
  line: THREE.Line;
  origin: Vec;
  r: Float32Array;
  peak: Float32Array;
  amp: Float32Array;
  active: boolean;
  ran: boolean;
  spawn: number;
};

type Marker = { id: string; fronts: Front[]; blip: THREE.Group; ink: THREE.Group; root: THREE.Group; burstMs: number };

const WIND = (() => {
  const l = Math.hypot(WEATHER.wind.x, WEATHER.wind.y);
  return { x: WEATHER.wind.x / l, y: WEATHER.wind.y / l };
})();

export class ContactsView {
  readonly root = new THREE.Group();
  private readonly markers = new Map<string, Marker>();
  private lastMs: number | null = null;
  private lastTurn = -1;

  update(terrain: Terrain, contacts: Contact[], listener: Vec, turn: number, nowMs: number): void {
    const dt = this.lastMs === null ? 0 : Math.min(0.1, (nowMs - this.lastMs) / 1000);
    this.lastMs = nowMs;
    const newTurn = turn !== this.lastTurn;
    this.lastTurn = turn;
    if (newTurn) for (const m of this.markers.values()) startBurst(m, nowMs);
    const live = new Set(contacts.map((c) => c.vehicleId));
    for (const [id, m] of this.markers) {
      if (live.has(id)) continue;
      this.root.remove(m.root);
      disposeMarker(m);
      this.markers.delete(id);
    }
    for (const c of contacts) {
      let m = this.markers.get(c.vehicleId);
      if (!m) {
        m = this.makeMarker(c.vehicleId);
        this.markers.set(c.vehicleId, m);
        startBurst(m, nowMs);
      }
      if (nowMs - m.burstMs >= WAVE.repeat * 1000) startBurst(m, nowMs);
      const hearsSound = SHOW_SOUND_WAVES && c.sources.includes('sound');
      m.fronts.forEach((f) => (f.line.visible = hearsSound));
      if (hearsSound) m.fronts.forEach((f, k) => this.advanceFront(terrain, c, listener, f, dt, (nowMs - m.burstMs) / 1000 >= k * WAVE.stagger));
      placeMark(terrain, m, c);
    }
  }

  private makeMarker(id: string): Marker {
    const root = new THREE.Group();
    const seed = hashId(id);
    const fronts = Array.from({ length: WAVE.fronts }, (_, k) => makeFront(k, seed));
    const blip = makeBlip();
    const ink = makeInkMark(id);
    root.add(...fronts.map((f) => f.line), blip, ink);
    this.root.add(root);
    return { id, fronts, blip, ink, root, burstMs: 0 };
  }

  private advanceFront(terrain: Terrain, c: Contact, listener: Vec, f: Front, dt: number, due: boolean): void {
    if (!f.active && (f.ran || !due)) {
      f.line.visible = false;
      return;
    }
    if (!f.active) {
      this.restartFront(terrain, c, f);
      f.active = true;
      f.ran = true;
    }
    const reach = Math.max(c.radius * 2, dist(c.center, listener) * WAVE.reachPast);
    const n = WAVE.points;
    const pos = f.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = f.line.geometry.getAttribute('color') as THREE.BufferAttribute;
    const base = heightAt(terrain, f.origin.x, f.origin.y);
    let mean = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      const here = { x: f.origin.x + dir.x * f.r[i], y: f.origin.y + dir.y * f.r[i] };
      const h = heightAt(terrain, here.x, here.y);
      const step = 0.5;
      const grade = (heightAt(terrain, here.x + dir.x * step, here.y + dir.y * step) - h) / step;
      const wind = 1 + WAVE.wind * (dir.x * WIND.x + dir.y * WIND.y);
      const speed = (WAVE.speed * wind) / (1 + WAVE.climbDrag * Math.max(0, grade));
      f.r[i] += speed * dt;
      f.peak[i] = Math.max(f.peak[i], h, base);
      f.amp[i] = Math.exp(-WAVE.shadowFade * (f.peak[i] - h));
      mean += f.r[i];
    }
    mean /= n;
    const fade = WAVE.brightness * Math.max(0, 1 - (mean / reach) ** 3);
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const a = (k / n) * Math.PI * 2;
      const wob = 1 + WAVE.wobble * (valueNoise(Math.cos(a) * WAVE.wobbleScale + f.spawn * 7.3, Math.sin(a) * WAVE.wobbleScale + mean * 0.2) * 2 - 1);
      const x = f.origin.x + Math.cos(a) * f.r[k] * wob;
      const y = f.origin.y + Math.sin(a) * f.r[k] * wob;
      pos.setXYZ(i, x * S, heightAt(terrain, x, y) * S + LIFT, y * S);
      const v = fade * f.amp[k];
      col.setXYZ(i, v, v, v);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    f.line.visible = true;
    if (mean >= reach) f.active = false;
  }

  private restartFront(terrain: Terrain, c: Contact, f: Front): void {
    f.spawn++;
    const seed = hashId(f.line.name) + f.spawn;
    const a = hash2(seed, 11) * Math.PI * 2;
    const r = Math.sqrt(hash2(seed, 23)) * c.radius * WAVE.originSpread;
    f.origin = { x: c.center.x + Math.cos(a) * r, y: c.center.y + Math.sin(a) * r };
    const base = heightAt(terrain, f.origin.x, f.origin.y);
    f.r.fill(0);
    f.peak.fill(base);
    f.amp.fill(1);
  }
}

function startBurst(m: Marker, nowMs: number): void {
  m.burstMs = nowMs;
  for (const f of m.fronts) {
    f.active = false;
    f.ran = false;
  }
}

function makeFront(k: number, seed: number): Front {
  const n = WAVE.points;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array((n + 1) * 3), 3));
  const mat = new THREE.LineBasicMaterial({ color: PAL.contact, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.name = `front-${seed}-${k}`;
  line.renderOrder = RENDER_ORDER;
  line.frustumCulled = false;
  line.visible = false;
  return { line, origin: { x: 0, y: 0 }, r: new Float32Array(n), peak: new Float32Array(n), amp: new Float32Array(n).fill(1), active: false, ran: false, spawn: seed % 1000 };
}

function makeBlip(): THREE.Group {
  const mat = () => overlayMaterial({ color: PAL.radio, opacity: BLIP.opacity, depthTest: false, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(BLIP.radius * S * 0.8, BLIP.radius * S, 32).rotateX(-Math.PI / 2), mat());
  const dot = new THREE.Mesh(new THREE.CircleGeometry(BLIP.dot * S, 16).rotateX(-Math.PI / 2), mat());
  ring.renderOrder = dot.renderOrder = RENDER_ORDER;
  const group = new THREE.Group();
  group.name = 'contact-blip';
  group.add(ring, dot);
  return group;
}

function makeInkMark(id: string): THREE.Group {
  const parts: [THREE.BufferGeometry, THREE.MeshBasicMaterial, number][] = [
    [INK_GEOMETRY.band, INK_MATERIALS.radio.pale, 0],
    [INK_GEOMETRY.core, INK_MATERIALS.radio.deep, 1],
    [INK_GEOMETRY.strokes, INK_MATERIALS.radio.deep, 2],
  ];
  const group = new THREE.Group();
  group.name = 'contact-ink';
  group.rotation.y = hash2(hashId(id), 37) * Math.PI * 2;
  for (const [geometry, material, layer] of parts) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = RENDER_ORDER + layer * 0.01;
    group.add(mesh);
  }
  return group;
}

function placeMark(terrain: Terrain, m: Marker, c: Contact): void {
  const kind = markKind(c);
  const inked = TUNING.fxInk.value >= INK_DUST_LAYER;
  m.blip.visible = kind !== null && !inked;
  m.ink.visible = kind !== null && inked;
  if (kind === null) return;
  const x = c.center.x * S;
  const y = heightAt(terrain, c.center.x, c.center.y) * S + LIFT;
  const z = c.center.y * S;
  if (inked) {
    const [band, core, strokes] = m.ink.children as THREE.Mesh[];
    band.material = INK_MATERIALS[kind].pale;
    core.material = INK_MATERIALS[kind].deep;
    strokes.material = INK_MATERIALS[kind].deep;
    m.ink.position.set(x, y, z);
    return;
  }
  const color = kind === 'radio' ? PAL.radio : PAL.flare.marker;
  m.blip.traverse((o) => {
    if (o instanceof THREE.Mesh) (o.material as THREE.MeshBasicMaterial).color.setHex(color);
  });
  m.blip.position.set(x, y, z);
}

function markKind(c: Contact): MarkKind | null {
  if (c.sources.includes('radio')) return 'radio';
  return c.sources.includes('flare') ? 'flare' : null;
}

function disposeMarker(m: Marker): void {
  for (const f of m.fronts) {
    f.line.geometry.dispose();
    (f.line.material as THREE.Material).dispose();
  }
  m.blip.traverse((o) => {
    if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
