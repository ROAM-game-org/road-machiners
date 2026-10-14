import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { checkKnockout } from '../sim/defeat';
import { corePart } from '../sim/grid';
import { QUESTS, questView, startQuest } from '../sim/quests';
import { defaultSetup } from '../sim/settings';
import { addVehicle, finishQuest } from '../sim/testkit';
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
  const raider = addVehicle(w, 'scrapjaw', 'buggy', [], { x: me.pos.x + 6, y: me.pos.y });
  me.lastHitBy = raider.id;
  corePart(me, 'cab').hp = 0;
  checkKnockout(w);
}

function wake(w: World): void {
  delete playerVehicle(w).defeat;
  w.player.state = 'active';
}

describe('the first fall', () => {
  it('shows its pages on the first combat knockout with no choice to make', () => {
    const w = freshWorld();
    fallToRaider(w);
    expect(w.player.state).toBe('knockedOut');
    const view = questView(w, QUESTS);
    expect(view.quest).toBe(FIRST_FALL);
    expect(view.choices).toEqual([]);
    expect(view.ended).toBe(true);
  });

  it('marks itself seen when it opens, and a second knockout opens nothing', () => {
    const w = freshWorld();
    fallToRaider(w);
    expect(w.player.quests.world).toEqual({ first_knockout_seen: true });
    w.player.quests = finishQuest(w).player.quests;
    wake(w);
    fallToRaider(w);
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
    expect(w.player.quests.live).toBeNull();
  });

  it('saves and loads at the knocked-out moment with the scene seen and no award', () => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    const w = freshWorld();
    fallToRaider(w);
    writeSave(slots, 'auto', w, 'run', 1);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('The save did not load');
    expect(loaded.player.quests.session).toBeNull();
    expect(loaded.player.quests.world).toEqual({ first_knockout_seen: true });
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.knockouts).toBe(1);
    expect(loaded.events).toEqual([]);
  });
});
