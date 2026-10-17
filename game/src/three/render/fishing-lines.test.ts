import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../data/physics';
import { beginFishing, fishActions } from '../../sim/fishing';
import { editableTerrain, emptyWorld } from '../../sim/testkit';
import type { World } from '../../sim/types';
import { FishingLinesView } from './lines';
import type { VehicleView } from './vehicle';

function pondWorld(): World {
  const w = emptyWorld({ x: 38.5, y: 41.5 });
  const terrain = editableTerrain(w);
  for (let y = 40; y < 44; y++) for (let x = 40; x < 44; x++) terrain.types[y * terrain.size + x] = 'dirtyWater';
  w.vehicles[0].speed = 0;
  w.player.supplies = 0;
  return w;
}

function viewsOf(w: World): Map<string, VehicleView> {
  const S = PHYSICS.metersPerTile;
  const me = w.vehicles[0];
  return new Map([[me.id, { center: () => ({ x: me.pos.x * S, y: 0, z: me.pos.y * S }) } as unknown as VehicleView]]);
}

describe('fishing lines', () => {
  it('draws a line and a float while a truck fishes and drops them when the job ends', () => {
    const w = pondWorld();
    const lines = new FishingLinesView();
    lines.update(w, viewsOf(w));
    expect(lines.count()).toBe(0);
    beginFishing(w, w.vehicles[0], fishActions(w)[0].pool);
    lines.update(w, viewsOf(w));
    expect(lines.count()).toBe(1);
    expect(lines.root.children).toHaveLength(2);
    w.vehicles[0].job = null;
    lines.update(w, viewsOf(w));
    expect(lines.count()).toBe(0);
    expect(lines.root.children).toHaveLength(0);
  });

  it('draws none for a search job', () => {
    const w = pondWorld();
    const lines = new FishingLinesView();
    w.vehicles[0].job = { kind: 'search', stockId: 'x', turnsLeft: 3, total: 3 };
    lines.update(w, viewsOf(w));
    expect(lines.count()).toBe(0);
  });

  it('draws none for a truck that is not drawn', () => {
    const w = pondWorld();
    const lines = new FishingLinesView();
    beginFishing(w, w.vehicles[0], fishActions(w)[0].pool);
    lines.update(w, new Map());
    expect(lines.count()).toBe(0);
  });

  it('ends the float on the water tile of the pool', () => {
    const w = pondWorld();
    const lines = new FishingLinesView();
    beginFishing(w, w.vehicles[0], fishActions(w)[0].pool);
    lines.update(w, viewsOf(w));
    const float = lines.root.children[1];
    expect(float.position.x / PHYSICS.metersPerTile).toBeCloseTo(40.5);
    expect(float.position.z / PHYSICS.metersPerTile).toBeCloseTo(41.5);
  });
});
