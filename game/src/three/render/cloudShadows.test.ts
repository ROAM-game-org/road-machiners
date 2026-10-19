import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TIME } from '../../data/time';
import { WEATHER } from '../../data/weather';
import { emptyWorld } from '../../sim/testkit';
import { sunAt } from '../../sim/sun';
import { CloudShadows, coverTarget, dayFactor, driftAt, easeCover } from './cloudShadows';

const CLOUDS = WEATHER.clouds;
const NOON = Array.from({ length: TIME.turnsPerDay }, (_, turn) => turn).reduce((best, turn) => ((sunAt(turn)?.elevation ?? 0) > (sunAt(best)?.elevation ?? 0) ? turn : best), 0);

function shaderOf(material: THREE.Material) {
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <aomap_fragment>',
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

describe('cloud cover', () => {
  it('is denser under overcast than under a clear sky', () => {
    expect(coverTarget(true)).toBeGreaterThan(coverTarget(false));
  });

  it('stays still without play time and reaches its target after the easing turns', () => {
    expect(easeCover(0.2, 0.7, 0)).toBe(0.2);
    const settled = easeCover(0.2, 0.7, CLOUDS.easeTurns * 1000);
    expect(0.7 - settled).toBeLessThan(0.05 * 0.5);
  });

  it('is gone at night and fades in over dawn', () => {
    expect(dayFactor(null)).toBe(0);
    expect(dayFactor(CLOUDS.fadeElevation / 2)).toBeCloseTo(0.5);
    expect(dayFactor(1.2)).toBe(1);
  });

  it('shows exactly no cover whenever the sun is down', () => {
    const shadows = new CloudShadows();
    const world = emptyWorld();
    world.weather = [{ id: 'o', kind: 'overcast', turnsLeft: 30 }];
    for (let turn = 0; turn < TIME.turnsPerDay; turn += 7) {
      shadows.sync(world, turn, 0);
      if (!sunAt(turn)) expect(shadows.cover()).toBe(0);
    }
    shadows.sync(world, NOON, 0);
    expect(shadows.cover()).toBeCloseTo(CLOUDS.overcast);
  });

  it('snaps on the first sync and then eases toward a new weather', () => {
    const shadows = new CloudShadows();
    const world = emptyWorld();
    shadows.sync(world, NOON, 0);
    expect(shadows.cover()).toBeCloseTo(CLOUDS.clear);
    world.weather = [{ id: 'o', kind: 'overcast', turnsLeft: 30 }];
    shadows.sync(world, NOON, 0);
    expect(shadows.cover()).toBeCloseTo(CLOUDS.clear);
    shadows.sync(world, NOON, 2000);
    expect(shadows.cover()).toBeGreaterThan(CLOUDS.clear);
    expect(shadows.cover()).toBeLessThan(CLOUDS.overcast);
  });
});

describe('cloud drift', () => {
  it('wraps within the noise period', () => {
    for (const turn of [0, 1, 100, 5000, 123456]) {
      const d = driftAt(turn);
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThan(CLOUDS.period);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThan(CLOUDS.period);
    }
  });

  it('moves with time, and is the same at the same time', () => {
    expect(driftAt(40)).toEqual(driftAt(40));
    expect(driftAt(40)).not.toEqual(driftAt(41));
  });

  it('is continuous across the wrap in noise space', () => {
    const before = driftAt(0);
    const turnsPerWrap = (CLOUDS.period * CLOUDS.scale) / (Math.abs(WEATHER.wind.x) * CLOUDS.speed);
    const step = 1e-6;
    const a = driftAt(turnsPerWrap - step).x;
    const b = driftAt(turnsPerWrap + step).x;
    const gap = Math.min(Math.abs(a - b), CLOUDS.period - Math.abs(a - b));
    expect(gap).toBeLessThan(1e-3);
    expect(before.x).toBeLessThan(CLOUDS.period);
  });
});

describe('cloud shader patch', () => {
  it('adds no texture and at most two uniforms, and keys the program', () => {
    const material = new THREE.MeshLambertMaterial();
    const shadows = new CloudShadows();
    shadows.shade(material);
    const shader = shaderOf(material);
    expect(shader.fragmentShader).not.toContain('sampler2D');
    expect(Object.keys(shader.uniforms).sort()).toEqual(['cloudParams', 'cloudShift']);
    expect(shader.fragmentShader).toContain('reflectedLight.directDiffuse *= cloudDim()');
    expect(material.customProgramCacheKey()).toContain('|clouds');
  });

  it('shades a Lambert material once and refuses a basic one', () => {
    const material = new THREE.MeshLambertMaterial();
    const shadows = new CloudShadows();
    shadows.shade(material);
    shadows.shade(material);
    expect(material.customProgramCacheKey().match(/\|clouds/g)).toHaveLength(1);
    expect(() => shadows.shade(new THREE.MeshBasicMaterial())).toThrow(/Lambert/);
  });

  it('leaves basic materials in a tree unshaded', () => {
    const basic = new THREE.MeshBasicMaterial();
    const lambert = new THREE.MeshLambertMaterial();
    const tree = new THREE.Group();
    tree.add(new THREE.Mesh(new THREE.BoxGeometry(), basic), new THREE.Mesh(new THREE.BoxGeometry(), lambert));
    new CloudShadows().shadeTree(tree);
    expect(basic.customProgramCacheKey()).not.toContain('clouds');
    expect(lambert.customProgramCacheKey()).toContain('|clouds');
  });
});
