import { describe, expect, it } from 'vitest';
import FORMAT_2_116 from './save-fixtures/format-2-116.json';
import { START_KITS } from '../data/start';
import { settleMeetings } from '../sim/ai';
import { defaultSetup } from '../sim/settings';
import { addVehicle, npcBrain, testDrive } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

const step = (world: unknown): SavedJson => TINY_STEPS[116 - TINY_FROM].step(structuredClone(world) as SavedJson);

function roundTrip(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

function meetingWorld(): World {
  const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
  const me = w.vehicles.find((v) => v.id === w.player.vehicleId)!;
  w.vehicles = [me];
  const a = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: me.pos.x + 4, y: me.pos.y + 4 }, 0);
  const b = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: me.pos.x + 17, y: me.pos.y + 4 }, Math.PI);
  a.brain = npcBrain('trader', a.pos, ['trader']);
  b.brain = npcBrain('trader', b.pos, ['trader']);
  a.speed = 2.1;
  b.speed = 4.14;
  a.order = { kind: 'through', dest: { x: a.pos.x + 60, y: a.pos.y } };
  b.order = { kind: 'through', dest: { x: b.pos.x - 60, y: b.pos.y } };
  return w;
}

describe('save migration 116 to 117, saves with no meetings stay as they are', () => {
  it('leaves every vehicle without a role', () => {
    const next = step(FORMAT_2_116) as unknown as { vehicles: { yieldsTo?: string[] }[] };
    expect(next).toEqual(FORMAT_2_116);
    expect(next.vehicles.every((v) => v.yieldsTo === undefined)).toBe(true);
  });
});

describe('a meeting in a save', () => {
  it('load gives back the same roles and awards nothing', () => {
    const w = meetingWorld();
    settleMeetings(w);
    const giver = w.vehicles.find((v) => v.yieldsTo)!;
    expect(giver.yieldsTo).toHaveLength(1);
    const loaded = roundTrip(w);
    expect(loaded.vehicles.find((v) => v.id === giver.id)!.yieldsTo).toEqual(giver.yieldsTo);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
    expect(loaded.events).toEqual([]);
  });

  it('the next turn matches an unloaded world', () => {
    const w = meetingWorld();
    settleMeetings(w);
    const loaded = roundTrip(w);
    endTurn(w, testDrive);
    endTurn(loaded, testDrive);
    const roles = (x: World) => x.vehicles.map((v) => [v.id, v.yieldsTo]);
    expect(roles(loaded)).toEqual(roles(w));
  });
});
