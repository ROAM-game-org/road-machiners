import { describe, expect, it } from 'vitest';
import FORMAT_2_138 from './save-fixtures/format-2-138.json';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { followTruck } from '../sim/follow';
import { defaultSetup } from '../sim/settings';
import { fallbackFaction } from '../sim/spawn';
import { NPCS } from '../data/npcs';
import { addVehicle } from '../sim/testkit';
import { refreshVision } from '../sim/vision';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { FOLDED_AND_TINY_STEPS as TINY_STEPS, type SavedJson } from './save-migrations';

const followStep = TINY_STEPS.find((s) => s.name === 'withFollowOrder')!;

describe('save migration withFollowOrder, a move order may name the truck it follows', () => {
  it('leaves the world as it was', () => {
    expect(followStep.step(structuredClone(FORMAT_2_138) as SavedJson)).toEqual(FORMAT_2_138);
  });
});

describe('following across a save', () => {
  it('load gives back the same follow order and awards nothing', () => {
    let w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const me = playerVehicle(w);
    const trader = addVehicle(w, fallbackFaction(NPCS.convoy), 'hauler', ['mg', 'workhorseDiesel', 'haulingRack'], { x: me.pos.x + 10, y: me.pos.y });
    refreshVision(w);
    w = followTruck(w, trader.id);
    w.events = [];
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(playerVehicle(loaded).order).toEqual(playerVehicle(w).order);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
