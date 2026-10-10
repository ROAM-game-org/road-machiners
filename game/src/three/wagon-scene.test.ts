import { describe, expect, it } from 'vitest';
import { WAGON_SEVEN } from '../data/salvage';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { leaveQuest, QUESTS, questView, startQuest } from '../sim/quests';
import { searchTurn } from '../sim/search';
import { defaultSetup } from '../sim/settings';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

const WAGON_SCENE = 'wagon_seven';

function freshWorld(): World {
  const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
  w.events = [];
  return w;
}

function finishSearch(w: World, stockId: string): void {
  searchTurn(w, playerVehicle(w), { kind: 'search', stockId, turnsLeft: 1, total: 1 });
}

function otherStock(w: World): string {
  const other = w.salvage.find((s) => s.id !== WAGON_SEVEN);
  if (!other) throw new Error('The test world has no other salvage');
  return other.id;
}

describe('the wagon Seven scene', () => {
  it('opens at the wagon when the player finishes searching it, after the search is logged', () => {
    const w = freshWorld();
    finishSearch(w, WAGON_SEVEN);
    expect(w.player.scavenged).toContain(WAGON_SEVEN);
    expect(w.events).toContainEqual({ t: 'searched', stock: WAGON_SEVEN });
    expect(questView(w, QUESTS).quest).toBe(WAGON_SCENE);
    expect(w.player.quests.world).toEqual({ wagon_seen: true });
  });

  it('opens once, and a second search of the wagon opens nothing', () => {
    const w = freshWorld();
    finishSearch(w, WAGON_SEVEN);
    w.player.quests = leaveQuest(w).player.quests;
    finishSearch(w, WAGON_SEVEN);
    expect(w.player.quests.live).toBeNull();
  });

  it('opens nothing for any other wreck', () => {
    const w = freshWorld();
    finishSearch(w, otherStock(w));
    expect(w.player.quests.live).toBeNull();
    expect(w.player.quests.world).toEqual({});
  });

  it('waits while another quest is open, leaves it open and opens on the next search', () => {
    const w = startQuest(freshWorld(), QUESTS, 'bowl_hattie', 'start');
    const before = w.player.quests.session;
    finishSearch(w, WAGON_SEVEN);
    expect(w.player.quests.session).toEqual(before);
    expect(w.player.quests.world.wagon_seen).toBeUndefined();
    w.player.quests = leaveQuest(w).player.quests;
    finishSearch(w, WAGON_SEVEN);
    expect(questView(w, QUESTS).quest).toBe(WAGON_SCENE);
  });

  it('saves and loads on the open scene with the same choices and no award', () => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    const w = freshWorld();
    finishSearch(w, WAGON_SEVEN);
    writeSave(slots, 'auto', w, 'run', 1);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('The save did not load');
    expect(loaded.player.quests.session).toEqual(w.player.quests.session);
    expect(questView(loaded, QUESTS).choices).toEqual(questView(w, QUESTS).choices);
    expect(loaded.player.quests.world).toEqual({ wagon_seen: true });
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
