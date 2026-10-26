import { describe, expect, it } from 'vitest';
import FORMAT_2_116 from './save-fixtures/format-2-116.json';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { callVehicle, currentOptions, chooseOption } from '../sim/dialogue';
import { defaultSetup } from '../sim/settings';
import { addVehicle, npcBrain } from '../sim/testkit';
import { refreshVision } from '../sim/vision';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = typeof FORMAT_2_116;

const step = (world: unknown): Saved => TINY_STEPS[116 - TINY_FROM].step(structuredClone(world) as SavedJson) as unknown as Saved;

describe('save migration 116 to 117, radio groups and seen replies', () => {
  it('opens a call at the hub with nothing asked and gives the quests an empty seen', () => {
    const next = step(FORMAT_2_116) as unknown as { player: { call: Record<string, unknown>; quests: Record<string, unknown>; money: number } };
    expect(next.player.call).toMatchObject({ with: 'v40', node: 'hub', group: null, asked: [] });
    expect(next.player.quests.seen).toEqual({});
    expect(next.player.money).toBe(1200);
  });

  it('leaves a save with no call and no quests alone', () => {
    const bare = { turn: 5, player: { money: 3, call: null } };
    expect(step(bare)).toEqual(bare);
  });
});

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('an open group page across a save', () => {
  it('load keeps the open group and what was asked, and awards nothing', () => {
    let w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const me = playerVehicle(w);
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: me.pos.x + 4, y: me.pos.y });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    refreshVision(w);
    w = callVehicle(w, npc.id);
    const group = currentOptions(w).findIndex((o) => o.group);
    expect(group).toBeGreaterThanOrEqual(0);
    w = chooseOption(w, group);
    w.events = [];
    const loaded = reload(w);
    expect(loaded.player.call).toEqual(w.player.call);
    expect(loaded.player.call!.group).not.toBeNull();
    expect(currentOptions(loaded)).toEqual(currentOptions(w));
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});

describe('seen replies across a save', () => {
  it('load keeps what a talk marked seen and awards nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    w.player.quests.seen = { bowl_dag: { lang: 'en', replies: { 'bowl_dag.0.hub.c-2': 'k3f9' } } };
    w.events = [];
    const loaded = reload(w);
    expect(loaded.player.quests.seen).toEqual(w.player.quests.seen);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
