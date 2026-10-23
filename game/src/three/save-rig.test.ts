import { describe, expect, it } from 'vitest';
import { haulerOf } from '../sim/damage';
import { highwayHash } from '../sim/highway';
import { frontAhead } from '../sim/rig';
import { furyRoadWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { TEST_MAP } from '../test/map';
import { loadWorld, SaveError, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function slotsOf(world: World): SaveSlots {
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', world, 'run-1', 1000);
  return slots;
}

type Envelope = { format: { major: number; minor: number }; world: { vehicles: { id: string; pos: { x: number; y: number }; heading: number; bend?: number }[] } };

describe('a saved rig', () => {
  it('gives back the bend of a folded hauler and awards nothing on load', () => {
    const world = furyRoadWorld(21);
    haulerOf(world).bend = 0.42;

    const loaded = loadWorld(slotsOf(world), 'auto', TEST_MAP)!;

    expect(haulerOf(loaded).bend).toBe(0.42);
    expect(loaded).toEqual(world);
    expect(loaded.events).toEqual([]);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.player.xp).toBe(world.player.xp);
  });

  it('moves the hauler of a live run saved before the swivel onto its tractor and loads it on its own highway', () => {
    const world = furyRoadWorld(21);
    const hauler = haulerOf(world);
    const slots = slotsOf(world);
    const envelope = slots.get('auto') as unknown as Envelope;
    const old = envelope.world.vehicles.find((v) => v.id === hauler.id)!;
    const middle = { x: old.pos.x - Math.cos(old.heading) * frontAhead(hauler.chassisId), y: old.pos.y - Math.sin(old.heading) * frontAhead(hauler.chassisId) };
    old.pos = middle;
    delete old.bend;
    envelope.format = { ...envelope.format, minor: 80 };
    slots.put('auto', envelope as never);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.mapHash).toBe(highwayHash(21, 0));
    expect(haulerOf(loaded).bend).toBe(0);
    expect(haulerOf(loaded).pos.x).toBeCloseTo(hauler.pos.x, 2);
    expect(haulerOf(loaded).pos.y).toBeCloseTo(hauler.pos.y, 2);
  });

  it('refuses a rig without a bend', () => {
    const world = furyRoadWorld(21);
    const slots = slotsOf(world);
    const envelope = slots.get('auto') as unknown as Envelope;
    delete envelope.world.vehicles.find((v) => v.id === haulerOf(world).id)!.bend;
    slots.put('auto', envelope as never);

    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(SaveError);
  });
});
