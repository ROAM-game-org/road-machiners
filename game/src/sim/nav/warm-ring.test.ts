import { describe, expect, it } from 'vitest';
import { REGION } from '../../data/region';
import { addVehicle, emptyWorld } from '../testkit';
import { buildCellsAround, navLayer } from './layer';
import { warmRadii, WARM_RING } from '../../phys/turn';
import { START_KITS } from '../../data/start';
import { defaultSetup } from '../settings';
import { newWorld } from '../world';
import { TEST_MAP } from '../../test/map';
import { CHASSIS } from '../../data/chassis';

const SPAN = REGION.navigation.cellTiles;

function builtCells(layer: ReturnType<typeof navLayer>): number[] {
  const cells: number[] = [];
  layer.grid.built.forEach((flag, cell) => flag === 1 && cells.push(cell));
  return cells;
}

describe('bounded cell warm', () => {
  it('builds only cells inside the ring, and only for the asked radii', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const at = w.vehicles.find((v) => v.id === w.player.vehicleId)!.pos;
    const radii = [...new Set(Object.values(CHASSIS).map((c) => c.radius))];
    const [asked, other] = radii;
    const wanted = navLayer(w.terrain, w.obstacles, asked);
    const skipped = navLayer(w.terrain, w.obstacles, other);
    const cx = Math.floor(at.x / SPAN);
    const cy = Math.floor(at.y / SPAN);
    while (buildCellsAround(w.terrain, at, Infinity, 1, [asked]));
    const m = wanted.grid.m;
    const cells = builtCells(wanted);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => Math.abs((c % m) - cx) <= 1 && Math.abs(Math.floor(c / m) - cy) <= 1)).toBe(true);
    expect(builtCells(skipped)).toHaveLength(0);
  });

  it('warms the player radius and the radii of trucks within the far window only', () => {
    const w = emptyWorld({ x: 100, y: 100 });
    const ids = Object.keys(CHASSIS);
    const player = w.vehicles.find((v) => v.id === w.player.vehicleId)!;
    const widest = ids.map((id) => CHASSIS[id as keyof typeof CHASSIS].radius);
    expect(warmRadii(w)).toEqual([CHASSIS[player.chassisId].radius]);
    const otherId = ids.find((id) => CHASSIS[id as keyof typeof CHASSIS].radius !== CHASSIS[player.chassisId].radius)!;
    const far = addVehicle(w, 'trader', otherId, [], { x: 100 + REGION.navigation.farWindow + 50, y: 100 });
    expect(warmRadii(w)).toEqual([CHASSIS[player.chassisId].radius]);
    far.pos = { x: 140, y: 100 };
    expect(warmRadii(w)).toHaveLength(2);
    expect(widest.length).toBeGreaterThan(1);
    expect(WARM_RING).toBe(Math.ceil(REGION.navigation.farWindow / SPAN));
  });
});
