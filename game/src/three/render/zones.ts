
import * as THREE from 'three';
import { PHYSICS } from '../../data/physics';
import { PAL } from '../../render/palette';
import { zoneEdges, type Throttle } from '../../sim/steering';
import { MESH_STEPS, surfaceTriangles } from '../../sim/surface';
import { groundAt, groundSurface, heightAt, markHeightAt, type Terrain } from '../../sim/terrain';
import type { Vec } from '../../sim/vec';
import { drawnGroundAt } from './terrain';

const S = PHYSICS.metersPerTile;
const ZONE_ALPHA: Record<Throttle, number> = { brake: 0.12, hold: 0.14, accelerate: 0.14 };
const ARC_SAMPLES = 16;
const LIFT = 0.1;
const HOVER_RADIUS_TILES = 0.6;
const HOVER_WIDTH_TILES = 0.08;
const HOVER_SEGMENTS = 32;
const FULL_TURN = Math.PI;

type Box = { minX: number; maxX: number; minY: number; maxY: number };

type MarkShape = {
  markCenter: { value: THREE.Vector2 };
  markHeading: { value: number };
  markHalf: { value: number };
  markInner: { value: number };
  markOuter: { value: number };
};

const MARK_SHAPE = `
uniform vec2 markCenter;
uniform float markHeading;
uniform float markHalf;
uniform float markInner;
uniform float markOuter;
varying vec2 vMarkAt;
float markCover() {
  vec2 off = vMarkAt - markCenter;
  float r = length(off);
  float px = max(fwidth(r), 0.0001);
  float edge = min(markInner > 0.0 ? r - markInner : markOuter, markOuter - r);
  if (markHalf < ${FULL_TURN.toFixed(5)}) {
    float turn = mod(atan(off.y, off.x) - markHeading + ${Math.PI.toFixed(5)}, ${(2 * Math.PI).toFixed(5)}) - ${Math.PI.toFixed(5)};
    edge = min(edge, (markHalf - abs(turn)) * r);
  }
  return smoothstep(-0.5 * px, 0.5 * px, edge);
}`;

type ZoneKey = {
  terrain: Terrain; x: number; y: number; heading: number; halfAngle: number; brakeEnd: number; holdEnd: number; reach: number;
};

export class ZonesView {
  readonly root = new THREE.Group();
  private bands: Record<Throttle, THREE.Mesh>;
  private shapes = new Map<THREE.Mesh, MarkShape>();
  private ring: THREE.Mesh;
  private last: ZoneKey | null = null;

  constructor() {
    this.bands = {
      brake: this.makeBand(PAL.throttle.brake, ZONE_ALPHA.brake),
      hold: this.makeBand(PAL.throttle.hold, ZONE_ALPHA.hold),
      accelerate: this.makeBand(PAL.throttle.accelerate, ZONE_ALPHA.accelerate),
    };
    for (const k of Object.keys(this.bands) as Throttle[]) this.root.add(this.bands[k]);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(HOVER_RADIUS_TILES * S - HOVER_WIDTH_TILES * S, HOVER_RADIUS_TILES * S, HOVER_SEGMENTS).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: PAL.plan, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }),
    );
    this.ring.visible = false;
    this.ring.renderOrder = 850;
    this.root.add(this.ring);
  }

  private makeBand(color: number, opacity: number): THREE.Mesh {
    const shape = markShape();
    const material = shapedMaterial(shape, {
      color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.renderOrder = 800;
    mesh.visible = false;
    this.shapes.set(mesh, shape);
    return mesh;
  }

  update(terrain: Terrain, pos: Vec, heading: number, speed: number, halfAngle: number): void {
    const z = zoneEdges();
    const brakeEnd = speed === 0 ? 0 : z.brakeEnd;
    const holdEnd = speed === 0 ? 0 : z.holdEnd;
    const last = this.last;
    if (last && last.terrain === terrain && last.x === pos.x && last.y === pos.y && last.heading === heading
      && last.halfAngle === halfAngle && last.brakeEnd === brakeEnd && last.holdEnd === holdEnd && last.reach === z.reach) return;
    this.last = { terrain, x: pos.x, y: pos.y, heading, halfAngle, brakeEnd, holdEnd, reach: z.reach };
    this.band('brake', terrain, pos, heading, halfAngle, 0, brakeEnd);
    this.band('hold', terrain, pos, heading, halfAngle, brakeEnd, holdEnd);
    this.band('accelerate', terrain, pos, heading, halfAngle, holdEnd, z.reach);
  }

  private band(t: Throttle, terrain: Terrain, pos: Vec, heading: number, half: number, r0: number, r1: number): void {
    const mesh = this.bands[t];
    if (r1 - r0 < 0.05) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const shape = this.shapes.get(mesh);
    if (!shape) throw new Error(`Zone band ${t} has no shape`);
    setShape(shape, pos, heading, half, r0, r1);
    mesh.geometry.dispose();
    mesh.geometry = groundGrid(terrain, pos, sectorBox(pos, heading, half, r0, r1));
  }

  hover(terrain: Terrain, p: Vec | null, color: number): void {
    this.ring.visible = p !== null;
    if (!p) return;
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    const h = heightAt(terrain, p.x, p.y) * S + LIFT;
    this.ring.position.set(p.x * S, h, p.y * S);
  }
}

function markShape(): MarkShape {
  return {
    markCenter: { value: new THREE.Vector2() },
    markHeading: { value: 0 },
    markHalf: { value: FULL_TURN },
    markInner: { value: 0 },
    markOuter: { value: 0 },
  };
}

function setShape(shape: MarkShape, center: Vec, heading: number, half: number, inner: number, outer: number): void {
  shape.markCenter.value.set(center.x * S, center.y * S);
  shape.markHeading.value = heading;
  shape.markHalf.value = half;
  shape.markInner.value = inner * S;
  shape.markOuter.value = outer * S;
}

function shapedMaterial(shape: MarkShape, params: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial(params);
  material.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes('#include <color_fragment>')) throw new Error('Ground mark found no color step');
    Object.assign(shader.uniforms, shape);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMarkAt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMarkAt = transformed.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${MARK_SHAPE}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= markCover();\nif (diffuseColor.a <= 0.0) discard;');
  };
  material.customProgramCacheKey = () => 'ground-mark';
  return material;
}

function sectorBox(center: Vec, heading: number, half: number, inner: number, outer: number): Box {
  const box = { minX: center.x, maxX: center.x, minY: center.y, maxY: center.y };
  const take = (a: number, r: number) => {
    const x = center.x + Math.cos(a) * r;
    const y = center.y + Math.sin(a) * r;
    box.minX = Math.min(box.minX, x);
    box.maxX = Math.max(box.maxX, x);
    box.minY = Math.min(box.minY, y);
    box.maxY = Math.max(box.maxY, y);
  };
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const a = heading - half + (2 * half * i) / ARC_SAMPLES;
    take(a, inner);
    take(a, outer / Math.cos(half / ARC_SAMPLES));
  }
  return box;
}

function groundGrid(terrain: Terrain, origin: Vec, box: Box): THREE.BufferGeometry {
  const x0 = Math.max(0, Math.floor(box.minX));
  const x1 = Math.min(terrain.size, Math.ceil(box.maxX));
  const y0 = Math.max(0, Math.floor(box.minY));
  const y1 = Math.min(terrain.size, Math.ceil(box.maxY));
  const across = x1 - x0;
  const down = y1 - y0;
  const geometry = new THREE.BufferGeometry();
  if (across <= 0 || down <= 0) return geometry;
  const positions: number[] = [];
  for (let j = 0; j <= down * MESH_STEPS; j++)
    for (let i = 0; i <= across * MESH_STEPS; i++) {
      const x = x0 + i / MESH_STEPS;
      const y = y0 + j / MESH_STEPS;
      const mark = markHeightAt(terrain, origin, x, y);
      const height = mark === groundAt(terrain, x, y) ? drawnGroundAt(terrain, x, y) : mark;
      positions.push(x * S, height * S + LIFT, y * S);
    }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(surfaceTriangles(groundSurface(terrain), x0, y0, across, down));
  return geometry;
}

export type BandLook = { color: number; opacity: number; renderOrder: number; overTrucks: boolean };

export class GroundBand {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private key = '';
  private shape = markShape();

  constructor(look: BandLook) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), shapedMaterial(this.shape, {
      color: look.color, transparent: true, opacity: look.opacity, depthWrite: false, depthTest: !look.overTrucks,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    this.mesh.renderOrder = look.renderOrder;
    this.mesh.visible = false;
  }

  set(terrain: Terrain, center: Vec, inner: number, outer: number): void {
    this.mesh.visible = true;
    const key = `${center.x},${center.y},${inner},${outer}`;
    if (key === this.key) return;
    this.key = key;
    setShape(this.shape, center, 0, FULL_TURN, inner, outer);
    this.mesh.geometry.dispose();
    this.mesh.geometry = groundGrid(terrain, center, { minX: center.x - outer, maxX: center.x + outer, minY: center.y - outer, maxY: center.y + outer });
  }

  color(hex: number): void {
    this.mesh.material.color.setHex(hex);
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
