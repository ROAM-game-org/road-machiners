import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PAINT } from '../data/chassis';
import { playerVehicle } from '../sim/damage';
import { bareVehicle } from '../sim/factory';
import { LIVE_REACH } from '../sim/fidelity';
import { defaultSetup } from '../sim/settings';
import { PLAIN_KIT } from '../sim/testkit';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadModels } from './render/models';
import type { RebuildBudget } from './render/vehicle';
import { TruckViews } from './truck-views';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

function setUp() {
  const world: World = newWorld(1337, PLAIN_KIT, TEST_MAP, defaultSetup('roaming'));
  const me = playerVehicle(world).pos;
  const truck = (id: string, ahead: number) => {
    const v = bareVehicle(world, { faction: 'player', chassisId: 'niva', pos: { x: me.x + ahead, y: me.y }, heading: 0, brain: null });
    v.id = id;
    return v;
  };
  const budget = { open: true };
  const rebuilds: RebuildBudget = { take: () => budget.open, ready: () => true };
  const scene = new THREE.Scene();
  return { world, truck, budget, scene, trucks: new TruckViews(scene, rebuilds) };
}

describe('truck views', () => {
  it('builds a hidden truck in physics range out of the scene, and shows it the first frame it is seen', () => {
    const { world, truck, budget, scene, trucks } = setUp();
    const near = truck('near', LIVE_REACH / 2);
    trucks.park(world, [near]);
    trucks.prune();
    expect(trucks.views.has('near')).toBe(false);
    expect(scene.children).toHaveLength(0);
    budget.open = false;
    const view = trucks.viewOf('near', near, true, PAINT.standard);
    expect(view?.built).toBe(true);
    expect(scene.children).toContain(view?.root);
  });

  it('keeps the built view of a truck that leaves sight in range, and drops the view of a truck out of range', () => {
    const { world, truck, budget, scene, trucks } = setUp();
    const near = truck('near', LIVE_REACH / 2);
    const far = truck('far', LIVE_REACH + 5);
    const nearView = trucks.viewOf('near', near, true, PAINT.standard);
    trucks.viewOf('far', far, true, PAINT.standard);
    trucks.prune();
    trucks.park(world, [near, far]);
    trucks.prune();
    expect(scene.children).toHaveLength(0);
    expect(trucks.views.size).toBe(0);
    budget.open = false;
    expect(trucks.viewOf('near', near, true, PAINT.standard)).toBe(nearView);
    expect(trucks.viewOf('far', far, true, PAINT.standard)).toBeNull();
  });
});
