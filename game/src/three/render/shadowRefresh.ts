import type * as THREE from 'three';
import type { GpuContext } from '../gpu-context';
import { enableSunShadows } from './shadowFilter';

type Values = { list: number[]; at: number; changed: boolean };
type Caster = { values: Values; stamp: number };
type ShadowLight = THREE.SpotLight | THREE.DirectionalLight;

const EMPTY_ID = -1;

function record(values: Values, value: number): void {
  if (values.list[values.at] !== value) {
    values.list[values.at] = value;
    values.changed = true;
  }
  values.at++;
}

function start(values: Values): void {
  values.at = 0;
  values.changed = false;
}

function finish(values: Values): boolean {
  if (values.list.length !== values.at) {
    values.list.length = values.at;
    values.changed = true;
  }
  return values.changed;
}

function isCaster(o: THREE.Object3D): o is THREE.Mesh {
  return o.castShadow && ((o as THREE.Mesh).isMesh === true || (o as THREE.Line).isLine === true || (o as THREE.Points).isPoints === true);
}

function isShadowLight(o: THREE.Object3D): o is ShadowLight {
  if ((o as THREE.Light).isLight !== true || !o.castShadow) return false;
  if ((o as THREE.PointLight).isPointLight) throw new Error('A point light casts shadows, and ShadowRefresh checks one view per light, not six');
  return true;
}

function materialId(material: THREE.Material): number {
  return (material as THREE.Material & { id: number }).id;
}

function attributeVersion(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): number {
  if (!attribute) return EMPTY_ID;
  return 'data' in attribute ? attribute.data.version : attribute.version;
}

function recordMaterial(values: Values, material: THREE.Material): void {
  record(values, materialId(material));
  record(values, Number(material.visible));
}

function recordGeometry(values: Values, geometry: THREE.BufferGeometry): void {
  record(values, geometry.id);
  record(values, attributeVersion(geometry.getAttribute('position')));
  record(values, geometry.index?.version ?? EMPTY_ID);
  record(values, geometry.drawRange.start);
  record(values, geometry.drawRange.count);
}

function recordCaster(values: Values, mesh: THREE.Mesh): void {
  for (const element of mesh.matrixWorld.elements) record(values, element);
  recordGeometry(values, mesh.geometry);
  for (const material of [mesh.material].flat()) recordMaterial(values, material);
  record(values, mesh.customDepthMaterial ? materialId(mesh.customDepthMaterial) : EMPTY_ID);
  const instanced = mesh as unknown as THREE.InstancedMesh;
  record(values, instanced.isInstancedMesh ? instanced.count : EMPTY_ID);
  record(values, instanced.isInstancedMesh ? instanced.instanceMatrix.version : EMPTY_ID);
}

function recordVector(values: Values, matrix: THREE.Matrix4): void {
  record(values, matrix.elements[12]);
  record(values, matrix.elements[13]);
  record(values, matrix.elements[14]);
}

function recordPose(values: Values, light: ShadowLight): void {
  recordVector(values, light.matrixWorld);
  if ('target' in light) recordVector(values, light.target.matrixWorld);
  if ('angle' in light) record(values, light.angle);
  if ('distance' in light) record(values, light.distance);
  const camera = light.shadow.camera as THREE.OrthographicCamera;
  for (const side of [camera.left, camera.right, camera.top, camera.bottom, camera.near]) record(values, side ?? EMPTY_ID);
  record(values, light.shadow.mapSize.x);
  record(values, light.shadow.mapSize.y);
}

export class ShadowRefresh {
  private readonly casters = new WeakMap<THREE.Object3D, Caster>();
  private drawn = new WeakMap<THREE.Light, Values>();
  private lastStamp = 0;
  private readonly lights: ShadowLight[] = [];
  private readonly standing: { mesh: THREE.Mesh; stamp: number }[] = [];
  private standingCount = 0;

  update(scene: THREE.Scene): void {
    this.lights.length = 0;
    this.standingCount = 0;
    this.visit(scene);
    for (const light of this.lights) this.settle(light);
  }

  forget(): void {
    this.drawn = new WeakMap();
  }

  private visit(o: THREE.Object3D): void {
    if (!o.visible) return;
    if (isShadowLight(o)) this.lights.push(o);
    else if (isCaster(o)) this.stand(o);
    for (const child of o.children) this.visit(child);
  }

  private stand(mesh: THREE.Mesh): void {
    const stamp = this.stampOf(mesh);
    const slot = this.standing[this.standingCount];
    if (slot) {
      slot.mesh = mesh;
      slot.stamp = stamp;
    } else {
      this.standing.push({ mesh, stamp });
    }
    this.standingCount++;
  }

  private stampOf(mesh: THREE.Mesh): number {
    let caster = this.casters.get(mesh);
    if (!caster) {
      caster = { values: { list: [], at: 0, changed: false }, stamp: 0 };
      this.casters.set(mesh, caster);
    }
    start(caster.values);
    recordCaster(caster.values, mesh);
    if (finish(caster.values)) caster.stamp = ++this.lastStamp;
    return caster.stamp;
  }

  private settle(light: ShadowLight): void {
    light.shadow.autoUpdate = false;
    const known = this.drawn.get(light);
    if (known && light.intensity <= 0) return;
    const values = known ?? { list: [], at: 0, changed: false };
    this.drawn.set(light, values);
    if (this.sightChanged(values, light)) light.shadow.needsUpdate = true;
  }

  private sightChanged(values: Values, light: ShadowLight): boolean {
    start(values);
    recordPose(values, light);
    const frustum = light.shadow.getFrustum();
    for (let i = 0; i < this.standingCount; i++) {
      const { mesh, stamp } = this.standing[i];
      if (!mesh.frustumCulled || frustum.intersectsObject(mesh)) record(values, stamp);
    }
    return finish(values);
  }
}

const refreshes = new WeakMap<THREE.Scene, ShadowRefresh>();

export function shadowRefreshOf(scene: THREE.Scene): ShadowRefresh {
  const refresh = refreshes.get(scene);
  if (!refresh) throw new Error('This scene does not refresh its shadow maps through ShadowRefresh');
  return refresh;
}

export function refreshShadows(renderer: THREE.WebGLRenderer, scene: THREE.Scene, gpu: GpuContext): void {
  enableSunShadows(renderer);
  const refresh = new ShadowRefresh();
  refreshes.set(scene, refresh);
  scene.onBeforeRender = () => refresh.update(scene);
  gpu.onRestored(() => refresh.forget());
}
