import * as THREE from 'three';
import { PHYSICS } from '../../data/physics';
import { PAL } from '../../render/palette';
import { fortressOutline, fortressFootprint, fortressPieces } from '../../sim/fortress';
import type { Site } from '../../sim/sites';
import { pointInPolygon, type Vec } from '../../sim/vec';

const S = PHYSICS.metersPerTile;

export const POOLS = { texelsPerTile: 4, maxSide: 2048, radius: 1.8, gain: 0.5, push: 0.5, margin: 2 };
const HALO = { size: 1.6, texels: 64 };

export type PoolLamp = { site: Site; x: number; z: number; inside: boolean };
type Side = 'inside' | 'outside' | 'solid';
type Region = { site: Site; i0: number; j0: number; i1: number; j1: number; sides: Side[] };

export type PoolGrid = { side: number; perTile: number };

export function poolGrid(worldSize: number, maxTextureSize: number): PoolGrid {
  const side = Math.min(worldSize * POOLS.texelsPerTile, POOLS.maxSide);
  if (side > maxTextureSize) throw new Error(`Night pool texture needs ${side} texels, the renderer allows ${maxTextureSize}`);
  return { side, perTile: side / worldSize };
}

export function poolSide(site: Site, solids: Vec[][], p: Vec): Side {
  if (solids.some((poly) => pointInPolygon(p, poly))) return 'solid';
  return pointInPolygon(p, fortressOutline(site)) ? 'inside' : 'outside';
}

function texelCentre(grid: PoolGrid, i: number): number {
  return (i + 0.5) / grid.perTile;
}

function siteRegion(site: Site, grid: PoolGrid): Region {
  const reach = site.radius + POOLS.radius + POOLS.margin;
  const lo = (v: number) => Math.max(0, Math.floor((v - reach) * grid.perTile));
  const hi = (v: number) => Math.min(grid.side - 1, Math.ceil((v + reach) * grid.perTile));
  const region = { site, i0: lo(site.pos.x), j0: lo(site.pos.y), i1: hi(site.pos.x), j1: hi(site.pos.y), sides: [] as Side[] };
  const solids = fortressPieces(site).map((piece) => fortressFootprint(site, piece));
  for (let j = region.j0; j <= region.j1; j++)
    for (let i = region.i0; i <= region.i1; i++) region.sides.push(poolSide(site, solids, { x: texelCentre(grid, i), y: texelCentre(grid, j) }));
  return region;
}

function sideAt(region: Region, i: number, j: number): Side {
  return region.sides[(j - region.j0) * (region.i1 - region.i0 + 1) + (i - region.i0)];
}

export function poolFalloff(d: number): number {
  const t = Math.min(1, d / POOLS.radius);
  return (1 - t * t) ** 2;
}

function addLamp(light: Float32Array, grid: PoolGrid, region: Region, lamp: PoolLamp): void {
  const side: Side = lamp.inside ? 'inside' : 'outside';
  const span = Math.ceil(POOLS.radius * grid.perTile);
  const ci = Math.floor(lamp.x * grid.perTile);
  const cj = Math.floor(lamp.z * grid.perTile);
  for (let j = Math.max(region.j0, cj - span); j <= Math.min(region.j1, cj + span); j++)
    for (let i = Math.max(region.i0, ci - span); i <= Math.min(region.i1, ci + span); i++) {
      if (sideAt(region, i, j) !== side) continue;
      light[j * grid.side + i] += poolFalloff(Math.hypot(texelCentre(grid, i) - lamp.x, texelCentre(grid, j) - lamp.z));
    }
}

export class PoolMap {
  readonly bytes: Uint8Array;
  private readonly light: Float32Array;

  constructor(readonly grid: PoolGrid) {
    this.light = new Float32Array(grid.side * grid.side);
    this.bytes = new Uint8Array(grid.side * grid.side);
  }

  add(lamps: readonly PoolLamp[]): void {
    const regions = new Map<Site, Region>();
    for (const lamp of lamps) {
      let region = regions.get(lamp.site);
      if (!region) regions.set(lamp.site, (region = siteRegion(lamp.site, this.grid)));
      addLamp(this.light, this.grid, region, lamp);
    }
    for (const region of regions.values()) this.write(region);
  }

  private write(region: Region): void {
    for (let j = region.j0; j <= region.j1; j++)
      for (let i = region.i0; i <= region.i1; i++) {
        const k = j * this.grid.side + i;
        this.bytes[k] = Math.round(Math.min(1, this.light[k]) * 255);
      }
  }
}

export function bakePools(lamps: PoolLamp[], grid: PoolGrid): Uint8Array {
  const map = new PoolMap(grid);
  map.add(lamps);
  return map.bytes;
}

export function samplePools(data: Uint8Array, grid: PoolGrid, p: Vec): number {
  const u = p.x * grid.perTile - 0.5;
  const v = p.y * grid.perTile - 0.5;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const at = (a: number, b: number) => data[b * grid.side + a] / 255;
  const fu = u - i;
  const fv = v - j;
  return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
}

const POOL_VERTEX = `#include <project_vertex>
vec4 poolWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
poolWorld = instanceMatrix * poolWorld;
#endif
vPoolXZ = (modelMatrix * poolWorld).xz;`;

const POOL_FRAGMENT = `if (poolLevel > 0.0) {
  vec3 poolNormal = inverseTransformDirection(normal, viewMatrix);
  vec2 poolAt = (vPoolXZ + poolNormal.xz * poolPush) / poolSpan;
  gl_FragColor.rgb += diffuseColor.rgb * poolColor * (texture2D(poolMap, poolAt).r * poolGain * poolLevel);
}
#include <tonemapping_fragment>`;

const POOL_UNIFORMS = 'uniform sampler2D poolMap;\nuniform float poolSpan;\nuniform float poolPush;\nuniform float poolGain;\nuniform float poolLevel;\nuniform vec3 poolColor;\nvarying vec2 vPoolXZ;';

function haloTexture(): THREE.DataTexture {
  const n = HALO.texels;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(i + 0.5 - n / 2, j + 0.5 - n / 2) / (n / 2);
      const k = 4 * (j * n + i);
      data.set([255, 255, 255, Math.round(Math.max(0, 1 - d) ** 2 * 255)], k);
    }
  const texture = new THREE.DataTexture(data, n, n);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class NightPools {
  readonly level = { value: 0 };
  private readonly uniforms = {
    poolMap: { value: null as THREE.DataTexture | null },
    poolSpan: { value: 1 },
    poolPush: { value: POOLS.push * S },
    poolGain: { value: POOLS.gain },
    poolLevel: this.level,
    poolColor: { value: new THREE.Color(PAL.siteLight.sodium) },
  };
  private readonly lit = new WeakSet<THREE.Material>();
  readonly haloMaterial = new THREE.SpriteMaterial({ map: haloTexture(), color: PAL.lamp.amber, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });

  private map: PoolMap | null = null;

  start(worldSize: number, maxTextureSize: number): void {
    const map = new PoolMap(poolGrid(worldSize, maxTextureSize));
    const texture = new THREE.DataTexture(map.bytes, map.grid.side, map.grid.side, THREE.RedFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    this.map = map;
    this.uniforms.poolMap.value = texture;
    this.uniforms.poolSpan.value = worldSize * S;
  }

  addLamps(lamps: readonly PoolLamp[]): void {
    const texture = this.uniforms.poolMap.value;
    if (!this.map || !texture) throw new Error('Night pools were never started');
    if (lamps.length === 0) return;
    this.map.add(lamps);
    texture.needsUpdate = true;
  }

  setLevel(level: number): void {
    if (!this.uniforms.poolMap.value) throw new Error('Night pools were never baked');
    this.level.value = level;
    this.haloMaterial.opacity = level;
  }

  halo(): THREE.Sprite {
    const sprite = new THREE.Sprite(this.haloMaterial);
    sprite.scale.setScalar(HALO.size * S);
    sprite.name = 'halo';
    return sprite;
  }

  light(material: THREE.Material): void {
    if (!(material instanceof THREE.MeshLambertMaterial)) throw new Error(`Night pools light only Lambert materials, not ${material.type}`);
    if (this.lit.has(material)) return;
    this.lit.add(material);
    const before = material.onBeforeCompile.bind(material);
    const key = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPoolXZ;').replace('#include <project_vertex>', POOL_VERTEX);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${POOL_UNIFORMS}`).replace('#include <tonemapping_fragment>', POOL_FRAGMENT);
    };
    material.customProgramCacheKey = () => `${key()}|pools`;
    material.needsUpdate = true;
  }
}

export const NIGHT_POOLS = new NightPools();
