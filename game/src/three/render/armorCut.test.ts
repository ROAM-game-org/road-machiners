import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { TRUCK_LOOK } from '../../render/partLooks';
import { CUT_SLOTS, cutSpec, lampIslands, withCut } from './armorCut';
import { CloudShadows } from './cloudShadows';

const HALF = { x: 2, y: 0.5, z: 1 };

function box(min: [number, number, number], max: [number, number, number]): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
}

function cube(size: [number, number, number], at: [number, number, number]): THREE.BufferGeometry {
  return new THREE.BoxGeometry(...size).translate(...at);
}

function shaderOf(material: THREE.Material) {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <clipping_planes_fragment>\n#include <aomap_fragment>',
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

describe('cutSpec', () => {
  it('cuts one cylinder per wheel box, scaled by the cut scale and as wide as the wheel', () => {
    const spec = cutSpec([box([1, -1, 1], [3, 1, 1.6])], [], HALF, TRUCK_LOOK);
    expect(spec.wheels).toHaveLength(1);
    expect(spec.wheels[0].center.toArray()).toEqual([2, 0, 1.3]);
    expect(spec.wheels[0].radius).toBeCloseTo(1 * TRUCK_LOOK.cutScale);
    expect(spec.wheels[0].halfWidth).toBeCloseTo(0.3);
  });

  it('opens a window for a lamp at either end and none for a lamp near the middle', () => {
    const front = box([1.9, 0.1, -0.5], [2.1, 0.3, -0.3]);
    const rear = box([-2.1, 0.1, 0.3], [-1.9, 0.3, 0.5]);
    const middle = box([0, 0.1, 0.3], [0.2, 0.3, 0.5]);
    const spec = cutSpec([], [front, rear, middle], HALF, TRUCK_LOOK);
    expect(spec.lamps).toHaveLength(2);
  });

  it('makes no window when no lamp is near an end', () => {
    expect(cutSpec([], [], HALF, TRUCK_LOOK).lamps).toEqual([]);
  });

  it('reaches a front window outward by the lamp reach and a rear window the other way', () => {
    const front = box([1.9, 0.1, -0.5], [2.1, 0.3, -0.3]);
    const rear = box([-2.1, 0.1, 0.3], [-1.9, 0.3, 0.5]);
    const [first, second] = cutSpec([], [front, rear], HALF, TRUCK_LOOK).lamps;
    expect(first.max.x).toBeCloseTo(2 + TRUCK_LOOK.lampReach);
    expect(first.min.x).toBeCloseTo(2 - 0.1 * TRUCK_LOOK.cutScale);
    expect(second.min.x).toBeCloseTo(-2 - TRUCK_LOOK.lampReach);
    expect(second.max.x).toBeCloseTo(-2 + 0.1 * TRUCK_LOOK.cutScale);
    expect(first.getSize(new THREE.Vector3()).z).toBeCloseTo(0.2 * TRUCK_LOOK.cutScale);
  });
});

describe('lampIslands', () => {
  it('gives one box for one lamp', () => {
    const islands = lampIslands(cube([1, 1, 1], [0, 0, 0]));
    expect(islands).toHaveLength(1);
    expect(islands[0].min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(islands[0].max.toArray()).toEqual([0.5, 0.5, 0.5]);
  });

  it('splits two separate boxes into two islands', () => {
    const merged = mergeGeometries([cube([1, 1, 1], [0, 0, 0]), cube([1, 1, 1], [5, 0, 0])])!;
    const islands = lampIslands(merged);
    expect(islands).toHaveLength(2);
    expect(islands.map((b) => b.getCenter(new THREE.Vector3()).x).sort()).toEqual([0, 5]);
  });

  it('joins boxes that share a corner, and reads a geometry without an index', () => {
    const touching = mergeGeometries([cube([1, 1, 1], [0, 0, 0]), cube([1, 1, 1], [1, 1, 1])])!.toNonIndexed();
    expect(touching.index).toBeNull();
    expect(lampIslands(touching)).toHaveLength(1);
  });
});

describe('withCut', () => {
  const spec = cutSpec([box([1, -1, 1], [3, 1, 1.6])], [box([1.9, 0.1, -0.5], [2.1, 0.3, -0.3])], HALF, TRUCK_LOOK);

  it('adds the discard after the clipping planes and the position varying to both shaders', () => {
    const shader = shaderOf(withCut(new THREE.MeshLambertMaterial(), spec));
    expect(shader.fragmentShader).toMatch(/#include <clipping_planes_fragment>\nfor \(int i = 0; i < CUT_WHEELS/);
    expect(shader.fragmentShader).toContain('discard');
    expect(shader.vertexShader).toContain('vCutPos = transformed;');
    expect(Object.keys(shader.uniforms).sort()).toEqual(['cutLampMax', 'cutLampMin', 'cutWheelAt', 'cutWheelHalfWidth']);
  });

  it('compiles one program for every truck, with unused slots that cut nothing', () => {
    const cut = withCut(new THREE.MeshLambertMaterial(), spec);
    expect(cut.defines).toMatchObject({ CUT_WHEELS: CUT_SLOTS.wheels, CUT_LAMPS: CUT_SLOTS.lamps });
    const other = withCut(new THREE.MeshLambertMaterial(), cutSpec([], [], HALF, TRUCK_LOOK));
    expect(cut.customProgramCacheKey()).toBe(other.customProgramCacheKey());
    const uniforms = shaderOf(cut).uniforms;
    const wheels = uniforms.cutWheelAt.value as THREE.Vector4[];
    expect(wheels).toHaveLength(CUT_SLOTS.wheels);
    expect(wheels.slice(1).every((w) => w.w === 0)).toBe(true);
    const mins = uniforms.cutLampMin.value as THREE.Vector3[];
    const maxes = uniforms.cutLampMax.value as THREE.Vector3[];
    expect(mins.slice(1).every((min, i) => min.x > maxes[i + 1].x)).toBe(true);
  });

  it('refuses more wheels than the shader has slots', () => {
    const many = cutSpec(Array.from({ length: CUT_SLOTS.wheels + 1 }, () => box([1, -1, 1], [3, 1, 1.6])), [], HALF, TRUCK_LOOK);
    expect(() => shaderOf(withCut(new THREE.MeshLambertMaterial(), many))).toThrow(/shader slots/);
  });

  it('keeps the cloud shadow patch of a shaded material', () => {
    const clouds = new CloudShadows();
    const lit = new THREE.MeshLambertMaterial();
    clouds.shade(lit);
    const cut = withCut(lit, spec);
    const shader = shaderOf(cut);
    expect(shader.fragmentShader).toContain('cloudDim');
    expect(shader.fragmentShader).toContain('discard');
    expect(shader.vertexShader).toContain('vCloudXZ');
    expect(shader.vertexShader).toContain('vCutPos');
    expect(cut.customProgramCacheKey()).toContain('clouds');
    expect(cut.customProgramCacheKey()).toContain('armor-cut');
  });

  it('keeps the vertex patch of a material that already has its own', () => {
    const source = new THREE.MeshBasicMaterial();
    source.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nOUTLINE_PUSH');
    };
    source.customProgramCacheKey = () => 'outline';
    const cut = withCut(source, spec);
    expect(shaderOf(cut).vertexShader).toContain('OUTLINE_PUSH');
    expect(cut.customProgramCacheKey()).toMatch(/^outline\|armor-cut/);
  });

  it('leaves the source material alone and shares one uniform set across its clones', () => {
    const source = new THREE.MeshLambertMaterial({ color: 0x336699 });
    const first = withCut(source, spec);
    const second = withCut(source, spec);
    expect(first).not.toBe(source);
    expect(first.color.getHex()).toBe(0x336699);
    expect(source.defines?.CUT_WHEELS).toBeUndefined();
    expect(shaderOf(first).uniforms.cutWheelAt).toBe(shaderOf(second).uniforms.cutWheelAt);
  });

  it('refuses a shader that has nowhere to cut', () => {
    const cut = withCut(new THREE.MeshBasicMaterial(), spec);
    const shader = { uniforms: {}, vertexShader: '#include <common>', fragmentShader: '#include <common>' };
    expect(() => cut.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)).toThrow(/project_vertex/);
  });
});
