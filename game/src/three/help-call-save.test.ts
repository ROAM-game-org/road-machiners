import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { joinPlayerFight } from '../sim/help-call';
import { topGoal } from '../sim/npc-activities';
import { defaultSetup } from '../sim/settings';
import { addState } from '../sim/states';
import { addVehicle, npcBrain, startCombat } from '../sim/testkit';
import type { World } from '../sim/types';
import { refreshVision } from '../sim/vision';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('the help call across a save', () => {
  it('loads a refusal and a helper that answered a call the same and awards nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
    const me = playerVehicle(w);
    const foe = addVehicle(w, 'scrapjaw', 'scout', ['mg', 'stockEngine'], { x: me.pos.x - 4, y: me.pos.y + 4 });
    foe.brain = npcBrain('buggy', foe.pos, ['raider']);
    const helper = addVehicle(w, 'bowl', 'scout', ['mg', 'stockEngine'], { x: me.pos.x + 4, y: me.pos.y });
    helper.brain = npcBrain('trader', helper.pos, ['trader']);
    const other = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: me.pos.x + 4, y: me.pos.y + 6 });
    other.brain = npcBrain('trader', other.pos, ['trader']);
    w.player.standing.bowl = 60;
    startCombat(w, foe, me);
    refreshVision(w);
    joinPlayerFight(w, helper);
    addState(w, 'helpRefused', other.id, me.id, { kind: 'none' });
    w.events = [];
    const loaded = reload(w);
    expect(loaded.states).toEqual(w.states);
    expect(topGoal(loaded.vehicles.find((v) => v.id === helper.id)!)?.reason).toBe('answeredCall');
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
