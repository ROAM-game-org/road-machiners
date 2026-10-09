import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { checkKnockout } from '../sim/defeat';
import { corePart } from '../sim/grid';
import { chooseQuestOption, leaveQuest, QUESTS, questView, startQuest } from '../sim/quests';
import { defaultSetup } from '../sim/settings';
import { addVehicle } from '../sim/testkit';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

const FIRST_FALL = 'first_fall';

function freshWorld(): World {
  const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
  w.events = [];
  return w;
}

function fallToRaider(w: World): void {
  const me = playerVehicle(w);
  const raider = addVehicle(w, 'raiders', 'buggy', [], { x: me.pos.x + 6, y: me.pos.y });
  me.lastHitBy = raider.id;
  corePart(me, 'cab').hp = 0;
  checkKnockout(w);
}

function wake(w: World): void {
  delete playerVehicle(w).defeat;
  w.player.state = 'active';
}

describe('the first fall', () => {
  it('opens at start on the first combat knockout', () => {
    const w = freshWorld();
    fallToRaider(w);
    expect(w.player.state).toBe('knockedOut');
    expect(w.player.quests.session?.quest).toBe(FIRST_FALL);
    expect(w.player.quests.session?.checkpoint).toBe('start');
    expect(questView(w, QUESTS).quest).toBe(FIRST_FALL);
  });

  it('marks itself seen after the first choice, and a second knockout opens nothing', () => {
    const w = freshWorld();
    fallToRaider(w);
    w.player.quests = leaveQuest(chooseQuestOption(w, QUESTS, 0)).player.quests;
    expect(w.player.quests.world).toEqual({ first_knockout_seen: true });
    wake(w);
    fallToRaider(w);
    expect(w.player.quests.session).toBeNull();
    expect(w.player.quests.live).toBeNull();
  });

  it('opens nothing while another quest is open, and the quest stays open', () => {
    const w = startQuest(freshWorld(), QUESTS, 'bowl_hattie', 'start');
    const before = w.player.quests.session;
    fallToRaider(w);
    expect(w.player.quests.session).toEqual(before);
    expect(w.player.quests.world.first_knockout_seen).toBeUndefined();
  });

  it('opens on a knockout with no attacker only when someone fought the truck', () => {
    const w = freshWorld();
    corePart(playerVehicle(w), 'cab').hp = 0;
    checkKnockout(w);
    expect(w.player.state).toBe('knockedOut');
    expect(w.player.quests.session).toBeNull();
  });

  it('saves and loads mid-scene into the same page without a second opening or any award', () => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    const w = freshWorld();
    fallToRaider(w);
    const mid = chooseQuestOption(w, QUESTS, 0);
    writeSave(slots, 'auto', mid, 'run', 1);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('The save did not load');
    expect(loaded.player.quests.session).toEqual(mid.player.quests.session);
    expect(questView(loaded, QUESTS).choices).toEqual(questView(mid, QUESTS).choices);
    expect(loaded.player.quests.world).toEqual({ first_knockout_seen: true });
    expect(loaded.player.money).toBe(mid.player.money);
    expect(loaded.player.knockouts).toBe(mid.player.knockouts);
    expect(loaded.events).toEqual([]);
  });

  it('saves and loads at the knocked-out moment into the first page without setting anything', () => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    const w = freshWorld();
    fallToRaider(w);
    writeSave(slots, 'auto', w, 'run', 1);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('The save did not load');
    expect(loaded.player.quests.session).toEqual(w.player.quests.session);
    expect(loaded.player.quests.world).toEqual({});
    expect(loaded.player.knockouts).toBe(1);
    expect(loaded.events).toEqual([]);
  });
});
