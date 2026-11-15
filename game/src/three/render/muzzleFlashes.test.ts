import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MuzzleFlashes } from './fx';
import { MUZZLE_FLASH } from './particles/blasts';

const STEP = 1 / 60;
const muzzle = { pos: { x: 0, y: 1, z: 0 }, dir: { x: 1, y: 0, z: 0 } };

function setup() {
  const scene = new THREE.Scene();
  const flashes = new MuzzleFlashes(scene);
  const meshes = () => scene.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
  const shown = () => meshes().filter((m) => m.visible);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += STEP) flashes.tick(STEP);
  };
  return { flashes, meshes, shown, run };
}

describe('muzzle flash star', () => {
  it('stays visible for 0.13 s and is gone after 0.15 s', () => {
    const { flashes, shown, run } = setup();
    flashes.show(muzzle, 1);
    run(0.13);
    expect(shown()).toHaveLength(1);
    run(0.02);
    expect(shown()).toHaveLength(0);
  });

  it('shares its life with the glow', () => {
    expect(MUZZLE_FLASH.star).toBeCloseTo(0.14);
    expect(MUZZLE_FLASH.glow).toBeCloseTo(0.2);
  });

  it('does not age while play time is paused', () => {
    const { flashes, shown, run } = setup();
    flashes.show(muzzle, 1);
    run(0.05);
    const scale = shown()[0].scale.x;
    for (let i = 0; i < 100; i++) flashes.tick(0);
    expect(shown()).toHaveLength(1);
    expect(shown()[0].scale.x).toBe(scale);
  });

  it('shrinks from full size to 0.3 of it over its life', () => {
    const { flashes, shown, run } = setup();
    flashes.show(muzzle, 2);
    expect(shown()[0].scale.x).toBe(2);
    run(MUZZLE_FLASH.star - STEP);
    expect(shown()[0].scale.x).toBeGreaterThan(0.6);
    expect(shown()[0].scale.x).toBeLessThan(0.75);
  });

  it('shows every flash a full pool can hold in one frame', () => {
    const { flashes, meshes, shown } = setup();
    const pool = meshes().length;
    for (let i = 0; i < pool; i++) flashes.show(muzzle, 1);
    expect(shown()).toHaveLength(pool);
  });
});
