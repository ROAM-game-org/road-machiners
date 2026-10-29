import { describe, expect, it } from 'vitest';
import { budget } from '../test/budget';
import { startKit } from '../data/start';
import { newWorld, update } from '../sim/world';
import { playerVehicle } from '../sim/damage';
import { gridOf, mountedParts, placementError } from '../sim/grid';
import { inOverdrive } from '../sim/stats';
import { addVehicle, emptyWorld, npcBrain } from '../sim/testkit';
import { noteAttack } from '../sim/combat';
import { noteDeed } from '../sim/relations';
import { addState } from '../sim/states';
import { canStowPart, moveItem, storePart, stowPart, stowSpot, takeFromStorage } from '../sim/inventory';
import { buyStockPart } from '../sim/economy';
import { buyChart, chartsOnSale } from '../sim/charts';
import { bareVehicle, makePart } from '../sim/factory';
import { PARTS } from '../data/parts';
import type { Faction, GridItem, World } from '../sim/types';
import { advanceContracts, siteOf, type Contract } from '../sim/market';
import { advanceJobs } from '../sim/jobs';
import { CHASSIS, chassisDef } from '../data/chassis';
import { dist } from '../sim/vec';
import { CRATE_MASS } from '../data/goods';
import { addGoods } from '../sim/inventory';
import { goodsCount } from '../sim/grid';
import { dropHaul, looseCargo, lootableProps } from '../sim/salvage';
import { wreckVehicle } from '../sim/combat';
import { itemMass, vehicleMass } from '../sim/mass';
import { clearGame, clearSlot, hasSave, loadWorld, packExplored, SaveError, unpackExplored, saveKey, saveInTown, isDayStart, saveOf, savedRunId, saveWorld, SaveHold, writeSave, SAVE_FORMAT } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { REGION } from '../data/region';
import { sitePads } from '../sim/sites';
import { hireEscort } from '../sim/tow';
import { TEST_MAP } from '../test/map';
import { advanceSunward, duskTurn, membersOf, rideOutTurn, sunwardFacts } from '../sim/sunward';
import { hollowBays, hollowObstacles } from '../sim/hollow-layout';
import { fillHollow, isFree } from '../sim/spawn';
import { reusedWorld } from '../test/world-cache';
import { isBakedObstacle, isBreakable, mapObstacles } from '../sim/mapgen';
import { breakProp, oldSpotOf, oldSpotPicks, oldStockId } from '../sim/salvage';
import { sunAt } from '../sim/sun';
import { playerSees, practiceContacts, refreshVision } from '../sim/vision';
import { surveySites } from '../sim/survey';
import { TIME } from '../data/time';
import { SAVE_MAJOR } from './save-migrations';
import SAVED_SHAPE from './save-shape.json';
import { allSlots, type SlotId } from './save-slots';
import { lostQuestNames, newGameShape, questLinks, questNames } from '../test/save-shape';
import { chooseQuestOption, QUESTS, questProblems, questView, startQuest } from '../sim/quests';
import { defaultSetup, parseSetup } from '../sim/settings';
import { askTopic, callVehicle } from '../sim/dialogue';
import { resolve } from '../text/resolve';
import { lineText } from '../ui/dialogue';

function standardWorld(): World {
  return reusedWorld('standard', () => newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming')));
}

const SLOTS = allSlots(3);
const RUN = 'run-1';

function makeSlots(): SaveSlots {
  return new SaveSlots(memoryBackend(), new Map());
}

function putOnMap(slots: SaveSlots, world: World, mapHash: string): void {
  const save = JSON.parse(JSON.stringify(saveOf(world))) as { world: { mapHash: string } };
  save.world.mapHash = mapHash;
  slots.put('auto', { ...save, savedAt: 1000, runId: RUN });
}

function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

type Saved = { player: { explored: unknown }; obstacles: { id: string }[]; vehicles: object[]; broken: object[] };

function savedWorldOf(slots: SaveSlots, slot: SlotId): Saved {
  return (slots.get(slot) as { world: Saved }).world;
}

describe('game save', () => {
  it('saves by hand on any turn and clears for a new game', () => {
    const slots = makeSlots();
    const world = { ...standardWorld(), turn: 7 };
    writeSave(slots, 'auto', world, RUN, 1000);
    expect(hasSave(slots, SLOTS)).toBe(true);
    expect(loadWorld(slots, 'auto', TEST_MAP)).toEqual(world);
    clearSlot(slots, 'auto');
    expect(hasSave(slots, SLOTS)).toBe(false);
  });

  it('gives the same lootable props after a save and load', () => {
    const slots = makeSlots();
    const world = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    const npc = addVehicle(world, 'scrapjaw', 'buggy', [], { x: 10, y: 10 });
    wreckVehicle(world, npc);
    const emptied = world.salvage.find((s) => !s.pile && s.id !== `wreck-${npc.id}`)!;
    emptied.goods = {};
    emptied.parts = [];
    emptied.fuel = 0;
    emptied.supplies = 0;
    emptied.hidden = { goods: {}, parts: [], fuel: 0, supplies: 0 };
    addGoods(world, world.vehicles[0], 'scrap', 3);
    dropHaul(world, world.vehicles[0], looseCargo(world.vehicles[0]));
    const before = lootableProps(world.salvage);
    expect(before.has(emptied.id)).toBe(false);
    expect(before.has(`wreck-${npc.id}`)).toBe(true);
    writeSave(slots, 'auto', world, RUN, 1000);
    expect(lootableProps(loadWorld(slots, 'auto', TEST_MAP)!.salvage)).toEqual(before);
  }, budget(30_000));

  it('clears the save and the seen tips for a new game, and keeps sound settings', () => {
    const slots = makeSlots();
    const storage = makeStorage();
    writeSave(slots, 'auto', standardWorld(), RUN, 1000);
    storage.setItem('roam.tips', JSON.stringify(['waypoint']));
    storage.setItem('roam.tipsOff', '1');
    storage.setItem('roam-sound', '{}');
    clearGame(slots, storage);
    expect(slots.has('auto')).toBe(false);
    expect([storage.getItem('roam.tips'), storage.getItem('roam.tipsOff'), storage.getItem('roam-sound')]).toEqual([null, null, '{}']);
  });

  it('saves a command on a town pad at once, and not out in the open', () => {
    const slots = makeSlots();
    const open = emptyWorld({ x: 30, y: 30 });
    saveInTown(slots, open, RUN, 1000);
    expect(hasSave(slots, SLOTS)).toBe(false);
    const inTown = emptyWorld(sitePads(REGION.towns[0])[0]);
    saveInTown(slots, inTown, RUN, 1000);
    expect(hasSave(slots, SLOTS)).toBe(true);
  });

  it('loads a save that holds an aim at a missing part as a body shot', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    const foe = world.vehicles[1] ?? addVehicle(world, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 33, y: 30 }, Math.PI);
    world.vehicles[0].weaponOrders = { w1: { targetId: foe.id, aim: 'gone-part' } };
    writeSave(slots, 'auto', world, RUN, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    expect(loaded?.vehicles[0].weaponOrders.w1).toEqual({ targetId: foe.id, aim: 'body' });
  });

  it('keeps a pending disarm order on an armed ram through a reload, and load awards nothing', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    const truck = addVehicle(world, 'independent', 'hauler', ['stockEngine', 'claymoreRam'], { x: 40, y: 30 });
    const ram = mountedParts(truck).find((p) => p.defId === 'claymoreRam')!;
    ram.charge = { reload: 0, armed: true };
    truck.utilityOrders[ram.id] = { kind: 'disarm' };
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    const back = loaded.vehicles.find((v) => v.id === truck.id)!;
    expect(back.utilityOrders[ram.id]).toEqual({ kind: 'disarm' });
    expect(mountedParts(back).find((p) => p.id === ram.id)!.charge).toEqual({ reload: 0, armed: true });
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.events).toEqual([]);
  });

  it('keeps the paint job through a reload, and load awards nothing', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    world.player.paint = { body: 'petrol', cab: 'slate', gear: 'chalk' };
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.player.paint).toEqual({ body: 'petrol', cab: 'slate', gear: 'chalk' });
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.player.xp).toBe(world.player.xp);
    expect(loaded.events).toEqual([]);
  });

  it('keeps a duty leg in flight through a reload, and load pays nothing', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    world.turn = 900;
    const lawman = addVehicle(world, 'bowl', 'scout', ['mg', 'stockEngine'], { x: 40, y: 40 });
    lawman.brain = npcBrain('bowlFarmer', lawman.pos, ['lawman', 'brave']);
    lawman.brain.goals = [{ kind: 'patrol', targetId: 'bowl', destination: { x: 60, y: 60 }, phase: 'travel', reason: 'patrolTown', leg: { from: { x: 20, y: 22 }, turn: 700 } }];
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    const back = loaded.vehicles.find((v) => v.id === lawman.id)!;
    expect(back.brain!.goals).toEqual(lawman.brain.goals);
    expect(back.resources).toEqual(lawman.resources);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.events.filter((e) => ['shopMoney', 'transfer', 'guardPaid', 'money'].includes(e.t))).toEqual([]);
  });

  it('keeps shop stocks, a site event, a shortage, an opened crate and road news through a reload, and load moves no stock', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    world.turn = 905;
    world.shops.granary.goods.grain = 0;
    world.shops.granary.shortSince = { grain: 700 };
    world.shops['pump-station'].event = { kind: 'breakdown', recipe: 'pump', until: 1400 };
    world.shops.bowl.opened = { fuel: 4 };
    world.roadNews = [{ turn: 880, kind: 'robbed', good: 'grain', units: 12, from: 'bowl', to: 'granary' }];
    const convoy = addVehicle(world, 'bowl', 'hauler', ['stockEngine'], { x: 40, y: 40 });
    convoy.brain = npcBrain('convoy', convoy.pos, ['supplier']);
    convoy.brain.goals = [{ kind: 'sell', targetId: 'granary', destination: { x: 60, y: 60 }, phase: 'travel', reason: 'deliverCargo', shipment: { good: 'grain', from: 'bowl', to: 'granary' } }];
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.shops).toEqual(world.shops);
    expect(loaded.roadNews).toEqual(world.roadNews);
    expect(loaded.vehicles.find((v) => v.id === convoy.id)!.brain!.goals).toEqual(convoy.brain.goals);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.player.xp).toBe(world.player.xp);
    expect(loaded.events).toEqual([]);
  });

  it('keeps a led investigation with the centre it heard through a reload, and load awards nothing', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    world.turn = 900;
    const raider = addVehicle(world, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 40, y: 40 });
    raider.brain = npcBrain('buggy', raider.pos, ['raider']);
    raider.brain.goals = [{ kind: 'investigate', targetId: 'player', destination: { x: 70, y: 52 }, phase: 'travel', reason: 'springOnPrey', heard: { x: 64, y: 50 }, chase: { turn: 900, gap: 26 } }];
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.vehicles.find((v) => v.id === raider.id)!.brain!.goals).toEqual(raider.brain.goals);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.events).toEqual([]);
  });

  it('keeps an open directions call and its words through a reload, and load awards nothing', () => {
    const slots = makeSlots();
    const world = emptyWorld({ x: 100, y: 450 });
    const npc = addVehicle(world, 'independent', 'scout', ['stockEngine'], { x: 106, y: 450 });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    refreshVision(world);
    let opened = callVehicle(world, npc.id);
    opened = askTopic(opened, 'directions');
    expect(opened.player.call?.line.line).toBe('townWay');
    writeSave(slots, 'auto', opened, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.player.call).toEqual(opened.player.call);
    const way = loaded.player.call!.vars.way;
    expect(way.kind === 'directions' && way.steps.find((s) => s.do === 'follow')).toMatchObject({ heading: expect.any(String) });
    const said = (w: World, locale: 'en' | 'ru') => resolve(lineText(w.player.call!.line.line, w.player.call!.line.vars.way ? w.player.call!.line.vars : w.player.call!.vars), locale);
    expect(said(loaded, 'en')).toBe(said(opened, 'en'));
    expect(said(loaded, 'ru')).toBe(said(opened, 'ru'));
    expect(said(loaded, 'en')).not.toMatch(/number|\d/);
    expect(loaded.player.xp).toBe(opened.player.xp);
    expect(loaded.player.money).toBe(opened.player.money);
    expect(loaded.events.filter((e) => e.t === 'discover' || e.t === 'money')).toEqual([]);
  });

  it('keeps an open road lesson and a settled one through a reload, and load awards nothing', () => {
    const slots = makeSlots();
    const world = emptyWorld({ x: 100, y: 450 });
    const npc = addVehicle(world, 'independent', 'scout', ['stockEngine'], { x: 106, y: 450 });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    world.player.talked['someone-else'] = { roadLesson: 'done' };
    refreshVision(world);
    let opened = callVehicle(world, npc.id);
    opened = askTopic(opened, 'roadLesson');
    expect(opened.player.call?.line.line).toBe('lessonTold');
    writeSave(slots, 'auto', opened, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.player.call).toEqual(opened.player.call);
    expect(loaded.player.talked).toEqual(opened.player.talked);
    expect(resolve(lineText('lessonTold', loaded.player.call!.vars), 'en')).toBe(resolve(lineText('lessonTold', opened.player.call!.vars), 'en'));
    expect(loaded.player.xp).toBe(opened.player.xp);
    expect(loaded.player.money).toBe(opened.player.money);
    expect(loaded.events).toEqual([]);
  });

  it('loads a save with overdrive on and a worn engine as not overdriving, and clears the flag on the next update', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    world.player.overdrive = true;
    mountedParts(world.vehicles[0], 'engine')[0].hp = 5;
    writeSave(slots, 'auto', world, RUN, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(inOverdrive(loaded, playerVehicle(loaded))).toBe(false);
    expect(update(loaded, () => {}).player.overdrive).toBe(false);
  });

  it('keeps a held haul with the reward and deadline it was accepted with, through a reload and a turn before its deadline', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    const haul: Contract = { id: 'ct-h', shop: 'bowl', kind: 'haul', good: 'tools', units: 8, to: 'granary', reward: 1328, deadline: 934, window: 934, rush: false, tier: 3 };
    world.player.contracts = [haul];
    writeSave(slots, 'auto', world, RUN, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('Expected saved haul');
    expect(loaded.player.contracts).toEqual([haul]);
    const after = update(loaded, (d) => advanceContracts(d));
    expect(after.player.contracts).toEqual([haul]);
  });
  it('keeps an escort job mid-trip with its clock running, and load pays nothing', () => {
    const slots = makeSlots();
    const pad = sitePads(siteOf('bowl'))[0];
    const world = emptyWorld(pad);
    const trader = addVehicle(world, 'independent', 'hauler', ['stockEngine'], { x: pad.x + 90, y: pad.y });
    trader.brain = npcBrain('trader', trader.pos, ['trader']);
    trader.brain.goals = [{ kind: 'sell', targetId: 'nose', destination: { ...siteOf('nose').pos }, phase: 'travel', reason: 'deliverCargo' }];
    world.turn = 300;
    const escort: Contract = {
      id: 'ct-e', shop: 'bowl', kind: 'escort', client: trader.id, to: 'nose', reward: 4800, deadline: Number.MAX_SAFE_INTEGER, window: 75, tier: 2, threat: 2,
      span: 300, together: 210, seen: { x: pad.x + 5, y: pad.y, turn: 295 }, apart: 12, stuck: 0, holdUntil: 340,
    };
    world.player.contracts = [escort];
    hireEscort(world, playerVehicle(world), trader, 'nose', 0);
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.player.contracts).toEqual([escort]);
    expect(loaded.states).toEqual(world.states);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.events.filter((e) => ['money', 'contract', 'escortEnded', 'practice'].includes(e.t))).toEqual([]);
  });

  it('keeps the past contracts across a reload, and awards nothing', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    const haul: Contract = { id: 'ct-h', shop: 'bowl', kind: 'haul', good: 'salt', units: 3, to: 'nose', reward: 10000, deadline: 500, window: 500, rush: false, tier: 1 };
    const claim: Contract = { id: 'ct-c', shop: 'nose', kind: 'claim', stockId: 's-1', at: { x: 50, y: 50 }, partId: 'p-1', defId: 'mg', reward: 12000, deadline: 900, window: 600, tier: 1, rivalAt: 700, rival: null, leads: [{ turn: 40, from: { x: 3, y: 4 }, driver: 'd-1' }] };
    world.player.pastContracts = [{ contract: haul, outcome: 'failed', turn: 501, amount: -1800 }, { contract: claim, outcome: 'done', turn: 640, amount: 12000 }];
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.player.pastContracts).toEqual(world.player.pastContracts);
    expect({ money: loaded.player.money, xp: loaded.player.xp, events: loaded.events }).toEqual({ money: world.player.money, xp: world.player.xp, events: [] });
  });

  it('keeps a part-done survey with its found places, a survey job in progress and a survey offer on a board across a reload, and awards nothing', () => {
    const slots = makeSlots();
    const [a, b, c, d] = surveySites(TEST_MAP);
    const world = emptyWorld({ x: c.pos.x + 2, y: c.pos.y });
    const survey: Contract = {
      id: 'ct-s',
      shop: 'bowl',
      kind: 'survey',
      points: [{ site: a.id, found: true, done: true }, { site: b.id, found: true, done: false }, { site: c.id, found: false, done: false }],
      reward: 3000,
      deadline: 900,
      window: 900,
      tier: 1,
    };
    const offer: Contract = { ...survey, id: 'ct-o', points: [{ site: d.id, found: false, done: false }] };
    world.player.contracts = [survey];
    world.shops.nose.contracts.push(offer);
    world.vehicles[0].job = { kind: 'survey', contractId: 'ct-s', site: b.id, turnsLeft: 4, total: 10 };
    writeSave(slots, 'auto', world, RUN, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(playerSees(loaded, c.pos)).toBe(true);
    expect(loaded.player.contracts).toEqual([survey]);
    expect(loaded.shops.nose.contracts).toContainEqual(offer);
    expect(loaded.vehicles[0].job).toEqual(world.vehicles[0].job);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.player.xp).toBe(world.player.xp);
    expect(loaded.events).toEqual(world.events);
  });

  it('keeps held rescues and a rescue offer through a reload and awards nothing on load', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    const rescue = (id: string, fulfilled: boolean): Contract => ({ id, shop: 'bowl', kind: 'rescue', client: 'v77', driver: 'Jed Cobb', need: 'fuel', area: { x: 40.5, y: 52.25 }, reward: 220, deadline: 900, window: 400, tier: 1, fulfilled });
    world.player.contracts = [rescue('ct-r1', false), rescue('ct-r2', true)];
    world.shops.bowl.contracts = [rescue('ct-r3', false)];
    writeSave(slots, 'auto', world, RUN, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('Expected saved rescues');
    expect(loaded.player.contracts).toEqual(world.player.contracts);
    expect(loaded.shops.bowl.contracts).toEqual([rescue('ct-r3', false)]);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.player.xp).toBe(world.player.xp);
    expect(loaded.events.filter((e) => e.t === 'contract' || e.t === 'money' || e.t === 'practice')).toEqual([]);
  });

  it('loads light and heavy crates, a haul, a cost basis and hidden goods as they were saved', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    const truck = world.vehicles[0];
    const held = goodsCount(truck);
    expect(addGoods(world, truck, 'electronics', 3)).toBe(3);
    expect(addGoods(world, truck, 'tools', 2)).toBe(2);
    const haul: Contract = { id: 'ct-h', shop: 'bowl', kind: 'haul', good: 'salt', units: 4, to: 'nose', reward: 900, deadline: 900, window: 900, rush: false, tier: 1 };
    expect(addGoods(world, truck, 'salt', 4)).toBe(4);
    world.player.contracts = [haul];
    world.player.costBasis = { electronics: 5000, tools: 3500, salt: 867 };
    world.salvage.push({ id: 'sv-x', pos: { x: 34, y: 30 }, radius: 1, goods: { scrap: 2 }, parts: [], hidden: { goods: { batteries: 3 }, parts: [], fuel: 0, supplies: 0 } });
    writeSave(slots, 'auto', world, RUN, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    const loadedTruck = loaded.vehicles[0];
    expect(loadedTruck.items).toEqual(truck.items);
    expect(goodsCount(loadedTruck)).toEqual({ ...held, electronics: 3, tools: 2, salt: 4 });
    expect(loaded.player.contracts).toEqual([haul]);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.player.xp).toBe(world.player.xp);
    expect(loaded.player.costBasis).toEqual(world.player.costBasis);
    expect(loaded.salvage.find((s) => s.id === 'sv-x')?.hidden.goods).toEqual({ batteries: 3 });
    expect(loaded.events).toEqual(world.events);
    const crates = Object.values(held).reduce((sum, n) => sum + n, 0) + 9;
    const partsMass = loadedTruck.items.filter((it) => it.kind === 'part').reduce((sum, it) => sum + itemMass(it), 0);
    expect(vehicleMass(loadedTruck)).toBe(CHASSIS[loadedTruck.chassisId].mass + partsMass + crates * CRATE_MASS);
  });

  it('resumes a pending refit after loading without losing progress', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    const weapon = world.vehicles[0].items.find((item) => item.kind === 'part' && item.part.defId === 'mg');
    if (!weapon) throw new Error('Expected weapon');
    const to = { x: 3, y: CHASSIS.scout.layout.length, rot: 1 as const };
    const next = moveItem(world, weapon.id, to);
    advanceJobs(next);
    writeSave(slots, 'auto', next, RUN, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('Expected saved refit');
    expect(loaded.vehicles[0].job).toEqual(next.vehicles[0].job);
    for (let turn = 0; turn < 4; turn++) advanceJobs(loaded);
    expect(loaded.vehicles[0].job).toBeNull();
    expect(loaded.vehicles[0].items.find((item) => item.id === weapon.id)).toMatchObject(to);
  });

  it('keeps a refit queue of three steps through a reload, runs it to the end, and load awards nothing', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    const weapon = world.vehicles[0].items.find((item) => item.kind === 'part' && item.part.defId === 'mg');
    if (!weapon) throw new Error('Expected weapon');
    const to = { x: 3, y: CHASSIS.scout.layout.length, rot: 1 as const };
    const queued = moveItem(moveItem(moveItem(world, weapon.id, to), weapon.id, weapon), weapon.id, to);
    advanceJobs(queued);
    queued.events = [];
    writeSave(slots, 'auto', queued, RUN, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded.vehicles[0].job).toEqual(queued.vehicles[0].job);
    expect(loaded.vehicles[0].job).toMatchObject({ queue: [{ pickup: null }, { pickup: null }] });
    expect(loaded.player.money).toBe(queued.player.money);
    expect(loaded.player.xp).toBe(queued.player.xp);
    expect(loaded.events).toEqual([]);
    for (let turn = 0; turn < 40 && loaded.vehicles[0].job; turn++) advanceJobs(loaded);
    expect(loaded.vehicles[0].job).toBeNull();
    expect(loaded.vehicles[0].items.find((item) => item.id === weapon.id)).toMatchObject(to);
  });

  it('keeps a part bought into storage at a stall, and takes it out after loading', () => {
    const slots = makeSlots();
    let world = emptyWorld(sitePads(siteOf('pump-station'))[0]);
    world.player.money = 100000;
    const part = world.shops['pump-station'].stock[0];
    while (canStowPart(world.vehicles[0], makePart(world, part.defId, 0))) stowPart(world, world.vehicles[0], makePart(world, part.defId, 0));
    world = buyStockPart(world, part.id);
    writeSave(slots, 'auto', world, RUN, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('Expected save');
    expect(loaded.player.storage.find((p) => p.id === part.id)).toEqual({ ...part });
    const stored = loaded.player.storage.find((p) => p.id === part.id)!;
    const probe: GridItem = { id: 'probe', x: 0, y: 0, rot: 0, kind: 'part', part: stored };
    let freed = loaded;
    let spot = stowSpot(freed.vehicles[0], probe);
    while (!spot) {
      const filler = freed.vehicles[0].items.filter((it) => it.kind === 'part').at(-1);
      if (!filler) throw new Error('Expected room for the stored part');
      freed = storePart(freed, filler.id);
      spot = stowSpot(freed.vehicles[0], probe);
    }
    const back = takeFromStorage(freed, part.id, spot);
    expect(back.vehicles[0].items.some((it) => it.kind === 'part' && it.part.id === part.id)).toBe(true);
  });

  it.each(['dustwell', 'green-pit'])('keeps the shop of the outpost %s across a save and a load and awards nothing', (id) => {
    const slots = makeSlots();
    const world = emptyWorld(sitePads(siteOf(id))[0]);
    world.player.money = 100000;
    const bought = buyStockPart(world, world.shops[id].stock[0].id);
    const xp = structuredClone(bought.player.xp);
    writeSave(slots, 'auto', bought, RUN, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded.shops[id]).toEqual(bought.shops[id]);
    expect(loaded.player.money).toBe(bought.player.money);
    expect(loaded.player.xp).toEqual(xp);
    expect(loaded.events).toEqual([]);
  });

  it('keeps a bought chart through a reload and awards nothing on load', () => {
    const slots = makeSlots();
    const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
    const start = emptyWorld(sitePads(bowl)[0]);
    start.player.money = 100000;
    start.player.explored.fill(0);
    start.player.discovered = [];
    const bought = buyChart(start, chartsOnSale(start, 'bowl')[0].square);
    writeSave(slots, 'auto', bought, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(bought.player.explored.every((seen, i) => seen === 0 || loaded.player.explored[i] === 1)).toBe(true);
    expect(loaded.player.discovered).toEqual(bought.player.discovered);
    expect(loaded.player.money).toBe(bought.player.money);
    expect(loaded.player.xp).toEqual(bought.player.xp);
    expect(loaded.events.filter((e) => ['discover', 'money', 'xp'].includes(e.t))).toEqual([]);
  });

  it('stores explored as a string', () => {
    const slots = makeSlots();
    writeSave(slots, 'auto', standardWorld(), RUN, 1000);
    expect(typeof savedWorldOf(slots, 'auto').player.explored).toBe('string');
  });

  it('rejects explored of the wrong length', () => {
    const slots = makeSlots();
    writeSave(slots, 'auto', standardWorld(), RUN, 1000);
    const save = slots.get('auto') as { world: Saved };
    save.world.player.explored = 'AAAA';
    slots.put('auto', save);
    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(SaveError);
  });

  it('keeps a longbed fitted on every free cell, each part on its cell, through a reload', () => {
    const slots = makeSlots();
    const world = structuredClone(standardWorld());
    const truck = addVehicle(world, 'scrapjaw', 'longbed', [], { x: 12, y: 12 });
    const grid = gridOf(truck);
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const fits = Object.keys(PARTS).map((defId): GridItem => ({ id: `fit-${x}-${y}`, x, y, rot: 0, kind: 'part', part: makePart(world, defId, 0) })).find((item) => placementError(grid, truck.items, item, null) === null);
        if (fits) truck.items.push(fits);
      }
    }
    expect(truck.items.filter((i) => i.id.startsWith('fit-')).length).toBeGreaterThan(20);
    saveWorld(slots, { ...world, turn: 9 }, RUN, 8, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded.vehicles.find((v) => v.id === truck.id)!.items).toEqual(truck.items);
    expect(loaded).toEqual({ ...world, turn: 9 });
  });

  it('returns null when there is no saved game', () => {
    expect(loadWorld(makeSlots(), 'auto', TEST_MAP)).toBeNull();
  });

  it('refuses to write a world with a field the saved world type lacks, and keeps the old save', () => {
    const slots = makeSlots();
    const errors: unknown[] = [];
    slots.onError = (err) => errors.push(err);
    const world = standardWorld();
    expect(writeSave(slots, 'auto', world, RUN, 1000)).toBe(true);
    expect(writeSave(slots, 'auto', { ...world, turn: 21, futureFeature: { progress: 7 } } as World, RUN, 2000)).toBe(false);
    expect(String(errors[0])).toMatch(/world\.futureFeature: unknown key/);
    expect((slots.get('auto') as { savedAt: number }).savedAt).toBe(1000);
  });

  it('loads a stored save with a field this build lacks and drops the field', () => {
    const slots = makeSlots();
    const world = { ...standardWorld(), turn: 21 };
    const envelope = saveOf(world);
    slots.put('auto', { ...envelope, world: { ...envelope.world, futureFeature: { progress: 7 } }, savedAt: 1000, runId: RUN });
    expect(loadWorld(slots, 'auto', TEST_MAP)).toEqual(world);
  });

  it('sends a save at the current format with a missing list to the save screen', () => {
    const slots = makeSlots();
    const { crimes: _crimes, ...withoutCrimes } = saveOf(standardWorld()).world;
    slots.put('auto', { format: SAVE_FORMAT, world: withoutCrimes, savedAt: 1000, runId: RUN });
    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/invalidWorld: world\.crimes: missing/);
    slots.put('auto', { ...saveOf(standardWorld()), world: withoutCrimes, savedAt: 1000, runId: RUN });
    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/invalidWorld: world\.crimes: missing/);
  });

  it('loads back a player driving the remade tractor unchanged, and load awards nothing', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const old = playerVehicle(world);
    const tractor = bareVehicle(world, { faction: 'player', chassisId: 'tractor', pos: old.pos, heading: old.heading, brain: null });
    tractor.id = old.id;
    world.vehicles = world.vehicles.map((v) => (v.id === old.id ? tractor : v));
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(playerVehicle(loaded).chassisId).toBe('tractor');
    expect(loaded).toEqual(world);
    expect(loaded.events).toEqual([]);
  });

  it('rejects a save that did not parse in local storage as unreadable, without replacing it', () => {
    const slots = makeSlots();
    slots.put('auto', '{');
    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/unreadable/);
    expect(slots.get('auto')).toBe('{');
  });

  it('rejects another major format, a newer minor format and incomplete worlds', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const saved = saveOf(world).world;
    const cases = [
      [{ major: SAVE_MAJOR - 1, minor: 0 }, saved, /incompatible/],
      [{ major: SAVE_MAJOR + 1, minor: 0 }, saved, /incompatible/],
      [{ major: SAVE_MAJOR, minor: SAVE_FORMAT.minor + 1 }, saved, /newer/],
      [{ major: SAVE_MAJOR, minor: -1 }, saved, /noFormat/],
      [SAVE_FORMAT, { turn: 21 }, /invalidWorld/],
    ] as const;
    for (const [format, savedWorld, error] of cases) {
      slots.put('auto', { format, world: savedWorld });
      expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(SaveError);
      expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(error);
    }
  });

  it('stocks every old-world loot spot of a save from before them, once', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const ids = oldSpotPicks(TEST_MAP).map(oldStockId);
    const saved = JSON.parse(JSON.stringify(saveOf(world))).world;
    saved.salvage = saved.salvage.filter((stock: { id: string }) => !oldSpotOf(stock));
    saved.vehicles = saved.vehicles.filter((v: { faction: string }) => v.faction !== 'sunward');
    slots.put('auto', { format: { major: SAVE_MAJOR, minor: SAVE_FORMAT.minor - 1 }, world: saved, savedAt: 1000, runId: RUN });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    const oldIds = (w: World): string[] => w.salvage.filter((stock) => oldSpotOf(stock)).map((stock) => stock.id);
    expect(oldIds(loaded)).toEqual(ids);
    expect(loaded.salvage).toHaveLength(world.salvage.length);
    writeSave(slots, 'auto', loaded, RUN, 1000);
    expect(loadWorld(slots, 'auto', TEST_MAP)).toEqual(loaded);
  });

  it('rolls the old-world loot spots a save lacks', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const saved = JSON.parse(JSON.stringify(saveOf(world))).world;
    const first = oldStockId(oldSpotPicks(TEST_MAP)[0]);
    saved.salvage = saved.salvage.filter((stock: { id: string }) => stock.id !== first);
    slots.put('auto', { format: SAVE_FORMAT, world: saved, savedAt: 1000, runId: RUN });
    expect(loadWorld(slots, 'auto', TEST_MAP)!.salvage.some((stock) => stock.id === first)).toBe(true);
  });

  it('records the saved shape of the current format', () => {
    const format = `${SAVE_FORMAT.major}.${SAVE_FORMAT.minor}`;
    expect(SAVED_SHAPE.format, 'Run npm run save:shape after a new save format').toBe(format);
    expect(newGameShape(), 'The saved shape changed. Add a migration step in src/three/save-migrations.ts, then run npm run save:shape').toEqual(SAVED_SHAPE.shape);
  });

  it('records the saved quest names, so a lost name needs a new format', () => {
    expect(questNames(QUESTS), 'Saved quest names changed. A removed, renamed or retyped name needs a migration step. Then run npm run save:shape').toEqual(SAVED_SHAPE.quests);
  });

  it('records the links and revision of every quest, so a link change asks for a revision or a compatible mark', () => {
    expect(questLinks(QUESTS), 'Quest links changed. Run npm run save:shape and follow what it asks').toEqual(SAVED_SHAPE.questLinks);
  });

  it('finds a removed, retyped or lost checkpoint name against the recorded names', () => {
    const recorded = { world: { heard: 'boolean' as const }, local: { bowl: { trust: 'number' as const } }, checkpoints: { bowl: ['start', 'start.talk'] } };
    const current = { world: {}, local: { bowl: { trust: 'string' as const } }, checkpoints: { bowl: ['start'] } };
    expect(lostQuestNames(recorded, current)).toEqual(['World variable heard (boolean)', 'Quest bowl variable trust (number)', 'Quest bowl checkpoint start.talk']);
  });

  it('saves quest variables and the checkpoint but never ink state, and resumes there on load', () => {
    const slots = makeSlots();
    const start = standardWorld();
    const mid = chooseQuestOption(startQuest(start, QUESTS, 'bowl_hattie', 'start'), QUESTS, 0);
    writeSave(slots, 'auto', mid, 'run', 1);
    const stored = JSON.stringify(slots.get('auto'));
    expect(stored).not.toContain('"live"');
    expect(stored).not.toContain('inkVersion');
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    expect(loaded?.player.quests.session).toEqual(mid.player.quests.session);
    expect(loaded?.player.notes).toEqual(mid.player.notes);
    expect(loaded && questView(loaded, QUESTS).choices).toEqual(questView(mid, QUESTS).choices);
    expect(loaded?.player.money).toBe(mid.player.money);
    expect(loaded?.events).toEqual([]);
  });

  it('loads Agnes\'s finished outcome and an open road session unchanged, awarding nothing', () => {
    const slots = makeSlots();
    const base = standardWorld();
    const finished = structuredClone(base);
    finished.player.quests.world.pipe_fate = 'delivered';
    finished.player.quests.world.marr_regard = 'enemy';
    const open = chooseQuestOption(startQuest(structuredClone(base), QUESTS, 'pump_agnes', 'start'), QUESTS, 0);
    for (const [slot, world] of [['auto', finished], ['day', open]] as const) {
      writeSave(slots, slot, world, 'run', 1);
      const loaded = loadWorld(slots, slot, TEST_MAP);
      expect(loaded?.player.quests.world).toEqual(world.player.quests.world);
      expect(loaded?.player.quests.local).toEqual(world.player.quests.local);
      expect(loaded?.player.quests.session).toEqual(world.player.quests.session);
      expect(loaded?.player.money).toBe(world.player.money);
      expect(loaded?.player.notes).toEqual(world.player.notes);
      expect(loaded?.events).toEqual([]);
    }
  });

  it('repairs in place a save holding a quest variable, quest or checkpoint this version does not know', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const cases = [
      { world: { gone: true }, local: {}, session: null },
      { world: {}, local: { retired_quest: { n: 1 } }, session: null },
      { world: {}, local: {}, session: { quest: 'bowl_hattie', checkpoint: 'nowhere', seed: 1 } },
    ];
    for (const quests of cases) {
      const saved = saveOf(world).world as { player: Record<string, unknown> };
      slots.put('auto', { format: SAVE_FORMAT, world: { ...saved, player: { ...saved.player, quests } } });
      const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
      expect(questProblems(loaded.player.quests, QUESTS)).toEqual([]);
      expect(loaded.player.quests).toEqual({ world: {}, local: {}, session: null, live: null, seen: {} });
    }
  });

  it('still rejects quest state that is no quest state', () => {
    const slots = makeSlots();
    const saved = saveOf(standardWorld()).world as { player: Record<string, unknown> };
    slots.put('auto', { format: SAVE_FORMAT, world: { ...saved, player: { ...saved.player, quests: { world: {}, local: [], session: null } } } });
    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/badQuests/);
  });

  it('rejects notes that are no notes as an invalid world', () => {
    const slots = makeSlots();
    const saved = saveOf(standardWorld()).world as { player: Record<string, unknown> };
    slots.put('auto', { format: SAVE_FORMAT, world: { ...saved, player: { ...saved.player, notes: [null] } } });
    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/invalidWorld/);
  });

  describe('quest revisions', () => {
    const hattieMid = () => chooseQuestOption(startQuest(standardWorld(), QUESTS, 'bowl_hattie', 'start'), QUESTS, 0);

    function savedAt(world: World, revisions: Record<string, unknown> | undefined): SaveSlots {
      const slots = makeSlots();
      writeSave(slots, 'auto', world, RUN, 1);
      const envelope = { ...(slots.get('auto') as Record<string, unknown>) };
      if (revisions === undefined) delete envelope.quests;
      else envelope.quests = { ...(envelope.quests as object), ...revisions };
      slots.put('auto', envelope);
      return slots;
    }

    it('writes the revision of every quest on the save', () => {
      const slots = makeSlots();
      writeSave(slots, 'auto', hattieMid(), RUN, 1);
      expect((slots.get('auto') as { quests: unknown }).quests).toEqual(Object.fromEntries(Object.entries(QUESTS.quests).map(([id, q]) => [id, q.revision])));
    });

    it('loads a save with no revisions as revision 1 everywhere, with nothing to repair', () => {
      const mid = hattieMid();
      const loaded = loadWorld(savedAt(mid, undefined), 'auto', TEST_MAP)!;
      expect(loaded.player.quests.session).toEqual(mid.player.quests.session);
    });

    it('resets a quest the game raised past the save and awards nothing', () => {
      const mid = hattieMid();
      const loaded = loadWorld(savedAt(mid, { bowl_hattie: 0 }), 'auto', TEST_MAP)!;
      expect(loaded.player.quests.session).toBeNull();
      expect(loaded.player.quests.local.bowl_hattie).toBeUndefined();
      expect(loaded.player.money).toBe(mid.player.money);
      expect(loaded.player.xp).toBe(mid.player.xp);
      expect(loaded.events).toEqual([]);
      expect(questProblems(loaded.player.quests, QUESTS)).toEqual([]);
    });

    it('repeats the same repair on every load until the next save, which then loads the same world', () => {
      const slots = savedAt(hattieMid(), { bowl_hattie: 0 });
      const first = loadWorld(slots, 'auto', TEST_MAP)!;
      expect(loadWorld(slots, 'auto', TEST_MAP)).toEqual(first);
      writeSave(slots, 'auto', first, RUN, 2);
      expect(loadWorld(slots, 'auto', TEST_MAP)!.player.quests).toEqual(first.player.quests);
    });

    it('rejects a save made by a build with a newer revision of a quest', () => {
      const slots = savedAt(hattieMid(), { bowl_hattie: 99 });
      expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(SaveError);
      expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/newerQuests: bowl_hattie/);
    });
  });

  it('rejects a save missing a field required for future turns', () => {
    const slots = makeSlots();
    const world = standardWorld();
    for (const field of ['nextId', 'rngState', 'spawnTimer', 'weather', 'broken'] as const) {
      const saved = { ...saveOf(world).world } as Record<string, unknown>;
      delete saved[field];
      slots.put('auto', { format: SAVE_FORMAT, world: saved });
      expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/invalidWorld/);
    }
  });

  it('keeps baked props out of the save and rebuilds them from the map', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const baked = new Set(mapObstacles(TEST_MAP).map((o) => o.id));
    writeSave(slots, 'auto', world, RUN, 1000);
    const saved: { id: string }[] = savedWorldOf(slots, 'auto').obstacles;

    expect(baked.size).toBeGreaterThan(0);
    expect(saved.filter((o) => baked.has(o.id))).toEqual([]);
    expect(saved.length).toBe(world.obstacles.length - baked.size - hollowObstacles().length);
    expect(loadWorld(slots, 'auto', TEST_MAP)!.obstacles).toEqual(world.obstacles);
  });

  it('rejects a save that holds a baked prop', () => {
    const slots = makeSlots();
    const world = standardWorld();
    writeSave(slots, 'auto', world, RUN, 1000);
    const save = slots.get('auto') as { world: Saved };
    save.world.obstacles.push(mapObstacles(TEST_MAP)[0]);
    slots.put('auto', save);

    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(SaveError);
    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/baked/);
  });

  it('keeps a broken baked fence broken across a save and a load', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const fence = world.obstacles.find(isBreakable);
    if (!fence || !isBakedObstacle(fence)) throw new Error('The map needs a baked fence or junk pile');
    breakProp(world, fence.id, world.player.vehicleId, 3);
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.obstacles.map((o) => o.id)).not.toContain(fence.id);
    expect(loaded.obstacles).toEqual(world.obstacles);
    expect(loaded.broken).toEqual(world.broken);
  });

  it('stores no trails, visible tiles, last turn events, removed vehicles or broken prop copies, and rebuilds them on load', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const fence = world.obstacles.find(isBreakable)!;
    breakProp(world, fence.id, world.player.vehicleId, 3);
    world.vehicles[0].trail = [{ x: 1, y: 2, heading: 0 }];
    world.events = [{ t: 'wake', gaveUp: false }];
    world.removed = [world.vehicles[1]];
    writeSave(slots, 'auto', world, RUN, 1000);
    const saved = savedWorldOf(slots, 'auto');

    expect(saved).not.toHaveProperty('events');
    expect(saved).not.toHaveProperty('removed');
    expect(saved.player).not.toHaveProperty('visible');
    expect(saved.vehicles.filter((v: object) => 'trail' in v)).toEqual([]);
    expect(saved.broken).toEqual([{ id: fence.id, turn: world.broken[0].turn }]);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded.player.visible).toEqual(world.player.visible);
    expect(loaded.broken).toEqual(world.broken);
    expect([loaded.events, loaded.removed, loaded.vehicles[0].trail]).toEqual([[], [], []]);
  });

  it('rebuilds contacts on load without paying perception XP for them again', () => {
    const slots = makeSlots();
    const world = emptyWorld({ x: 30, y: 30 });
    world.turn = Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => !sunAt(t))!;
    const buggy = addVehicle(world, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 45, y: 30 });
    buggy.speed = 6;
    practiceContacts(world, refreshVision(world));
    writeSave(slots, 'auto', world, RUN, 1000);

    expect(savedWorldOf(slots, 'auto').player).not.toHaveProperty('contacts');
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded.player.contacts).toEqual(world.player.contacts);
    expect(loaded.player.clouds).toEqual(world.player.clouds);
    expect([loaded.player.xp, loaded.player.repeats]).toEqual([world.player.xp, world.player.repeats]);
    practiceContacts(loaded, refreshVision(loaded));
    expect(loaded.player.xp).toEqual(world.player.xp);
  });

  it('keeps the spot a driver last made progress at through a reload, and load pays nothing', () => {
    const slots = makeSlots();
    const world = emptyWorld();
    world.turn = 900;
    const trader = addVehicle(world, 'independent', 'scout', ['mg', 'stockEngine'], { x: 40, y: 40 });
    trader.brain = npcBrain('trader', trader.pos, ['trader']);
    trader.brain.progress = { key: 'idle -', since: 880, at: { x: 38.5, y: 41 } };
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.vehicles.find((v) => v.id === trader.id)!.brain!.progress).toEqual(trader.brain.progress);
    expect([loaded.player.money, loaded.player.xp, loaded.events]).toEqual([world.player.money, world.player.xp, []]);
  });

  it('keeps every driver personality through a save and a load, and awards nothing on load', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const drivers = world.vehicles.filter((v) => v.brain);
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(drivers.length).toBeGreaterThan(0);
    expect(loaded.vehicles.filter((v) => v.brain).map((v) => v.brain!.personality)).toEqual(drivers.map((v) => v.brain!.personality));
    expect(loaded.vehicles.map((v) => v.resources)).toEqual(world.vehicles.map((v) => v.resources));
    expect([loaded.player.money, loaded.player.xp, loaded.player.repeats, loaded.events]).toEqual([world.player.money, world.player.xp, world.player.repeats, []]);
  });

  it('keeps the stranded count and anchor of a held truck through a reload, and awards nothing on load', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const held = world.vehicles.find((v) => v.brain)!;
    held.strandedTurns = 2;
    held.strandedAt = { x: held.pos.x + 0.25, y: held.pos.y };
    writeSave(slots, 'auto', world, RUN, 1000);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    const back = loaded.vehicles.find((v) => v.id === held.id)!;
    expect([back.strandedTurns, back.strandedAt]).toEqual([2, held.strandedAt]);
    expect([loaded.player.money, loaded.player.xp, loaded.player.repeats, loaded.events]).toEqual([world.player.money, world.player.xp, world.player.repeats, []]);
  });

  it('stands a broken prop up again when the map no longer has it as a breakable prop', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const rock = mapObstacles(TEST_MAP).find((o) => o.kind === 'rock')!;
    const fence = world.obstacles.find(isBreakable)!;
    const stranger = { ...fence, id: 'fence-999999' };

    for (const obstacle of [rock, stranger]) {
      writeSave(slots, 'auto', { ...world, broken: [{ obstacle, turn: 1 }], obstacles: world.obstacles.filter((o) => o.id !== obstacle.id) }, RUN, 1000);
      const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
      expect(loaded.broken).toEqual([]);
      expect(loaded.obstacles.filter((o) => o.id === obstacle.id)).toHaveLength(obstacle === rock ? 1 : 0);
    }
  });

  it('repairs a save made on an older bake of the map instead of rejecting it', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const broken = world.obstacles.find(isBreakable)!;
    putOnMap(slots, { ...world, broken: [{ obstacle: broken, turn: 1 }], obstacles: world.obstacles.filter((o) => o !== broken) }, 'older-bake');
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded.mapHash).toBe(TEST_MAP.hash);
    expect(loaded.size).toBe(TEST_MAP.terrain.size);
    expect(loaded.broken).toEqual([]);
    expect(loaded.obstacles.some((o) => o.id === broken.id)).toBe(true);
    expect(loaded.player.storage).toEqual(world.player.storage);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.events).toEqual([]);
  });

  it('still rejects a Roaming save that names a highway map', () => {
    const slots = makeSlots();
    putOnMap(slots, standardWorld(), 'highway:0:21:0');
    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/otherMap/);
  });

  it('saves only after each twentieth completed turn', () => {
    const slots = makeSlots();
    const world = standardWorld();
    saveWorld(slots, { ...world, turn: 20 }, RUN, 20, 1000);
    expect(loadWorld(slots, 'auto', TEST_MAP)).toBeNull();
    saveWorld(slots, { ...world, turn: 21 }, RUN, 20, 1000);
    expect(loadWorld(slots, 'auto', TEST_MAP)?.turn).toBe(21);
    saveWorld(slots, { ...world, turn: 22 }, RUN, 20, 1000);
    expect(loadWorld(slots, 'auto', TEST_MAP)?.turn).toBe(21);
    saveWorld(slots, { ...world, turn: 41 }, RUN, 20, 1000);
    expect(loadWorld(slots, 'auto', TEST_MAP)?.turn).toBe(41);
  });

  it('never saves a dead world', () => {
    const slots = makeSlots();
    const world = standardWorld();
    saveWorld(slots, { ...world, turn: 21 }, RUN, 20, 1000);
    const previous = slots.get('auto');
    const dead = { ...world, turn: 41, player: { ...world.player, health: 0, state: 'dead' as const } };
    saveWorld(slots, dead, RUN, 20, 1000);
    expect(slots.get('auto')).toEqual(previous);
    expect(() => writeSave(slots, 'auto', dead, RUN, 1000)).toThrow(/dead/);
    expect(slots.get('auto')).toEqual(previous);
  });

  it('rejects an invalid interval instead of skipping saves', () => {
    const slots = makeSlots();
    const world = standardWorld();
    expect(() => saveWorld(slots, world, RUN, 0, 1000)).toThrow(/interval/);
  });

  it('stores no terrain and restores far routes', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const npc = world.vehicles.find((v) => v.brain);
    if (!npc?.brain) throw new Error('The start world needs an NPC');
    npc.brain.farRoute = { dest: { x: 300, y: 200 }, points: [{ x: 290, y: 205 }, { x: 300, y: 200 }], offRoad: false };
    saveWorld(slots, { ...world, turn: 21 }, RUN, 20, 1000);
    expect(savedWorldOf(slots, 'auto')).not.toHaveProperty('terrain');
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded).toEqual({ ...world, turn: 21 });
    expect(loaded.terrain).toBe(world.terrain);
  });

  it('writes the day start autosave on the first turn of a day only', () => {
    const slots = makeSlots();
    const world = standardWorld();
    expect([319, 320, 321, 770].map(isDayStart)).toEqual([false, true, false, true]);
    saveWorld(slots, { ...world, turn: 319 }, RUN, 20, 1000);
    saveWorld(slots, { ...world, turn: 321 }, RUN, 20, 1000);
    expect(slots.has('day')).toBe(false);
    saveWorld(slots, { ...world, turn: 320 }, RUN, 20, 1000);
    expect(loadWorld(slots, 'day', TEST_MAP)?.turn).toBe(320);
  });

  it('writes only the autosave on the interval and in town, and never a manual slot', () => {
    const slots = makeSlots();
    const world = standardWorld();
    saveWorld(slots, { ...world, turn: 21 }, RUN, 20, 1000);
    saveInTown(slots, emptyWorld(sitePads(REGION.towns[0])[0]), RUN, 1000);
    const written = SLOTS.filter((slot: SlotId) => hasSave(slots, [slot]));
    expect(written).toEqual(['auto']);
  });

  it('writes no slot for a dead world', () => {
    const slots = makeSlots();
    const world = standardWorld();
    const dead = { ...world, turn: 320, player: { ...world.player, health: 0, state: 'dead' as const } };
    saveWorld(slots, dead, RUN, 20, 1000);
    expect(hasSave(slots, SLOTS)).toBe(false);
  });

  it('keeps the manual slots and the sound settings when a new game clears the autosaves', () => {
    const slots = makeSlots();
    const storage = makeStorage();
    const world = standardWorld();
    for (const slot of SLOTS) writeSave(slots, slot, world, RUN, 1000);
    storage.setItem('roam-sound', '{}');
    clearGame(slots, storage);
    expect(SLOTS.filter((slot) => hasSave(slots, [slot]))).toEqual(['slot1', 'slot2', 'slot3']);
    expect(storage.getItem('roam-sound')).toBe('{}');
  });

  it('loads a save from before slots, with no savedAt, as the autosave', () => {
    const slots = makeSlots();
    const world = standardWorld();
    slots.put('auto', saveOf(world));
    expect(loadWorld(slots, 'auto', TEST_MAP)).toEqual(world);
  });

  it('holds the run id, and gives a save from before run ids one from its seed', () => {
    const slots = makeSlots();
    const world = standardWorld();
    writeSave(slots, 'auto', world, RUN, 1000);
    expect(savedRunId(slots.get('auto'))).toBe(RUN);
    expect(savedRunId(saveOf(world))).toBe('legacy-1337');
    expect(savedRunId('{')).toBeNull();
  });
});

describe('saved world settings', () => {
  const tuned = (damage: number, fuelUse: number) => parseSetup({ mode: 'roaming', settings: { damage, fuelUse, supplyUse: 1, enemyGearGrowth: 1 } });

  function storedWith(setup: unknown): SaveSlots {
    const slots = makeSlots();
    const save = JSON.parse(JSON.stringify(saveOf(standardWorld())));
    save.world.setup = setup;
    if (setup === undefined) delete save.world.setup;
    slots.put('auto', save);
    return slots;
  }

  it('keeps each slot its own setup across a save and a load', () => {
    const slots = makeSlots();
    writeSave(slots, 'slot1', newWorld(1337, startKit('standard'), TEST_MAP, tuned(1.5, 2)), RUN, 1000);
    writeSave(slots, 'slot2', newWorld(1337, startKit('standard'), TEST_MAP, tuned(0.5, 1)), RUN, 1000);

    expect(loadWorld(slots, 'slot1', TEST_MAP)?.setup).toEqual(tuned(1.5, 2));
    expect(loadWorld(slots, 'slot2', TEST_MAP)?.setup).toEqual(tuned(0.5, 1));
  });

  it('sends a save at a format no build shipped to the carry route, and keeps the stored save', () => {
    const slots = makeSlots();
    const { steps: _steps, ...save } = JSON.parse(JSON.stringify(saveOf(newWorld(1337, startKit('standard'), TEST_MAP, tuned(2, 2)))));
    const stored = { ...save, format: { major: SAVE_MAJOR, minor: 13 } };
    slots.put('auto', stored);

    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/outOfReach/);
    expect(slots.get('auto')).toEqual(stored);
  });

  it.each([
    ['NaN, which JSON stores as null', { mode: 'roaming', settings: { damage: NaN, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 1 } }],
    ['zero', { mode: 'roaming', settings: { damage: 1, fuelUse: 0, supplyUse: 1, enemyGearGrowth: 1 } }],
    ['a runaway value', { mode: 'roaming', settings: { damage: 10, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 1 } }],
  ])('loads a save with %s, resetting that setting', (_, setup) => {
    expect(loadWorld(storedWith(setup), 'auto', TEST_MAP)!.setup).toEqual(defaultSetup('roaming'));
  });

  it.each([
    ['an unknown mode', { mode: 'campaign', settings: { damage: 1, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 1 } }],
    ['no setup at the current format', undefined],
  ])('rejects a save with %s as a save error', (_, setup) => {
    expect(() => loadWorld(storedWith(setup), 'auto', TEST_MAP)).toThrow(SaveError);
    expect(() => loadWorld(storedWith(setup), 'auto', TEST_MAP)).toThrow(/badSetup/);
  });
});

describe('saveKey', () => {
  it('keeps the plain key for an unscoped build', () => {
    expect(saveKey('')).toBe('roam.save');
  });

  it('adds the scope to the key', () => {
    expect(saveKey('factory')).toBe('roam.save.factory');
  });

  it('throws a SaveError when a migration step cannot read an old save', () => {
    const slots = makeSlots();
    slots.put('auto', { format: { major: SAVE_MAJOR, minor: 1 }, world: { vehicles: 5, player: 7 } });
    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/notMigrated/);
  });
});

function pattern(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * 7 + (i >> 3)) % 3 === 0 ? 1 : 0);
}

describe('explored bitset', () => {
  it('round-trips any length', () => {
    for (const length of [1, 8, 9, 360_000]) {
      const explored = pattern(length);
      expect(unpackExplored(packExplored(explored), length)).toEqual(explored);
    }
  });

  it('packs 360,000 tiles into 60,000 characters', () => {
    expect(packExplored(new Uint8Array(360_000)).length).toBe(60_000);
  });

  it('rejects the wrong length and a non-string as a SaveError', () => {
    const packed = packExplored(pattern(16));
    expect(() => unpackExplored(packed, 40)).toThrow(SaveError);
    expect(() => unpackExplored([0, 1], 2)).toThrow(SaveError);
    expect(() => unpackExplored('!!!', 8)).toThrow(SaveError);
  });

  it('refuses to pack a value other than 0 or 1', () => {
    expect(() => packExplored(Uint8Array.from([0, 2]))).toThrow(/not 0 or 1/);
  });
});

describe('SaveHold', () => {
  it('starts free', () => {
    expect(new SaveHold().held).toBe(false);
  });

  it('holds after an error until a turn that began after it finishes clean', () => {
    const hold = new SaveHold();
    hold.noteError();
    hold.finishTurn();
    expect(hold.held).toBe(true);
    hold.beginTurn();
    hold.finishTurn();
    expect(hold.held).toBe(false);
  });

  it('stays held when an error happens during the turn', () => {
    const hold = new SaveHold();
    hold.noteError();
    hold.beginTurn();
    hold.noteError();
    hold.finishTurn();
    expect(hold.held).toBe(true);
  });

  it('holds again on an error after a clean turn', () => {
    const hold = new SaveHold();
    hold.beginTurn();
    hold.finishTurn();
    hold.noteError();
    expect(hold.held).toBe(true);
  });
});

describe('full browser storage', () => {
  it('keeps the slot in memory and reports the failure when the backend refuses a write', async () => {
    const backend = memoryBackend();
    const slots = new SaveSlots(backend, new Map());
    const errors: unknown[] = [];
    slots.onError = (err) => errors.push(err);
    const world = { ...standardWorld(), turn: 21 };
    writeSave(slots, 'auto', world, RUN, 1000);
    await slots.flush();
    const quota = new DOMException('quota', 'QuotaExceededError');
    backend.put = () => Promise.reject(quota);
    writeSave(slots, 'auto', { ...world, turn: 22 }, RUN, 2000);
    await slots.flush();
    expect(errors).toEqual([quota]);
    expect((await backend.readAll()).has('auto')).toBe(true);
  });
});

describe('relations in a save', () => {
  const npcAt = (w: World, faction: Faction, template: string, pos: { x: number; y: number }) => {
    const v = addVehicle(w, faction, 'scout', ['mg', 'stockEngine'], pos);
    v.brain = npcBrain(template, pos, ['trader']);
    return v;
  };

  it('saves and loads standing, deeds, memories, feuds, truces and escorts as they are and awards nothing', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const victim = npcAt(w, 'bowl', 'trader', { x: 30, y: 34 });
    const guard = npcAt(w, 'bowl', 'convoyGuard', { x: 32, y: 36 });
    addState(w, 'escort', guard.id, victim.id, { kind: 'escort', site: null, fee: 0 });
    const friend = npcAt(w, 'guidestar', 'courier', { x: 40, y: 30 });
    addState(w, 'truce', friend.id, me.id, { kind: 'none' });
    noteAttack(w, me, victim, true);
    noteDeed(w, me, friend, 'towed', true);
    w.events = [];
    const slots = new SaveSlots(memoryBackend(), new Map());
    writeSave(slots, 'auto', w, 'run-1', 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded.player.standing).toEqual(w.player.standing);
    expect(loaded.player.deeds).toEqual(w.player.deeds);
    expect(loaded.vehicles.find((v) => v.id === victim.id)!.brain!.memories).toEqual(victim.brain!.memories);
    expect(loaded.states).toEqual(w.states);
    expect(loaded.events).toEqual([]);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.player.money).toBe(w.player.money);
  });

  it('gives back the Sunward record and the order\'s night ledger after a save and load', () => {
    const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    w.sunward = { collapsed: 330, night: { dusk: 245, roster: ['v9', 'v10'], beaten: ['v9'], calls: { v1: { count: 2, turn: 300 } }, hunt: { party: ['v11'], grounds: [{ x: 1, y: 2 }, { x: 3, y: 4 }], prey: null, over: true, breaks: 1 }, shouted: ['v1'], offered: ['v1'] }, lastHunt: 1 };
    w.events = [];
    const slots = new SaveSlots(memoryBackend(), new Map());

    writeSave(slots, 'auto', w, 'run-1', 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.sunward).toEqual(w.sunward);
    expect(loaded.player.standing.sunward).toBe(-20);
    expect(loaded.events).toEqual([]);
  });

  it('gives back the order parked in the fort bays, awarding nothing at load', () => {
    const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    fillHollow(w);
    w.events = [];
    const slots = new SaveSlots(memoryBackend(), new Map());

    writeSave(slots, 'auto', w, 'run-1', 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    const members = (x: typeof w) => membersOf(x).map((v) => ({ id: v.id, pos: v.pos, home: v.brain!.home }));
    expect(members(loaded)).toEqual(members(w));
    expect(members(loaded).every((m) => hollowBays().some((b) => b.x === m.home.x && b.y === m.home.y))).toBe(true);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.events).toEqual([]);
  });

  it('moves a truck standing in the Hollow\'s wall off it at load, awarding nothing', () => {
    const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    const wall = hollowObstacles().find((o) => o.kind === 'landmark' && o.look === 'fortScrapWall')!;
    const me = playerVehicle(w);
    me.pos = { ...wall.pos };
    w.events = [];
    const slots = new SaveSlots(memoryBackend(), new Map());

    writeSave(slots, 'auto', w, 'run-1', 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    const moved = playerVehicle(loaded);
    expect(dist(moved.pos, wall.pos)).toBeGreaterThan(0.5);
    expect(isFree(loaded, moved.pos, chassisDef(moved.chassisId).radius, moved.id)).toBe(true);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });

  it('gives back a night opened between the ride-out and dusk, awarding nothing at load', () => {
    const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    fillHollow(w);
    w.turn = rideOutTurn(duskTurn(2)) + 3;
    advanceSunward(w);
    w.events = [];
    const slots = new SaveSlots(memoryBackend(), new Map());

    writeSave(slots, 'auto', w, 'run-1', 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(sunwardFacts(w).night?.dusk).toBe(duskTurn(2));
    expect(sunwardFacts(loaded)).toEqual(sunwardFacts(w));
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.events).toEqual([]);
  });

  it('keeps the Hollow out of the save and builds it again at load, also for a save that never held it', () => {
    const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    w.events = [];
    const slots = new SaveSlots(memoryBackend(), new Map());

    writeSave(slots, 'auto', w, 'run-1', 1000);
    const saved = savedWorldOf(slots, 'auto');
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(saved.obstacles.some((o) => o.id.startsWith('hollow-'))).toBe(false);
    expect(loaded.obstacles.filter((o) => o.id.startsWith('hollow-'))).toEqual(w.obstacles.filter((o) => o.id.startsWith('hollow-')));
    expect(loaded.obstacles).toEqual(w.obstacles);
  });
});
