import { describe, expect, it } from 'vitest';
import { CHAOS_HIGHWAY, HIGHWAY } from '../data/modes';
import { RULES } from '../data/rules';
import { haulerOf, playerVehicle } from './damage';
import { betweenLevels } from './chaos-highway';
import { yardSpots } from './outpost-gates';
import { chosenLane, haulerLane, haulerPace, laneClear, noteHaulerHits, planHaulerOrder, resetHaulerWatch, sideThreat, waitsForGunTruck, watchHaulerStall } from './hauler';
import { acrossOf, alongOf, milestoneAt, roadHeading, roadPoint, toRoad } from './highway';
import { addVehicle, chaosHighwayWorld } from './testkit';
import { fuelCap, plainMaxSpeed } from './stats';
import { heldHeatSpeed } from './engine-heat';
import { plainFuelSpeed } from './far';
import { TIME } from '../data/time';
import { ENGINE_HEAT } from '../data/wear';
import { endTurn } from './world';
import { addState } from './states';
import { coreParts, mountedParts } from './grid';
import { getResources } from './resources';
import type { Vehicle, WaveGroup, World } from './types';
import { dist } from './vec';
import { frontAhead } from './rig';

const LANES = HIGHWAY.road.lanes;
const N = 140;

function openRoad(seed = 3): { w: World; hauler: Vehicle } {
  const w = chaosHighwayWorld(seed);
  w.chaosHighway!.groups = [];
  w.obstacles = [];
  const hauler = haulerOf(w);
  hauler.pos = roadPoint(seed, 0, N + frontAhead(hauler.chassisId), LANES[1]);
  hauler.heading = roadHeading(seed, N);
  playerVehicle(w).pos = roadPoint(seed, 0, N - 40, LANES[3]);
  return { w, hauler };
}

function groupTruck(w: World, across: number, along: number, speed: number, heading?: number): Vehicle {
  const v = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], roadPoint(w.seed, 0, along, across), heading ?? roadHeading(w.seed, along));
  v.speed = speed;
  w.chaosHighway!.groups = [{ id: 'g1-0', stretch: 1, from: 'ahead', at: 0, templates: [], money: 10000, elite: false, level: 'light', spawned: true, vehicles: [v.id], wrecked: 0, counted: [], retryUntil: null }];
  return v;
}

function across(w: World, v: Vehicle): number {
  return acrossOf(w.seed, toRoad(w.seed, 0, v.pos));
}

describe('the hauler driver', () => {
  it('holds its lane on open road at cruise pace, aiming at a lane center ahead', () => {
    const { w, hauler } = openRoad();
    planHaulerOrder(w);

    expect(haulerLane(w, hauler)).toBe(1);
    expect(hauler.order).toMatchObject({ kind: 'through', pace: CHAOS_HIGHWAY.hauler.cruise });
    const dest = (hauler.order as { dest: { x: number; y: number } }).dest;
    expect(acrossOf(w.seed, toRoad(w.seed, 0, dest))).toBeCloseTo(LANES[1], 1);
    expect(alongOf(w.seed, toRoad(w.seed, 0, dest))).toBeCloseTo(N + CHAOS_HIGHWAY.hauler.lookahead, 0);
    expect(hauler.direct).toBe(false);
  });

  it('is deterministic: the same world gives the same order', () => {
    const a = openRoad();
    const b = openRoad();
    planHaulerOrder(a.w);
    planHaulerOrder(b.w);
    expect(a.hauler.order).toEqual(b.hauler.order);
  });

  it('moves one lane away from a closing flank truck and holds with trucks on both sides', () => {
    const { w, hauler } = openRoad();
    const left = groupTruck(w, LANES[0], N + 1, 5);
    left.heading = Math.atan2(hauler.pos.y - left.pos.y, hauler.pos.x - left.pos.x);
    expect(sideThreat(w, hauler)).toBe('left');
    expect(chosenLane(w, hauler)).toBe(2);

    const right = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], roadPoint(w.seed, 0, N + 1, LANES[2] + 1.5), 0);
    right.speed = 5;
    right.heading = Math.atan2(hauler.pos.y - right.pos.y, hauler.pos.x - right.pos.x);
    w.chaosHighway!.groups[0].vehicles.push(right.id);
    expect(sideThreat(w, hauler)).toBe('both');
    expect(chosenLane(w, hauler)).toBe(1);
  });

  it('ignores a truck that is beside it but driving away', () => {
    const { w, hauler } = openRoad();
    const left = groupTruck(w, LANES[0], N + 1, 5);
    left.heading = Math.atan2(left.pos.y - hauler.pos.y, left.pos.x - hauler.pos.x);
    expect(sideThreat(w, hauler)).toBeNull();
  });

  it('changes lane before a truck parked in its lane, toward the road middle on a tie', () => {
    const { w, hauler } = openRoad();
    groupTruck(w, LANES[1], N + 6, 0);
    expect(laneClear(w, hauler, 1)).toBe(false);
    expect(laneClear(w, hauler, 2)).toBe(true);
    expect(chosenLane(w, hauler)).toBe(2);
  });

  it('leaves a lane that runs into a crater dip early enough to change lanes, and ignores a crater beyond that', () => {
    const { w, hauler } = openRoad(4);
    playerVehicle(w).pos = roadPoint(4, 0, 0, LANES[3]);
    const at = (along: number, lane: number) => {
      hauler.pos = roadPoint(4, 0, along, LANES[lane]);
      hauler.heading = roadHeading(4, along);
    };
    const spots = [60, 80, 100, 120, 140, 160, 180].flatMap((along) => LANES.map((_, lane) => ({ along, lane })));
    const dip = spots.find(({ along, lane }) => {
      at(along, lane);
      return !laneClear(w, hauler, lane) && LANES.some((_, other) => laneClear(w, hauler, other));
    });
    if (!dip) throw new Error('seed 4 has no crater dip on its first stretch');
    at(dip.along, dip.lane);
    const lane = chosenLane(w, hauler);
    expect(lane).not.toBe(dip.lane);
    expect(laneClear(w, hauler, lane)).toBe(true);

    at(dip.along - CHAOS_HIGHWAY.hauler.laneLook - 20, dip.lane);
    expect(laneClear(w, hauler, dip.lane)).toBe(true);
    expect(chosenLane(w, hauler)).toBe(dip.lane);
  });

  it('keeps its lane when every lane is blocked, for the router to thread the gap', () => {
    const { w, hauler } = openRoad();
    const trucks = LANES.map((lane) => addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], roadPoint(w.seed, 0, N + 6, lane), 0));
    w.chaosHighway!.groups = [{ id: 'g1-0', stretch: 1, from: 'ahead', at: 0, templates: [], money: 10000, elite: false, level: 'light', spawned: true, vehicles: trucks.map((t) => t.id), wrecked: 0, counted: [], retryUntil: null }];
    expect(chosenLane(w, hauler)).toBe(1);
  });

  it('aims just past a blockage that covers every lane and holds that aim as it closes in', () => {
    const { w, hauler } = openRoad();
    const wall = (along: number) => [-5, -3, -1, 1, 3, 5].map((across, i) => ({ id: `wall-${along}-${i}`, pos: roadPoint(w.seed, 0, along, across), r: 1, kind: 'rock' as const }));
    w.obstacles = [...wall(N + 8), ...wall(N + 20)];
    const aim = () => {
      planHaulerOrder(w);
      return alongOf(w.seed, toRoad(w.seed, 0, (hauler.order as { dest: { x: number; y: number } }).dest));
    };

    expect(LANES.every((_, lane) => !laneClear(w, hauler, lane))).toBe(true);
    const first = aim();
    expect(first).toBeGreaterThan(N + 20);
    expect(first).toBeLessThan(N + CHAOS_HIGHWAY.hauler.laneLook);

    hauler.pos = roadPoint(w.seed, 0, N + 2.4, LANES[1]);
    expect(aim()).toBe(first);
  });

  it('runs at hurry pace for the alarm turns after a hit, then back at cruise', () => {
    const { w, hauler } = openRoad();
    const attacker = groupTruck(w, LANES[3], N + 8, 5);
    const part = hauler.items.find((it) => it.kind === 'part')!;
    w.events.push({ t: 'shot', shooter: attacker.id, weapon: 'w', target: hauler.id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: null, hits: [{ part: part.kind === 'part' ? part.part.id : '', damage: 5 }], blast: [], burst: null }] });
    noteHaulerHits(w);

    const alarm = w.chaosHighway!.hauler.alarmUntil!;
    expect(alarm).toBe(w.turn + CHAOS_HIGHWAY.hauler.alarmTurns);
    expect(haulerPace(w)).toBe(CHAOS_HIGHWAY.hauler.hurry);
    w.turn = alarm;
    expect(haulerPace(w)).toBe(CHAOS_HIGHWAY.hauler.hurry);
    w.turn = alarm + 1;
    expect(haulerPace(w)).toBe(CHAOS_HIGHWAY.hauler.cruise);
  });

  it('never runs faster under fire than it cruises, so a fight cannot be outrun', () => {
    expect(CHAOS_HIGHWAY.hauler.hurry).toBeLessThanOrEqual(CHAOS_HIGHWAY.hauler.cruise);
  });

  it('is not alarmed by a shot that does no damage', () => {
    const { w, hauler } = openRoad();
    const attacker = groupTruck(w, LANES[3], N + 8, 5);
    w.events.push({ t: 'shot', shooter: attacker.id, weapon: 'w', target: hauler.id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: false, crit: false, offset: 0, struck: null, hits: [], blast: [], burst: null }] });
    noteHaulerHits(w);
    expect(w.chaosHighway!.hauler.alarmUntil).toBeNull();
  });

  it('stops at its yard spot within the approach and never aims off the lanes before that', () => {
    const { w, hauler } = openRoad();
    const pad = yardSpots(w, 1).hauler;
    hauler.pos = roadPoint(w.seed, 0, milestoneAt(w.seed, 1) - 10, LANES[1]);
    expect(dist(hauler.pos, pad)).toBeLessThanOrEqual(CHAOS_HIGHWAY.hauler.approach);
    planHaulerOrder(w);
    expect(hauler.order).toEqual({ kind: 'stopAt', dest: pad });
  });

  it('backs out when a drive order left it in place, keeps backing while it moves, then drives on', () => {
    const { w, hauler } = openRoad();
    planHaulerOrder(w);
    const drive = hauler.order;
    hauler.trail = [{ ...hauler.pos, heading: hauler.heading }, { ...hauler.pos, heading: hauler.heading }];
    planHaulerOrder(w);
    expect(hauler.order?.kind).toBe('stopAt');
    const spot = (hauler.order as { dest: { x: number; y: number } }).dest;
    expect(dist(spot, hauler.pos)).toBeCloseTo(RULES.reverse.distance + RULES.minAimDistance, 5);
    expect(alongOf(w.seed, toRoad(w.seed, 0, spot))).toBeLessThan(alongOf(w.seed, toRoad(w.seed, 0, hauler.pos)));

    hauler.trail = [{ ...hauler.pos, heading: hauler.heading }, { x: hauler.pos.x, y: hauler.pos.y + 1, heading: hauler.heading }];
    planHaulerOrder(w);
    expect(hauler.order).toEqual({ kind: 'stopAt', dest: spot });

    hauler.order = null;
    planHaulerOrder(w);
    expect(hauler.order).toEqual(drive);
  });

  it('backs out when it is held short of the yard on its way in, and not once it is parked on its spot', () => {
    const { w, hauler } = openRoad();
    const pad = yardSpots(w, 1).hauler;
    hauler.pos = roadPoint(w.seed, 0, milestoneAt(w.seed, 1) - 40, LANES[1]);
    hauler.order = { kind: 'stopAt', dest: pad };
    hauler.trail = [{ ...hauler.pos, heading: hauler.heading }, { ...hauler.pos, heading: hauler.heading }];
    planHaulerOrder(w);
    expect(hauler.order?.kind).toBe('stopAt');
    expect(dist((hauler.order as { dest: { x: number; y: number } }).dest, pad)).toBeGreaterThan(0);

    hauler.pos = { ...pad };
    hauler.order = { kind: 'stopAt', dest: pad };
    hauler.trail = [{ ...pad, heading: hauler.heading }, { ...pad, heading: hauler.heading }];
    planHaulerOrder(w);
    expect(hauler.order).toEqual({ kind: 'stopAt', dest: pad });
  });

  it('does not back out after a turn parked or braking, only after a drive order that went nowhere', () => {
    const { w, hauler } = openRoad();
    hauler.trail = [{ ...hauler.pos, heading: hauler.heading }, { ...hauler.pos, heading: hauler.heading }];
    hauler.order = { kind: 'brake' };
    planHaulerOrder(w);
    expect(hauler.order?.kind).toBe('through');
  });

  it('drives to its yard spot between levels and holds still once parked on it', () => {
    const { w, hauler } = openRoad();
    w.chaosHighway!.waitingAt = 1;
    const spot = yardSpots(w, 1).hauler;
    expect(betweenLevels(w)).toBe(true);
    hauler.pos = { x: spot.x + 2, y: spot.y };
    hauler.speed = 3;
    planHaulerOrder(w);
    expect(hauler.order).toEqual({ kind: 'stopAt', dest: spot });
    hauler.speed = 0;
    planHaulerOrder(w);
    expect(hauler.order).toEqual({ kind: 'stopAt', dest: spot });
    hauler.pos = { ...spot };
    planHaulerOrder(w);
    expect(hauler.order).toBeNull();
  });

  it('raises a stall when it makes less than a tile of progress for the stall turns', () => {
    resetHaulerWatch();
    const { w, hauler } = openRoad();
    hauler.speed = 0;
    const stalls = [];
    for (let i = 0; i <= CHAOS_HIGHWAY.hauler.stallTurns + 1; i++) {
      w.turn++;
      w.events = [];
      watchHaulerStall(w);
      stalls.push(...w.events.filter((e) => e.t === 'stall'));
    }
    expect(stalls).toEqual([{ t: 'stall', vehicle: hauler.id, goal: null, reason: 'idle' }]);
  });

  it('raises no stall while it progresses, is parked at an outpost, or is stranded', () => {
    resetHaulerWatch();
    const { w, hauler } = openRoad();
    const events = () => w.events.filter((e) => e.t === 'stall');
    for (let i = 0; i < CHAOS_HIGHWAY.hauler.stallTurns * 3; i++) {
      w.turn++;
      w.events = [];
      hauler.pos = roadPoint(w.seed, 0, N + i * 2, LANES[1]);
      watchHaulerStall(w);
      expect(events()).toEqual([]);
    }
    resetHaulerWatch();
    w.chaosHighway!.waitingAt = 1;
    hauler.speed = 0;
    for (let i = 0; i < CHAOS_HIGHWAY.hauler.stallTurns * 3; i++) {
      w.turn++;
      w.events = [];
      watchHaulerStall(w);
      expect(events()).toEqual([]);
    }
    expect(RULES.parkedSpeed).toBeGreaterThan(0);
  });

  it('raises no stall while it waits parked in the fort yard for a gun truck still on the road', () => {
    resetHaulerWatch();
    const { w, hauler } = openRoad();
    hauler.pos = { ...yardSpots(w, w.chaosHighway!.window + 1).hauler };
    hauler.speed = 0;
    expect(betweenLevels(w)).toBe(false);
    for (let i = 0; i < CHAOS_HIGHWAY.hauler.stallTurns * 3; i++) {
      w.turn++;
      w.events = [];
      watchHaulerStall(w);
      expect(w.events.filter((e) => e.t === 'stall')).toEqual([]);
    }
  });

  it('raises no stall while a group truck pins it nose to nose, and raises one once that truck is beaten', () => {
    resetHaulerWatch();
    const { w, hauler } = openRoad();
    hauler.speed = 0;
    const foe = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], roadPoint(w.seed, 0, N + 3.5, LANES[1]), 0);
    w.chaosHighway!.groups = [{ vehicles: [foe.id] } as unknown as WaveGroup];
    const stalls = () => {
      const seen = [];
      for (let i = 0; i <= CHAOS_HIGHWAY.hauler.stallTurns + 1; i++) {
        w.turn++;
        w.events = [];
        watchHaulerStall(w);
        seen.push(...w.events.filter((e) => e.t === 'stall'));
      }
      return seen;
    };

    expect(stalls()).toEqual([]);
    foe.defeat = { phase: 'retreat', turns: 0, unseen: 0, foes: [], gaveUp: true };
    expect(stalls()).toHaveLength(1);
    delete foe.defeat;
    foe.pos = roadPoint(w.seed, 0, N, LANES[1] + 4);
    expect(stalls()).toHaveLength(1);
  });
});


describe('the hauler pace behind a slow gun truck', () => {
  function slowRoad(): { w: World; hauler: Vehicle; gun: Vehicle } {
    const { w, hauler } = openRoad();
    const gun = playerVehicle(w);
    coreParts(gun, 'wheel').forEach((wheel) => { wheel.hp = 0; });
    mountedParts(gun, 'engine')[0].wear = 2;
    expect(plainMaxSpeed(w, gun)).toBeLessThan(CHAOS_HIGHWAY.hauler.cruise);
    return { w, hauler, gun };
  }

  it('keeps to the gun truck top speed, in the alarm too, and carries it in the order', () => {
    const { w, hauler, gun } = slowRoad();
    expect(haulerPace(w)).toBe(plainMaxSpeed(w, gun));
    planHaulerOrder(w);
    expect(hauler.order).toMatchObject({ kind: 'through', pace: plainMaxSpeed(w, gun) });
    w.chaosHighway!.hauler.alarmUntil = w.turn + 3;
    expect(haulerPace(w)).toBe(plainMaxSpeed(w, gun));
  });

  it('ignores overdrive and the gun truck speed this turn', () => {
    const { w, gun } = slowRoad();
    const pace = haulerPace(w);
    w.player.overdrive = true;
    expect(haulerPace(w)).toBe(pace);
    gun.speed = 0;
    expect(haulerPace(w)).toBe(pace);
  });

  it('sets no cap while the gun truck is stranded, stalled or shut down', () => {
    const cruise = CHAOS_HIGHWAY.hauler.cruise;
    const cases: Record<string, (w: World, gun: Vehicle) => void> = {
      'an empty tank': (w, gun) => { getResources(w, gun).fuel = 0; },
      'a dead engine': (_, gun) => { gun.items = gun.items.filter((it) => !(it.kind === 'part' && it.part.defId === 'stockEngine')); },
      'a stall': (w, gun) => { gun.stalledUntil = w.turn; },
      'a shutdown': (w, gun) => { gun.shutDown = { from: w.turn, until: w.turn + 2 }; },
    };
    for (const [name, apply] of Object.entries(cases)) {
      const { w, gun } = slowRoad();
      apply(w, gun);
      expect(haulerPace(w), name).toBe(cruise);
    }
  });

  it('gives the same pace and order after a save and load', () => {
    const { w, hauler } = slowRoad();
    planHaulerOrder(w);
    const copy = JSON.parse(JSON.stringify(w)) as World;
    planHaulerOrder(copy);
    expect(haulerPace(copy)).toBe(haulerPace(w));
    expect(haulerOf(copy).order).toEqual(hauler.order);
  });

  it('holds a lane for a gun truck driving ahead at the cap and blocks it when slower', () => {
    const { w, hauler, gun } = slowRoad();
    const cap = plainMaxSpeed(w, gun);
    gun.pos = roadPoint(w.seed, 0, N + 4, LANES[1]);
    gun.speed = cap;
    expect(laneClear(w, hauler, 1)).toBe(true);
    gun.speed = cap - 0.5;
    expect(laneClear(w, hauler, 1)).toBe(false);
  });
});

describe('the hauler pace behind a hot or thirsty gun truck', () => {
  const noMove = (): void => {};
  const NOON = 1 + (((TIME.sunrise + TIME.sunset) / 2 - TIME.startHour) * TIME.turnsPerDay) / 24;
  const NIGHT = 1 + ((23 - TIME.startHour) * TIME.turnsPerDay) / 24;
  const crawl = CHAOS_HIGHWAY.hauler.crawl;
  const cruise = CHAOS_HIGHWAY.hauler.cruise;

  function hotRoad(turn = NOON): { w: World; hauler: Vehicle; gun: Vehicle } {
    const { w, hauler } = openRoad();
    w.turn = turn;
    w.player.engineHeat = 1;
    return { w, hauler, gun: playerVehicle(w) };
  }

  it('crawls while a hot gun truck stands to cool, then goes back to cruise', () => {
    let { w, gun } = hotRoad();
    gun.speed = 0;
    expect(haulerPace(w)).toBe(crawl);
    let turns = 0;
    let paced = 0;
    while (w.player.engineHeat >= ENGINE_HEAT.warnAt) {
      paced += haulerPace(w);
      w = endTurn(w, noMove);
      gun = playerVehicle(w);
      gun.speed = 0;
      turns++;
      expect(turns).toBeLessThanOrEqual(6);
    }
    expect(paced).toBeLessThan((cruise * turns * 2) / 3);
    expect(w.events.some((e) => e.t === 'stall')).toBe(false);
    expect(haulerPace(w)).toBe(cruise);
  });

  it('keeps to the held-heat speed while a hot gun truck drives', () => {
    const { w, gun } = hotRoad();
    gun.speed = 3;
    expect(haulerPace(w)).toBe(Math.max(crawl, heldHeatSpeed(w, gun)));
    expect(haulerPace(w)).toBeLessThan(cruise);
  });

  it('keeps its pace at night, with a cool engine, and for overdrive', () => {
    const night = hotRoad(NIGHT);
    night.gun.speed = 3;
    expect(haulerPace(night.w)).toBe(Math.min(cruise, plainMaxSpeed(night.w, night.gun)));
    const cool = hotRoad();
    cool.w.player.engineHeat = ENGINE_HEAT.warnAt - 0.05;
    cool.gun.speed = 0;
    expect(haulerPace(cool.w)).toBe(Math.min(cruise, plainMaxSpeed(cool.w, cool.gun)));
    const hot = hotRoad();
    hot.gun.speed = 3;
    const pace = haulerPace(hot.w);
    hot.w.player.overdrive = true;
    expect(haulerPace(hot.w)).toBe(pace);
  });

  it('keeps to the low-fuel top speed', () => {
    const { w, gun } = hotRoad(NIGHT);
    w.player.engineHeat = 0;
    getResources(w, gun).fuel = fuelCap(gun) * 0.1;
    gun.speed = 3;
    expect(plainFuelSpeed(w, gun)).toBeLessThan(cruise);
    expect(haulerPace(w)).toBe(Math.min(cruise, Math.max(crawl, plainFuelSpeed(w, gun))));
  });

  it('sets no cap for a stranded, stalled or shut-down gun truck, hot and thirsty', () => {
    const cases: Record<string, (w: World, gun: Vehicle) => void> = {
      'an empty tank': (w, gun) => { getResources(w, gun).fuel = 0; },
      'a stall': (w, gun) => { gun.stalledUntil = w.turn; },
      'a shutdown': (w, gun) => { gun.shutDown = { from: w.turn, until: w.turn + 2 }; },
    };
    for (const [name, apply] of Object.entries(cases)) {
      const { w, gun } = hotRoad();
      gun.speed = 0;
      apply(w, gun);
      expect(haulerPace(w), name).toBe(cruise);
    }
  });

  it('gives the same pace and order after a save and load', () => {
    const { w, hauler } = hotRoad();
    planHaulerOrder(w);
    const copy = JSON.parse(JSON.stringify(w)) as World;
    planHaulerOrder(copy);
    expect(haulerPace(copy)).toBe(haulerPace(w));
    expect(haulerOf(copy).order).toEqual(hauler.order);
  });
});

const NOON_TURN = 1 + (((TIME.sunrise + TIME.sunset) / 2 - TIME.startHour) * TIME.turnsPerDay) / 24;

describe('the hauler waits for a gun truck that trails it', () => {
  const noMove = (): void => {};
  const WAIT = CHAOS_HIGHWAY.hauler.waitGap;
  const RESUME = CHAOS_HIGHWAY.hauler.resumeGap;

  function trailing(lag: number, seed = 3): { w: World; hauler: Vehicle; gun: Vehicle } {
    const { w, hauler } = openRoad(seed);
    const gun = playerVehicle(w);
    gun.pos = roadPoint(seed, 0, N + frontAhead(hauler.chassisId) - lag, LANES[2]);
    gun.heading = roadHeading(seed, N);
    gun.speed = 0;
    return { w, hauler, gun };
  }

  function stallEvents(w: World): number {
    return w.events.filter((e) => e.t === 'stall').length;
  }

  it('holds braked at a lag past the reach for 45 turns with no stall', () => {
    let { w } = trailing(WAIT + 3);
    let stalls = 0;
    for (let i = 0; i < 45; i++) {
      w = endTurn(w, noMove);
      stalls += stallEvents(w);
      expect(haulerOf(w).order).toEqual({ kind: 'brake' });
    }
    expect(stalls).toBe(0);
  });

  it('waits at any distance for a gun truck that cannot drive or is busy', () => {
    const cases: Record<string, (w: World, gun: Vehicle) => void> = {
      'an empty tank': (w, gun) => { getResources(w, gun).fuel = 0; },
      'a stall': (w, gun) => { gun.stalledUntil = w.turn + 50; },
      'a shutdown': (w, gun) => { gun.shutDown = { from: w.turn, until: w.turn + 50 }; },
      'a fight': (w, gun) => {
        const foe = groupTruck(w, LANES[3], N - 70, 0);
        addState(w, 'combat', foe.id, gun.id, { kind: 'none' });
      },
      'a patch': (w, gun) => {
        const other = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: gun.pos.x + 3, y: gun.pos.y });
        addState(w, 'patch', other.id, gun.id, { kind: 'patch', deal: 'free', parts: 0, partIds: [], price: 0, work: 3, workLeft: 3 });
      },
    };
    for (const [name, apply] of Object.entries(cases)) {
      const { w, hauler, gun } = trailing(60);
      apply(w, gun);
      planHaulerOrder(w);
      expect(waitsForGunTruck(w, hauler), name).toBe(true);
      expect(hauler.order, name).toEqual({ kind: 'brake' });
    }
  });

  it('brakes for a hot gun truck that stands to cool once it is past gun reach', () => {
    const { w, hauler } = trailing(WAIT + 3);
    w.turn = Math.round(NOON_TURN);
    planHaulerOrder(w);
    expect(hauler.order).toEqual({ kind: 'brake' });
  });

  it('has a hysteresis: a moving hauler waits past the reach, a parked one resumes at the resume gap', () => {
    const cases: [number, number, boolean][] = [[15, 4, false], [WAIT + 3, 4, true], [15, 0, true], [RESUME - 1, 0, false]];
    for (const [lag, speed, waits] of cases) {
      const { w, hauler } = trailing(lag);
      hauler.speed = speed;
      planHaulerOrder(w);
      expect(waitsForGunTruck(w, hauler), `lag ${lag} speed ${speed}`).toBe(waits);
      expect(hauler.order?.kind).toBe(waits ? 'brake' : 'through');
    }
  });

  it('drives on from a gun truck ahead of it, and from a free one that left it far behind', () => {
    const ahead = trailing(-50);
    planHaulerOrder(ahead.w);
    expect(ahead.hauler.order?.kind).toBe('through');
    const far = trailing(60);
    planHaulerOrder(far.w);
    expect(far.hauler.order?.kind).toBe('through');
  });

  it('leaves the yard approach and the stop between levels alone', () => {
    const { w, hauler } = trailing(60);
    const gun = playerVehicle(w);
    gun.pos = { x: gun.pos.x, y: gun.pos.y };
    hauler.pos = { ...yardSpots(w, w.chaosHighway!.window + 1).hauler };
    hauler.speed = 4;
    planHaulerOrder(w);
    expect(hauler.order?.kind).toBe('stopAt');
  });

  it('gives the same order after a save and load while waiting', () => {
    const { w, hauler } = trailing(WAIT + 2);
    hauler.speed = 0;
    planHaulerOrder(w);
    const copy = JSON.parse(JSON.stringify(w)) as World;
    planHaulerOrder(copy);
    expect(haulerOf(copy).order).toEqual(hauler.order);
  });

  it('still raises a stall for a hauler held still that does not wait', () => {
    const { w, hauler } = trailing(-50);
    hauler.pos = roadPoint(w.seed, 0, N + 5, LANES[1]);
    resetHaulerWatch();
    watchHaulerStall(w);
    w.turn += CHAOS_HIGHWAY.hauler.stallTurns;
    watchHaulerStall(w);
    expect(stallEvents(w)).toBe(1);
  });
});
