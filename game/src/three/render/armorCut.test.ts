import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { TRUCK_LOOK } from '../../render/partLooks';
import type { HeightMap } from '../../sim/body';
import { CUT_SLOTS, cutFace, cutSpec, lampIslands, withCut } from './armorCut';
import { fitToBody, placedBounds, type Placement } from './armorFit';
import { cutHeightAt, topCut } from './armorTop';
import { CloudShadows } from './cloudShadows';

const HALF = { x: 2, y: 0.5, z: 1 };
const CELL = 0.1;
const SEAMS = { along: [-2, -1, 0, 1, 2], across: [-1, 0, 1] };

function tops(height: (x: number, z: number) => number): HeightMap {
  const i0 = -20;
  const j0 = -10;
  const top = Array.from({ length: 40 }, (_, i) => Array.from({ length: 20 }, (_, j) => Math.round(100 * height((i0 + i + 0.5) * CELL, -(j0 + j + 0.5) * CELL))));
  return { cell: CELL, i0, j0, top };
}

const TOP = topCut(tops(() => 0.4), SEAMS);
const STRIPE = 0xc04020;

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
    fragmentShader: '#include <common>\n#include <clipping_planes_fragment>\n#include <color_fragment>\n#include <aomap_fragment>\n#include <tonemapping_fragment>',
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

describe('cutSpec', () => {
  it('cuts one cylinder per wheel box, scaled by the cut scale and as wide as the wheel', () => {
    const spec = cutSpec([box([1, -1, 1], [3, 1, 1.6])], [], HALF, TRUCK_LOOK, TOP, STRIPE);
    expect(spec.wheels).toHaveLength(1);
    expect(spec.wheels[0].center.toArray()).toEqual([2, 0, 1.3]);
    expect(spec.wheels[0].radius).toBeCloseTo(1 * TRUCK_LOOK.cutScale);
    expect(spec.wheels[0].halfWidth).toBeCloseTo(0.3);
  });

  it('opens a window for a lamp at either end and none for a lamp near the middle', () => {
    const front = box([1.9, 0.1, -0.5], [2.1, 0.3, -0.3]);
    const rear = box([-2.1, 0.1, 0.3], [-1.9, 0.3, 0.5]);
    const middle = box([0, 0.1, 0.3], [0.2, 0.3, 0.5]);
    const spec = cutSpec([], [front, rear, middle], HALF, TRUCK_LOOK, TOP, STRIPE);
    expect(spec.lamps).toHaveLength(2);
  });

  it('makes no window when no lamp is near an end', () => {
    expect(cutSpec([], [], HALF, TRUCK_LOOK, TOP, STRIPE).lamps).toEqual([]);
  });

  it('reaches a front window outward by the lamp reach and a rear window the other way', () => {
    const front = box([1.9, 0.1, -0.5], [2.1, 0.3, -0.3]);
    const rear = box([-2.1, 0.1, 0.3], [-1.9, 0.3, 0.5]);
    const [first, second] = cutSpec([], [front, rear], HALF, TRUCK_LOOK, TOP, STRIPE).lamps;
    expect(first.max.x).toBeCloseTo(2 + TRUCK_LOOK.lampReach);
    expect(first.min.x).toBeCloseTo(2 - 0.1 * TRUCK_LOOK.cutScale);
    expect(second.min.x).toBeCloseTo(-2 - TRUCK_LOOK.lampReach);
    expect(second.max.x).toBeCloseTo(-2 + 0.1 * TRUCK_LOOK.cutScale);
    expect(first.getSize(new THREE.Vector3()).z).toBeCloseTo(0.2 * TRUCK_LOOK.cutScale);
  });
});

describe('topCut', () => {
  const SIDE_Z = -1.15;

  it('cuts armor beside the body just under the body edge it lies against', () => {
    const cut = topCut(tops(() => 0.4), SEAMS);
    expect(cutHeightAt(cut, 0.5, SIDE_Z)).toBeLessThan(0.4);
    expect(cutHeightAt(cut, 0.5, SIDE_Z)).toBeGreaterThan(0.33);
  });

  it('drops a body feature narrower than one plate from the cut line', () => {
    const cut = topCut(tops((x) => (Math.abs(x - 0.5) < 0.1 ? 0.9 : 0.4)), SEAMS);
    expect(cutHeightAt(cut, 0.5, SIDE_Z)).toBeLessThan(0.41);
  });

  it('runs the cut in a straight line between plate seams', () => {
    const cut = topCut(tops((x) => 0.4 + 0.1 * x), SEAMS);
    const mid = cutHeightAt(cut, -0.5, SIDE_Z);
    expect(mid).toBeCloseTo((cutHeightAt(cut, -1, SIDE_Z) + cutHeightAt(cut, 0, SIDE_Z)) / 2, 2);
  });

  it('lets side armor rise beside a cab set back from the edge, but not to the roof', () => {
    const cab = (x: number, z: number) => (Math.abs(x) < 0.6 && Math.abs(z) < 0.85 ? 0.95 : 0.4);
    const cut = topCut(tops(cab), SEAMS);
    const beside = cutHeightAt(cut, 0, SIDE_Z);
    expect(beside).toBeGreaterThan(0.55);
    expect(beside).toBeLessThan(0.95);
    expect(cutHeightAt(cut, 1.6, SIDE_Z)).toBeLessThan(0.41);
  });
});

describe('fitToBody', () => {
  const plateBox = box([-0.05, -0.1, -0.225], [0.05, 0.1, 0.225]);
  const noBody = new THREE.Group();

  it('sinks a ram until its top sits under the cut, so nothing of it is cut', () => {
    const at: Placement = { pos: new THREE.Vector3(2.2, 0.5, 0), yaw: 0, scale: new THREE.Vector3(1, 1, 1) };
    const ramBox = box([-0.15, -0.25, -0.8], [0.15, 0.25, 0.8]);
    fitToBody(at, ramBox, noBody, TOP, 'F', true);
    expect(placedBounds(at, ramBox).max.y).toBeLessThanOrEqual(cutHeightAt(TOP, 2.2, 0) + 0.021);
  });

  it('grows a short side plate up to the cut, keeps its foot and sinks it half its depth into the body', () => {
    const at: Placement = { pos: new THREE.Vector3(0.5, 0, -1.1), yaw: Math.PI / 2, scale: new THREE.Vector3(1, 1, 1) };
    const before = placedBounds(at, plateBox);
    fitToBody(at, plateBox, noBody, TOP, 'L', false);
    const after = placedBounds(at, plateBox);
    expect(after.min.y).toBeCloseTo(before.min.y, 5);
    expect(after.max.y).toBeGreaterThan(0.33);
    expect(after.min.z).toBeCloseTo(before.min.z + 0.05, 5);
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
  const spec = cutSpec([box([1, -1, 1], [3, 1, 1.6])], [box([1.9, 0.1, -0.5], [2.1, 0.3, -0.3])], HALF, TRUCK_LOOK, TOP, STRIPE);

  it('adds the discard after the clipping planes and the position varying to both shaders', () => {
    const shader = shaderOf(withCut(new THREE.MeshLambertMaterial(), spec));
    expect(shader.fragmentShader).toMatch(/#include <clipping_planes_fragment>\nfor \(int i = 0; i < CUT_WHEELS/);
    expect(shader.fragmentShader).toContain('discard');
    expect(shader.vertexShader).toContain('vCutPos = transformed;');
    expect(Object.keys(shader.uniforms).sort()).toEqual(['cutLampMax', 'cutLampMin', 'cutStripe', 'cutStripeAt', 'cutTop', 'cutTopCell', 'cutTopFirst', 'cutTopSize', 'cutWheelAt', 'cutWheelHalfWidth']);
    expect(shader.fragmentShader).toContain('cutTopHeight(vCutPos)');
  });

  it('paints the faction line only on striped faces and caps every shaded face', () => {
    const striped = shaderOf(withCut(new THREE.MeshLambertMaterial(), spec, 'striped')).fragmentShader;
    const capped = shaderOf(withCut(new THREE.MeshLambertMaterial(), spec, 'capped')).fragmentShader;
    const plain = shaderOf(withCut(new THREE.MeshLambertMaterial(), spec)).fragmentShader;
    expect(striped).toMatch(/#include <color_fragment>\nfloat cutStripeAa/);
    expect(striped).toContain('abs(vCutPos.y - cutStripeAt)');
    expect(capped).not.toContain('cutStripeAa');
    expect(capped).toContain('gl_FrontFacing');
    expect(plain).not.toContain('gl_FrontFacing');
    expect(spec.stripeAt).toBeCloseTo(TRUCK_LOOK.armorRise / 2);
  });

  it('keeps rams out of the faction line and outlines out of every face', () => {
    const mesh = (userData: Record<string, unknown>) => Object.assign(new THREE.Mesh(), { userData });
    expect(cutFace(mesh({ surface: 'armor' }))).toBe('striped');
    expect(cutFace(mesh({ surface: 'ram' }))).toBe('capped');
    expect(cutFace(mesh({ outline: true, surface: 'armor' }))).toBe('plain');
  });

  it('compiles one program for every truck, with unused slots that cut nothing', () => {
    const cut = withCut(new THREE.MeshLambertMaterial(), spec);
    expect(cut.defines).toMatchObject({ CUT_WHEELS: CUT_SLOTS.wheels, CUT_LAMPS: CUT_SLOTS.lamps });
    const other = withCut(new THREE.MeshLambertMaterial(), cutSpec([], [], HALF, TRUCK_LOOK, TOP, STRIPE));
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
    const many = cutSpec(Array.from({ length: CUT_SLOTS.wheels + 1 }, () => box([1, -1, 1], [3, 1, 1.6])), [], HALF, TRUCK_LOOK, TOP, STRIPE);
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
