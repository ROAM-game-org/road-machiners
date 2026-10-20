import { describe, expect, it } from 'vitest';
import { chassisDef } from '../data/chassis';
import { CHEATS } from '../data/rules';
import { startKit } from '../data/start';
import { TIME } from '../data/time';
import { TEST_MAP } from '../test/map';
import { reusedWorld } from '../test/world-cache';
import { playerVehicle } from './damage';
import { freeSpotNear } from './free-spot';
import { isBakedObstacle, isBreakable, mapObstacles } from './mapgen';
import { fitBake, repairMap, settleTrucks, type SavedMapWorld } from './map-repair';
import { isRoadWreck, oldSpotOf, oldSpotPicks, oldStockId, renewSalvage, stockOldSpots } from './salvage';
import { defaultSetup } from './settings';
import { fillHollow, isFree } from './spawn';
import { hollowBays, isHollowObstacle, membersOf } from './sunward';
import { surveySites } from './survey';
import { isLootSpot } from './territory';
import { addVehicle, npcBrain } from './testkit';
import type { Contract } from './market';
import type { NpcState, Obstacle, SalvageStock, World } from './types';
import { dist, type Vec } from './vec';
import { newWorld } from './world';

const OLD_SIZE = 600;
const RATIO = TEST_MAP.terrain.size / OLD_SIZE;

function base(): World {
  return reusedWorld('map repair', () => newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming')));
}

function savedOf(world: World, size = world.size): SavedMapWorld {
  const { terrain: _terrain, ...rest } = structuredClone(world);
  return {
    ...rest,
    size,
    player: { ...rest.player, explored: new Uint8Array(size * size) },
    broken: world.broken.map((b) => ({ id: b.obstacle.id, turn: b.turn })),
    obstacles: rest.obstacles.filter((o) => !isBakedObstacle(o) && !isHollowObstacle(o)),
  };
}

function oldScaleBase(): World {
  const w = base();
  const me = playerVehicle(w);
  w.vehicles = [me];
  const spot = freeSpotNear(w, scaled({ x: 200, y: 200 }), chassisDef(me.chassisId).radius, me.id)!;
  me.pos = { x: spot.x / RATIO, y: spot.y / RATIO };
  return w;
}

const scaled = (p: Vec): Vec => ({ x: p.x * RATIO, y: p.y * RATIO });

function expectNear(actual: Vec, expected: Vec): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

function freeAfterScaling(world: World, near: Vec, radius: number): Vec {
  const spot = freeSpotNear(world, scaled(near), radius, null);
  if (!spot) throw new Error('No free ground for the test');
  return { x: spot.x / RATIO, y: spot.y / RATIO };
}

describe('repairMap positions', () => {
  it('sets the size and the map hash, and resamples the explored tiles to the new size', () => {
    const saved = savedOf(oldScaleBase(), OLD_SIZE);
    saved.player.explored[10 * OLD_SIZE + 20] = 1;
    saved.player.explored[599 * OLD_SIZE + 599] = 1;
    const world = repairMap(saved, TEST_MAP);
    const size = TEST_MAP.terrain.size;
    expect(world.size).toBe(size);
    expect(world.mapHash).toBe(TEST_MAP.hash);
    expect(world.terrain).toBe(TEST_MAP.terrain);
    expect(world.player.explored).toHaveLength(size * size);
    expect(world.player.explored[Math.floor(10 * RATIO) * size + Math.floor(20 * RATIO)]).toBe(1);
    expect(world.player.explored[(size - 1) * size + size - 1]).toBe(1);
  });

  it('keeps the explored tiles when only the bake changed', () => {
    const world = base();
    const saved = savedOf(world);
    saved.player.explored[5 * world.size + 7] = 1;
    expect(repairMap(saved, TEST_MAP).player.explored).toEqual(saved.player.explored);
  });

  it('scales a truck, its order, its brain and every position its goals and memories hold', () => {
    const w = oldScaleBase();
    const radius = chassisDef('scout').radius;
    const home = { x: 100, y: 100 };
    const npc = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], freeAfterScaling(w, { x: 120, y: 90 }, radius));
    const brain = npcBrain('scavenger', home, ['scavenger']);
    brain.goal = { x: 1, y: 1 };
    brain.lastPos = { x: 2, y: 2 };
    brain.progress = { key: 'k', since: 1, at: { x: 3, y: 3 } };
    brain.recoveryGoal = { x: 4, y: 4 };
    brain.stalled = 2;
    brain.farRoute = { dest: { x: 5, y: 5 }, points: [{ x: 5, y: 5 }], offRoad: false };
    brain.tracks = { v1: { at: { x: 10, y: 20 }, turn: 3, sighted: true, seenSince: null, choice: null, chosenInSight: false } };
    brain.targetSeen = { id: 'v1', turn: 2, pos: { x: 30, y: 40 }, heading: 1, speed: 2 };
    brain.memories = [{ turn: 1, fact: { kind: 'sighting', vehicle: 'v1', at: { x: 50, y: 60 }, heading: 0 } }, { turn: 1, fact: { kind: 'helped', by: 'v1', deed: 'aided' } }];
    brain.goals = [{ kind: 'explore', targetId: null, destination: { x: 70, y: 80 }, phase: 'travel', reason: 'explore', leg: { from: { x: 7, y: 8 }, turn: 4 }, heard: { x: 9, y: 9 } }];
    npc.brain = brain;
    npc.order = { kind: 'through', dest: { x: 1, y: 1 } };
    npc.weaponOrders = { gun: { targetId: 'v1', aim: 'body' } };
    npc.trail = [{ x: 1, y: 1, heading: 0 }];
    const me = playerVehicle(w);
    me.order = { kind: 'stopAt', dest: { x: 150, y: 150 } };
    const before = { npc: npc.pos, me: me.pos };

    const out = repairMap(savedOf(w, OLD_SIZE), TEST_MAP);
    const moved = out.vehicles.find((v) => v.id === npc.id)!;
    expectNear(moved.pos, scaled(before.npc));
    expect(moved.order).toBeNull();
    expect(moved.weaponOrders).toEqual({});
    expect(moved.trail).toEqual([]);
    expectNear(moved.brain!.home, scaled(home));
    expect(moved.brain!.goal).toBeNull();
    expect([moved.brain!.lastPos, moved.brain!.progress, moved.brain!.recoveryGoal, moved.brain!.stalled, moved.brain!.farRoute]).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expectNear(moved.brain!.tracks.v1.at, scaled({ x: 10, y: 20 }));
    expectNear(moved.brain!.targetSeen!.pos, scaled({ x: 30, y: 40 }));
    const [sighting, helped] = moved.brain!.memories;
    expectNear((sighting.fact as { at: Vec }).at, scaled({ x: 50, y: 60 }));
    expect(helped.fact).toEqual({ kind: 'helped', by: 'v1', deed: 'aided' });
    const [goal] = moved.brain!.goals;
    expectNear(goal.destination!, scaled({ x: 70, y: 80 }));
    expectNear(goal.leg!.from, scaled({ x: 7, y: 8 }));
    expectNear(goal.heard!, scaled({ x: 9, y: 9 }));
    const player = playerVehicle(out);
    expectNear(player.pos, scaled(before.me));
    expect(player.order).toMatchObject({ kind: 'stopAt' });
    expectNear((player.order as { dest: Vec }).dest, scaled({ x: 150, y: 150 }));
  });

  it('scales the positions in contracts, shop offers, states and the Sunward hunt', () => {
    const w = oldScaleBase();
    const escort = { id: 'ct-escort', shop: 'bowl', kind: 'escort', client: 'v1', to: 'nose', reward: 1, deadline: 9, window: 9, tier: 1, threat: 'raiders', span: 3, together: 0, seen: { x: 11, y: 12, turn: 5 }, apart: 0, stuck: 0, holdUntil: null } as unknown as Contract;
    const rescue = { id: 'ct-rescue', shop: 'bowl', kind: 'rescue', client: 'v1', driver: 'Jed', need: 'fuel', area: { x: 13, y: 14 }, reward: 1, deadline: 9, window: 9, tier: 1, fulfilled: false } as unknown as Contract;
    const search = { id: 'ct-search', shop: 'bowl', kind: 'search', target: 'v1', driver: 'Jed', template: 'buggy', lead: { at: { x: 15, y: 16 }, turn: 2 }, reward: 1, deadline: 9, window: 9, tier: 1, delivered: false } as unknown as Contract;
    w.player.contracts = [escort, rescue];
    w.shops.bowl.contracts = [search];
    const offering: NpcState = { id: 's1', kind: 'offering', holder: 'v1', other: 'v2', turnsLeft: 4, born: 1, data: { kind: 'offering', core: { x: 21, y: 22 }, closest: 3 } };
    const drag: NpcState = { id: 's2', kind: 'drag', holder: 'v1', other: 'v2', turnsLeft: 4, born: 1, data: { kind: 'drag', drop: { x: 23, y: 24 } } };
    w.states = [offering, drag];
    w.sunward = { collapsed: null, night: { dusk: 1, roster: [], beaten: [], calls: {}, hunt: { party: [], grounds: [{ x: 31, y: 32 }, { x: 33, y: 34 }], prey: null, over: false, breaks: 0 }, shouted: [], offered: [] }, lastHunt: null };

    const out = repairMap(savedOf(w, OLD_SIZE), TEST_MAP);
    const [seen, area] = out.player.contracts;
    expectNear((seen as { seen: Vec }).seen, scaled({ x: 11, y: 12 }));
    expect((seen as { seen: { turn: number } }).seen.turn).toBe(5);
    expectNear((area as { area: Vec }).area, scaled({ x: 13, y: 14 }));
    expectNear((out.shops.bowl.contracts[0] as { lead: { at: Vec } }).lead.at, scaled({ x: 15, y: 16 }));
    expectNear((out.states[0].data as { core: Vec }).core, scaled({ x: 21, y: 22 }));
    expectNear((out.states[1].data as { drop: Vec }).drop, scaled({ x: 23, y: 24 }));
    const grounds = out.sunward!.night!.hunt!.grounds;
    expectNear(grounds[0], scaled({ x: 31, y: 32 }));
    expectNear(grounds[1], scaled({ x: 33, y: 34 }));
  });

  it('snaps the home of a Sunward car to the nearest fort bay', () => {
    const w = oldScaleBase();
    fillHollow(w);
    const bays = hollowBays();
    const members = membersOf(w);
    expect(members.length).toBeGreaterThan(0);
    members.forEach((v) => {
      const bay = bays.reduce((best, b) => (dist(b, v.brain!.home) < dist(best, v.brain!.home) ? b : best));
      v.brain!.home = { x: bay.x / RATIO + 0.1, y: bay.y / RATIO - 0.1 };
    });
    const out = repairMap(savedOf(w, OLD_SIZE), TEST_MAP);
    for (const v of membersOf(out)) expect(bays.some((b) => b.x === v.brain!.home.x && b.y === v.brain!.home.y)).toBe(true);
  });

  it('moves a truck standing in a prop to the nearest free spot and leaves a free truck where it is', () => {
    const w = base();
    const rock = mapObstacles(TEST_MAP).find((o) => o.kind === 'rock')!;
    const radius = chassisDef('scout').radius;
    const stuck = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { ...rock.pos });
    stuck.speed = 5;
    stuck.order = { kind: 'through', dest: { x: 1, y: 1 } };
    const free = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], freeSpotNear(w, { x: rock.pos.x + 12, y: rock.pos.y }, radius, null)!);
    const freeAt = { ...free.pos };

    const out = repairMap(savedOf(w), TEST_MAP);
    settleTrucks(out);
    const moved = out.vehicles.find((v) => v.id === stuck.id)!;
    expect(isFree(out, moved.pos, radius, moved.id)).toBe(true);
    expect(dist(moved.pos, rock.pos)).toBeLessThanOrEqual(CHEATS.searchRings * CHEATS.searchStep);
    expect(moved.speed).toBe(0);
    expect(moved.order).toBeNull();
    expect(out.vehicles.find((v) => v.id === free.id)!.pos).toEqual(freeAt);
  });

  it('throws when no free ground lies within reach of a truck', () => {
    const w = base();
    addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: -1000, y: -1000 });
    expect(() => settleTrucks(repairMap(savedOf(w), TEST_MAP))).toThrow(/No free spot/);
  });
});

describe('repairMap transient state', () => {
  it('drops craters, smoke, dust, fields, flares, harpoon lines, weather and the last turn', () => {
    const w = base();
    w.craters.push({ id: 'c1', pos: { x: 5, y: 5 }, radius: 3, turn: 1 });
    w.smoke.push({ id: 'sm1', source: 'v1', pos: { x: 5, y: 5 }, r: 2, turnsLeft: 3 });
    w.dustClouds.push({ id: 'd1', source: 'v1', pos: { x: 5, y: 5 }, vel: { x: 1, y: 0 }, age: 0, range: 3 });
    w.fields.push({ id: 'f1', kind: 'oil', source: 'v1', pos: { x: 5, y: 5 }, r: 2, turnsLeft: 3, hit: [] });
    w.flares.push({ id: 'fl1', source: 'v1', pos: { x: 5, y: 5 }, r: 2, turnsLeft: 3 });
    w.lines.push({ id: 'l1', from: 'v1', fromPart: 'p', to: 'v2', toPart: 'q', length: 3, turnsLeft: 2 });
    w.weather.push({ id: 'w1', kind: 'storm', pos: { x: 5, y: 5 }, radius: 4, vel: { x: 1, y: 0 }, turnsLeft: 5, born: 1 });
    w.events.push({ t: 'honk', vehicle: w.player.vehicleId });
    w.removed.push(addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 1, y: 1 }));
    w.vehicles.pop();
    playerVehicle(w).trail = [{ x: 1, y: 1, heading: 0 }];
    playerVehicle(w).stormExposure = { w1: 2 };

    const out = repairMap(savedOf(w), TEST_MAP);
    expect([out.craters, out.smoke, out.dustClouds, out.fields, out.flares, out.lines, out.weather, out.events, out.removed]).toEqual([[], [], [], [], [], [], [], [], []]);
    expect(playerVehicle(out).trail).toEqual([]);
    expect(playerVehicle(out).stormExposure).toEqual({});
  });
});

describe('repairMap obstacles', () => {
  it('rebuilds the baked props from the map, stands every saved broken prop up again and keeps the saved wrecks', () => {
    const w = base();
    const fence = w.obstacles.find(isBreakable)!;
    const stale: Obstacle = { id: 'rock999999', pos: { x: 50, y: 50 }, r: 1, kind: 'rock' };
    const saved = savedOf({ ...w, obstacles: [...w.obstacles.filter((o) => o !== fence), stale], broken: [{ obstacle: fence, turn: 2 }] });
    saved.obstacles.push(stale);
    const world = repairMap(saved, TEST_MAP);
    const baked = mapObstacles(TEST_MAP);
    expect(world.obstacles.filter(isBakedObstacle).map((o) => o.id)).toEqual(baked.map((o) => o.id));
    expect(world.obstacles.some((o) => o.id === stale.id)).toBe(false);
    expect(world.broken).toEqual([]);
    expect(world.obstacles.filter(isRoadWreck)).toHaveLength(w.obstacles.filter(isRoadWreck).length);
    expect(world.obstacles.some((o) => o.id === 'opening-wreck')).toBe(true);
  });

  it('moves a road wreck that lands on a prop to clear ground and takes its stock along', () => {
    const w = base();
    const rock = mapObstacles(TEST_MAP).find((o) => o.kind === 'rock')!;
    const wreck = w.obstacles.find(isRoadWreck)!;
    wreck.pos = { ...rock.pos };
    w.salvage.find((s) => s.id === wreck.id)!.pos = { ...rock.pos };
    const world = repairMap(savedOf(w), TEST_MAP);
    const placed = world.obstacles.find((o) => o.id === wreck.id)!;
    expect(dist(placed.pos, rock.pos)).toBeGreaterThan(0);
    expect(world.obstacles.filter((o) => o !== placed).some((o) => o.kind !== 'site' && dist(o.pos, placed.pos) < o.r + placed.r)).toBe(false);
    expect(world.salvage.find((s) => s.id === wreck.id)!.pos).toEqual(placed.pos);
  });

  it('puts the story wreck back at the position its data gives', () => {
    const w = base();
    const story = w.obstacles.find((o) => o.id.startsWith('story-'))!;
    const original = { ...story.pos };
    story.pos = { x: 1, y: 1 };
    w.salvage.find((s) => s.id === story.id)!.pos = { x: 1, y: 1 };
    const out = repairMap(savedOf(w), TEST_MAP);
    expect(out.obstacles.find((o) => o.id === story.id)!.pos).toEqual(original);
    expect(out.salvage.find((s) => s.id === story.id)!.pos).toEqual(original);
  });
});

describe('repairMap stocks', () => {
  const picks = oldSpotPicks(TEST_MAP);

  function stockOf(w: World, id: string): SalvageStock {
    return w.salvage.find((s) => s.id === id)!;
  }

  it('keeps a stock whose prop stands where the stock stood, rolls the rest and leaves no stock the map lacks', () => {
    const w = base();
    const lootSpots = w.obstacles.filter(isLootSpot);
    expect(picks.length).toBeGreaterThan(3);
    expect(lootSpots.length).toBeGreaterThan(3);
    const [heldOld, movedOld, , missingOld] = picks.map(oldStockId);
    const [heldSpot, movedSpot, missingSpot] = lootSpots;
    for (const id of [heldOld, movedOld, heldSpot.id, movedSpot.id]) stockOf(w, id).goods = { scrap: 777 };
    stockOf(w, movedOld).pos = { x: stockOf(w, movedOld).pos.x + 40, y: stockOf(w, movedOld).pos.y };
    stockOf(w, movedSpot.id).pos = { x: movedSpot.pos.x, y: movedSpot.pos.y + 40 };
    w.salvage = w.salvage.filter((s) => s.id !== missingOld && s.id !== missingSpot.id);
    w.salvage.push({ ...stockOf(w, heldOld), id: 'old-hamlet-house-999999' }, { ...stockOf(w, heldSpot.id), id: 'deadTruck-999999' });

    const world = repairMap(savedOf(w), TEST_MAP);
    expect(stockOf(world, heldOld).goods).toEqual({ scrap: 777 });
    expect(stockOf(world, heldSpot.id).goods).toEqual({ scrap: 777 });
    for (const id of [movedOld, movedSpot.id, missingOld, missingSpot.id]) expect(stockOf(world, id).goods).toEqual({});
    expect(world.salvage.some((s) => s.id === 'old-hamlet-house-999999' || s.id === 'deadTruck-999999')).toBe(false);
    expect(world.salvage.filter((s) => oldSpotOf(s)).map((s) => s.id).sort()).toEqual(picks.map(oldStockId).sort());
    for (const o of world.obstacles.filter(isLootSpot)) expect(stockOf(world, o.id).pos).toEqual(o.pos);
    expect(new Set(world.salvage.map((s) => s.id)).size).toBe(world.salvage.length);
    expect(() => stockOldSpots(world, TEST_MAP)).not.toThrow();
    world.turn = TIME.turnsPerDay * 3;
    expect(() => renewSalvage(world)).not.toThrow();
  });

  it('keeps the stocks of piles and truck wrecks and moves them with the scale', () => {
    const w = oldScaleBase();
    const pile: SalvageStock = { id: 'cargo-v1-4', pos: { x: 100, y: 100 }, radius: 1, goods: { scrap: 2 }, parts: [], hidden: { goods: {}, parts: [], fuel: 0, supplies: 0 }, pile: { until: 99, fromPlayer: false, basis: {} } };
    w.salvage.push(pile);
    const out = repairMap(savedOf(w, OLD_SIZE), TEST_MAP);
    expectNear(stockOf(out, 'cargo-v1-4').pos, scaled(pile.pos));
  });
});

describe('repairMap references to dropped stocks and sites', () => {
  const claim = (id: string, stockId: string, over: Partial<Contract> = {}): Contract => ({ id, shop: 'bowl', kind: 'claim', stockId, at: { x: 1, y: 1 }, partId: 'p1', defId: 'mg', reward: 5, deadline: 999, window: 99, tier: 1, rivalAt: 999, rival: null, leads: [], ...over }) as Contract;
  const survey = (id: string, sites: string[], done: boolean): Contract => ({ id, shop: 'bowl', kind: 'survey', points: sites.map((site) => ({ site, found: done, done })), reward: 5, deadline: 999, window: 99, tier: 1 });

  it('lapses claims on a dropped stock with a log event, and drops survey points whose site is gone', () => {
    const w = base();
    const gone = 'deadTruck-999999';
    const goodSite = surveySites(TEST_MAP)[0].id;
    const keptStock = w.salvage.find((s) => isRoadWreck(s))!;
    w.salvage.push({ ...keptStock, id: gone });
    w.player.contracts = [claim('ct-gone', gone), claim('ct-kept', keptStock.id), survey('ct-lost-site', ['survey-gone-1'], false), survey('ct-good-site', [goodSite], false), survey('ct-met', ['survey-gone-2'], true)];
    w.shops.bowl.contracts = [claim('ct-offer-gone', gone), claim('ct-offer-kept', keptStock.id), survey('ct-offer-lost', ['survey-gone-3'], false)];
    const me = playerVehicle(w);
    me.job = { kind: 'survey', contractId: 'ct-lost-site', site: 'survey-gone-1', turnsLeft: 2, total: 3 };
    const money = w.player.money;
    const xp = w.player.xp;

    const out = repairMap(savedOf(w), TEST_MAP);
    expect(out.player.contracts.map((c) => c.id)).toEqual(['ct-kept', 'ct-lost-site', 'ct-good-site', 'ct-met']);
    const points = (id: string) => (out.player.contracts.find((c) => c.id === id) as Extract<Contract, { kind: 'survey' }>).points.map((p) => p.site);
    expect([points('ct-lost-site'), points('ct-good-site'), points('ct-met')]).toEqual([[], [goodSite], []]);
    expect(out.shops.bowl.contracts.map((c) => c.id)).toEqual(['ct-offer-kept']);
    expect([out.player.money, out.player.xp]).toEqual([money, xp]);
    expect(out.events.flatMap((e) => (e.t === 'contract' ? [[e.contract.id, e.outcome]] : []))).toEqual([['ct-gone', 'lapsed']]);
    expect(playerVehicle(out).job).toBeNull();
    const kept = out.player.contracts[0] as Extract<Contract, { kind: 'claim' }>;
    expect(kept.at).toEqual(out.salvage.find((s) => s.id === kept.stockId)!.pos);
  });

  it('on the same map, drops old spot stocks the picks no longer hold, lapses their claims, rolls the missing ones and fits surveys', () => {
    const w = base();
    const [first, second] = oldSpotPicks(TEST_MAP);
    const stray = { ...w.salvage.find((s) => s.id === oldStockId(first))!, id: oldStockId({ type: first.type, propId: '99999' }) };
    w.salvage = [...w.salvage.filter((s) => s.id !== oldStockId(second)), stray];
    w.player.contracts = [claim('ct-stray', stray.id), survey('ct-survey', ['survey-gone-1', surveySites(TEST_MAP)[0].id], false)];

    fitBake(w, TEST_MAP);
    stockOldSpots(w, TEST_MAP);

    expect(w.salvage.some((s) => s.id === stray.id)).toBe(false);
    expect(w.salvage.some((s) => s.id === oldStockId(second))).toBe(true);
    expect(w.player.contracts.map((c) => c.id)).toEqual(['ct-survey']);
    expect((w.player.contracts[0] as Extract<Contract, { kind: 'survey' }>).points.map((p) => p.site)).toEqual([surveySites(TEST_MAP)[0].id]);
    expect(w.events.flatMap((e) => (e.t === 'contract' ? [[e.contract.id, e.outcome]] : []))).toEqual([['ct-stray', 'lapsed']]);
  });

  it('drops the scavenged, rumored, stripped, goal, job and warning references to a dropped stock', () => {
    const w = base();
    const gone = 'deadTruck-999999';
    const keptSite = 'bowl';
    w.salvage.push({ ...w.salvage.find((s) => isRoadWreck(s))!, id: gone });
    w.player.scavenged = [gone, 'wreck0'];
    w.player.rumored = [gone, keptSite];
    const npc = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 300, y: 300 });
    npc.brain = npcBrain('scavenger', npc.pos, ['scavenger']);
    npc.brain.memories = [{ turn: 1, fact: { kind: 'stripped', stock: gone } }, { turn: 1, fact: { kind: 'stripped', stock: 'wreck0' } }];
    const stop = { phase: 'travel' as const, reason: 'searchSpot' as const, destination: null };
    npc.brain.goals = [
      { kind: 'scavenge', targetId: gone, ...stop },
      { kind: 'claim', targetId: 'wreck0', left: [gone], ...stop },
      { kind: 'claim', targetId: 'bowl', claim: 'ct-cut', ...stop },
      { kind: 'scavenge', targetId: 'wreck0', ...stop },
    ];
    npc.job = { kind: 'search', stockId: gone, turnsLeft: 2, total: 3 };
    w.player.contracts = [claim('ct-cut', gone)];
    const warning: NpcState = { id: 'sw', kind: 'lootWarning', holder: npc.id, other: w.player.vehicleId, turnsLeft: 3, born: 1, data: { kind: 'lootWarning', targetId: gone, answer: null } };
    w.states = [warning];

    const out = repairMap(savedOf(w), TEST_MAP);
    const moved = out.vehicles.find((v) => v.id === npc.id)!;
    expect(out.player.scavenged).toEqual(['wreck0']);
    expect(out.player.rumored).toEqual([keptSite]);
    expect(moved.brain!.memories.map((m) => m.fact)).toEqual([{ kind: 'stripped', stock: 'wreck0' }]);
    expect(moved.brain!.goals.map((g) => g.targetId)).toEqual(['wreck0']);
    expect(moved.job).toBeNull();
    expect(out.states).toEqual([]);
  });
});
