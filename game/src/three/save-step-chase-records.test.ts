import { describe, expect, it } from 'vitest';
import FORMAT_2_120 from './save-fixtures/chase-records-input.json';
import { START_KITS } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { sizeUpGoal } from '../sim/look-over';
import { defaultSetup } from '../sim/settings';
import { addVehicle, npcBrain } from '../sim/testkit';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

const chaseStep = TINY_STEPS.find((s) => s.name === 'withChaseRecords')!;
const migrated = (): SavedJson[] => chaseStep.step(structuredClone(FORMAT_2_120) as SavedJson).vehicles as SavedJson[];
const goalsOf = (vehicles: SavedJson[], id: string): SavedJson[] => ((vehicles.find((v) => v.id === id)!.brain as SavedJson).goals as SavedJson[]);

function roundTrip(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('save migration 122 to 123, size-ups and investigations keep a chase record', () => {
  it('sits after the meeting roles step', () => {
    expect(TINY_STEPS[122 - TINY_FROM]).toBe(chaseStep);
  });

  it('starts a size-up chase at the save turn, from the truck to where it last saw its target', () => {
    expect(goalsOf(migrated(), 'v2')[1].chase).toEqual({ turn: 3120, gap: 13 });
  });

  it('starts an investigation chase from the truck to the heard spot', () => {
    expect(goalsOf(migrated(), 'v3')[0].chase).toEqual({ turn: 3120, gap: 40 });
  });

  it('leaves every other goal and every truck with no brain as it was', () => {
    const vehicles = migrated();
    expect(goalsOf(vehicles, 'v2')[0]).toEqual(FORMAT_2_120.vehicles[1].brain!.goals[0]);
    expect(vehicles[0]).toEqual(FORMAT_2_120.vehicles[0]);
    expect(vehicles[3]).toEqual(FORMAT_2_120.vehicles[3]);
  });
});

describe('a chase record in a save', () => {
  it('load gives back the same record and awards nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const player = playerVehicle(w);
    w.vehicles = [player];
    const raider = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: player.pos.x + 12, y: player.pos.y }, Math.PI);
    raider.brain = npcBrain('buggy', raider.pos, ['raider']);
    raider.brain.goals = [sizeUpGoal(w, raider, player)];
    const loaded = roundTrip(w);
    expect(loaded.vehicles.find((v) => v.id === raider.id)!.brain!.goals).toEqual(raider.brain.goals);
    expect(raider.brain.goals[0].chase).toEqual({ turn: w.turn, gap: 12 });
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
