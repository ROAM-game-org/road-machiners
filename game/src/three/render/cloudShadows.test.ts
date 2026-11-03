import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../data/physics';
import { TIME } from '../../data/time';
import { DEFAULT_ZOOM } from '../../data/view';
import { WEATHER } from '../../data/weather';
import { emptyWorld } from '../../sim/testkit';
import { sunAt } from '../../sim/sun';
import { VIEW_METERS } from './camera';
import { CloudShadows, coverTarget, dayFactor, depthFor, driftAt, easeCover } from './cloudShadows';

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

describe('cloud depth', () => {
  it('runs from the clear depth to the overcast depth with the cover', () => {
    expect(depthFor(CLOUDS.clear)).toBeCloseTo(CLOUDS.depth.clear);
    expect(depthFor(CLOUDS.overcast)).toBeCloseTo(CLOUDS.depth.overcast);
    const middle = depthFor((CLOUDS.clear + CLOUDS.overcast) / 2);
    expect(middle).toBeGreaterThan(CLOUDS.depth.clear);
    expect(middle).toBeLessThan(CLOUDS.depth.overcast);
  });

  it('throws for a weather value outside clear to overcast', () => {
    expect(() => depthFor(CLOUDS.clear - 0.1)).toThrow();
    expect(() => depthFor(CLOUDS.overcast + 0.1)).toThrow();
  });

  it('follows the sky on sync and rises as the cover eases', () => {
    const shadows = new CloudShadows();
    const world = emptyWorld();
    shadows.sync(world, NOON, 0);
    expect(shadows.depth()).toBeCloseTo(CLOUDS.depth.clear);
    world.weather = [{ id: 'o', kind: 'overcast', turnsLeft: 30 }];
    shadows.sync(world, NOON, 2000);
    expect(shadows.depth()).toBeGreaterThan(CLOUDS.depth.clear);
    expect(shadows.depth()).toBeLessThan(CLOUDS.depth.overcast);
    shadows.sync(world, NOON, CLOUDS.easeTurns * 5000);
    expect(shadows.depth()).toBeCloseTo(CLOUDS.depth.overcast, 2);
  });

  it('has no octave finer than two times the base cell', () => {
    expect(new CloudShadows().shaderChunks().fragment).not.toContain('p * 4.0');
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

type CloudLook = { scale: number; soft: number; cover: number };

const smoothstep = (low: number, high: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

function cloudHash(x: number, y: number) {
  let px = (x * 123.34) % 1;
  let py = (y * 456.21) % 1;
  const shift = px * (px + 45.32) + py * (py + 45.32);
  px += shift;
  py += shift;
  return (px * py) % 1;
}

function cloudValue(x: number, y: number, period: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wrap = (v: number) => ((v % period) + period) % period;
  const corner = (dx: number, dy: number) => cloudHash(wrap(ix + dx), wrap(iy + dy));
  const low = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * sx;
  const high = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * sx;
  return low + (high - low) * sy;
}

function cloudMask(tileX: number, tileY: number, look: CloudLook) {
  const x = tileX / look.scale;
  const y = tileY / look.scale;
  const n = cloudValue(x, y, CLOUDS.period) * 0.75 + cloudValue(x * 2, y * 2, CLOUDS.period * 2) * 0.25;
  const edge = 0.5 + (0.5 - look.cover) * 0.3;
  return smoothstep(edge - look.soft, edge + look.soft, n);
}

function lookOver(look: CloudLook) {
  const span = VIEW_METERS / DEFAULT_ZOOM / PHYSICS.metersPerTile;
  const windows = 30;
  const points = 17;
  const reach = CLOUDS.period * look.scale;
  const step = 0.05;
  let withEdge = 0;
  const bands: number[] = [];
  for (let wx = 0; wx < windows; wx++) {
    for (let wy = 0; wy < windows; wy++) {
      const originX = (wx / windows) * reach;
      const originY = (wy / windows) * reach;
      let low = 1;
      let high = 0;
      for (let px = 0; px < points; px++) {
        for (let py = 0; py < points; py++) {
          const x = originX + (px / (points - 1)) * span;
          const y = originY + (py / (points - 1)) * span;
          const mask = cloudMask(x, y, look);
          low = Math.min(low, mask);
          high = Math.max(high, mask);
          if (mask < 0.1 || mask > 0.9) continue;
          const gx = (cloudMask(x + step, y, look) - cloudMask(x - step, y, look)) / (2 * step);
          const gy = (cloudMask(x, y + step, look) - cloudMask(x, y - step, look)) / (2 * step);
          const slope = Math.hypot(gx, gy);
          if (slope > 0) bands.push(0.8 / slope);
        }
      }
      if (low < 0.1 && high > 0.9) withEdge++;
    }
  }
  bands.sort((a, b) => a - b);
  return { wholeEdgeShare: withEdge / windows ** 2, medianBand: bands[Math.floor(bands.length / 2)] };
}

describe('cloud look in the default view', () => {
  const look = { scale: CLOUDS.scale, soft: CLOUDS.soft, cover: CLOUDS.clear };

  it('shows a whole shadow edge in most default views under a clear sky', () => {
    expect(lookOver(look).wholeEdgeShare).toBeGreaterThanOrEqual(0.6);
  });

  it('keeps the edge soft but inside a quarter of the view', () => {
    const { medianBand } = lookOver(look);
    expect(medianBand).toBeGreaterThanOrEqual(2);
    expect(medianBand).toBeLessThanOrEqual(4);
  });

  it('models the same mask as the shader', () => {
    const fragment = new CloudShadows().shaderChunks().fragment;
    for (const part of ['* 0.75', 'p * 2.0', '* 0.25', '(0.5 - cloudParams.x) * 0.3', 'smoothstep(edge - cloudParams.w, edge + cloudParams.w']) {
      expect(fragment).toContain(part);
    }
  });
});
