import { describe, expect, it } from 'vitest';
import { HOLLOW, SUNWARD } from '../data/sunward';
import { REGION } from '../data/region';
import { NPCS } from '../data/npcs';
import { CHASSIS } from '../data/chassis';
import { TIME } from '../data/time';
import { addVehicle, emptyWorld, furyRoadWorld, npcBrain, testDrive } from './testkit';
import { addGoods } from './inventory';
import { knockOutNpc } from './defeat';
import { siteGap, sitePads } from './sites';
import { standardWorld } from '../test/world-cache';
import { playerVehicle } from './damage';
import { endTurn } from './world';
import { followingOf, joinCompany } from './companies';
import { noteDefeat } from './relations';
import { route, routeLength } from './path';
import { lightZone } from './sunward-crater';
import { RULES } from '../data/rules';
import { makeTaste, nightTaste, tasted, terrainNav } from './nav/layer';
import { topGoal } from './npc-activities';
import { clockOf } from './sun';
import { refreshVision } from './vision';
import { discoverSites } from './locations';
import { isFree, spawnAt, spawnNpcs } from './spawn';
import { fortressProps, insideCurtain } from './fortress';
import { isHollowGate } from './hollow-gate';
import { sunwardDusk, sunwardHunt, sunwardLedger } from './cheats';
import { generateNpcLoadout } from './npc-loadout';
import { callVehicle, currentLine, currentOptions } from './dialogue';
import {
  advanceSunward, avoidsCrater, fallenSun, gateOrder, vigilPosts, collapseOrder, craterExit, CRATER_NIGHT, inCraterZone, nightSafe, shunsAtNight, vigilGrounds, dawnAfter, hollowLampsLit, huntTonight, planSunward, spawnsAtHollow, duskTurn, hollowBays, hollowLayout, hollowObstacles, isHollowObstacle, lastDusk, membersOf, phaseAt, returnTurn, sunwardFacts, sunwardPhase,
} from './sunward';
import type { Vehicle, World } from './types';
import { dist } from './vec';

function quietWorld(): World {
  const w = standardWorld(5);
  const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
  w.vehicles = [playerVehicle(w)];
  playerVehicle(w).pos = { x: bowl.pos.x + bowl.radius + 6, y: bowl.pos.y };
  refreshVision(w);
  w.events = [];
  return w;
}

const seen = { stalls: 0 };

function runTo(w: World, turn: number): World {
  let world = w;
  while (world.turn < turn) {
    world = endTurn(world, testDrive);
    seen.stalls += world.events.filter((e) => e.t === 'stall').length;
  }
  return world;
}

describe('the Sunward clock', () => {
  it('rests by day, rides at dusk, keeps the vigil and rides home before dawn', () => {
    const dusk = duskTurn(1);
    expect(clockOf(dusk).hour).toBeGreaterThanOrEqual(TIME.sunset);
    expect(clockOf(dusk - 1).hour).toBeLessThan(TIME.sunset);
    expect(phaseAt(dusk - 1)).toBe('rest');
    expect(phaseAt(dusk)).toBe('ride');
    expect(phaseAt(dusk + SUNWARD.driveTurns + SUNWARD.returnMarginTurns)).toBe('vigil');
    expect(phaseAt(returnTurn(dusk))).toBe('home');
    expect(phaseAt(dawnAfter(dusk) - 1)).toBe('home');
    expect(phaseAt(dawnAfter(dusk))).toBe('rest');
    expect(clockOf(dawnAfter(dusk)).hour).toBeGreaterThanOrEqual(TIME.sunrise);
  });

  it('counts a night from the dusk before it, also past midnight', () => {
    const dusk = duskTurn(2);
    expect(lastDusk(dusk + 100)).toBe(dusk);
    expect(clockOf(dusk + 100).day).toBe(3);
  });

  it('has no order on Chaos Highway', () => {
    const w = furyRoadWorld();
    expect(w.sunward).toBeNull();
    expect(() => sunwardPhase(w)).toThrow(/no Sunward order/);
    expect(w.obstacles.some(isHollowObstacle)).toBe(false);
  });
});

describe('the Hollow', () => {
  it('stands in a new Roaming world as derived props, off every road', () => {
    const w = standardWorld(5);
    const props = w.obstacles.filter((o) => isHollowObstacle(o) && !isHollowGate(o));
    expect(props).toEqual(hollowObstacles());
    for (const road of REGION.roads) for (const p of road) expect(dist(p, HOLLOW.pos)).toBeGreaterThan(30);
  });

  it('is a walled scrap fort with one gate toward the crater, laid by the fortress rule and never by the bake', () => {
    const fort = hollowObstacles().flatMap((o) => (o.kind === 'landmark' && o.look.startsWith('fortScrap') ? [o] : []));
    expect(fort.map(({ look, pos, r, yaw }) => ({ look, pos, r, yaw }))).toEqual(fortressProps(HOLLOW.site).map((p) => ({ look: p.kind, pos: p.pos, r: p.r, yaw: p.yaw })));
    const gate = HOLLOW.site.gates[0];
    const inward = { x: (HOLLOW.pos.x - gate.x) / HOLLOW.radius, y: (HOLLOW.pos.y - gate.y) / HOLLOW.radius };
    const gateway = { x: gate.x + inward.x * 1.25, y: gate.y + inward.y * 1.25 };
    expect(fort.filter((o) => dist(o.pos, gateway) < 1.5)).toEqual([]);
    expect(fort.filter((o) => o.look === 'fortScrapTower' && dist(o.pos, gateway) < 4)).toHaveLength(2);
    expect(fort.filter((o) => o.look === 'fortScrapTower').length).toBeGreaterThan(4);
    expect(REGION.locations.some((l) => l.id === HOLLOW.id)).toBe(false);
    const toGate = Math.atan2(gate.y - HOLLOW.pos.y, gate.x - HOLLOW.pos.x);
    const toCrater = Math.atan2(fallenSun().pos.y - HOLLOW.pos.y, fallenSun().pos.x - HOLLOW.pos.x);
    expect(Math.abs(toGate - toCrater)).toBeLessThan(0.25);
  });

  it('parks every bay inside the curtain and hangs every lamp by a fort piece or a shed', () => {
    for (const bay of hollowBays()) expect(insideCurtain(HOLLOW.site, bay, 2)).toBe(true);
    const pieces = hollowObstacles();
    const lamps = [...HOLLOW.lanterns, HOLLOW.fire].map((l) => ({ x: HOLLOW.pos.x + l.x, y: HOLLOW.pos.y + l.y }));
    for (const lamp of lamps) expect(Math.min(...pieces.map((o) => dist(o.pos, lamp) - o.r))).toBeLessThan(3);
  });

  it('is a small den about 72 m across, with room for the widest member in every bay', () => {
    expect(HOLLOW.radius * 2 * 8).toBe(144);
    const radii = [...NPCS.cavalcade.loadout.chassis, ...NPCS.hunter.loadout.chassis].map((c) => CHASSIS[c.value as string].radius);
    expect(SUNWARD.memberRadius).toBeGreaterThanOrEqual(Math.max(...radii));
    const { bays, pieces } = hollowLayout();
    expect(bays).toHaveLength(SUNWARD.cavalcade + SUNWARD.hunters);
    for (const bay of bays) {
      expect(insideCurtain(HOLLOW.site, bay, SUNWARD.memberRadius)).toBe(true);
      for (const o of pieces) expect(dist(o.pos, bay)).toBeGreaterThan(SUNWARD.memberRadius);
    }
  });

  it('stands far out in the wastes, well clear of the Fallen Sun', () => {
    expect(siteGap(fallenSun(), HOLLOW.pos)).toBeGreaterThanOrEqual(110);
  });

  it('keeps its walls solid, so no truck spawns or parks in them', () => {
    const w = standardWorld(5);
    for (const wall of hollowObstacles().filter((o) => o.kind === 'landmark' && o.look === 'fortScrapWall').slice(0, 5)) expect(isFree(w, wall.pos, 0.9, null)).toBe(false);
    for (const bay of hollowBays()) expect(isFree(w, bay, 0.9, null)).toBe(true);
  });

  it('is found by sight like any place, and only once', () => {
    const w = quietWorld();
    playerVehicle(w).pos = { x: HOLLOW.pos.x + 6, y: HOLLOW.pos.y + 8 };
    refreshVision(w);
    discoverSites(w);
    discoverSites(w);
    expect(w.player.discovered.filter((id) => id === HOLLOW.id)).toHaveLength(1);
  });
});

describe('the silent ride', () => {
  it('answers a call with silence and offers nothing but Hang up', () => {
    const w = orderWorld();
    const member = membersOf(w)[0];
    playerVehicle(w).pos = { ...HOLLOW.pos };
    refreshVision(w);

    const called = callVehicle(w, member.id);

    expect(currentLine(called)).toBe('silent');
    expect(currentOptions(called).map((o) => o.line)).toEqual(['hangUp']);
  });

  it('stays silent for a car with a brave or coward streak', () => {
    for (const extra of ['brave', 'coward'] as const) {
      const w = orderWorld();
      const member = membersOf(w)[0];
      member.brain!.traits = ['cultist', extra];
      playerVehicle(w).pos = { ...HOLLOW.pos };
      refreshVision(w);

      const called = callVehicle(w, member.id);

      expect(currentLine(called)).toBe('silent');
      expect(currentOptions(called).map((o) => o.line)).toEqual(['hangUp']);
    }
  });
});

describe('the order refills', () => {
  it('spawns members in the Hollow bays by day while the player is far', () => {
    let w = quietWorld();
    for (let i = 0; i < 400 && membersOf(w).length < SUNWARD.cavalcade + SUNWARD.hunters; i++) {
      w.turn++;
      spawnNpcs(w);
    }
    const members = membersOf(w);
    expect(members.filter((v) => v.brain!.templateId === 'cavalcade')).toHaveLength(SUNWARD.cavalcade);
    expect(members.filter((v) => v.brain!.templateId === 'hunter')).toHaveLength(SUNWARD.hunters);
    for (const v of members) {
      expect(v.faction).toBe('sunward');
      expect(hollowBays().some((b) => dist(b, v.pos) < 0.01)).toBe(true);
    }
    expect(new Set(members.map((v) => `${v.pos.x},${v.pos.y}`)).size).toBe(members.length);
  });

  it('spawns nobody at night or while the Hollow is in the player gray vision', () => {
    const night = quietWorld();
    night.turn = duskTurn(1) + 5;
    for (let i = 0; i < 60; i++) {
      night.turn++;
      spawnNpcs(night);
    }
    expect(membersOf(night)).toHaveLength(0);
    const near = quietWorld();
    playerVehicle(near).pos = { x: HOLLOW.pos.x + 40, y: HOLLOW.pos.y };
    for (let i = 0; i < 60; i++) {
      near.turn++;
      spawnNpcs(near);
    }
    expect(membersOf(near)).toHaveLength(0);
  });
});

function orderWorld(): World {
  const w = quietWorld();
  for (let i = 0; i < 400 && membersOf(w).length < SUNWARD.cavalcade + SUNWARD.hunters; i++) {
    w.turn++;
    spawnNpcs(w);
  }
  w.vehicles = w.vehicles.filter((v) => v.id === w.player.vehicleId || membersOf(w).includes(v));
  for (const tpl of Object.values(NPCS)) if (tpl.spawn.kind !== 'hollow') w.spawnTimer[tpl.id] = Number.MAX_SAFE_INTEGER;
  w.turn = duskTurn(1) - 3;
  w.events = [];
  return w;
}

function watchedFromTheGate(w: World): World {
  const gate = HOLLOW.site.gates[0];
  const out = { x: (gate.x - HOLLOW.pos.x) / HOLLOW.radius, y: (gate.y - HOLLOW.pos.y) / HOLLOW.radius };
  playerVehicle(w).pos = { x: gate.x - out.y * 30, y: gate.y + out.x * 30 };
  playerVehicle(w).trail = [];
  refreshVision(w);
  return w;
}

function riderAt(w: World, id: string): Vehicle {
  const v = w.vehicles.find((x) => x.id === id);
  if (!v) throw new Error(`No rider ${id}`);
  return v;
}

describe('the night schedule', () => {
  it('files out of the gate one car at a time while the player watches, rides to the light without turning back and holds a post until the return', () => {
    let w = watchedFromTheGate(orderWorld());
    const dusk = duskTurn(1);
    seen.stalls = 0;
    w = runTo(w, dusk);
    const order = gateOrder(w, sunwardFacts(w).night!);
    const posts = vigilPosts(w);
    const left = new Map<string, number>();
    const arrived = new Map<string, number>();
    const away = new Map<string, { best: number; worse: number; most: number }>();
    while (w.turn < returnTurn(dusk)) {
      w = runTo(w, w.turn + 1);
      order.forEach((id, seat) => {
        const v = riderAt(w, id);
        if (!left.has(id) && dist(v.pos, HOLLOW.pos) > HOLLOW.radius + 1) left.set(id, w.turn - dusk);
        if (!arrived.has(id) && dist(v.pos, posts[seat]) <= RULES.arriveRadius * 2) arrived.set(id, w.turn - dusk);
        if (arrived.has(id) || !left.has(id)) return;
        const gap = dist(v.pos, posts[seat]);
        const track = away.get(id) ?? { best: gap, worse: 0, most: 0 };
        track.worse = gap > track.best + 0.5 ? track.worse + 1 : 0;
        track.best = Math.min(track.best, gap);
        track.most = Math.max(track.most, track.worse);
        away.set(id, track);
      });
    }

    expect(left.get(order[0])).toBeLessThanOrEqual(6);
    expect(Math.max(...order.map((id) => left.get(id)!))).toBeLessThanOrEqual(45);
    expect([...arrived.keys()].sort()).toEqual([...order].sort());
    expect(Math.max(...[...away.values()].map((t) => t.most))).toBeLessThanOrEqual(5);
    expect(seen.stalls).toBe(0);
  }, 600_000);

  it('rides out at dusk, keeps the vigil at the posts, leaves before dawn and rests in the bays by the morning', () => {
    let w = runTo(orderWorld(), duskTurn(1) - 1);
    const members = membersOf(w);
    for (const v of members) expect(topGoal(v)?.reason).toBe('restHollow');
    seen.stalls = 0;

    w = runTo(w, duskTurn(1) + 3);
    const night = sunwardFacts(w).night!;
    expect(night.roster).toHaveLength(SUNWARD.cavalcade);
    const order = gateOrder(w, night);
    expect(topGoal(riderAt(w, order[0]))?.reason).toBe('rideVigil');
    for (const v of membersOf(w).filter((x) => x.brain!.templateId === 'hunter')) expect(topGoal(v)?.reason).toBe(night.hunt ? 'huntRoad' : 'restHollow');

    w = runTo(w, returnTurn(duskTurn(1)) - 5);
    order.forEach((id, seat) => {
      const v = riderAt(w, id);
      expect(dist(v.pos, vigilPosts(w)[seat])).toBeLessThanOrEqual(RULES.arriveRadius * 2);
      expect(topGoal(v)?.reason).toBe('keepVigil');
      expect(followingOf(w, v)).toBeNull();
    });

    w = runTo(w, dawnAfter(duskTurn(1)) + 120);
    for (const v of membersOf(w)) {
      expect(dist(v.pos, v.brain!.home)).toBeLessThan(3);
      expect(topGoal(v)?.reason).toBe('restHollow');
    }
    expect(membersOf(w).map((v) => v.id).sort()).toEqual(members.map((v) => v.id).sort());
    expect(seen.stalls).toBe(0);
  }, 600_000);

  it('closes the column up behind a car beaten on the ride', () => {
    let w = runTo(watchedFromTheGate(orderWorld()), duskTurn(1) + 1);
    const order = gateOrder(w, sunwardFacts(w).night!);
    while (followingOf(w, riderAt(w, order[4]))?.other !== order[3]) w = runTo(w, w.turn + 1);
    const beaten = riderAt(w, order[3]);
    beaten.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };

    w = runTo(w, w.turn + 1);

    expect(followingOf(w, riderAt(w, order[4]))?.other).toBe(order[2]);
  }, 600_000);

  it('rides the cars out in the order of their bays, the bay by the gate first', () => {
    const w = orderWorld();
    const night = { dusk: duskTurn(1), roster: membersOf(w).filter((v) => v.brain!.templateId === 'cavalcade').map((v) => v.id).reverse(), beaten: [], calls: {}, hunt: null, shouted: [], offered: [] };
    const bays = hollowBays();
    const bayOf = (id: string) => bays.findIndex((b) => dist(b, riderAt(w, id).brain!.home) < 0.5);

    const order = gateOrder(w, night).map(bayOf);

    expect(order).toEqual([...order].sort((a, b) => a - b));
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
    expect(Math.min(...rides)).toBeGreaterThan(150);
    expect(Math.max(...rides)).toBeLessThan(320);
  });
});

describe('the hunting parties', () => {
  it('rides out on a few nights a week by a hash of the seed and the day, with a cooldown, and draws no world random number', () => {
    const w = quietWorld();
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
    const w = orderWorld();
    const day = Array.from({ length: 200 }, (_, i) => i + 1).find((d) => huntTonight(w, d))!;
    w.turn = duskTurn(day);
    advanceSunward(w);
    const night = sunwardFacts(w).night!;
    const hunters = membersOf(w).filter((v) => v.brain!.templateId === 'hunter');
    expect(night.hunt?.party.sort()).toEqual(hunters.map((v) => v.id).sort());
    for (const id of night.roster) expect(hunters.map((v) => v.id)).not.toContain(id);
    const leader = w.vehicles.find((v) => v.id === night.hunt!.party[0])!;
    const trader = spawnAt(w, NPCS.trader, generateNpcLoadout(w, NPCS.trader), { x: leader.pos.x + 6, y: leader.pos.y }, 'independent');

    planSunward(w, leader);

    expect(night.hunt!.prey).toBe(trader.id);
    expect(w.states.some((s) => s.kind === 'feud' && s.holder === leader.id && s.other === trader.id)).toBe(true);
    expect(topGoal(leader)).toMatchObject({ kind: 'fight', targetId: trader.id });
  });

  it('goes home when a hunter falls, and at the return', () => {
    const w = orderWorld();
    const day = Array.from({ length: 200 }, (_, i) => i + 1).find((d) => huntTonight(w, d))!;
    w.turn = duskTurn(day) + 1;
    advanceSunward(w);
    const hunt = sunwardFacts(w).night!.hunt!;
    const fallen = w.vehicles.find((v) => v.id === hunt.party[1])!;
    fallen.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };

    advanceSunward(w);

    expect(hunt.over).toBe(true);
    const other = w.vehicles.find((v) => v.id === hunt.party[2])!;
    planSunward(w, other);
    expect(other.brain!.goals[0].reason).not.toBe('huntRoad');
  });
});

describe('the night ledger and the collapse', () => {
  function ledgerWorld(): { w: World; roster: Vehicle[] } {
    const w = orderWorld();
    w.turn = duskTurn(1) + 70;
    advanceSunward(w);
    const roster = sunwardFacts(w).night!.roster.map((id) => w.vehicles.find((v) => v.id === id)!);
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
    const w = quietWorld();
    const scav = scavengerAt(w, { x: 100, y: 100 });
    const rider = membersOf(orderWorld())[0];
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
    const w = quietWorld();
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
    const w = quietWorld();
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
    const w = sunwardDusk(quietWorld());
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
