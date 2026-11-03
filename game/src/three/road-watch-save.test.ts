import { describe, expect, it } from 'vitest';
import { TOPICS } from '../data/dialogue';
import { callVehicle } from '../sim/dialogue';
import { chooseLine } from '../sim/dialogue-testkit';
import { remember } from '../sim/memory';
import { addVehicle, emptyWorld, npcBrain } from '../sim/testkit';
import type { World } from '../sim/types';
import { TEST_MAP } from '../test/map';
import { resolve } from '../text/resolve';
import { lineText } from '../ui/dialogue';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';
import FORMAT_2_124 from './save-fixtures/format-2-124.json';

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', w, 'run', 1);
  const loaded = loadWorld(slots, 'auto', TEST_MAP);
  if (!loaded) throw new Error('The save did not load');
  return loaded;
}

function toldWorld(): World {
  const w = emptyWorld({ x: 30, y: 30 });
  w.player.perks = ['roadWatch'];
  const teller = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 36, y: 30 });
  teller.brain = npcBrain('trader', teller.pos, ['trader']);
  const raider = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], { x: 300, y: 300 });
  raider.brain = npcBrain('buggy', raider.pos, ['raider']);
  remember(w, teller, { kind: 'sighting', vehicle: raider.id, at: { x: 60, y: 30 }, heading: 0 });
  w.turn += 40;
  return chooseLine(callVehicle(w, teller.id), TOPICS.roadWatch.ask!.say);
}

const words = (w: World): string => resolve(lineText(w.player.call!.line.line, w.player.call!.line.vars), 'en');

describe('a road watch answer across a save', () => {
  it('reads the same words after a reload and the load awards nothing', () => {
    const w = toldWorld();

    const loaded = reload(w);

    expect(words(loaded)).toBe(words(w));
    expect(loaded.player.call?.vars).toEqual(w.player.call?.vars);
    expect({ money: loaded.player.money, xp: loaded.player.xp, events: loaded.events }).toEqual({ money: w.player.money, xp: w.player.xp, events: [] });
  });
});

describe('save migration 134 to 135, a call may hold a raider sighting', () => {
  it('sits after the work day XP step and changes no data', () => {
    const step = TINY_STEPS.find((s) => s.name === 'marksRoadWatchCalls')!;
    expect(TINY_STEPS[134 - TINY_FROM]).toBe(step);
    const old = structuredClone(FORMAT_2_124) as SavedJson;
    expect(step.step(structuredClone(old))).toEqual(old);
  });
});
