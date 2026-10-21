import * as THREE from 'three';
import type { TRUCK_LOOK } from '../../render/partLooks';
import type { Body } from '../../sim/body';

export type WheelCut = { center: THREE.Vector3; radius: number; halfWidth: number };
export type CutSpec = { wheels: WheelCut[]; lamps: THREE.Box3[] };

const CORNER_DIGITS = 3;

type Positions = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

export function cutSpec(wheels: readonly THREE.Box3[], lamps: readonly THREE.Box3[], half: Body['half'], look: typeof TRUCK_LOOK): CutSpec {
  return {
    wheels: wheels.map((box) => wheelCut(box, look)),
    lamps: lamps.filter((island) => atEnd(island, half, look)).map((island) => lampWindow(island, look)),
  };
}

function wheelCut(box: THREE.Box3, look: typeof TRUCK_LOOK): WheelCut {
  const size = box.getSize(new THREE.Vector3());
  return { center: box.getCenter(new THREE.Vector3()), radius: (size.y / 2) * look.cutScale, halfWidth: size.z / 2 };
}

function atEnd(island: THREE.Box3, half: Body['half'], look: typeof TRUCK_LOOK): boolean {
  return Math.abs(island.getCenter(new THREE.Vector3()).x) > half.x * look.lampEndShare;
}

function lampWindow(island: THREE.Box3, look: typeof TRUCK_LOOK): THREE.Box3 {
  const c = island.getCenter(new THREE.Vector3());
  const reach = island.getSize(new THREE.Vector3()).multiplyScalar(look.cutScale / 2);
  const front = c.x > 0;
  const x0 = front ? c.x - reach.x : c.x - look.lampReach;
  const x1 = front ? c.x + look.lampReach : c.x + reach.x;
  return new THREE.Box3(new THREE.Vector3(x0, c.y - reach.y, c.z - reach.z), new THREE.Vector3(x1, c.y + reach.y, c.z + reach.z));
}

class DisjointSet {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root];
    return root;
  }

  join(a: number, b: number): void {
    this.parent[this.find(b)] = this.find(a);
  }
}

function cornersOf(pos: Positions): { cornerOf: number[]; count: number } {
  const known = new Map<string, number>();
  const cornerOf = Array.from({ length: pos.count }, (_, i) => {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((n) => n.toFixed(CORNER_DIGITS)).join(',');
    const id = known.get(key) ?? known.size;
    known.set(key, id);
    return id;
  });
  return { cornerOf, count: known.size };
}

function vertexOrder(geo: THREE.BufferGeometry, vertexCount: number): ArrayLike<number> {
  return geo.index ? geo.index.array : Array.from({ length: vertexCount }, (_, i) => i);
}

export function lampIslands(geo: THREE.BufferGeometry): THREE.Box3[] {
  const pos = geo.getAttribute('position');
  const { cornerOf, count } = cornersOf(pos);
  const order = vertexOrder(geo, pos.count);
  const sets = new DisjointSet(count);
  for (let n = 0; n + 2 < order.length; n += 3) {
    sets.join(cornerOf[order[n]], cornerOf[order[n + 1]]);
    sets.join(cornerOf[order[n]], cornerOf[order[n + 2]]);
  }
  const boxes = new Map<number, THREE.Box3>();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const root = sets.find(cornerOf[i]);
    boxes.set(root, (boxes.get(root) ?? new THREE.Box3()).expandByPoint(p.fromBufferAttribute(pos, i)));
  }
  return [...boxes.values()];
}

const VERTEX_DECLARE = 'varying vec3 vCutPos;';
const VERTEX_SET = 'vCutPos = transformed;';
const FRAGMENT_DECLARE = `varying vec3 vCutPos;
#if CUT_WHEELS > 0
uniform vec4 cutWheelAt[CUT_WHEELS];
uniform float cutWheelHalfWidth[CUT_WHEELS];
#endif
#if CUT_LAMPS > 0
uniform vec3 cutLampMin[CUT_LAMPS];
uniform vec3 cutLampMax[CUT_LAMPS];
#endif`;
const FRAGMENT_DISCARD = `#if CUT_WHEELS > 0
for (int i = 0; i < CUT_WHEELS; i++) {
  if (length(vCutPos.xy - cutWheelAt[i].xy) < cutWheelAt[i].w && sign(cutWheelAt[i].z) * (vCutPos.z - cutWheelAt[i].z) > -cutWheelHalfWidth[i]) discard;
}
#endif
#if CUT_LAMPS > 0
for (int i = 0; i < CUT_LAMPS; i++) {
  if (all(greaterThan(vCutPos, cutLampMin[i])) && all(lessThan(vCutPos, cutLampMax[i]))) discard;
}
#endif`;

type CutUniforms = Record<string, THREE.IUniform>;

const uniformsOfSpec = new WeakMap<CutSpec, CutUniforms>();

function uniformsOf(spec: CutSpec): CutUniforms {
  const known = uniformsOfSpec.get(spec);
  if (known) return known;
  const uniforms: CutUniforms = {};
  if (spec.wheels.length > 0) {
    uniforms.cutWheelAt = { value: spec.wheels.map((w) => new THREE.Vector4(w.center.x, w.center.y, w.center.z, w.radius)) };
    uniforms.cutWheelHalfWidth = { value: spec.wheels.map((w) => w.halfWidth) };
  }
  if (spec.lamps.length > 0) {
    uniforms.cutLampMin = { value: spec.lamps.map((b) => b.min.clone()) };
    uniforms.cutLampMax = { value: spec.lamps.map((b) => b.max.clone()) };
  }
  uniformsOfSpec.set(spec, uniforms);
  return uniforms;
}

function insertAfter(source: string, token: string, extra: string): string {
  if (!source.includes(token)) throw new Error(`Shader has no ${token} to cut at`);
  return source.replace(token, () => `${token}\n${extra}`);
}

export function withCut<M extends THREE.Material>(source: M, spec: CutSpec): M {
  const own = source.clone() as M;
  const before = source.onBeforeCompile;
  const sourceKey = source.customProgramCacheKey;
  const uniforms = uniformsOf(spec);
  own.defines = { ...source.defines, CUT_WHEELS: spec.wheels.length, CUT_LAMPS: spec.lamps.length };
  own.onBeforeCompile = (shader, renderer) => {
    before.call(own, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = insertAfter(insertAfter(shader.vertexShader, '#include <common>', VERTEX_DECLARE), '#include <project_vertex>', VERTEX_SET);
    shader.fragmentShader = insertAfter(insertAfter(shader.fragmentShader, '#include <common>', FRAGMENT_DECLARE), '#include <clipping_planes_fragment>', FRAGMENT_DISCARD);
  };
  own.customProgramCacheKey = () => `${sourceKey.call(source)}|armor-cut|${spec.wheels.length}|${spec.lamps.length}`;
  return own;
}
