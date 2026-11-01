
import * as THREE from 'three';
import { PHYSICS } from '../../data/physics';
import { propPose, propReach, type PropPose } from '../../sim/mapgen';
import { propBase } from '../../sim/bridge';
import type { Terrain } from '../../sim/terrain';
import type { Obstacle } from '../../sim/types';
import { dist } from '../../sim/vec';
import { instancedModel, type ModelName } from './models';
import type { RenderScope } from './scope';
import { TERRAIN_CHUNK } from './terrain';

const S = PHYSICS.metersPerTile;
const ZERO = new Float32Array(16);

type Landmark = Extract<Obstacle, { kind: 'landmark' }>;
type Slot = { meshes: THREE.InstancedMesh[]; standing: Float32Array[]; index: number; obstacle: Landmark };
export type MaterialOf = (model: ModelName, source: THREE.Material) => THREE.Material;

export class PropInstances {
  private readonly slots = new Map<string, Slot>();
  private readonly props = new Map<string, Landmark>();
  private readonly hidden = new Set<string>();
  private readonly withdrawn = new Set<string>();

  constructor(scope: RenderScope, terrain: Terrain, props: readonly Landmark[], materialOf: MaterialOf) {
    for (const [model, list] of groupsOf(props).values()) this.placeGroup(scope, terrain, model, list, materialOf);
  }

  has(id: string): boolean {
    return this.props.has(id);
  }

  holds(id: string): boolean {
    return this.props.has(id) && !this.withdrawn.has(id);
  }

  ids(): IterableIterator<string> {
    return this.props.keys();
  }

  hide(id: string): void {
    this.known(id);
    if (this.hidden.has(id)) return;
    this.hidden.add(id);
    const slot = this.slots.get(id);
    if (slot) for (const mesh of slot.meshes) setInstance(mesh, slot.index, ZERO);
  }

  show(id: string): void {
    this.known(id);
    if (this.withdrawn.has(id) || !this.hidden.delete(id)) return;
    const slot = this.slots.get(id);
    slot?.meshes.forEach((mesh, i) => setInstance(mesh, slot.index, slot.standing[i].subarray(slot.index * 16, slot.index * 16 + 16)));
  }

  withdraw(id: string): Landmark {
    const obstacle = this.known(id);
    if (this.withdrawn.has(id) || this.hidden.has(id)) throw new Error(`Lootable prop ${id} has no view`);
    this.hide(id);
    this.withdrawn.add(id);
    return obstacle;
  }

  private known(id: string): Landmark {
    const prop = this.props.get(id);
    if (!prop) throw new Error(`Prop ${id} is not a baked prop; plain props are drawn as fixed instances`);
    return prop;
  }

  private placeGroup(scope: RenderScope, terrain: Terrain, name: ModelName, list: readonly Landmark[], materialOf: MaterialOf): void {
    for (const o of list) this.props.set(o.id, o);
    const center = list.reduce((c, o) => ({ x: c.x + o.pos.x / list.length, y: c.y + o.pos.y / list.length }), { x: 0, y: 0 });
    const reach = Math.max(...list.map((o) => dist(center, o.pos) + propReach(o)));
    scope.place(center, reach, () => this.buildGroup(terrain, name, list, materialOf));
  }

  private buildGroup(terrain: Terrain, name: ModelName, list: readonly Landmark[], materialOf: MaterialOf): THREE.Group {
    const placements = list.map((o) => {
      const g = posed(propBase(terrain, o), propPose(o));
      g.updateMatrix();
      return g.matrix;
    });
    const group = instancedModel(name, placements, placements.map(() => 1), (source) => materialOf(name, source));
    const meshes = group.children.map((m) => {
      if (!(m instanceof THREE.InstancedMesh)) throw new Error(`Instanced ${name} holds a mesh that is not instanced`);
      return m;
    });
    const standing = meshes.map((m) => Float32Array.from(m.instanceMatrix.array));
    list.forEach((obstacle, index) => {
      this.slots.set(obstacle.id, { meshes, standing, index, obstacle });
      if (this.hidden.has(obstacle.id)) for (const mesh of meshes) setInstance(mesh, index, ZERO);
    });
    return group;
  }
}

export function posed(base: number, pose: PropPose): THREE.Group {
  const g = new THREE.Group();
  g.position.set(pose.pos.x * S, base * S, pose.pos.y * S);
  g.rotation.y = -pose.yaw;
  g.scale.set(pose.scale.x, pose.scale.z, pose.scale.y);
  return g;
}

function groupsOf(props: readonly Landmark[]): Map<string, [ModelName, Landmark[]]> {
  const out = new Map<string, [ModelName, Landmark[]]>();
  const ids = new Set<string>();
  for (const o of props) {
    if (ids.has(o.id)) throw new Error(`Prop ${o.id} is listed twice`);
    ids.add(o.id);
    const name = propPose(o).model;
    if (name === 'hulk') throw new Error(`Prop ${o.id} is a hulk; hulks keep their own view`);
    const key = `${Math.floor(o.pos.x / TERRAIN_CHUNK)},${Math.floor(o.pos.y / TERRAIN_CHUNK)},${name}`;
    const found = out.get(key);
    if (found) found[1].push(o);
    else out.set(key, [name, [o]]);
  }
  return out;
}

function setInstance(mesh: THREE.InstancedMesh, index: number, matrix: ArrayLike<number>): void {
  mesh.instanceMatrix.array.set(matrix, index * 16);
  mesh.instanceMatrix.needsUpdate = true;
}
