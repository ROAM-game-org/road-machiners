import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { RULES } from '../data/rules';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { siteOf } from '../sim/market';
import { chooseQuestOption, QUESTS, questView, startQuest } from '../sim/quests';
import { greetAtScale } from '../sim/intro';
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
  it('opens the scene once the truck parks on a Bowl pad with salvage in the bed', () => {
    const w = wait(parkAt(quietWorld(), 'bowl'));
    expect(w.player.quests.session).toEqual(expect.objectContaining({ quest: SCALE, checkpoint: 'start' }));
    expect(w.player.quests.world.scale_seen).toBe(true);
    expect(questView(w, QUESTS).choices.length).toBeGreaterThan(0);
  });

  it('opens nothing while the truck still rolls across the pad', () => {
    const w = parkAt(quietWorld(), 'bowl');
    const moving = endTurn(w, (d) => {
      const me = playerVehicle(d);
      me.speed = RULES.parkedSpeed + 1;
      me.trail = [{ ...me.pos, heading: me.heading }, { ...me.pos, heading: me.heading }];
    });
    expect(playerVehicle(moving).speed).toBeGreaterThan(RULES.parkedSpeed);
    expect(moving.player.quests.session).toBeNull();
  });

  it('opens nothing on a pad of another town', () => {
    const w = wait(parkAt(quietWorld(), 'nose'));
    expect(w.player.quests.session).toBeNull();
    expect(w.player.quests.world.scale_seen).toBeUndefined();
  });

  it('opens nothing for a bed with no scrap or parts in it', () => {
    const w = parkAt(quietWorld(), 'bowl');
    for (const item of playerVehicle(w).items) if (item.kind === 'good') item.good = 'grain';
    expect(wait(w).player.quests.session).toBeNull();
  });

  it('opens nothing for a driver who has sold at a profit before', () => {
    const w = parkAt(quietWorld(), 'bowl');
    w.player.xpBySource.profit = 1;
    expect(wait(w).player.quests.session).toBeNull();
  });

  it('opens nothing while the truck is in a fight', () => {
    const w = parkAt(quietWorld(), 'bowl');
    const me = playerVehicle(w);
    const raider = addVehicle(w, 'scrapjaw', 'buggy', [], { x: me.pos.x + 6, y: me.pos.y });
    addState(w, 'combat', raider.id, me.id, { kind: 'none' });
    expect(wait(w).player.quests.session).toBeNull();
  });

  it('waits behind another open quest and opens on the turn after it ends', () => {
    const talking = wait(startQuest(parkAt(quietWorld(), 'bowl'), QUESTS, 'bowl_hattie', 'start'));
    expect(talking.player.quests.session?.quest).toBe('bowl_hattie');
    expect(talking.player.quests.world.scale_seen).toBeUndefined();
    const after = wait(finishQuest(talking));
    expect(after.player.quests.session?.quest).toBe(SCALE);
  });

  it('opens nothing while a radio call is open', () => {
    const w = parkAt(quietWorld(), 'bowl');
    w.player.call = { with: 'x', topic: 'tale', node: 'offer', vars: {}, line: { line: 'gotAStoryFrom', vars: {} } };
    greetAtScale(w);
    expect(w.player.quests.session).toBeNull();
    expect(w.player.quests.world.scale_seen).toBeUndefined();
  });

  it('opens once a game: leaving and parking again opens nothing', () => {
    const seen = finishQuest(wait(parkAt(quietWorld(), 'bowl')));
    const away = wait(driveOff(seen));
    const back = wait(parkAt(away, 'bowl'));
    expect(back.player.quests.session).toBeNull();
    expect(back.player.quests.world.scale_seen).toBe(true);
  });

  it('moves no money, cargo or shop stock, and only writes the Old Orchard note', () => {
    const opened = wait(parkAt(quietWorld(), 'bowl'));
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
    const w = settle(wait(parkAt(quietWorld(), 'bowl')));
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
    const next = wait(finishQuest(loaded));
    expect(next.player.quests.session).toBeNull();
  });
});
