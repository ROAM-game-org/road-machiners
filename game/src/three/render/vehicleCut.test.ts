import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../../data/chassis';
import { PHYSICS } from '../../data/physics';
import { TRUCK_LOOK, drawnWheelPoints } from '../../render/partLooks';
import { wheelMounts } from '../../phys/body';
import { PAL } from '../../render/palette';
import { baseModel } from '../../render/partLooks';
import { bodyOf } from '../../sim/body';
import type { Vehicle } from '../../sim/types';
import { bare, lineWithArmor } from '../../test/gun-clearance-kit';
import { lampIslands } from './armorCut';
import { model } from './models';
import { hidesInside, VehicleView, type ViewScene } from './vehicle';

const LAMP_MATERIAL = 'light';

function armoredView(chassisId: string, scene: ViewScene): { view: VehicleView; v: Vehicle } {
  const { world, v } = bare(chassisId);
  lineWithArmor(world, v, 'steelPlate');
  const view = new VehicleView(v, true, scene);
  const wheels = wheelMounts(bodyOf(chassisId)).map(() => ({ steer: 0, spin: 0, suspension: PHYSICS.truck.suspensionRest, ground: true }));
  view.pose({ pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, acc: { x: 0, y: 0, z: 0 }, wheels }, 0);
  return { view, v };
}

function meshesOf(view: VehicleView): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  view.root.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

function materialOf(m: THREE.Mesh): THREE.Material {
  return m.material as THREE.Material;
}

function cutCounts(material: THREE.Material): { wheels: number; lamps: number } | null {
  const defines = material.defines;
  if (!defines || defines.CUT_WHEELS === undefined) return null;
  return { wheels: Number(defines.CUT_WHEELS), lamps: Number(defines.CUT_LAMPS) };
}

function uniformsOf(material: THREE.Material): Record<string, { value: unknown }> {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <clipping_planes_fragment>\n#include <aomap_fragment>',
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader.uniforms;
}

function expectedEndLamps(chassisId: string): THREE.Box3[] {
  const base = model(baseModel(chassisId));
  base.updateMatrixWorld(true);
  const islands: THREE.Box3[] = [];
  base.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.material.name !== LAMP_MATERIAL) return;
    islands.push(...lampIslands(o.geometry.clone().applyMatrix4(o.matrixWorld)));
  });
  const reach = bodyOf(chassisId).half.x * TRUCK_LOOK.lampEndShare;
  return islands.filter((b) => Math.abs(b.getCenter(new THREE.Vector3()).x) > reach);
}

describe.each(Object.keys(CHASSIS))('armor cut on %s', (id) => {
  const { view, v } = armoredView(id, 'world');
  const meshes = meshesOf(view);
  const isTwin = (m: THREE.Mesh) => materialOf(m).transparent;
  const lit = meshes.filter((m) => m.userData.armor && !m.userData.outline && !isTwin(m));
  const twins = meshes.filter((m) => m.userData.armor && isTwin(m));
  const armorOutlines = meshes.filter((m) => m.userData.armor && m.userData.outline);
  const bodyOutlines = meshes.filter((m) => !m.userData.armor && m.userData.outline);
  const lamps = expectedEndLamps(id);

  it('has armor meshes, their twins and an armor outline apart from the body outline', () => {
    expect(lit.length).toBeGreaterThan(0);
    expect(twins).toHaveLength(lit.length);
    expect(armorOutlines).toHaveLength(1);
    expect(bodyOutlines.length).toBeGreaterThan(0);
  });

  it('cuts one cylinder per drawn wheel and one window per end headlight island, none at the rear', () => {
    expect(lamps.every((b) => b.getCenter(new THREE.Vector3()).x > 0)).toBe(true);
    const material = materialOf(lit[0]);
    expect(cutCounts(material)).toEqual({ wheels: 4, lamps: lamps.length });
    const uniforms = uniformsOf(material);
    const mins = lamps.length > 0 ? (uniforms.cutLampMin.value as THREE.Vector3[]) : [];
    const maxes = lamps.length > 0 ? (uniforms.cutLampMax.value as THREE.Vector3[]) : [];
    const windows = mins.map((min, i) => new THREE.Box3(min, maxes[i]));
    for (const island of lamps) expect(windows.some((w) => w.containsBox(island)), 'window around the island').toBe(true);
    for (const w of windows) expect(w.min.x).toBeGreaterThan(0);
    const wheelAt = uniforms.cutWheelAt.value as THREE.Vector4[];
    const expected = drawnWheelPoints(bodyOf(id)).map((p) => [p.x, p.y - PHYSICS.truck.suspensionRest, p.z]);
    expect(wheelAt).toHaveLength(expected.length);
    wheelAt.forEach((w, i) => {
      expect(w.x).toBeCloseTo(expected[i][0], 9);
      expect(w.y).toBeCloseTo(expected[i][1], 9);
      expect(w.z).toBeCloseTo(expected[i][2], 9);
    });
  });

  it('puts the same cut on every material that draws armor, and none on anything else', () => {
    const counts = cutCounts(materialOf(lit[0]));
    const shared = uniformsOf(materialOf(lit[0])).cutWheelAt;
    for (const m of [...lit, ...twins, ...armorOutlines]) {
      expect(cutCounts(materialOf(m)), `${m.userData.partId} ${m.userData.outline ? 'outline' : ''}`).toEqual(counts);
      expect(uniformsOf(materialOf(m)).cutWheelAt).toBe(shared);
    }
    for (const m of lit) {
      expect(m.customDepthMaterial, `${m.userData.partId} depth`).toBeInstanceOf(THREE.MeshDepthMaterial);
      expect(cutCounts(m.customDepthMaterial!)).toEqual(counts);
    }
    for (const m of meshes.filter((o) => !o.userData.armor)) expect(cutCounts(materialOf(m)), m.userData.outline ? 'body outline' : materialOf(m).type).toBeNull();
  });

  it('keeps the cut on armor when the truck turns dark, and restores the lit material after', () => {
    const counts = cutCounts(materialOf(lit[0]));
    const litMaterials = lit.map(materialOf);
    view.outline(true);
    for (const m of lit) {
      expect(cutCounts(materialOf(m))).toEqual(counts);
      expect((materialOf(m) as THREE.MeshBasicMaterial).color.getHex()).toBe(PAL.outline);
    }
    for (const m of twins) expect(materialOf(m).transparent).toBe(true);
    for (const m of bodyOutlines) expect(cutCounts(materialOf(m))).toBeNull();
    view.outline(false);
    expect(lit.map(materialOf)).toEqual(litMaterials);
  });

  it('draws armor in body space, so the shader cuts in the same space as the spec', () => {
    view.root.updateMatrixWorld(true);
    for (const m of lit) expect(m.matrixWorld.equals(new THREE.Matrix4()), `${m.userData.partId}`).toBe(true);
  });

  it('tags a mesh for every drawn part', () => {
    const tagged = new Set(meshes.map((m) => m.userData.partId));
    for (const item of v.items) {
      if (item.kind !== 'part' || hidesInside(v, item)) continue;
      expect(tagged.has(item.part.id), item.part.defId).toBe(true);
    }
  });
});

describe('portrait scene', () => {
  const { view } = armoredView('scout', 'portrait');
  const meshes = meshesOf(view);

  it('has no see-through twins and no shadows, and still cuts the armor', () => {
    expect(meshes.some((m) => materialOf(m).transparent)).toBe(false);
    expect(meshes.every((m) => !m.castShadow && !m.receiveShadow)).toBe(true);
    const lit = meshes.filter((m) => m.userData.armor && !m.userData.outline);
    expect(lit.length).toBeGreaterThan(0);
    for (const m of lit) expect(cutCounts(materialOf(m))).not.toBeNull();
  });

  it('shades the world truck with cloud shadows and the portrait truck without', () => {
    const worldLit = meshesOf(armoredView('scout', 'world').view).filter((m) => materialOf(m) instanceof THREE.MeshLambertMaterial && !m.userData.armor);
    const portraitLit = meshes.filter((m) => materialOf(m) instanceof THREE.MeshLambertMaterial && !m.userData.armor);
    expect(worldLit.length).toBeGreaterThan(0);
    expect(worldLit.every((m) => materialOf(m).customProgramCacheKey().includes('clouds'))).toBe(true);
    expect(portraitLit.some((m) => materialOf(m).customProgramCacheKey().includes('clouds'))).toBe(false);
  });

  it('still cuts the armor on a cloud shaded world truck', () => {
    const lit = meshesOf(armoredView('scout', 'world').view).filter((m) => m.userData.armor && !m.userData.outline && !materialOf(m).transparent);
    const key = materialOf(lit[0]).customProgramCacheKey();
    expect(key).toContain('clouds');
    expect(key).toContain('armor-cut');
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <clipping_planes_fragment>\n#include <aomap_fragment>' };
    materialOf(lit[0]).onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('cloudDim');
    expect(shader.fragmentShader).toContain('discard');
  });
});
