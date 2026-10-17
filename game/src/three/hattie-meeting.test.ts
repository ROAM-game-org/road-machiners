import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { startKit } from '../data/start';
import { addGoods } from '../sim/inventory';
import { playerVehicle } from '../sim/damage';
import { siteOf } from '../sim/market';
import { chooseQuestOption, QUESTS, questView, setIntroStep, setWorldVar } from '../sim/quests';
import { defaultSetup } from '../sim/settings';
import { nearestPad } from '../sim/sites';
import { finishQuest } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

const QUIET_ROAD = 1_000_000;

function introWorld(): World {
  const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
  w.vehicles = w.vehicles.filter((v) => v.id === playerVehicle(w).id);
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = QUIET_ROAD;
  w.events = [];
  setIntroStep(w, 'done');
  return w;
}

function parkAt(w: World, siteId: string): World {
  const me = playerVehicle(w);
  me.pos = { ...nearestPad(siteOf(siteId), me.pos) };
  me.speed = 0;
  me.trail = [{ x: me.pos.x, y: me.pos.y, heading: me.heading }, { x: me.pos.x - 1, y: me.pos.y, heading: me.heading }];
  return w;
}

const wait = (w: World): World => endTurn(w, () => {});
const spoken = (w: World): string => questView(w, QUESTS).lines.map((l) => l.text).join(' ');
const choices = (w: World): string[] => questView(w, QUESTS).choices;

function choose(w: World, text: string): World {
  const index = choices(w).indexOf(text);
  if (index < 0) throw new Error(`No choice ${text} in ${choices(w).join(', ')}`);
  return chooseQuestOption(w, QUESTS, index);
}

function savedAndLoaded(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', w, 'run', 1);
  const loaded = loadWorld(slots, 'auto', TEST_MAP);
  if (!loaded) throw new Error('The save did not load');
  return loaded;
}

describe('Hattie at her well for a driver who arrives on their own', () => {
  it('opens the meeting once the truck parks on a Bowl pad and marks her met', () => {
    const w = wait(parkAt(introWorld(), 'bowl'));
    expect(w.player.quests.session).toEqual(expect.objectContaining({ quest: 'intro_bowl' }));
    expect(w.player.quests.world.hattie_met).toBe(true);
    expect(spoken(w)).toContain('Hattie, they call me');
    expect(questView(w, QUESTS).choices.length).toBeGreaterThan(0);
  });

  it('never offers the knockout questions and ends on a leave line that does not mention a slate', () => {
    const w = wait(parkAt(introWorld(), 'bowl'));
    expect(choices(w)).not.toContain('What happened to me?');
    const asked = choose(w, 'What do I do now?');
    expect(choices(asked)).not.toContain('Who brought me in?');
    const left = choose(asked, "I'll go.");
    expect(left.player.quests.session).toBeNull();
    expect(left.player.money).toBe(w.player.money);
    expect(left.player.xp).toEqual(w.player.xp);
  });

  it('does not open again on later turns or after a load', () => {
    let w = finishQuest(wait(parkAt(introWorld(), 'bowl')));
    w = wait(w);
    expect(w.player.quests.session?.quest).not.toBe('intro_bowl');
    const loaded = wait(savedAndLoaded(w));
    expect(loaded.player.quests.session?.quest).not.toBe('intro_bowl');
  });

  it('loads mid-meeting on the same question list and awards nothing', () => {
    const w = choose(wait(parkAt(introWorld(), 'bowl')), 'Where am I?');
    const loaded = savedAndLoaded(w);
    expect(choices(loaded)).toEqual(choices(w));
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
    expect(loaded.events).toEqual([]);
  });

  it('waits while rolling, away from Bowl, on a call, in a fight, or after a tow', () => {
    const rolling = parkAt(introWorld(), 'bowl');
    const me = playerVehicle(rolling);
    me.speed = 5;
    me.trail = [{ x: me.pos.x, y: me.pos.y, heading: me.heading }, { x: me.pos.x - 1, y: me.pos.y, heading: me.heading }];
    expect(wait(rolling).player.quests.session?.quest).not.toBe('intro_bowl');
    expect(wait(parkAt(introWorld(), 'nose')).player.quests.session?.quest).not.toBe('intro_bowl');
    const towed = parkAt(introWorld(), 'bowl');
    setWorldVar(towed, 'towed_to_bowl', true);
    expect(wait(towed).player.quests.session?.quest).not.toBe('intro_bowl');
  });

  it('stays out of worlds without the intro', () => {
    const w = parkAt(introWorld(), 'bowl');
    setIntroStep(w, 'off');
    expect(wait(w).player.quests.session?.quest).not.toBe('intro_bowl');
  });

  it('opens the well before the weigher when salvage rides in the bed', () => {
    const w = parkAt(introWorld(), 'bowl');
    addGoods(w, playerVehicle(w), 'scrap', 2);
    const first = wait(w);
    expect(first.player.quests.session?.quest).toBe('intro_bowl');
    const later = wait(finishQuest(first));
    expect(later.player.quests.session?.quest).toBe('bowl_scale');
  });
});
