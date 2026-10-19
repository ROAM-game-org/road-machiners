import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { RULES } from '../data/rules';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { siteOf } from '../sim/market';
import { chooseQuestOption, pickTownSection, QUESTS, questView, startQuest } from '../sim/quests';
import { defaultSetup } from '../sim/settings';
import { nearestPad } from '../sim/sites';
import { addState } from '../sim/states';
import { addVehicle, finishQuest } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

const SCALE = 'bowl_scale';
const QUIET_ROAD = 1_000_000;

function quietWorld(): World {
  const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
  w.vehicles = w.vehicles.filter((v) => v.id === playerVehicle(w).id);
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = QUIET_ROAD;
  w.events = [];
  return w;
}

function parkAt(w: World, siteId: string): World {
  const me = playerVehicle(w);
  me.pos = { ...nearestPad(siteOf(siteId), me.pos) };
  me.speed = 0;
  me.trail = [];
  return w;
}

function wait(w: World): World {
  return endTurn(w, () => {});
}

function enterMarket(w: World): World {
  return pickTownSection(w, null, 'market');
}

function driveOff(w: World): World {
  const me = playerVehicle(w);
  me.pos = { x: me.pos.x + 60, y: me.pos.y };
  return w;
}

function talkThrough(world: World): World {
  let w = world;
  while (w.player.quests.session) w = chooseQuestOption(w, QUESTS, 0);
  return w;
}

describe('the weigher at the Bowl gate yard', () => {
  it('opens the scene when the player enters Market at Bowl with salvage in the bed', () => {
    const w = enterMarket(parkAt(quietWorld(), 'bowl'));
    expect(w.player.quests.session).toEqual(expect.objectContaining({ quest: SCALE, checkpoint: 'start' }));
    expect(w.player.quests.world.scale_seen).toBe(true);
    expect(questView(w, QUESTS).choices.length).toBeGreaterThan(0);
  });

  it('opens nothing from a turn parked at Bowl', () => {
    const w = wait(parkAt(quietWorld(), 'bowl'));
    expect(w.player.quests.session).toBeNull();
    expect(w.player.quests.world.scale_seen).toBeUndefined();
  });

  it('opens nothing on entering another section at Bowl', () => {
    const w = pickTownSection(parkAt(quietWorld(), 'bowl'), null, 'board');
    expect(w.player.quests.session).toBeNull();
  });

  it('refuses the pick while the truck rolls across the pad', () => {
    const w = parkAt(quietWorld(), 'bowl');
    playerVehicle(w).speed = RULES.parkedSpeed + 1;
    expect(() => enterMarket(w)).toThrow('Not parked at a shop');
  });

  it('opens nothing on a pad of another town', () => {
    const w = enterMarket(parkAt(quietWorld(), 'nose'));
    expect(w.player.quests.session).toBeNull();
    expect(w.player.quests.world.scale_seen).toBeUndefined();
  });

  it('opens nothing for a bed with no scrap or parts in it', () => {
    const w = parkAt(quietWorld(), 'bowl');
    for (const item of playerVehicle(w).items) if (item.kind === 'good') item.good = 'grain';
    expect(enterMarket(w).player.quests.session).toBeNull();
  });

  it('opens nothing for a driver who has sold at a profit before', () => {
    const w = parkAt(quietWorld(), 'bowl');
    w.player.xpBySource.profit = 1;
    expect(enterMarket(w).player.quests.session).toBeNull();
  });

  it('opens nothing while the truck is in a fight', () => {
    const w = parkAt(quietWorld(), 'bowl');
    const me = playerVehicle(w);
    const raider = addVehicle(w, 'scrapjaw', 'buggy', [], { x: me.pos.x + 6, y: me.pos.y });
    addState(w, 'combat', raider.id, me.id, { kind: 'none' });
    expect(enterMarket(w).player.quests.session).toBeNull();
  });

  it('opens nothing behind another open quest, and opens on the next entry after it ends', () => {
    const talking = enterMarket(startQuest(parkAt(quietWorld(), 'bowl'), QUESTS, 'bowl_hattie', 'start'));
    expect(talking.player.quests.session?.quest).toBe('bowl_hattie');
    expect(talking.player.quests.world.scale_seen).toBeUndefined();
    const after = enterMarket(finishQuest(talking));
    expect(after.player.quests.session?.quest).toBe(SCALE);
  });

  it('opens nothing while a radio call is open', () => {
    const w = parkAt(quietWorld(), 'bowl');
    w.player.call = { with: 'x', topic: 'tale', node: 'offer', vars: {}, line: { line: 'gotAStoryFrom', vars: {} } };
    const next = enterMarket(w);
    expect(next.player.quests.session).toBeNull();
    expect(next.player.quests.world.scale_seen).toBeUndefined();
  });

  it('opens once a game: leaving and entering Market again opens nothing', () => {
    const seen = finishQuest(enterMarket(parkAt(quietWorld(), 'bowl')));
    const away = wait(driveOff(seen));
    const back = enterMarket(parkAt(away, 'bowl'));
    expect(back.player.quests.session).toBeNull();
    expect(back.player.quests.world.scale_seen).toBe(true);
  });

  it('moves no money, cargo or shop stock, and only writes the Old Orchard note', () => {
    const opened = enterMarket(parkAt(quietWorld(), 'bowl'));
    const done = talkThrough(opened);
    expect(done.player.money).toBe(opened.player.money);
    expect(playerVehicle(done).items).toEqual(playerVehicle(opened).items);
    expect(done.shops.bowl).toEqual(opened.shops.bowl);
    expect(done.player.xp).toBe(opened.player.xp);
    expect(done.player.notes.map((n) => n.id)).toEqual([...opened.player.notes.map((n) => n.id), 'orchardIron']);
  });

  it.each([
    ['open', (w: World) => w],
    ['ended', (w: World) => talkThrough(w)],
  ])('saves and loads with the scene %s, awards nothing and does not open it again', (_label, settle) => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    const w = settle(enterMarket(parkAt(quietWorld(), 'bowl')));
    w.events = [];
    writeSave(slots, 'auto', w, 'run', 1);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('The save did not load');
    expect(loaded.player.quests.session).toEqual(w.player.quests.session);
    expect(loaded.player.quests.world).toEqual(w.player.quests.world);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.player.xpBySource).toEqual(w.player.xpBySource);
    expect(loaded.player.notes).toEqual(w.player.notes);
    expect(loaded.events).toEqual([]);
    const next = enterMarket(finishQuest(loaded));
    expect(next.player.quests.session).toBeNull();
  });
});
