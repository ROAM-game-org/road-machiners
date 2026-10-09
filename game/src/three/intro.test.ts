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
import { chooseQuestOption, leaveQuest, QUESTS, questView } from '../sim/quests';
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

function playScene(w: World, picks: number): World {
  let next = w;
  for (let i = 0; i < picks; i++) next = chooseQuestOption(next, QUESTS, 0);
  return next;
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

function driven(w: World): World {
  let scene = w;
  while (scene.player.quests.session) scene = chooseQuestOption(scene, QUESTS, 0);
  return scene;
}

function searchedAndLooted(w: World): World {
  const searched = untilIdle(startSearch(parked(w), OPENING_WRECK_ID));
  return takeAllLoot(searched, OPENING_WRECK_ID);
}

function patched(w: World): World {
  return untilIdle(startRepair(w, engineOf(w).id));
}

describe('the arrival at the farm', () => {
  it('opens the arrival page quest on a new game and sets nothing before the first choice', () => {
    const w = arrival();
    expect(w.player.quests.session?.quest).toBe('intro_arrival');
    expect(w.player.quests.session?.checkpoint).toBe('start');
    expect(questView(w, QUESTS).view).toBe('page');
    expect(introStep(w)).toBe('off');
    expect(w.player.money).toBe(startKit('standard').money);
  });

  it('walks to the shed whatever the player picks, setting walk on the first choice and drive at the end', () => {
    for (const pick of [0, 1]) {
      let w = arrival();
      for (let i = 0; i < 6; i++) {
        w = chooseQuestOption(w, QUESTS, Math.min(pick, questView(w, QUESTS).choices.length - 1));
        if (i === 0) expect(introStep(w)).toBe('walk');
      }
      expect(w.player.quests.session).toBeNull();
      expect(introStep(w)).toBe('drive');
    }
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

  it('puts the wreck in sight on open dirt with no cliff between, and a road toward Green Pit near the farm', () => {
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
    expect(dist(out, wreck)).toBeLessThan(20);
    expect(cliffsAlong(w, wreck, out)).toBe(0);
  });

  it('shows the opening tip for the wreck, and keeps the farewell from firing at the start', () => {
    const w = arrival();
    expect(openingStep(w)).toBe('wreck');
    expect(dist(playerVehicle(w).pos, startPose().pos)).toBeGreaterThan(80);
  });

  it('reaches patched once the engine patch lands, not before', () => {
    let w = driven(arrival());
    w = searchedAndLooted(w);
    expect(introStep(turns(w, 2))).toBe('drive');
    w = patched(w);
    expect(engineNeedsPatch(w, playerVehicle(w))).toBe(false);
    expect(introStep(w)).toBe('patched');
  });

  it('survives a save and load at every step and awards nothing twice', () => {
    let w = sameAfterRoundTrip(arrival());
    const view = questView(w, QUESTS);
    expect(questView(w, QUESTS).choices).toEqual(view.choices);
    w = sameAfterRoundTrip(playScene(w, 1));
    expect(introStep(w)).toBe('walk');
    w = sameAfterRoundTrip(playScene(w, 2));
    w = sameAfterRoundTrip(driven(w));
    expect(introStep(w)).toBe('drive');
    w = sameAfterRoundTrip(searchedAndLooted(w));
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

  it('moves on to drive when the player leaves the scene early', () => {
    const w = leaveQuest(playScene(arrival(), 1));
    expect(introStep(w)).toBe('walk');
    expect(introStep(turns(w, 1))).toBe('drive');
    const early = leaveQuest(arrival());
    expect(introStep(turns(early, 1))).toBe('drive');
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
