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
import { chooseQuestOption, QUESTS, questView } from '../sim/quests';
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
import { endTurn, newWorld, startPose } from '../sim/world';
import { openingStep } from '../ui/tips';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

const SEED = 1337;
const setup = defaultSetup('roaming');
const arrival = (): World => newGame(SEED, 'arrival', true, TEST_MAP, setup);
const SEARCH_HOUSE = 0;
const GO_TO_SHED = 1;
const arrived = (): World => chooseQuestOption(arrival(), QUESTS, GO_TO_SHED);

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
  const next = structuredClone(w);
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
  it('opens the arrival pages on a new game with a choice to search the house or go to the shed, setting nothing', () => {
    const w = arrival();
    const view = questView(w, QUESTS);
    expect(view.quest).toBe('intro_arrival');
    expect(view.view).toBe('page');
    expect(view.choices).toHaveLength(2);
    expect(view.ended).toBe(false);
    expect(introStep(w)).toBe('off');
    expect(w.player.money).toBe(startKit('standard').money);
  });

  it('pays 50 M for searching the house, nothing for going straight to the shed, and ends the scene either way', () => {
    const start = startKit('standard').money;
    const searched = chooseQuestOption(arrival(), QUESTS, SEARCH_HOUSE);
    const straight = chooseQuestOption(arrival(), QUESTS, GO_TO_SHED);
    expect(searched.player.money - start).toBe(50 * UNITS.centsPerM);
    expect(straight.player.money).toBe(start);
    for (const w of [searched, straight]) {
      expect(questView(w, QUESTS).ended).toBe(true);
      expect(w.player.quests.session).toBeNull();
    }
  });

  it('keeps the arrival choice and the money as they were across a save made before the pick', () => {
    const loaded = sameAfterRoundTrip(arrival());
    expect(questView(loaded, QUESTS).choices).toHaveLength(2);
    const searched = chooseQuestOption(loaded, QUESTS, SEARCH_HOUSE);
    expect(searched.player.money - startKit('standard').money).toBe(50 * UNITS.centsPerM);
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
  it('starts exactly as the old start did, with no quest, no farm and no intro step', () => {
    const w = newGame(SEED, 'arrival', false, TEST_MAP, setup);
    const old = newWorld(SEED, startKit('standard'), TEST_MAP, setup);
    expect(JSON.stringify(saveOf(w))).toBe(JSON.stringify(saveOf(old)));
    expect(playerVehicle(w).pos).toEqual(startPose().pos);
    expect(w.player.quests.session).toBeNull();
    expect(w.obstacles.some((o) => o.id === FARM_TOWER_ID)).toBe(false);
    expect(introStep(w)).toBe('off');
  });

  it('leaves the step off when the engine is patched', () => {
    let w = newGame(SEED, 'arrival', false, TEST_MAP, setup);
    w = patched(searchedAndLooted(w));
    expect(engineNeedsPatch(w, playerVehicle(w))).toBe(false);
    expect(introStep(turns(w, 2))).toBe('off');
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
