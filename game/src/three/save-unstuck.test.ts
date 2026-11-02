import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { defaultSetup } from '../sim/settings';
import { getUnstuck } from '../sim/unstuck';
import { endTurn, newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { memoryBackend, SaveSlots } from './save-db';
import { loadWorld, saveWorld } from './save';

describe('saving after Get unstuck', () => {
  it('loads the same world and awards nothing', () => {
    const start = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    const lost = { x: TEST_MAP.terrain.size / 2, y: TEST_MAP.terrain.size / 2 };
    playerVehicle(start).pos = lost;
    const world = endTurn(getUnstuck(start), () => {});
    world.events = [];
    const slots = new SaveSlots(memoryBackend(), new Map());
    saveWorld(slots, world, 'run-1', 1, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded).toEqual(world);
    expect(loaded.events).toEqual([]);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.player.xp).toBe(world.player.xp);
    expect(playerVehicle(loaded).strandedTurns).toBe(playerVehicle(world).strandedTurns);
  });
});
