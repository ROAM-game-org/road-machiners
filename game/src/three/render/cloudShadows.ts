import * as THREE from 'three';
import { PHYSICS } from '../../data/physics';
import { WEATHER } from '../../data/weather';
import { isOvercast } from '../../sim/weather';
import { sunAt } from '../../sim/sun';
import type { World } from '../../sim/types';

const CLOUDS = WEATHER.clouds;
const TURN_MS = PHYSICS.turnSeconds * 1000;
const SETTLE_SHARE = 3;

export function coverTarget(overcast: boolean): number {
  return overcast ? CLOUDS.overcast : CLOUDS.clear;
}

export function easeCover(shown: number, target: number, playFrameMs: number): number {
  if (!(playFrameMs >= 0)) throw new Error(`Play frame must be a non-negative time, got ${playFrameMs}`);
  const pace = 1 - Math.exp((-playFrameMs * SETTLE_SHARE) / (CLOUDS.easeTurns * TURN_MS));
  return shown + (target - shown) * pace;
}

export function dayFactor(elevation: number | null): number {
  if (elevation === null) return 0;
  return Math.min(1, Math.max(0, elevation / CLOUDS.fadeElevation));
}

export function driftAt(lightTurn: number): { x: number; y: number } {
  const tiles = lightTurn * PHYSICS.turnSeconds * CLOUDS.speed;
  const wrap = (v: number) => ((v % CLOUDS.period) + CLOUDS.period) % CLOUDS.period;
  return { x: wrap((-WEATHER.wind.x * tiles) / CLOUDS.scale), y: wrap((-WEATHER.wind.y * tiles) / CLOUDS.scale) };
}

const VERTEX = `#include <project_vertex>
vec4 cloudWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
cloudWorld = instanceMatrix * cloudWorld;
#endif
vCloudXZ = (modelMatrix * cloudWorld).xz;`;

const UNIFORMS = `uniform vec4 cloudParams;
uniform vec2 cloudShift;
varying vec2 vCloudXZ;
const float cloudPeriod = ${CLOUDS.period.toFixed(1)};
float cloudHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float cloudValue(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = cloudHash(mod(i, period));
  float b = cloudHash(mod(i + vec2(1.0, 0.0), period));
  float c = cloudHash(mod(i + vec2(0.0, 1.0), period));
  float d = cloudHash(mod(i + vec2(1.0, 1.0), period));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float cloudDim() {
  if (cloudParams.x <= 0.0) return 1.0;
  vec2 p = vCloudXZ * cloudParams.z + cloudShift;
  float n = cloudValue(p, cloudPeriod) * 0.6 + cloudValue(p * 2.0, cloudPeriod * 2.0) * 0.3 + cloudValue(p * 4.0, cloudPeriod * 4.0) * 0.1;
  float edge = 0.5 + (0.5 - cloudParams.x) * 0.3;
  float mask = smoothstep(edge - cloudParams.w, edge + cloudParams.w, n);
  return 1.0 - cloudParams.y * mask;
}`;

const FRAGMENT = `#include <aomap_fragment>
reflectedLight.directDiffuse *= cloudDim();`;

export class CloudShadows {
  private readonly uniforms = {
    cloudParams: { value: new THREE.Vector4(0, CLOUDS.depth, 1 / (CLOUDS.scale * PHYSICS.metersPerTile), CLOUDS.soft) },
    cloudShift: { value: new THREE.Vector2() },
  };
  private readonly shaded = new WeakSet<THREE.Material>();
  private weather: number | null = null;

  shadeTree(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const materials: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of materials) if (m instanceof THREE.MeshLambertMaterial) this.shade(m);
    });
  }

  shade(material: THREE.Material): void {
    if (!(material instanceof THREE.MeshLambertMaterial)) throw new Error(`Cloud shadows shade only Lambert materials, not ${material.type}`);
    if (this.shaded.has(material)) return;
    this.shaded.add(material);
    const before = material.onBeforeCompile.bind(material);
    const key = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;').replace('#include <project_vertex>', VERTEX);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${UNIFORMS}`).replace('#include <aomap_fragment>', FRAGMENT);
    };
    material.customProgramCacheKey = () => `${key()}|clouds`;
    material.needsUpdate = true;
  }

  sync(world: World, lightTurn: number, playFrameMs: number): void {
    const target = coverTarget(isOvercast(world));
    this.weather = this.weather === null ? target : easeCover(this.weather, target, playFrameMs);
    const params = this.uniforms.cloudParams.value;
    params.x = this.weather * dayFactor(sunAt(lightTurn)?.elevation ?? null);
    const drift = driftAt(lightTurn);
    this.uniforms.cloudShift.value.set(drift.x, drift.y);
  }

  cover(): number {
    return this.uniforms.cloudParams.value.x;
  }

  shaderChunks(): { vertex: string; fragment: string } {
    return { vertex: VERTEX, fragment: `${UNIFORMS}\n${FRAGMENT}` };
  }
}

export const CLOUD_SHADOWS = new CloudShadows();
