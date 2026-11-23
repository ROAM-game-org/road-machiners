import { describe, expect, it } from 'vitest';
import { HAZE_WAVES, hazeWavesGlsl } from './shade';
import { TIME } from '../../data/time';
import { HAZE_FROM } from '../../data/wear';
import { shadeCasters, sunAt, sunHeatAt } from '../../sim/sun';
import { emptyWorld } from '../../sim/testkit';
import * as THREE from 'three';
import { PlayClock } from '../play-clock';
import { CLOUD_SHADOWS } from './cloudShadows';
import { NIGHT_POOLS } from './lightPools';
import { cornerLook, ShadeView } from './shade';

function turnFor(hour: number): number {
  return 1 + ((hour - TIME.startHour) * TIME.turnsPerDay) / 24;
}

describe('heat haze', () => {
  const noon = (TIME.sunrise + TIME.sunset) / 2;

  it('shimmers at full strength on open ground at noon in a heat wave', () => {
    const w = emptyWorld();
    w.turn = turnFor(noon);
    w.weather = [{ id: 'hw', kind: 'heatwave', turnsLeft: 10 }];
    const { x, y } = w.vehicles[0].pos;
    expect(cornerLook(w, x, y, sunAt(w.turn)!, w.obstacles).haze).toBe(255);
  });

  it('shimmers harder the hotter the ground', () => {
    const w = emptyWorld();
    const { x, y } = w.vehicles[0].pos;
    const plainNoon = cornerLook(w, x, y, sunAt(turnFor(noon))!, w.obstacles).haze;
    expect(cornerLook(w, x, y, sunAt(turnFor(noon - 2))!, w.obstacles).haze).toBeLessThan(plainNoon);
    w.weather = [{ id: 'hw', kind: 'heatwave', turnsLeft: 10 }];
    expect(cornerLook(w, x, y, sunAt(turnFor(noon))!, w.obstacles).haze).toBeGreaterThan(plainNoon);
  });

  it('does not shimmer in sun too weak to heat a driving engine', () => {
    const w = emptyWorld();
    w.turn = turnFor(TIME.sunrise + 1);
    const { x, y } = w.vehicles[0].pos;
    const sun = sunAt(w.turn)!;
    expect(sunHeatAt(w, { x, y }, sun)).toBeLessThan(HAZE_FROM);
    expect(cornerLook(w, x, y, sun, w.obstacles).haze).toBe(0);
  });

  it('does not shimmer in shade', () => {
    const w = emptyWorld();
    w.turn = turnFor(noon);
    const sun = sunAt(w.turn)!;
    const { x, y } = w.vehicles[0].pos;
    const heights = [...w.terrain.heights];
    const size = w.terrain.size;
    const bx = Math.round(x + sun.dir.x * 3);
    const by = Math.round(y + sun.dir.y * 3);
    for (let j = by - 1; j <= by + 1; j++) for (let i = bx - 1; i <= bx + 1; i++) heights[j * (size + 1) + i] = 50;
    w.terrain = { ...w.terrain, heights };
    expect(cornerLook(w, x, y, sun, w.obstacles).haze).toBe(0);
  });

  it('shades a patch-edge corner behind a rock outside the patch', () => {
    const w = emptyWorld();
    w.turn = turnFor(noon);
    const sun = sunAt(w.turn)!;
    const me = w.vehicles[0].pos;
    const corner = { x: Math.round(me.x + sun.dir.x * 19), y: Math.round(me.y + sun.dir.y * 19) };
    const rock = { x: corner.x + sun.dir.x * 1.5, y: corner.y + sun.dir.y * 1.5 };
    w.obstacles = [...w.obstacles, { id: 'rock-edge', kind: 'rock', pos: rock, r: 1 }];
    const casters = shadeCasters(w, me, 20);
    expect(casters.map((o) => o.id)).toContain('rock-edge');
    expect(cornerLook(w, corner.x, corner.y, sun, casters).haze).toBe(0);
    expect(cornerLook(w, corner.x, corner.y, sun, []).haze).toBeGreaterThan(0);
  });
});

describe('shade patch over frames', () => {
  const noon = (TIME.sunrise + TIME.sunset) / 2;
  const worldAt = (turn: number) => {
    const w = emptyWorld();
    w.turn = turn;
    return w;
  };
  const build = (w: ReturnType<typeof emptyWorld>) => {
    return new ShadeView(w, new THREE.MeshLambertMaterial(), new PlayClock({ stopMs: 1, startMs: 1, stopFolds: 1 }));
  };
  const dump = (v: ShadeView) => ({
    pos: Array.from(v.mesh.geometry.getAttribute('position').array),
    alpha: Array.from(v.mesh.geometry.getAttribute('alpha').array),
    haze: Array.from((v as unknown as { hazeCells: Uint8Array }).hazeCells),
  });
  const FRAMES = Math.ceil(41 / 4);
  const t1 = turnFor(noon);
  const t2 = turnFor(noon - 2);
  const t3 = turnFor(noon + 2);

  it('keeps the old patch until the new one is complete', () => {
    const view = build(worldAt(t1));
    const before = dump(view);
    view.update(worldAt(t2));
    for (let i = 0; i < FRAMES - 1; i++) {
      view.advance();
      expect(dump(view)).toEqual(before);
    }
    view.advance();
    expect(dump(view)).not.toEqual(before);
  });

  it('ends with the patch a synchronous compute gives', () => {
    const view = build(worldAt(t1));
    view.update(worldAt(t2));
    for (let i = 0; i < FRAMES; i++) view.advance();
    expect(dump(view)).toEqual(dump(build(worldAt(t2))));
  });

  it('finishes the running patch, then the latest queued world', () => {
    const view = build(worldAt(t1));
    view.update(worldAt(t2));
    view.advance();
    view.update(worldAt(t3));
    for (let i = 0; i < FRAMES - 1; i++) view.advance();
    expect(dump(view)).toEqual(dump(build(worldAt(t2))));
    for (let i = 0; i < FRAMES; i++) view.advance();
    expect(dump(view)).toEqual(dump(build(worldAt(t3))));
  });
});

describe('one world position varying', () => {
  const stacked = (order: 'haze-first' | 'haze-last') => {
    const material = new THREE.MeshLambertMaterial();
    const play = new PlayClock({ stopMs: 1, startMs: 1, stopFolds: 1 });
    if (order === 'haze-first') new ShadeView(emptyWorld(), material, play);
    NIGHT_POOLS.light(material);
    CLOUD_SHADOWS.shade(material);
    if (order === 'haze-last') new ShadeView(emptyWorld(), material, play);
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <color_fragment>\n#include <aomap_fragment>\n#include <tonemapping_fragment>',
    };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    return shader;
  };
  const count = (text: string, part: string) => text.split(part).length - 1;

  it.each(['haze-first', 'haze-last'] as const)('declares it once per stage and writes it once with %s', (order) => {
    const shader = stacked(order);
    expect(count(shader.vertexShader, 'varying vec2 vWorldXZ;')).toBe(1);
    expect(count(shader.fragmentShader, 'varying vec2 vWorldXZ;')).toBe(1);
    expect(count(shader.vertexShader, 'vWorldXZ = ')).toBe(1);
    expect(shader.vertexShader).not.toMatch(/vPoolXZ|vHazeXZ|vCloudXZ/);
  });

  it('shifts the world position for the lookups and restores it before the color chunk', () => {
    const { fragmentShader } = stacked('haze-last');
    const shifted = fragmentShader.indexOf('#define vWorldXZ (vWorldXZ + hazeShift)');
    const restored = fragmentShader.indexOf('#undef vWorldXZ');
    expect(shifted).toBeGreaterThan(-1);
    expect(restored).toBeGreaterThan(shifted);
    expect(restored).toBeLessThan(fragmentShader.indexOf('#include <color_fragment>'));
  });

  it('writes the ground haze from the shared wave table', () => {
    const { fragmentShader } = stacked('haze-last');
    expect(fragmentShader).toContain(hazeWavesGlsl({ point: 'hazeP', time: 'hazeT', warp: 'hazeWarp', out: 'hazeShift' }));
    expect(count(fragmentShader, 'hazeShift += ')).toBe(HAZE_WAVES.waves.length);
  });
});
