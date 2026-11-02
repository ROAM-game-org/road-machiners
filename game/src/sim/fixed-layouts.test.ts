import { describe, expect, it } from 'vitest';
import { HAULER_KIT, START_KITS } from '../data/start';
import { makeVehicle } from './factory';
import { gridOf, layoutError } from './grid';
import { emptyWorld } from './testkit';

function built(chassis: string, parts: string[], placed: { defId: string; x: number; y: number; rot: 0 | 1 | 2 | 3 }[]) {
  const world = emptyWorld();
  return makeVehicle(world, {
    faction: 'player',
    chassisId: chassis,
    parts: [...placed.map(({ defId, ...at }) => ({ defId, wear: 0, at })), ...parts.map((defId) => ({ defId, wear: 0 }))],
    spares: [],
    cargo: {},
    pos: { x: 50, y: 50 },
    heading: 0,
    brain: null,
  });
}

describe('fixed layouts in data', () => {
  it.each(Object.entries(START_KITS))('the %s start kit builds without a barrel clash', (_, kit) => {
    const v = built(kit.chassis, kit.parts, kit.placed ?? []);
    expect(layoutError(gridOf(v), v.items)).toBeNull();
  });

  it('the hauler kit builds without a barrel clash', () => {
    const v = built(HAULER_KIT.chassis, HAULER_KIT.parts, []);
    expect(layoutError(gridOf(v), v.items)).toBeNull();
  });
});
