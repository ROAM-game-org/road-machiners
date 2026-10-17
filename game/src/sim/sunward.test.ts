import { describe, expect, it } from 'vitest';
import { HOLLOW, SUNWARD } from '../data/sunward';
import { REGION } from '../data/region';
import { NPCS } from '../data/npcs';
import { TIME } from '../data/time';
import { furyRoadWorld, testDrive } from './testkit';
import { standardWorld } from '../test/world-cache';
import { playerVehicle } from './damage';
import { endTurn } from './world';
import { followingOf } from './companies';
import { topGoal } from './npc-activities';
import { clockOf } from './sun';
import { refreshVision } from './vision';
import { discoverSites } from './locations';
import { spawnAt, spawnNpcs } from './spawn';
import { generateNpcLoadout } from './npc-loadout';
import { callVehicle, currentLine, currentOptions } from './dialogue';
import {
  advanceSunward, dawnAfter, huntTonight, inFallenSun, planSunward, duskTurn, hollowBays, hollowObstacles, isHollowObstacle, lastDusk, membersOf, phaseAt, returnTurn, sunwardFacts, sunwardPhase,
} from './sunward';
import type { World } from './types';
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
    const props = w.obstacles.filter(isHollowObstacle);
    expect(props).toEqual(hollowObstacles());
    for (const road of REGION.roads) for (const p of road) expect(dist(p, HOLLOW.pos)).toBeGreaterThan(30);
  });

  it('is found by sight like any place, and only once', () => {
    const w = quietWorld();
    playerVehicle(w).pos = { x: HOLLOW.pos.x, y: HOLLOW.pos.y + 14 };
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
    playerVehicle(w).pos = { x: member.pos.x, y: member.pos.y + 6 };
    refreshVision(w);

    const called = callVehicle(w, member.id);

    expect(currentLine(called)).toBe('silent');
    expect(currentOptions(called).map((o) => o.line)).toEqual(['hangUp']);
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

describe('the night schedule', () => {
  it('rides out at dusk in a column, keeps the vigil at the crater, comes home before dawn and rests in the bays', () => {
    let w = runTo(orderWorld(), duskTurn(1) - 1);
    const members = membersOf(w);
    for (const v of members) expect(topGoal(v)?.reason).toBe('restHollow');
    seen.stalls = 0;

    w = runTo(w, duskTurn(1) + 3);
    const night = sunwardFacts(w).night!;
    expect(night.roster).toHaveLength(SUNWARD.cavalcade);
    const column = night.roster.map((id) => w.vehicles.find((v) => v.id === id)!);
    expect(column.filter((v) => followingOf(w, v)?.kind === 'cavalcade')).toHaveLength(SUNWARD.cavalcade - 1);
    for (const v of membersOf(w).filter((x) => x.brain!.templateId === 'hunter')) expect(topGoal(v)?.reason).toBe('restHollow');

    w = runTo(w, returnTurn(duskTurn(1)) - 5);
    for (const id of night.roster) {
      const v = w.vehicles.find((x) => x.id === id)!;
      expect(inFallenSun(v.pos)).toBe(true);
      expect(followingOf(w, v)).toBeNull();
    }

    w = runTo(w, dawnAfter(duskTurn(1)) + 10);
    for (const v of membersOf(w)) {
      expect(dist(v.pos, v.brain!.home)).toBeLessThan(3);
      expect(topGoal(v)?.reason).toBe('restHollow');
    }
    expect(membersOf(w).map((v) => v.id).sort()).toEqual(members.map((v) => v.id).sort());
    expect(seen.stalls).toBe(0);
  }, 600_000);
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
