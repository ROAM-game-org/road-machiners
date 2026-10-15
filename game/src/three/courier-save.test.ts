import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../data/encounters';
import { NPCS } from '../data/npcs';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { raiseCalls } from '../sim/dialogue';
import { emptyHidden } from '../sim/salvage';
import { defaultSetup } from '../sim/settings';
import { addVehicle, npcBrain } from '../sim/testkit';
import type { World } from '../sim/types';
import { refreshVision } from '../sim/vision';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function helpedWorld(): { w: World; npcId: string } {
  const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
  w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  const me = playerVehicle(w);
  const npc = addVehicle(w, 'couriers', 'scout', ['stockEngine'], { x: me.pos.x + 6, y: me.pos.y });
  npc.brain = npcBrain('courier', npc.pos, ['courier']);
  npc.resources!.money = 30000;
  w.player.discovered = [];
  w.salvage = [{ id: 'wreck4', pos: { x: me.pos.x + 14, y: me.pos.y }, radius: 0.6, goods: {}, parts: [], hidden: { ...emptyHidden(), goods: { scrap: 2 } } }];
  w.turn = ENCOUNTERS.storyGapTurns * 3;
  w.player.encounters = { next: w.turn + 50, pending: null, story: { driver: npc.id, beat: 'helped', turn: w.turn - ENCOUNTERS.storyGapTurns, aidValue: 700, free: true } };
  refreshVision(w);
  return { w, npcId: npc.id };
}

function slotsWith(save: object): SaveSlots {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...save, savedAt: 1000, runId: 'run-1' });
  return slots;
}

describe('a courier story across a save', () => {
  it('raises the same beat with the same values after a reload, and the load awards nothing', () => {
    const { w, npcId } = helpedWorld();
    const loaded = loadWorld(slotsWith(saveOf(w)), 'auto', TEST_MAP)!;

    expect(loaded.player.encounters).toEqual(w.player.encounters);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
    expect(loaded.vehicles.find((v) => v.id === npcId)!.resources!.money).toBe(30000);

    raiseCalls(w);
    raiseCalls(loaded);
    expect(w.player.call).toMatchObject({ with: npcId, topic: 'courierThanks' });
    expect(loaded.player.call).toMatchObject({ with: npcId, topic: 'courierThanks' });
    expect(loaded.player.call?.vars).toEqual(w.player.call?.vars);
    expect(loaded.player.call?.line).toEqual(w.player.call?.line);
  });

  it('keeps a story that is waiting for its gap', () => {
    const { w, npcId } = helpedWorld();
    w.player.encounters.story!.turn = w.turn - 5;
    const loaded = loadWorld(slotsWith(saveOf(w)), 'auto', TEST_MAP)!;
    raiseCalls(loaded);
    expect(loaded.player.call).toBeNull();
    expect(loaded.player.encounters.story).toMatchObject({ driver: npcId, beat: 'helped' });
  });

  it('keeps a pending encounter and its pacing', () => {
    const { w, npcId } = helpedWorld();
    w.player.encounters = { next: w.turn + 40, pending: { encounter: 'tale', driver: npcId, until: w.turn + 6 }, story: null };
    const loaded = loadWorld(slotsWith(saveOf(w)), 'auto', TEST_MAP)!;
    expect(loaded.player.encounters).toEqual(w.player.encounters);
  });
});
