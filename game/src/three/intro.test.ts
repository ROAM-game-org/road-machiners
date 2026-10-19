import { describe, expect, it } from 'vitest';
import { ARRIVAL, FARM_TOWER_ID } from '../data/arrival';
import { REGION } from '../data/region';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { goodsCount, mountedParts } from '../sim/grid';
import { introStep } from '../sim/quests';
import { startRepair } from '../sim/jobs';
import { takeAllLoot } from '../sim/locations';
import { newGame } from '../sim/new-game';
import { openingStockOf, OPENING_WRECK_ID } from '../sim/opening';
import { chooseQuestOption, QUESTS, questView, setQuestLanguage } from '../sim/quests';
import { UNITS } from '../data/units';
import { engineNeedsPatch, repairPlan } from '../sim/repair';
import { defaultSetup } from '../sim/settings';
import { startSearch } from '../sim/search';
import { isCliff, isRoadTile, tileAt } from '../sim/terrain';
import { openingStopPoint, testDrive } from '../sim/testkit';
import type { World } from '../sim/types';
import { dist, type Vec } from '../sim/vec';
import { playerSees } from '../sim/vision';
import { maxHp } from '../sim/wear';
import { cloneWorld, endTurn } from '../sim/world';
import { startPose } from '../sim/start-pose';
import { openingStep } from '../sim/opening';
import { TEST_MAP } from '../test/map';
import { readQuestSources } from '../test/quest-compile';
import { loadWorld, saveOf, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

const SEED = 1337;
const setup = defaultSetup('roaming');
const arrival = (): World => newGame(SEED, 'arrival', true, TEST_MAP, setup);
const ROPE = 'Drop the rope down the well.';
const HOUSE = 'Go into the house.';
const SHED = 'Go to the shed.';
const LOOK = 'Look around.';
const LEAVE_HOUSE = 'Go out to the shed.';
const LINK = 'Sit down and close the clamps.';

function pick(w: World, ...texts: string[]): World {
  return texts.reduce((at, text) => {
    const index = questView(at, QUESTS).choices.indexOf(text);
    if (index < 0) throw new Error(`No choice ${text} in ${questView(at, QUESTS).choices.join(', ')}`);
    return chooseQuestOption(at, QUESTS, index);
  }, w);
}

const arrived = (): World => pick(arrival(), SHED, LINK);

const engineOf = (w: World) => mountedParts(playerVehicle(w), 'engine')[0];

function throughRoundTrip(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', w, 'run', 1);
  const loaded = loadWorld(slots, 'auto', TEST_MAP);
  if (!loaded) throw new Error('The save did not load');
  return loaded;
}

function sameAfterRoundTrip(w: World): World {
  const loaded = throughRoundTrip(w);
  expect(JSON.stringify(saveOf(loaded))).toBe(JSON.stringify(saveOf(w)));
  expect(loaded.events).toEqual([]);
  return loaded;
}

function parked(w: World): World {
  const next = cloneWorld(w);
  const me = playerVehicle(next);
  me.pos = openingStopPoint(next);
  me.speed = 0;
  me.order = null;
  return next;
}

function turns(w: World, n: number): World {
  let next = w;
  for (let i = 0; i < n; i++) next = endTurn(next, testDrive);
  return next;
}

function untilIdle(w: World): World {
  let next = w;
  for (let i = 0; i < 12 && playerVehicle(next).job; i++) next = turns(next, 1);
  return next;
}

function searchedAndLooted(w: World): World {
  const searched = untilIdle(startSearch(parked(w), OPENING_WRECK_ID));
  return takeAllLoot(searched, OPENING_WRECK_ID);
}

function patched(w: World): World {
  return untilIdle(startRepair(w, engineOf(w).id));
}

describe('the arrival at the farm', () => {
  it('opens the arrival pages on a new game at the farm, with the rope, the house and the shed to choose from, setting nothing', () => {
    const w = arrival();
    const view = questView(w, QUESTS);
    expect(view.quest).toBe('intro_arrival');
    expect(view.view).toBe('page');
    expect(view.choices).toEqual([ROPE, HOUSE, SHED]);
    expect(view.ended).toBe(false);
    expect(introStep(w)).toBe('off');
    expect(w.player.money).toBe(startKit('standard').money);
  });

  it('takes the rope off the list once the well is measured', () => {
    expect(questView(pick(arrival(), ROPE), QUESTS).choices).toEqual([HOUSE, SHED]);
  });

  it('pays 50 M only to a driver who looks around the house, and ends the scene on every road', () => {
    const start = startKit('standard').money;
    const looked = pick(arrival(), HOUSE, LOOK, LINK);
    const left = pick(arrival(), HOUSE, LEAVE_HOUSE, LINK);
    const straight = pick(arrival(), SHED, LINK);
    expect(looked.player.money - start).toBe(50 * UNITS.centsPerM);
    expect(left.player.money).toBe(start);
    expect(straight.player.money).toBe(start);
    for (const w of [looked, left, straight]) {
      expect(questView(w, QUESTS).ended).toBe(true);
      expect(w.player.quests.session).toBeNull();
    }
  });

  it('keeps the farm and the house choices and the money as they were across a save before each pick', () => {
    const atFarm = sameAfterRoundTrip(pick(arrival(), ROPE));
    expect(questView(atFarm, QUESTS).choices).toEqual([HOUSE, SHED]);
    const inHouse = sameAfterRoundTrip(pick(atFarm, HOUSE));
    expect(questView(inHouse, QUESTS).choices).toEqual([LOOK, LEAVE_HOUSE]);
    expect(pick(inHouse, LOOK).player.money - startKit('standard').money).toBe(50 * UNITS.centsPerM);
  });

  it('shows the farm page before its choices after a load', () => {
    const loaded = sameAfterRoundTrip(pick(arrival(), ROPE));
    const view = questView(loaded, QUESTS);
    expect(view.lines[0].text.startsWith('Up close the tank is rusted brown')).toBe(true);
    expect(view.choices).toEqual([HOUSE, SHED]);
    expect(loaded.player.quests.session?.checkpoint).toBe('start.farm');
    expect(loaded.player.money).toBe(startKit('standard').money);
  });

  it('shows the Russian farm page before its choices after a load', () => {
    const lines = readQuestSources('src/data/quests')['ru/intro_arrival.ink'].split('\n');
    const opening = lines[lines.indexOf('# checkpoint: start.farm') + 1].split('#')[0].trim();
    expect(opening).toBeTruthy();
    setQuestLanguage('ru');
    try {
      const loaded = sameAfterRoundTrip(pick(arrival()));
      expect(questView(loaded, QUESTS).lines[0].text).toBe(opening);
    } finally {
      setQuestLanguage('en');
    }
  });

  it('loads the seat after the house loot with only the seat on offer and pays the loot once', () => {
    const loaded = sameAfterRoundTrip(pick(arrival(), HOUSE, LOOK));
    const view = questView(loaded, QUESTS);
    expect(view.choices).toEqual([LINK]);
    expect(view.lines[0].text.startsWith('Under the fallen roof sheet')).toBe(true);
    expect(loaded.player.money - startKit('standard').money).toBe(50 * UNITS.centsPerM);
  });

  it('runs a turn after a load while the truck still rolls with no order', () => {
    const rolling = parked(arrived());
    playerVehicle(rolling).speed = 3;
    const w = turns(throughRoundTrip(rolling), 1);
    expect(playerVehicle(w).trail.length).toBeGreaterThan(1);
  });

  it('moves on to drive on the first turn after the arrival, not while its choice waits', () => {
    expect(introStep(turns(arrived(), 1))).toBe('drive');
    expect(introStep(turns(arrival(), 1))).toBe('off');
  });

  it('parks the pickup at the farm with a nearly dead engine, a worn cab and parts enough to patch it', () => {
    const w = arrival();
    const me = playerVehicle(w);
    expect(me.pos).toEqual(ARRIVAL.pose.pos);
    expect(me.chassisId).toBe('scout');
    expect(w.obstacles.find((o) => o.id === FARM_TOWER_ID)?.kind).toBe('landmark');
    expect(engineOf(w).hp).toBeLessThan(maxHp(engineOf(w)) * 0.25);
    expect(engineNeedsPatch(w, me)).toBe(true);
    const stock = openingStockOf(w)!;
    const needed = repairPlan(w, me, engineOf(w).id).needed;
    expect((goodsCount(me).parts ?? 0) + (stock.goods.parts ?? 0)).toBeGreaterThan(needed);
    expect(w.player.autoRepair).toBe(false);
  });

  it('puts the wreck in sight on open dirt, and the farm out of sight of the road, with no cliff on the way out', () => {
    const w = arrival();
    const me = playerVehicle(w);
    const wreck = openingStockOf(w)!.pos;
    expect(playerSees(w, wreck)).toBe(true);
    for (const p of [me.pos, wreck]) {
      const tile = tileAt(w.terrain, p);
      expect(isRoadTile(w.terrain, p)).toBe(false);
      expect(isCliff(w.terrain, tile)).toBe(false);
    }
    expect(cliffsAlong(w, me.pos, wreck)).toBe(0);
    const greenPit = REGION.locations.find((l) => l.id === 'green-pit')!.pos;
    const road = REGION.roads.find((r) => r.some((p) => dist(p, greenPit) < 20))!;
    const out = nearestOnRoad(road, wreck);
    expect(playerSees(w, out)).toBe(false);
    expect(playerSees(w, greenPit)).toBe(false);
    expect(cliffsAlong(w, wreck, out)).toBe(0);
  });

  it('shows the opening tip for the wreck, and keeps the farewell from firing at the start', () => {
    const w = arrival();
    expect(openingStep(w)).toBe('wreck');
    expect(dist(playerVehicle(w).pos, startPose().pos)).toBeGreaterThan(80);
  });

  it('reaches patched once the engine patch lands, not before', () => {
    let w = searchedAndLooted(arrived());
    expect(introStep(turns(w, 2))).toBe('drive');
    w = patched(w);
    expect(engineNeedsPatch(w, playerVehicle(w))).toBe(false);
    expect(introStep(w)).toBe('patched');
  });

  it('survives a save and load at every step and awards nothing twice', () => {
    let w = sameAfterRoundTrip(arrived());
    w = sameAfterRoundTrip(searchedAndLooted(w));
    expect(introStep(w)).toBe('drive');
    const money = w.player.money;
    const xp = w.player.xp;
    const parts = goodsCount(playerVehicle(w)).parts;
    w = sameAfterRoundTrip(patched(w));
    expect(introStep(w)).toBe('patched');
    const after = turns(sameAfterRoundTrip(w), 3);
    expect(introStep(after)).toBe('patched');
    expect(after.player.money).toBe(w.player.money);
    expect([after.player.xpBySource.patch, after.player.xpBySource.search]).toEqual([w.player.xpBySource.patch, w.player.xpBySource.search]);
    expect(money).toBe(w.player.money);
    expect(xp).toBeLessThanOrEqual(w.player.xp);
    expect(parts).toBeGreaterThan(goodsCount(playerVehicle(w)).parts ?? 0);
  });
});

describe('a skipped intro', () => {
  it('builds the same world as the intro, with the arrival scene the only thing missing', () => {
    const skipped = newGame(SEED, 'arrival', false, TEST_MAP, setup);
    const played = newGame(SEED, 'arrival', true, TEST_MAP, setup);
    expect(skipped.player.quests.session).toBeNull();
    expect(played.player.quests.session?.quest).toBe('intro_arrival');
    const withoutQuests = (w: World) => JSON.stringify({ ...saveOf(w).world, player: { ...(saveOf(w).world as World).player, quests: null } });
    expect(withoutQuests(skipped)).toBe(withoutQuests(played));
  });

  it('runs the rest of the intro the same way when the scene is skipped', () => {
    expect(introStep(turns(newGame(SEED, 'arrival', false, TEST_MAP, setup), 1))).toBe('drive');
  });
});

function cliffsAlong(w: World, a: Vec, b: Vec): number {
  const steps = Math.ceil(dist(a, b));
  let cliffs = 0;
  for (let i = 0; i <= steps; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
    if (isCliff(w.terrain, tileAt(w.terrain, p))) cliffs++;
  }
  return cliffs;
}

function nearestOnRoad(road: readonly Vec[], from: Vec): Vec {
  return road.reduce((best, p) => (dist(p, from) < dist(best, from) ? p : best));
}
