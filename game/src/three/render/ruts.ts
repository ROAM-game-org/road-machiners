
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { CHASSIS } from '../../data/chassis';
import { PHYSICS } from '../../data/physics';
import { TERRAIN_TYPES } from '../../data/terrain';
import { physicsWheelPoints } from '../../render/partLooks';
import { TIME } from '../../data/time';
import { groundPoint, headingOf, toMap, type V3, type VehicleFrame } from '../../phys/frames';
import { unitBody } from '../../sim/body';
import { atlasOf } from '../../sim/atlas';
import { deckAt } from '../../sim/bridge';
import { tileAt, type Terrain } from '../../sim/terrain';
import type { Vehicle, World } from '../../sim/types';

const FASTEST_METERS_PER_SECOND = Math.max(...Object.values(CHASSIS).map((c) => c.maxSpeed)) * PHYSICS.metersPerTile / PHYSICS.turnSeconds;
const LATE_FRAME_SECONDS = 0.1;

export const RUT = {
  max: 8000,
  wheels: [2, 3],
  step: 0.5,
  gap: FASTEST_METERS_PER_SECOND * Math.max(...CONFIG.travelSpeeds) * LATE_FRAME_SECONDS,
  lift: 0.04,
  lifeTurns: TIME.turnsPerDay,
  floor: 0.56,
  wall: 0.3,
  leastDepth: 0.6,
  wallFrom: 0.15,
  rimFrom: 0.3,
} as const;

const WHITE = new THREE.Color(1, 1, 1);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

const RUT_VERTEX = `#include <project_vertex>
vec3 rutAxis = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
vRutAcross = position.z;
vRutSun = dot(normalize(rutAxis.xz), rutSun.xz);`;

const RUT_FRAGMENT = `float rutStrength = 1.0 - vColor.r;
float rutSide = vRutAcross * sign(vRutSun);
float rutAa = fwidth(vRutAcross);
float rutLit = smoothstep(0.05, 0.4, abs(vRutSun)) * smoothstep(0.0, 0.05, rutSun.y);
float rutWall = smoothstep(${RUT.wallFrom.toFixed(2)} - rutAa, ${RUT.wallFrom.toFixed(2)} + rutAa, rutSide) * rutLit;
float rutRim = (1.0 - smoothstep(-${RUT.rimFrom.toFixed(2)} - rutAa, -${RUT.rimFrom.toFixed(2)} + rutAa, rutSide)) * rutLit;
float rutProfile = mix(mix(${RUT.floor.toFixed(2)}, ${RUT.wall.toFixed(2)}, rutWall), 1.0, rutRim);
diffuseColor.rgb = vec3(mix(1.0, rutProfile, rutStrength));`;

export class Ruts {
  readonly mesh: THREE.InstancedMesh;
  private readonly last = new Map<string, (V3 | null)[]>();
  private readonly turns = new Float64Array(RUT.max);
  private readonly darkness = new Float32Array(RUT.max);
  private next = 0;
  private drawnTurn = Number.NaN;
  private wholeUpload = false;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YZX');
  private readonly mid = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly tint = new THREE.Color();
  private readonly sun = { value: new THREE.Vector3(0, 1, 0) };
  private readonly material = new THREE.MeshBasicMaterial({
    blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });

  constructor(private readonly scene: THREE.Scene) {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.rutSun = this.sun;
      const declare = 'uniform vec3 rutSun;\nvarying float vRutAcross;\nvarying float vRutSun;\n';
      shader.vertexShader = `${declare}${shader.vertexShader.replace('#include <project_vertex>', RUT_VERTEX)}`;
      shader.fragmentShader = `${declare}${shader.fragmentShader.replace('#include <color_fragment>', RUT_FRAGMENT).replace('#include <colorspace_fragment>', '')}`;
    };
    const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(quad, this.material, RUT.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, WHITE);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  layTracks(world: World, v: Vehicle, f: VehicleFrame, tires: V3[]): void {
    const wheels = [...f.wheels, ...(f.rear?.wheels ?? [])];
    if (tires.length !== wheels.length) throw new Error(`Vehicle ${v.id} has ${wheels.length} wheel frames for ${tires.length} wheels`);
    const ends = this.endsOf(v.id, tires.length);
    for (const i of rutWheels(f)) this.extend(world.terrain, ends, i, tires[i], wheels[i].ground ? rutAt(world.terrain, tires[i]) : 0, tireWidth(v.chassisId, f, i), world.turn);
  }

  light(sunDir: THREE.Vector3): void {
    this.sun.value.copy(sunDir);
  }

  tick(turn: number): void {
    this.wholeUpload = false;
    if (turn === this.drawnTurn) return;
    this.drawnTurn = turn;
    for (let k = 0; k < this.mesh.count; k++) {
      const share = fadeOf(turn - this.turns[k]);
      if (share === 0) this.mesh.setMatrixAt(k, HIDDEN);
      this.mesh.setColorAt(k, this.tint.setScalar(1 - depthOf(this.darkness[k]) * share));
    }
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.needsUpdate = true;
    this.markColors();
    this.mesh.instanceColor?.clearUpdateRanges();
    this.wholeUpload = true;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }

  private extend(t: Terrain, ends: (V3 | null)[], i: number, p: V3, rut: number, width: number, turn: number): void {
    if (rut === 0) {
      ends[i] = null;
      return;
    }
    const end = ends[i];
    if (end !== null) {
      const moved = Math.hypot(p.x - end.x, p.z - end.z);
      if (moved < RUT.step) return;
      if (moved <= RUT.gap) this.layAlong(t, end, p, Math.max(1, Math.floor(moved / RUT.step)), rut, width, turn);
    }
    ends[i] = p;
  }

  private layAlong(t: Terrain, from: V3, to: V3, pieces: number, rut: number, width: number, turn: number): void {
    let a = from;
    for (let n = 1; n <= pieces; n++) {
      const b = n === pieces ? to : groundPoint(t, toMap({ x: from.x + ((to.x - from.x) * n) / pieces, y: 0, z: from.z + ((to.z - from.z) * n) / pieces }));
      const here = n === pieces ? rut : rutAt(t, b);
      if (here === 0) return;
      this.lay(a, b, here, width, turn);
      a = b;
    }
  }

  private endsOf(id: string, wheels: number): (V3 | null)[] {
    let ends = this.last.get(id);
    if (!ends || ends.length !== wheels) {
      ends = new Array<V3 | null>(wheels).fill(null);
      this.last.set(id, ends);
    }
    return ends;
  }

  private lay(a: V3, b: V3, rut: number, width: number, turn: number): void {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const flat = Math.hypot(dx, dz);
    this.euler.set(0, -Math.atan2(dz, dx), Math.atan2(dy, flat));
    this.quat.setFromEuler(this.euler);
    this.mid.set((a.x + b.x) / 2, (a.y + b.y) / 2 + RUT.lift, (a.z + b.z) / 2);
    this.scale.set(Math.hypot(flat, dy), 1, width);
    const k = this.next;
    this.mesh.setMatrixAt(k, this.matrix.compose(this.mid, this.quat, this.scale));
    this.mesh.setColorAt(k, this.tint.setScalar(1 - depthOf(rut)));
    this.turns[k] = turn;
    this.darkness[k] = rut;
    this.next = (k + 1) % RUT.max;
    this.mesh.count = Math.max(this.mesh.count, k + 1);
    this.markLaid(k);
  }

  private markLaid(k: number): void {
    const colors = this.mesh.instanceColor;
    if (!colors) throw new Error('Ruts lost their instance colours');
    if (!this.wholeUpload) {
      this.mesh.instanceMatrix.addUpdateRange(k * 16, 16);
      colors.addUpdateRange(k * 3, 3);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    colors.needsUpdate = true;
  }

  private markColors(): void {
    const colors = this.mesh.instanceColor;
    if (!colors) throw new Error('Ruts lost their instance colours');
    colors.needsUpdate = true;
  }
}

function rutAt(t: Terrain, p: V3): number {
  const at = toMap(p);
  if (deckAt(atlasOf(t).decks, at.x, at.y) !== null) return 0;
  return TERRAIN_TYPES[t.types[tileAt(t, at)]].rut;
}

function fadeOf(age: number): number {
  return Math.max(0, 1 - age / RUT.lifeTurns);
}

export function tirePoints(terrain: Terrain, chassisId: string, f: VehicleFrame): V3[] {
  const units = [{ unit: 0, pos: f.pos, rot: f.rot }, ...(f.rear ? [{ unit: 1, pos: f.rear.pos, rot: f.rear.rot }] : [])];
  return units.flatMap(({ unit, pos, rot }) => {
    const h = headingOf(rot);
    const at = toMap(pos);
    return physicsWheelPoints(unitBody(chassisId, unit), unit).map((m) => {
      const off = { x: m.x * Math.cos(h) - m.z * Math.sin(h), z: m.x * Math.sin(h) + m.z * Math.cos(h) };
      return groundPoint(terrain, { x: at.x + off.x / PHYSICS.metersPerTile, y: at.y + off.z / PHYSICS.metersPerTile });
    });
  });
}

export function rutWheels(f: VehicleFrame): readonly number[] {
  return f.rear ? [...RUT.wheels, f.wheels.length, f.wheels.length + 1] : RUT.wheels;
}

function tireWidth(chassisId: string, f: VehicleFrame, wheel: number): number {
  return 2 * unitBody(chassisId, wheel < f.wheels.length ? 0 : 1).wheelHalfWidth;
}

function depthOf(rut: number): number {
  return RUT.leastDepth + (1 - RUT.leastDepth) * rut;
}
