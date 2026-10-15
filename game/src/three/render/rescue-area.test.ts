import { describe, expect, it } from 'vitest';
import { CONTRACTS } from '../../data/market';
import { PHYSICS } from '../../data/physics';
import { ICARUS_KEY } from '../../sim/atlas';
import type { Contract } from '../../sim/market';
import type { Terrain } from '../../sim/terrain';
import { emptyWorld } from '../../sim/testkit';
import { RescueAreaView } from './rescue-area';

const terrain: Terrain = { size: 100, heights: Array(101 * 101).fill(0), types: Array(100 * 100).fill('road'), atlas: ICARUS_KEY };

const SCREEN = { width: 800, height: 600 };

const rescue = (id: string, fulfilled: boolean): Contract => ({ id, shop: 'bowl', kind: 'rescue', client: 'v1', driver: 'Jed Cobb', need: 'fuel', area: { x: 50, y: 50 }, reward: 100, deadline: 900, window: 400, tier: 1, fulfilled });

describe('rescue area ring', () => {
  it('draws one dashed ring of the area radius around each held unmet rescue', () => {
    const view = new RescueAreaView(terrain);
    const world = emptyWorld();
    world.player.contracts = [rescue('ct-1', false), rescue('ct-2', true)];
    view.show(world, SCREEN);
    expect(view.root.children).toHaveLength(1);
    const ring = view.root.children[0] as unknown as { material: { dashed: boolean }; geometry: { attributes: Record<string, { array: Float32Array }> } };
    expect(ring.material.dashed).toBe(true);
    const start = ring.geometry.attributes.instanceStart.array;
    expect(Math.hypot(start[0] - 50 * PHYSICS.metersPerTile, start[2] - 50 * PHYSICS.metersPerTile)).toBeCloseTo(CONTRACTS.rescue.areaRadius * PHYSICS.metersPerTile);
  });

  it('is empty once the rescue is met, dropped or never held, and keeps its rings while the set is the same', () => {
    const view = new RescueAreaView(terrain);
    const world = emptyWorld();
    world.player.contracts = [rescue('ct-1', false)];
    view.show(world, SCREEN);
    const ring = view.root.children[0];
    view.show(world, SCREEN);
    expect(view.root.children[0]).toBe(ring);
    world.player.contracts = [rescue('ct-1', true)];
    view.show(world, SCREEN);
    expect(view.root.children).toHaveLength(0);
  });
});
