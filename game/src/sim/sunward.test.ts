import { describe, expect, it } from 'vitest';
import { HOLLOW, SUNWARD } from '../data/sunward';
import { REGION } from '../data/region';
import { TERRAIN } from '../data/terrain';
import { MAX_RANK, SKILL_EFFECTS } from '../data/skills';
import { NPCS } from '../data/npcs';
import { TIME } from '../data/time';
import { addVehicle, emptyWorld, chaosHighwayWorld, npcBrain } from './testkit';
import { addGoods } from './inventory';
import { getResources } from './resources';
import { fuelCap } from './stats';
import { knockOutNpc } from './defeat';
import { canUseSite, everyTruck, isSheltered, leaveSite, shelteredAt, siteGap, sitePads } from './sites';
import { standardWorld } from '../test/world-cache';
import { beyondPad, fillHollowByDay, letOut, orderWorld, quietWorld, riderAt, runTo } from '../test/sunward-kit';
import { RULES } from '../data/rules';
import { playerVehicle } from './damage';
import { followingOf, joinCompany } from './companies';
import { noteDefeat } from './relations';
import { route, routeLength } from './path';
import { lightZone } from './sunward-crater';
import { makeTaste, nightTaste, tasted, terrainNav } from './nav/layer';
import { thinkNpc, topGoal } from './npc-activities';
import { clockOf } from './sun';
import { refreshVision } from './vision';
import { discoverSites } from './locations';
import { isFree, spawnAt, spawnNpcs } from './spawn';
import { fortressPieces, fortressProps, insideCurtain } from './fortress';
import { sunwardDusk, sunwardHunt, sunwardLedger } from './cheats';
import { generateNpcLoadout } from './npc-loadout';
import { optionWeights } from './npc-decisions';
import { watchPost } from './watch-posts';
import { makePart } from './factory';
import { emptyHidden } from './salvage';
import { ROAD_INDEX } from './road-index';
import { callVehicle, currentLine, currentOptions } from './dialogue';
import { hollowDiscs, hollowObstacles, hollowPad, hollowReach, hollowSitesFor, isHollowObstacle } from './hollow-layout';
import {
  advanceSunward, isCavalcadeCar, isHunterCar, avoidsCrater, fallenSun, gateOrder, vigilPosts, collapseOrder, craterExit, CRATER_NIGHT, inCraterZone, nightSafe, shunsAtNight, vigilGrounds, dawnAfter, hollowLampsLit, huntTonight, planSunward, spawnsAtHollow, duskTurn, orderDusk, nextRideOut, nightWindow, rideOutTurn, lastDusk, membersOf, keepsToItself, phaseAt, returnTurn, sunwardFacts, sunwardPhase,
} from './sunward';
import type { Obstacle, Vehicle, World } from './types';
import { dist, type Vec } from './vec';

function segmentGap(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

describe('the Sunward clock', () => {
  it('rests by day, rides out before dusk, keeps the vigil and rides home before dawn', () => {
    const dusk = duskTurn(2);
    const out = rideOutTurn(dusk);
    expect(out).toBe(dusk - SUNWARD.rideLeadTurns);
    expect(clockOf(out).hour).toBeLessThan(TIME.sunset);
    expect(phaseAt(out - 1)).toBe('rest');
    expect(phaseAt(out)).toBe('ride');
    expect(phaseAt(out + SUNWARD.driveTurns - 1)).toBe('ride');
    expect(phaseAt(out + SUNWARD.driveTurns)).toBe('vigil');
    expect(phaseAt(returnTurn(dusk) - 1)).toBe('vigil');
    expect(phaseAt(returnTurn(dusk))).toBe('home');
    expect(phaseAt(dawnAfter(dusk) - 1)).toBe('home');
    expect(phaseAt(dawnAfter(dusk))).toBe('rest');
    expect(clockOf(dawnAfter(dusk)).hour).toBeGreaterThanOrEqual(TIME.sunrise);
  });

  it('keys a night by the dusk whose ride-out came last', () => {
    const dusk = duskTurn(2);
    expect(orderDusk(rideOutTurn(dusk) - 1)).toBe(duskTurn(1));
    expect(orderDusk(rideOutTurn(dusk))).toBe(dusk);
    expect(orderDusk(dusk + 100)).toBe(dusk);
    expect(orderDusk(dawnAfter(dusk) + 5)).toBe(dusk);
    expect(nextRideOut(dawnAfter(dusk) + 5)).toBe(rideOutTurn(duskTurn(3)));
    expect(nextRideOut(rideOutTurn(dusk) - 1)).toBe(rideOutTurn(dusk));
    expect(() => orderDusk(-1)).toThrow(/before the game began/);
  });

  it('leaves a rest window between the ride home and the next ride-out', () => {
    expect(SUNWARD.rideLeadTurns).toBeLessThan(TIME.turnsPerDay - (dawnAfter(duskTurn(2)) - duskTurn(2)));
    expect(SUNWARD.rideLeadTurns).toBeGreaterThan(0);
    expect(SUNWARD.returnMarginTurns).toBeLessThan(dawnAfter(duskTurn(2)) - duskTurn(2));
  });

  it('starts every night rule at dusk and ends it at dawn, while the column rides from its ride-out', () => {
    const w = standardWorld(5);
    const dusk = duskTurn(2);
    const dawn = dawnAfter(dusk);
    const rule = (turn: number): boolean[] => {
      const at = { ...w, turn };
      return [nightWindow(at), hollowLampsLit(at, turn)];
    };
    for (const turn of [rideOutTurn(dusk), dusk - 1, dawn]) expect(rule(turn)).toEqual([false, false]);
    for (const turn of [dusk, dawn - 1]) expect(rule(turn)).toEqual([true, true]);
    expect(phaseAt(rideOutTurn(dusk))).toBe('ride');
  });

  it('counts a night from the dusk before it, also past midnight', () => {
    const dusk = duskTurn(2);
    expect(lastDusk(dusk + 100)).toBe(dusk);
    expect(clockOf(dusk + 100).day).toBe(3);
  });

  it('has no order on Chaos Highway', () => {
    const w = chaosHighwayWorld();
    expect(w.sunward).toBeNull();
    expect(() => sunwardPhase(w)).toThrow(/no Sunward order/);
    expect(w.obstacles.some(isHollowObstacle)).toBe(false);
    expect(hollowSitesFor(w)).toEqual([]);
  });

  it('draws its pad while the order stands', () => {
    expect(hollowSitesFor(orderWorld(5))).toEqual([HOLLOW.site]);
  });
});

describe('the Hollow', () => {
  it('stands in a new Roaming world as derived props, off every road', () => {
    const w = standardWorld(5);
    const props = w.obstacles.filter(isHollowObstacle);
    expect(props).toEqual(hollowObstacles());
  });

  it('starts full: a new Roaming world holds eight Cavalcade cars and three hunters, all resting inside with the pad as home', () => {
    const w = standardWorld(5);
    const members = membersOf(w);
    expect(members.filter(isCavalcadeCar)).toHaveLength(SUNWARD.cavalcade);
    expect(members.filter(isHunterCar)).toHaveLength(SUNWARD.hunters);
    expect(shelteredAt(w, HOLLOW.id).map((v) => v.id).sort()).toEqual(members.map((v) => v.id).sort());
    expect(w.vehicles.some((v) => v.faction === 'sunward')).toBe(false);
    for (const v of members) expect(dist(v.brain!.home, hollowPad())).toBeLessThan(0.01);
  });

  it('gives Chaos Highway no Sunward car', () => {
    expect(membersOf(chaosHighwayWorld())).toEqual([]);
  });

  it('lies out of sight of every road segment and every town and site, even for a maxed driver by day', () => {
    const maxedSight = TERRAIN.vision.radius * (1 + SKILL_EFFECTS.perception.sight * MAX_RANK);
    const discs = hollowDiscs();
    const roadGap = Math.min(...discs.flatMap((d) => REGION.roads.flatMap((road) => road.slice(1).map((b, i) => segmentGap(d.at, road[i], b) - d.r))));
    expect(roadGap).toBeGreaterThan(maxedSight + SUNWARD.sightMargin);
    const sights = [...REGION.towns, ...REGION.locations].filter((s) => s.id !== 'fallen-sun');
    const siteGaps = discs.flatMap((d) => sights.map((s) => siteGap(s, d.at) - d.r));
    expect(Math.min(...siteGaps)).toBeGreaterThan(TERRAIN.vision.radius * TERRAIN.vision.grayFactor);
  });

  it('is a walled scrap fort, smaller than every small site, with a shut gatehouse toward the crater', () => {
    const fort = hollowObstacles().flatMap((o) => (o.kind === 'landmark' && o.look.startsWith('fortScrap') ? [o] : []));
    expect(fort.map(({ look, pos, r, yaw }) => ({ look, pos, r, yaw }))).toEqual(fortressProps(HOLLOW.site).map((p) => ({ look: p.kind, pos: p.pos, r: p.r, yaw: p.yaw })));
    expect(HOLLOW.radius).toBeLessThan(Math.min(...REGION.locations.filter((l) => l.id !== 'fallen-sun' && l.radius > 0).map((l) => l.radius)));
    expect(fort.filter((o) => o.look === 'fortScrapGate')).toHaveLength(1);
    expect(fortressPieces(HOLLOW.site).filter((p) => p.kind === 'gate')).toHaveLength(1);
    expect(REGION.locations.some((l) => l.id === HOLLOW.id)).toBe(false);
    const gate = HOLLOW.site.gates[0];
    const toGate = Math.atan2(gate.y - HOLLOW.pos.y, gate.x - HOLLOW.pos.x);
    const toCrater = Math.atan2(fallenSun().pos.y - HOLLOW.pos.y, fallenSun().pos.x - HOLLOW.pos.x);
    expect(Math.abs(toGate - toCrater)).toBeLessThan(0.25);
  });

  it('opens its pad on the gate side outside the curtain, keeps the laager within the reach bound and the lamps by a piece', () => {
    expect(insideCurtain(HOLLOW.site, hollowPad(), 0)).toBe(false);
    expect(canUseSite(hollowPad(), HOLLOW.site)).toBe(true);
    expect(hollowReach()).toBeLessThanOrEqual(HOLLOW.maxReach);
    const pieces = hollowObstacles();
    const looks = (o: Obstacle): string => (o.kind === 'landmark' ? o.look : '');
    for (const o of pieces.filter((x) => ['hullChunk', 'shack'].includes(looks(x)))) expect(insideCurtain(HOLLOW.site, o.pos, 0.5)).toBe(true);
    for (const o of pieces.filter((x) => ['drums', 'woodpile'].includes(looks(x)))) expect(insideCurtain(HOLLOW.site, o.pos, 0)).toBe(false);
    const lamps = [...HOLLOW.lanterns, HOLLOW.fire].map((l) => ({ x: HOLLOW.pos.x + l.x, y: HOLLOW.pos.y + l.y }));
    for (const lamp of lamps) {
      expect(insideCurtain(HOLLOW.site, lamp, 0.5)).toBe(true);
      expect(Math.min(...pieces.map((o) => dist(o.pos, lamp) - o.r))).toBeLessThan(3);
    }
  });

  it('stands out in the wastes, clear of the Fallen Sun', () => {
    expect(siteGap(fallenSun(), HOLLOW.pos)).toBeGreaterThanOrEqual(hollowReach() * 2);
  });

  it('keeps its walls solid, so no truck spawns or parks in them', () => {
    const w = quietWorld(5);
    for (const wall of hollowObstacles().filter((o) => o.kind === 'landmark' && o.look === 'fortScrapWall').slice(0, 5)) expect(isFree(w, wall.pos, 0.9, null)).toBe(false);
    expect(isFree(w, hollowPad(), 0.9, null)).toBe(true);
  });

  it('is found by sight like any place, and only once', () => {
    const w = quietWorld(5);
    playerVehicle(w).pos = { x: HOLLOW.pos.x + 6, y: HOLLOW.pos.y + 8 };
    refreshVision(w);
    discoverSites(w);
    discoverSites(w);
    expect(w.player.discovered.filter((id) => id === HOLLOW.id)).toHaveLength(1);
  });
});

describe('the silent ride', () => {
  it('answers a call with silence and offers nothing but Hang up', () => {
    const w = orderWorld(5);
    const member = letOut(w, membersOf(w)[0].id);
    playerVehicle(w).pos = beyondPad(6);
    refreshVision(w);

    const called = callVehicle(w, member.id);

    expect(currentLine(called)).toBe('silent');
    expect(currentOptions(called).map((o) => o.line)).toEqual(['hangUp']);
  });

  it('stays silent for a car with a brave or coward streak', () => {
    for (const extra of ['brave', 'coward'] as const) {
      const w = orderWorld(5);
      const member = letOut(w, membersOf(w)[0].id);
      member.brain!.traits = ['cultist', extra];
      playerVehicle(w).pos = beyondPad(6);
      refreshVision(w);

      const called = callVehicle(w, member.id);

      expect(currentLine(called)).toBe('silent');
      expect(currentOptions(called).map((o) => o.line)).toEqual(['hangUp']);
    }
  });
});

describe('the order refills', () => {
  it('spawns members inside the Hollow by day while the player is far', () => {
    let w = quietWorld(5);
    fillHollowByDay(w);
    const members = membersOf(w);
    expect(members.filter((v) => v.brain!.templateId === 'cavalcade')).toHaveLength(SUNWARD.cavalcade);
    expect(members.filter((v) => v.brain!.templateId === 'hunter')).toHaveLength(SUNWARD.hunters);
    for (const v of members) {
      expect(v.faction).toBe('sunward');
      expect(isSheltered(w, v.id)).toBe(true);
    }
  });

  it('spawns nobody at night or while the Hollow is in the player gray vision', () => {
    const night = quietWorld(5);
    night.turn = duskTurn(1) + 5;
    for (let i = 0; i < 60; i++) {
      night.turn++;
      spawnNpcs(night);
    }
    expect(membersOf(night)).toHaveLength(0);
    const near = quietWorld(5);
    playerVehicle(near).pos = { x: HOLLOW.pos.x + 40, y: HOLLOW.pos.y };
    for (let i = 0; i < 60; i++) {
      near.turn++;
      spawnNpcs(near);
    }
    expect(membersOf(near)).toHaveLength(0);
  });
});

describe('the vigil posts', () => {
  it('rings the light with one free post per car, outside the drain and apart from each other', () => {
    const w = standardWorld(5);
    const posts = vigilPosts(w);
    const zone = lightZone();
    expect(posts).toHaveLength(SUNWARD.cavalcade);
    for (const p of posts) {
      expect(dist(p, zone.pos)).toBeGreaterThan(zone.radius);
      expect(isFree({ ...w, vehicles: [] }, p, 1, null)).toBe(true);
      for (const q of posts) if (q !== p) expect(dist(p, q)).toBeGreaterThanOrEqual(SUNWARD.postSpacing);
    }
  });

  it('lies a long ride across open ground from the gate, and every post can be reached', () => {
    const w = standardWorld(5);
    const gate = HOLLOW.site.gates[0];
    const rides = vigilPosts(w).map((post) => {
      const path = route(w, gate, post, 0.9, []);
      expect(dist(path[path.length - 1], post)).toBeLessThan(2);
      return routeLength(gate, path);
    });
    expect(Math.min(...rides)).toBeGreaterThan(200);
    expect(Math.max(...rides)).toBeLessThan(340);
  });
});

describe('the hunting parties', () => {
  it('sends a defeated column follower home instead of keeping its column follow and state', () => {
    const w = orderWorld(5);
    w.turn = rideOutTurn(duskTurn(1)) + 1;
    advanceSunward(w);
    const night = sunwardFacts(w).night!;
    const [leaderId, followerId] = gateOrder(w, night);
    const leader = riderAt(w, leaderId);
    leader.pos = { x: HOLLOW.pos.x + hollowReach() + SUNWARD.fileGap + 30, y: HOLLOW.pos.y };
    const follower = letOut(w, followerId);
    planSunward(w, follower);
    expect(topGoal(follower)?.kind).toBe('follow');
    expect(followingOf(w, follower)?.kind).toBe('cavalcade');
    follower.pos = { x: leader.pos.x - 5, y: leader.pos.y };
    follower.defeat = { phase: 'retreat', turns: 0, unseen: 0, foes: [], gaveUp: false };

    const action = thinkNpc(w, follower);

    expect(action).toMatchObject({ kind: 'explore', reason: 'rideHome' });
    expect(topGoal(follower)).toBe(action);
    expect(follower.brain!.goals.every((g) => g.kind !== 'follow')).toBe(true);
    expect(followingOf(w, follower)).toBeNull();
  });

  it('rides out on a few nights a week by a hash of the seed and the day, with a cooldown, and draws no world random number', () => {
    const w = quietWorld(5);
    const before = { rng: w.rngState, market: w.marketRng.rngState, names: w.nameRng.rngState, search: w.searchRng.rngState };
    const nights: number[] = [];
    for (let day = 1; day <= 120; day++) {
      if (!huntTonight(w, day)) continue;
      nights.push(day);
      sunwardFacts(w).lastHunt = day;
    }
    for (let i = 1; i < nights.length; i++) expect(nights[i] - nights[i - 1]).toBeGreaterThan(SUNWARD.huntCooldownNights);
    expect(nights.length).toBeGreaterThan(8);
    expect(nights.length).toBeLessThan(40);
    expect({ rng: w.rngState, market: w.marketRng.rngState, names: w.nameRng.rngState, search: w.searchRng.rngState }).toEqual(before);
  });

  it('sends the three hunters, never the Cavalcade, and takes a lone truck it sees', () => {
    const w = orderWorld(5);
    const day = Array.from({ length: 200 }, (_, i) => i + 1).find((d) => huntTonight(w, d))!;
    w.turn = duskTurn(day);
    advanceSunward(w);
    const night = sunwardFacts(w).night!;
    const hunters = membersOf(w).filter((v) => v.brain!.templateId === 'hunter');
    expect(night.hunt?.party.sort()).toEqual(hunters.map((v) => v.id).sort());
    for (const id of night.roster) expect(hunters.map((v) => v.id)).not.toContain(id);
    const leader = letOut(w, night.hunt!.party[0]);
    const trader = spawnAt(w, NPCS.trader, generateNpcLoadout(w, NPCS.trader), { x: leader.pos.x + 6, y: leader.pos.y }, 'independent');

    planSunward(w, leader);

    expect(night.hunt!.prey).toBe(trader.id);
    expect(w.states.some((s) => s.kind === 'feud' && s.holder === leader.id && s.other === trader.id)).toBe(true);
    expect(topGoal(leader)).toMatchObject({ kind: 'fight', targetId: trader.id });
  });

  it('rides the hunters out with the column but takes no prey before dusk', () => {
    const w = orderWorld(5);
    const day = Array.from({ length: 200 }, (_, i) => i + 1).find((d) => huntTonight(w, d))!;
    w.turn = rideOutTurn(duskTurn(day));
    advanceSunward(w);
    const night = sunwardFacts(w).night!;
    const leader = letOut(w, night.hunt!.party[0]);
    spawnAt(w, NPCS.trader, generateNpcLoadout(w, NPCS.trader), { x: leader.pos.x + 6, y: leader.pos.y }, 'independent');

    planSunward(w, leader);

    expect(night.dusk).toBe(duskTurn(day));
    expect(topGoal(leader)?.reason).toBe('huntRoad');
    expect(night.hunt!.prey).toBeNull();
  });

  it('waits out the day at a hide off its hunt road, and takes the road at dusk', () => {
    const w = orderWorld(5);
    const day = Array.from({ length: 200 }, (_, i) => i + 1).find((d) => huntTonight(w, d))!;
    w.turn = rideOutTurn(duskTurn(day));
    advanceSunward(w);
    const hunt = sunwardFacts(w).night!.hunt!;
    const leader = letOut(w, hunt.party[0]);
    const follower = letOut(w, hunt.party[1]);

    planSunward(w, leader);
    planSunward(w, follower);

    const hide = watchPost(w, hunt.grounds[0])!;
    expect(topGoal(leader)).toMatchObject({ kind: 'wait', reason: 'huntRoad', destination: hide, until: duskTurn(day) });
    expect(ROAD_INDEX.nearestWithin(hide.x, hide.y, REGION.roadWidth)).toBeGreaterThan(REGION.roadWidth / 2);
    expect(topGoal(follower)).toMatchObject({ kind: 'follow', reason: 'huntRoad', targetId: leader.id });

    w.turn = duskTurn(day);
    planSunward(w, leader);

    expect(topGoal(leader)).toMatchObject({ kind: 'prowl', reason: 'huntRoad', targetId: 'a' });
  });

  it('finds a hide for every road the hunters may take', () => {
    const w = orderWorld(5);
    const grounds = Array.from({ length: 30 }, (_, i) => i + 1).flatMap((d) => {
      sunwardFacts(w).lastHunt = null;
      if (!huntTonight(w, d)) return [];
      w.turn = rideOutTurn(duskTurn(d));
      advanceSunward(w);
      return sunwardFacts(w).night!.hunt!.grounds;
    });
    const roads = new Set(grounds.map((g) => `${g.x},${g.y}`));
    expect(roads.size).toBeGreaterThanOrEqual(2);
    for (const g of grounds) expect(watchPost(w, g)).not.toBeNull();
  });

  it('holds the hunters at their hide until dusk without a stall', () => {
    const w0 = orderWorld(5);
    const day = Array.from({ length: 200 }, (_, i) => i + 1).find((d) => huntTonight(w0, d))!;
    w0.turn = rideOutTurn(duskTurn(day));
    advanceSunward(w0);
    const hunt = sunwardFacts(w0).night!.hunt!;
    const hide = watchPost(w0, hunt.grounds[0])!;
    hunt.party.forEach((id, k) => {
      const v = riderAt(w0, id);
      v.pos = { x: hide.x + k * 2, y: hide.y };
      v.trail = [];
    });
    const stalls = (world: World) => world.events.filter((e) => e.t === 'stall' && hunt.party.includes(e.vehicle)).length;
    let w = w0;
    let stalled = 0;
    for (let turn = 0; turn < 100; turn++) {
      w = runTo(w, w.turn + 1);
      stalled += stalls(w);
    }

    expect(stalled).toBe(0);
    expect(dist(riderAt(w, hunt.party[0]).pos, hide)).toBeLessThanOrEqual(RULES.arriveRadius * 2);
  }, 600_000);

  it('sends the leader from one hunting ground to the other and keeps it on its way once it leaves the first', () => {
    const w = orderWorld(5);
    const day = Array.from({ length: 200 }, (_, i) => i + 1).find((d) => huntTonight(w, d))!;
    w.turn = duskTurn(day) + 1;
    advanceSunward(w);
    const hunt = sunwardFacts(w).night!.hunt!;
    const leader = letOut(w, hunt.party[0]);
    const [a, b] = hunt.grounds;
    const at = (p: Vec, by: number): Vec => ({ x: p.x + by, y: p.y });
    const plan = (pos: Vec) => {
      leader.pos = { ...pos };
      planSunward(w, leader);
      return topGoal(leader)!.targetId;
    };

    expect(plan(at(a, 80))).toBe('a');
    expect(plan(at(a, 2))).toBe('b');
    expect(plan(at(a, 12))).toBe('b');
    expect(plan(at(b, 2))).toBe('a');
    expect(plan(at(b, 12))).toBe('a');
  });

  it('opens tonight between the ride-out and dusk once, keyed by the coming dusk', () => {
    const w = orderWorld(5);
    const dusk = duskTurn(2);
    w.turn = rideOutTurn(dusk);
    advanceSunward(w);
    const night = sunwardFacts(w).night!;
    w.turn = dusk + 1;
    advanceSunward(w);

    expect(night.dusk).toBe(dusk);
    expect(sunwardFacts(w).night).toBe(night);
  });

  it('goes home when a hunter falls, and at the return', () => {
    const w = orderWorld(5);
    const day = Array.from({ length: 200 }, (_, i) => i + 1).find((d) => huntTonight(w, d))!;
    w.turn = duskTurn(day) + 1;
    advanceSunward(w);
    const hunt = sunwardFacts(w).night!.hunt!;
    const fallen = letOut(w, hunt.party[1]);
    fallen.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };

    advanceSunward(w);

    expect(hunt.over).toBe(true);
    const other = letOut(w, hunt.party[2]);
    planSunward(w, other);
    expect(other.brain!.goals[0].reason).not.toBe('huntRoad');
  });
});

describe('the day restraint', () => {
  const HOUR_TURNS = TIME.turnsPerDay / 24;
  const atHour = (hour: number): number => Math.ceil(1 + (hour - TIME.startHour) * HOUR_TURNS);

  function meetRaider(hour: number): { w: World; car: Vehicle; raider: Vehicle } {
    const w = orderWorld(5);
    w.turn = atHour(hour);
    const car = letOut(w, membersOf(w).find(isCavalcadeCar)!.id);
    const raider = spawnAt(w, NPCS.buggy, generateNpcLoadout(w, NPCS.buggy), { x: car.pos.x + 6, y: car.pos.y }, 'kiln');
    return { w, car, raider };
  }

  it('keeps a member from picking a fight or going to look by day', () => {
    const { w, car, raider } = meetRaider(15);

    expect(keepsToItself(w, car)).toBe(true);
    expect(optionWeights(w, car, 'hostileSeen', raider.id, null)).not.toHaveProperty('fight');
    expect(optionWeights(w, car, 'contactHeard', raider.id, null)).not.toHaveProperty('investigate');
    expect(optionWeights(w, car, 'warnRefused', raider.id, null)).not.toHaveProperty('fight');
  });

  it('keeps a member from stopping for salvage on the way by day while the order stands', () => {
    const w = emptyWorld();
    w.turn = atHour(15);
    const car = addVehicle(w, 'sunward', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 30 });
    car.brain = npcBrain('cavalcade', { x: 60, y: 60 }, ['cultist']);
    car.brain.goals = [{ kind: 'travel', targetId: null, destination: { x: 60, y: 60 }, phase: 'travel', reason: 'tripToSite' }];
    w.salvage = [{ id: 'wreck-test', pos: { x: 34, y: 30 }, radius: 0.6, goods: { scrap: 2 }, parts: [makePart(w, 'plates', 0)], hidden: emptyHidden() }];

    expect(optionWeights(w, car, 'salvageSeen', 'wreck-test', null)).not.toHaveProperty('loot');
    sunwardFacts(w).collapsed = w.turn;
    expect(optionWeights(w, car, 'salvageSeen', 'wreck-test', null)).toHaveProperty('loot');
  });

  it('lets a member fight back or flee when attacked by day', () => {
    const { w, car, raider } = meetRaider(15);

    expect(Object.keys(optionWeights(w, car, 'attacked', raider.id, null))).toEqual(expect.arrayContaining(['fightBack', 'flee']));
  });

  it('lets a member start a fight at night', () => {
    const { w, car, raider } = meetRaider(21);

    expect(keepsToItself(w, car)).toBe(false);
    expect(optionWeights(w, car, 'hostileSeen', raider.id, null)).toHaveProperty('fight');
    expect(optionWeights(w, car, 'contactHeard', raider.id, null)).toHaveProperty('investigate');
  });

  it('holds only for members, and ends with the order', () => {
    const { w, car, raider } = meetRaider(15);

    expect(keepsToItself(w, raider)).toBe(false);
    expect(optionWeights(w, raider, 'hostileSeen', car.id, null)).toHaveProperty('fight');
    sunwardFacts(w).collapsed = w.turn;
    expect(keepsToItself(w, car)).toBe(false);
  });
});

describe('the night ledger and the collapse', () => {
  function ledgerWorld(): { w: World; roster: Vehicle[] } {
    const w = orderWorld(5);
    w.turn = duskTurn(1) + 70;
    advanceSunward(w);
    const roster = sunwardFacts(w).night!.roster.map((id) => riderAt(w, id));
    return { w, roster };
  }

  function beat(w: World, v: Vehicle, by: Vehicle): void {
    v.lastHitBy = by.id;
    noteDefeat(w, v, false);
  }

  it('keeps the order after five cars beaten by the player in one night and breaks it on the sixth, in that turn', () => {
    const { w, roster } = ledgerWorld();
    const me = playerVehicle(w);
    for (const v of roster.slice(0, 5)) beat(w, v, me);
    expect(sunwardFacts(w).collapsed).toBeNull();
    expect(sunwardFacts(w).night!.beaten).toHaveLength(5);

    beat(w, roster[5], me);

    expect(sunwardFacts(w).collapsed).toBe(w.turn);
    expect(w.events.filter((e) => e.t === 'sunwardFallen')).toHaveLength(1);
    expect(sunwardPhase(w)).toBe('fallen');
  });

  it('counts a car once however often it is beaten', () => {
    const { w, roster } = ledgerWorld();
    for (let i = 0; i < 6; i++) beat(w, roster[0], playerVehicle(w));
    expect(sunwardFacts(w).night!.beaten).toEqual([roster[0].id]);
    expect(sunwardFacts(w).collapsed).toBeNull();
  });

  it('counts a car beaten by a guard in the player\'s company, but no third party, no hunter and nothing by day', () => {
    const { w, roster } = ledgerWorld();
    const merc = spawnAt(w, NPCS.merc, generateNpcLoadout(w, NPCS.merc), { x: 60, y: 60 }, 'independent');
    joinCompany(w, merc, playerVehicle(w), 'hire', { kind: 'hire', fee: 0 });
    const stranger = spawnAt(w, NPCS.trader, generateNpcLoadout(w, NPCS.trader), { x: 70, y: 70 }, 'independent');
    const hunter = membersOf(w).find((v) => v.brain!.templateId === 'hunter')!;

    beat(w, roster[0], merc);
    beat(w, roster[1], stranger);
    beat(w, hunter, playerVehicle(w));
    w.turn = dawnAfter(duskTurn(1)) + 5;
    beat(w, roster[2], playerVehicle(w));

    expect(sunwardFacts(w).night!.beaten).toEqual([roster[0].id]);
  });

  it('starts a fresh count at the next dusk', () => {
    const { w, roster } = ledgerWorld();
    for (const v of roster.slice(0, 5)) beat(w, v, playerVehicle(w));
    w.turn = duskTurn(2) + 70;
    advanceSunward(w);
    expect(sunwardFacts(w).night!.beaten).toEqual([]);
    beat(w, roster[5], playerVehicle(w));
    expect(sunwardFacts(w).collapsed).toBeNull();
  });

  it('turns every rider into an independent roamer and ends the Hollow, its lamps, its refills and its nights for good', () => {
    const { w, roster } = ledgerWorld();
    const members = membersOf(w);
    for (const v of roster.slice(0, 6)) beat(w, v, playerVehicle(w));

    for (const v of members) {
      expect(v.faction).toBe('independent');
      expect(v.brain!.traits).toEqual(['roamer']);
    }
    expect(membersOf(w)).toEqual([]);
    expect(hollowLampsLit(w)).toBe(false);
    w.turn = duskTurn(3) + 70;
    advanceSunward(w);
    expect(sunwardFacts(w).night?.dusk).toBe(duskTurn(1));
    w.turn = duskTurn(4) - 100;
    expect(spawnsAtHollow(w)).toBe(false);
    for (let i = 0; i < 80; i++) {
      w.turn++;
      spawnNpcs(w);
    }
    expect(membersOf(w)).toEqual([]);
    expect(sunwardPhase(w)).toBe('fallen');
  });

  it('refuses a collapse short of six counted cars', () => {
    const { w } = ledgerWorld();
    expect(() => collapseOrder(w)).toThrow(/only after 6/);
  });
});

describe('night avoidance', () => {
  function scavengerAt(w: World, pos: { x: number; y: number }): Vehicle {
    return spawnAt(w, NPCS.scavenger, generateNpcLoadout(w, NPCS.scavenger), pos, 'independent');
  }

  it('keeps every other driver off the crater at night while the order stands, and nobody by day or after it falls', () => {
    const w = quietWorld(5);
    const scav = scavengerAt(w, { x: 100, y: 100 });
    const rider = membersOf(orderWorld(5))[0];
    w.turn = duskTurn(1) - 10;
    expect(avoidsCrater(w, scav)).toBe(false);
    w.turn = duskTurn(1) + 10;
    expect(avoidsCrater(w, scav)).toBe(true);
    expect(avoidsCrater(w, rider)).toBe(false);
    expect(avoidsCrater(w, playerVehicle(w))).toBe(false);
    sunwardFacts(w).collapsed = w.turn;
    expect(avoidsCrater(w, scav)).toBe(false);
  });

  it('drops a night goal inside the crater and sends a driver inside out by the nearest edge', () => {
    const w = quietWorld(5);
    w.turn = duskTurn(1) + 10;
    const spot = vigilGrounds()[0];
    const inside = scavengerAt(w, spot);
    const goal = { kind: 'scavenge' as const, targetId: 'spot', destination: { ...spot }, phase: 'travel' as const, reason: 'searchSpot' as const };
    expect(shunsAtNight(w, inside, goal)).toBe(true);
    const out = nightSafe(w, inside, goal);
    expect(out).toMatchObject({ kind: 'explore', reason: 'leaveCrater' });
    expect(inCraterZone(out.destination!)).toBe(false);
    w.turn = dawnAfter(duskTurn(1)) + 1;
    expect(nightSafe(w, inside, goal)).toBe(goal);
  });

  it('makes crater ground dearer at night but never closes it, so a driver inside still finds its way out', () => {
    const w = quietWorld(5);
    const nav = terrainNav(w.terrain);
    const taste = nightTaste(makeTaste(1, w.size), nav, CRATER_NIGHT);
    const spot = vigilGrounds()[0];
    const outside = craterExit(spot);
    expect(tasted(taste, 1, Math.floor(spot.x), Math.floor(spot.y)) / tasted(makeTaste(1, w.size), 1, Math.floor(spot.x), Math.floor(spot.y))).toBeCloseTo(SUNWARD.avoidCost, 5);
    expect(tasted(taste, 1, Math.floor(outside.x), Math.floor(outside.y))).toBeCloseTo(tasted(makeTaste(1, w.size), 1, Math.floor(outside.x), Math.floor(outside.y)), 5);
    const scav = scavengerAt(w, spot);
    w.turn = duskTurn(1) + 40;

    const way = route(w, scav.pos, outside, 0.9, [], scav);

    expect(dist(way.at(-1)!, outside)).toBeLessThan(3);
  });
});

describe('the Sunward debug commands', () => {
  it('fills the Hollow, skips to dusk, sends the hunters and prints the ledger', () => {
    const w = sunwardDusk(quietWorld(5));
    expect(phaseAt(w.turn)).toBe('ride');
    expect(sunwardFacts(w).night!.roster).toHaveLength(SUNWARD.cavalcade);
    const hunted = sunwardHunt(w);
    expect(sunwardFacts(hunted).night!.hunt!.party).toHaveLength(SUNWARD.hunters);
    expect(sunwardLedger(hunted).join('\n')).toMatch(/Beaten: 0 of 6/);
  });
});

describe('the order and the road news', () => {
  const site = (id: string) => [...REGION.towns, ...REGION.locations].find((x) => x.id === id)!;

  function trader(w: World, shipment: boolean): Vehicle {
    const npc = addVehicle(w, 'bowl', 'hauler', ['mg', 'workhorseDiesel', 'trailerBox'], { ...sitePads(site('bowl'))[0] });
    npc.brain = npcBrain('convoy', npc.pos, ['supplier']);
    npc.brain.goals = [{ kind: 'sell', targetId: 'granary', destination: { ...site('granary').pos }, phase: 'travel', reason: 'deliverCargo', ...(shipment ? { shipment: { good: 'grain', from: 'bowl', to: 'granary' } } : {}) }];
    addGoods(w, npc, 'grain', 4);
    return npc;
  }

  it('reports the crates of a shipping trader a hunter knocks out, as for any knockout, and nothing for a trader with no shipment', () => {
    const w = emptyWorld();
    const hunter = addVehicle(w, 'sunward', 'buggy', ['mg', 'stockEngine'], { x: 60, y: 60 });
    hunter.brain = npcBrain('hunter', hunter.pos, ['cultist']);
    const shipping = trader(w, true);
    const plain = trader(w, false);
    for (const victim of [shipping, plain]) victim.lastHitBy = hunter.id;

    knockOutNpc(w, shipping);
    knockOutNpc(w, plain);

    expect(w.roadNews.map((n) => [n.kind, n.good, n.units, n.from, n.to])).toEqual([['knockedOut', 'grain', 4, 'bowl', 'granary']]);
  });
});
