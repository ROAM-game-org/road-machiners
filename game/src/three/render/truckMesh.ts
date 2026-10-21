import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Body } from '../../sim/body';
import { EDGE_DISTANCE, MASK_UV, neutralSurface, outlineOf, surfacedMaterial, surfaceOf, type SurfaceName } from './models';

export const BODY_PAINT_SATURATION = 0.8;

export function bodyPaint(paint: number): number {
  const hsl = new THREE.Color(paint).getHSL({ h: 0, s: 0, l: 0 });
  return new THREE.Color().setHSL(hsl.h, hsl.s * BODY_PAINT_SATURATION, hsl.l).getHex();
}

export function flipWinding(geo: THREE.BufferGeometry): void {
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < a.itemSize; k++) {
        const one = a.array[(i + 1) * a.itemSize + k];
        a.array[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k];
        a.array[(i + 2) * a.itemSize + k] = one;
      }
    }
    a.needsUpdate = true;
  }
}

function giveSurface(geo: THREE.BufferGeometry): void {
  if (geo.getAttribute(MASK_UV)) return;
  const neutral = neutralSurface(geo.getAttribute('position').count);
  geo.setAttribute(MASK_UV, neutral.maskUv);
  geo.setAttribute(EDGE_DISTANCE, neutral.edgeDistance);
}

const KEPT_ATTRIBUTES = new Set(['position', 'normal', MASK_UV, EDGE_DISTANCE]);

function staticGeometry(mesh: THREE.Mesh, toGroup: THREE.Matrix4): THREE.BufferGeometry {
  const toHere = toGroup.clone().multiply(mesh.matrixWorld);
  let geo = mesh.geometry.clone().applyMatrix4(toHere);
  if (geo.index) geo = geo.toNonIndexed();
  if (toHere.determinant() < 0) flipWinding(geo);
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  giveSurface(geo);
  for (const name of Object.keys(geo.attributes)) if (!KEPT_ATTRIBUTES.has(name)) geo.deleteAttribute(name);
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo;
}

type Bucket = { hex: number; surface: SurfaceName | null; partId: string | null; armor: boolean; geos: THREE.BufferGeometry[] };
type Buckets = Map<string, Bucket>;
type Owner = { partId: string | null; armor: boolean };

export type MergeSplit = 'parts' | 'armor';

const NO_ARMOR: ReadonlySet<string> = new Set();

function ownerOf(mesh: THREE.Mesh, armorIds: ReadonlySet<string>, split: MergeSplit): Owner {
  const tagged: string | null = mesh.userData.partId ?? null;
  const armor = tagged !== null && armorIds.has(tagged);
  return { partId: split === 'parts' ? tagged : null, armor };
}

function surfacedMesh(bucket: Bucket): THREE.Mesh {
  const { hex, surface, partId, armor, geos } = bucket;
  const merged = mergeGeometries(geos);
  if (!merged) throw new Error(`Could not merge ${geos.length} truck meshes of color ${hex.toString(16)}`);
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, surfacedMaterial(hex, surface));
  if (partId) mesh.userData.partId = partId;
  if (armor) mesh.userData.armor = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function bucketFor(buckets: Buckets, mat: THREE.MeshLambertMaterial, owner: Owner): Bucket {
  const hex = mat.color.getHex();
  const surface = surfaceOf(mat.name);
  const key = `${hex}|${surface}|${owner.partId}|${owner.armor}`;
  const bucket = buckets.get(key) ?? { hex, surface, ...owner, geos: [] };
  buckets.set(key, bucket);
  return bucket;
}

function movedLamp(lamp: THREE.Mesh, toGroup: THREE.Matrix4): THREE.Mesh {
  const toHere = toGroup.clone().multiply(lamp.matrixWorld);
  const geo = lamp.geometry.clone().applyMatrix4(toHere);
  if (toHere.determinant() < 0) flipWinding(geo);
  lamp.geometry.dispose();
  const mesh = new THREE.Mesh(geo, lamp.material);
  if (lamp.userData.partId) mesh.userData.partId = lamp.userData.partId;
  return mesh;
}

export function mergeStatic(group: THREE.Group): THREE.Group {
  return mergeParts(group, NO_ARMOR, 'parts');
}

export function mergeParts(group: THREE.Group, armorIds: ReadonlySet<string>, split: MergeSplit): THREE.Group {
  group.updateMatrixWorld(true);
  const toGroup = group.matrixWorld.clone().invert();
  const buckets: Buckets = new Map();
  const used: THREE.Mesh[] = [];
  const lamps: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.userData.lamp) {
      lamps.push(o);
      return;
    }
    bucketFor(buckets, o.material as THREE.MeshLambertMaterial, ownerOf(o, armorIds, split)).geos.push(staticGeometry(o, toGroup));
    used.push(o);
  });
  const out = mergedGroup([...buckets.values()]);
  for (const lamp of lamps) out.add(movedLamp(lamp, toGroup));
  for (const m of used) {
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
  return out;
}

function mergedGroup(buckets: Bucket[]): THREE.Group {
  const out = new THREE.Group();
  out.add(...outlineOf(buckets.filter((b) => !b.armor).flatMap((b) => b.geos)));
  for (const outline of outlineOf(buckets.filter((b) => b.armor).flatMap((b) => b.geos))) {
    outline.userData.armor = true;
    out.add(outline);
  }
  for (const bucket of buckets) out.add(surfacedMesh(bucket));
  return out;
}

export const CONTACT_SHADOW = { darkness: 0.55, core: 0.125, side: 64, lift: 0.02, spread: { length: 1.25, width: 1.4 } };
let contactTexture: THREE.DataTexture | null = null;

export function contactShadowFor(b: Body): THREE.Mesh {
  const length = 2 * Math.max(b.half.x, b.wheelX + b.wheelRadius) * CONTACT_SHADOW.spread.length;
  const width = 2 * Math.max(b.half.z, b.wheelZ + b.wheelHalfWidth) * CONTACT_SHADOW.spread.width;
  const material = new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, width), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.raycast = () => {};
  return mesh;
}

function contactShadowTexture(): THREE.DataTexture {
  if (contactTexture) return contactTexture;
  const { side, core, darkness } = CONTACT_SHADOW;
  const pixels = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const r = Math.hypot(x + 0.5 - side / 2, y + 0.5 - side / 2) / (side / 2);
      const fade = THREE.MathUtils.clamp((1 - r) / (1 - core), 0, 1);
      pixels[(y * side + x) * 4 + 3] = Math.round(255 * darkness * fade);
    }
  }
  contactTexture = new THREE.DataTexture(pixels, side, side);
  contactTexture.magFilter = THREE.LinearFilter;
  contactTexture.minFilter = THREE.LinearMipmapLinearFilter;
  contactTexture.generateMipmaps = true;
  contactTexture.needsUpdate = true;
  return contactTexture;
}
