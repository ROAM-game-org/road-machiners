import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { askTopic, callVehicle, currentOptions } from '../sim/dialogue';
import { playerVehicle } from '../sim/damage';
import { addVehicle, emptyWorld, npcBrain } from '../sim/testkit';
import { refreshVision } from '../sim/vision';
import { TEST_MAP } from '../test/map';
import type { World } from '../sim/types';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS } from './save-migrations';

function callOnHelpTrade(): World {
  const road = REGION.roads[0];
  const at = road[Math.floor(road.length / 2)];
  const world = emptyWorld({ x: at.x, y: at.y });
  const npc = addVehicle(world, 'independent', 'scout', ['stockEngine'], { x: at.x + 6, y: at.y });
  npc.brain = npcBrain('trader', npc.pos, ['trader']);
  refreshVision(world);
  const opened = callVehicle(world, npc.id);
  const next = structuredClone(opened);
  next.player.call!.group = 'helpTrade';
  next.player.call!.asked = ['trade'];
  return next;
}

function reloadBefore(w: World, stepName: string): World {
  const minor = TINY_FROM + TINY_STEPS.findIndex((s) => s.name === stepName);
  const envelope = JSON.parse(JSON.stringify(saveOf(w)));
  const older = { ...envelope, format: { ...envelope.format, minor }, steps: { ...envelope.steps, names: envelope.steps.names.slice(0, minor - TINY_FROM) } };
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...older, savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('save migration withSpokenRadio, the radio menu gains new folders', () => {
  it('loads a call that stood on the help and trade page as a valid page and awards nothing', () => {
    const w = callOnHelpTrade();
    expect(w.player.call?.group).toBe('helpTrade');

    const loaded = reloadBefore(w, 'withSpokenRadio');

    expect(loaded.player.call).toEqual(w.player.call);
    const options = currentOptions(loaded);
    expect(options.length).toBeGreaterThan(1);
    expect(options[options.length - 1].back).toBe(true);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
    expect(loaded.events).toEqual([]);
  });

  it('lets the loaded call be asked on and hung up like the saved one', () => {
    const w = callOnHelpTrade();
    const loaded = reloadBefore(w, 'withSpokenRadio');
    const asked = askTopic(loaded, 'directions');
    expect(asked.player.call?.topic).toBe('directions');
    expect(playerVehicle(asked).id).toBe(playerVehicle(w).id);
  });
});
