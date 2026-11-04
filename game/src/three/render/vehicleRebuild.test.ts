import { describe, expect, it } from 'vitest';
import { PAINT, PAINT_SCHEMES } from '../../data/chassis';
import { restFrame } from '../../phys/frames';
import { bareVehicle } from '../../sim/factory';
import type { World } from '../../sim/types';
import { newWorld } from '../../sim/world';
import { PLAIN_KIT } from '../../sim/testkit';
import { defaultSetup } from '../../sim/settings';
import { TEST_MAP } from '../../test/map';
import { loadModels } from './models';
import { VehicleView, type RebuildBudget } from './vehicle';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const STALLED: RebuildBudget = { take: () => false, ready: () => true };

const world: World = newWorld(1337, PLAIN_KIT, TEST_MAP, defaultSetup('roaming'));
const truck = (chassisId: string) => {
  const v = bareVehicle(structuredClone(world), { faction: 'player', chassisId, pos: { x: 40, y: 40 }, heading: 0, brain: null });
  v.id = 'swapped';
  return v;
};

describe('a truck view that swaps chassis', () => {
  it.each([['niva', 'sorokonoga'], ['sorokonoga', 'niva']])('keeps posing its %s build on %s frames until the new build is done', (from, to) => {
    const view = new VehicleView(truck(from), true, PAINT.standard, 'world');
    const next = truck(to);
    view.update(next, true, PAINT.standard, STALLED);
    expect(() => view.pose(restFrame(world, next), 0)).not.toThrow();
    view.update(next, true, PAINT.standard);
    expect(() => view.pose(restFrame(world, next), 0)).not.toThrow();
  });

  it('still throws on a frame that does not fit a finished build', () => {
    const view = new VehicleView(truck('niva'), true, PAINT.standard, 'world');
    expect(() => view.pose(restFrame(world, truck('sorokonoga')), 0)).toThrow(/rear unit/);
  });
});

describe('a truck view that compares what it was built from', () => {
  const looks = (view: VehicleView) => view.root.children[0];

  it('keeps its build when asked again with the same items, chassis and paint', () => {
    const v = truck('niva');
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    const built = looks(view);

    view.update(v, true, PAINT.standard);

    expect(looks(view)).toBe(built);
  });

  it('rebuilds when a new items array has a part worn to a new step', () => {
    const v = truck('niva');
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    const built = looks(view);
    const worn = structuredClone(v);
    for (const it of worn.items) if (it.kind === 'part') it.part.hp = 0;

    view.update(worn, true, PAINT.standard);

    expect(looks(view)).not.toBe(built);
  });

  it('rebuilds when the player repaints the truck', () => {
    const v = truck('niva');
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    const built = looks(view);
    const other = PAINT_SCHEMES[1];

    view.update(v, true, other);

    expect(looks(view)).not.toBe(built);
  });

  it('keeps finishing a stalled rebuild when asked again with the same truck', () => {
    const view = new VehicleView(truck('niva'), true, PAINT.standard, 'world');
    const next = truck('sorokonoga');
    const built = looks(view);

    view.update(next, true, PAINT.standard, STALLED);
    view.update(next, true, PAINT.standard);

    expect(looks(view)).not.toBe(built);
  });
});
