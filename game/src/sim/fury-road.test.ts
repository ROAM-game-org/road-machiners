import { describe, expect, it } from 'vitest';
import { FURY_ROAD, HIGHWAY } from '../data/modes';
import { NPCS } from '../data/npcs';
import { TERRAIN } from '../data/terrain';
import { PARTS } from '../data/parts';
import { startKit } from '../data/start';
import { TEST_MAP } from '../test/map';
import { defaultSetup } from './settings';
import { inOverdrive, maxSpeedSteps } from './stats';
import { inCombat } from './combat';
import { haulerOf, playerVehicle } from './damage';
import { sightRadius } from './vision';
import { dist } from './vec';
import { abandonRun, advanceFuryRoad, betweenLevels, canAbandonRun, canDriveOn, driveOn, furyRoadReadout, moveWindow, planStretch, reachedOutpostAt, runEarnings, spawnGroup, waveOf, WINDOW_MOVE } from './fury-road';
import { yardSpots } from './outpost-gates';
import { enemyTrucks, gearMoneyOf, groupSizes, payOf } from './fury-road-danger';
import { acrossOf, alongOf, highwayHash, highwayMap, milestoneAt, roadPoint, toRoad, WINDOW_SHIFT } from './highway';
import { topGoal } from './npc-activities';
import { planNpcOrders } from './ai';
import { optionWeights, tradeOffers } from './npc-decisions';
import { getResources } from './resources';
import { addState, stateOf } from './states';
import { furyRoadWorld } from './testkit';
import type { FuryRoadRun, Vehicle, WaveGroup, World } from './types';
import { heightAt } from './terrain';
import { cloneWorld, endTurn, newWorld } from './world';

function runOf(w: World): FuryRoadRun {
  if (!w.furyRoad) throw new Error('No run');
  return w.furyRoad;
}

function moveTo(w: World, n: number): void {
  const me = playerVehicle(w);
  me.pos = roadPoint(w.seed, runOf(w).window, n, HIGHWAY.road.lanes[2]);
  me.speed = 0;
  const hauler = haulerOf(w);
  hauler.pos = roadPoint(w.seed, runOf(w).window, n, HIGHWAY.road.lanes[1]);
  hauler.speed = 0;
}

function parkOnNext(w: World): void {
  const spots = yardSpots(w, runOf(w).window + 1);
  for (const [truck, spot] of [[haulerOf(w), spots.hauler], [playerVehicle(w), spots.truck]] as const) {
    truck.pos = { ...spot };
    truck.speed = 0;
    truck.order = null;
  }
}

function arrive(w: World): World {
  parkOnNext(w);
  return endTurn(w, still);
}

function groupTrucks(w: World): string[] {
  return runOf(w).groups.flatMap((g) => g.vehicles);
}

const still = () => {};

function group(w: World, i = 0): WaveGroup {
  return runOf(w).groups[i];
}

function quietUntilDue(w: World): void {
  w.turn = runOf(w).quietFrom + FURY_ROAD.pacing.quiet;
}

function spawnFirst(w: World): WaveGroup {
  quietUntilDue(w);
  advanceFuryRoad(w);
  const first = group(w);
  if (!first.spawned) throw new Error('The first group did not spawn');
  return first;
}

function trucksOf(w: World, g: WaveGroup): Vehicle[] {
  return w.vehicles.filter((v) => g.vehicles.includes(v.id));
}

function roadSpot(w: World, v: Vehicle): { along: number; across: number } {
  const at = toRoad(runOf(w).window, v.pos);
  return { along: alongOf(w.seed, at), across: acrossOf(w.seed, at) };
}

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const STRETCHES = Array.from({ length: 10 }, (_, i) => i + 1);
const SIZES = [3, 3, 2];

describe('the Fury Road pool', () => {
  it('names every NPC template, and draws each one over twenty runs', () => {
    const named = new Set(FURY_ROAD.pool.flatMap((tier) => Object.keys(tier.weights)));
    const drawn = new Set(SEEDS.flatMap((seed) => STRETCHES.flatMap((j) => planStretch(seed, j, SIZES).flatMap((g) => g.templates))));

    expect([...named].sort()).toEqual(Object.keys(NPCS).sort());
    expect(Object.keys(FURY_ROAD.pool[FURY_ROAD.pool.length - 1].weights).sort()).toEqual(Object.keys(NPCS).sort());
    expect([...drawn].sort()).toEqual(Object.keys(NPCS).sort());
  });

  it('sends the given group sizes at the wave gear level, from the tier of the stretch', () => {
    for (const seed of SEEDS) {
      for (const j of STRETCHES) {
        const groups = planStretch(seed, j, SIZES);
        const tier = FURY_ROAD.pool.find((t) => j <= t.upTo)!;
        expect(groups.map((g) => g.templates.length)).toEqual(SIZES);
        expect(groups.every((g) => g.level === waveOf(j).level)).toBe(true);
        expect(groups.flatMap((g) => g.templates).every((id) => tier.weights[id] > 0), `seed ${seed} stretch ${j}`).toBe(true);
      }
    }
  });

  it('sends light trucks first and army trucks and convoys only later', () => {
    const early = SEEDS.flatMap((seed) => [1, 2].flatMap((j) => planStretch(seed, j, SIZES).flatMap((g) => g.templates)));

    expect(early.some((id) => ['gunwagon', 'noseArmy', 'convoy', 'convoyGuard'].includes(id))).toBe(false);
  });
});

describe('the sides a group comes from', () => {
  it('never repeats the side of the group before it', () => {
    const sides = new Set<string>();
    for (const seed of SEEDS) {
      for (const j of STRETCHES) {
        const from = planStretch(seed, j, SIZES).map((g) => g.from);
        from.forEach((side) => sides.add(side));
        from.slice(1).forEach((side, i) => expect(side, `seed ${seed} stretch ${j}`).not.toBe(from[i]));
      }
    }

    expect([...sides].sort()).toEqual(['ahead', 'left', 'right']);
  });

  it('spawns ahead of the player or out in the badlands ahead on its side, inside the window', () => {
    for (const from of ['ahead', 'left', 'right'] as const) {
      const w = furyRoadWorld();
      moveTo(w, milestoneAt(0) + 120);
      const first = group(w);
      first.from = from;
      first.templates = ['buggy', 'trader', 'merc'];
      const progress = alongOf(w.seed, toRoad(0, playerVehicle(w).pos));

      spawnGroup(w, runOf(w), first, progress);

      expect(first.vehicles).toHaveLength(3);
      for (const v of trucksOf(w, first)) {
        const at = roadSpot(w, v);
        expect(Math.min(v.pos.x, v.pos.y)).toBeGreaterThan(0);
        expect(Math.max(v.pos.x, v.pos.y)).toBeLessThan(w.size);
        expect(at.along).toBeGreaterThan(progress + 10);
        if (from === 'left') expect(at.across).toBeLessThanOrEqual(-18);
        if (from === 'right') expect(at.across).toBeGreaterThanOrEqual(18);
      }
    }
  });
});

describe('spawning out of the gun truck sight', () => {
  function placeGunTruck(w: World, n: number, across: number): void {
    const me = playerVehicle(w);
    me.pos = roadPoint(w.seed, runOf(w).window, n, across);
    me.speed = 0;
  }

  function reach(w: World): number {
    return sightRadius(w, playerVehicle(w), true) + FURY_ROAD.sightMargin;
  }

  const CASES = [
    { from: 'ahead', lead: 8, across: HIGHWAY.road.lanes[2] },
    { from: 'left', lead: 0, across: -15 },
    { from: 'right', lead: 0, across: 15 },
  ] as const;

  it.each(CASES)('puts a group from $from beyond the sight of a gun truck', ({ from, lead, across }) => {
    for (const rank of [0, 5]) {
      const w = furyRoadWorld();
      w.player.ranks.perception = rank;
      moveTo(w, milestoneAt(0) + 120);
      placeGunTruck(w, milestoneAt(0) + 120 + lead, across);
      const first = group(w);
      first.from = from;
      first.templates = ['buggy', 'trader', 'merc'];

      spawnGroup(w, runOf(w), first, alongOf(w.seed, toRoad(0, haulerOf(w).pos)));

      expect(first.vehicles).toHaveLength(3);
      for (const v of trucksOf(w, first)) expect(dist(v.pos, playerVehicle(w).pos)).toBeGreaterThan(reach(w));
    }
  });

  it('waits with no failure clock while every spot is in sight, then spawns when one is not', () => {
    const w = furyRoadWorld();
    moveTo(w, milestoneAt(0) + 120);
    const first = group(w);
    first.from = 'ahead';
    placeGunTruck(w, milestoneAt(0) + 120 + FURY_ROAD.sides.ahead, HIGHWAY.road.lanes[1]);
    quietUntilDue(w);
    for (let i = 0; i < FURY_ROAD.spawnRetryTurns + 5; i++) {
      advanceFuryRoad(w);
      w.turn += 1;
    }
    expect(first.spawned).toBe(false);
    expect(first.retryUntil).toBeNull();

    placeGunTruck(w, milestoneAt(0) + 120, HIGHWAY.road.lanes[2]);
    advanceFuryRoad(w);

    expect(first.spawned).toBe(true);
  });

  it('throws after the retry turns when no free spot exists even with sight ignored', () => {
    const w = furyRoadWorld();
    moveTo(w, milestoneAt(0) + 120);
    const first = group(w);
    first.from = 'ahead';
    w.size = 2;
    quietUntilDue(w);
    expect(() => {
      for (let i = 0; i < FURY_ROAD.spawnRetryTurns + 2; i++) {
        advanceFuryRoad(w);
        w.turn += 1;
      }
    }).toThrow(/no free lane spot/);
  });

  it('clears a running failure clock once the only blocker is sight', () => {
    const w = furyRoadWorld();
    moveTo(w, milestoneAt(0) + 120);
    const first = group(w);
    first.from = 'ahead';
    placeGunTruck(w, milestoneAt(0) + 120 + FURY_ROAD.sides.ahead, HIGHWAY.road.lanes[1]);
    first.retryUntil = w.turn + FURY_ROAD.spawnRetryTurns;
    quietUntilDue(w);
    advanceFuryRoad(w);

    expect(first.spawned).toBe(false);
    expect(first.retryUntil).toBeNull();
  });

  it('starts the quiet clock when a group spawns, so the next group waits', () => {
    const w = furyRoadWorld();
    const first = spawnFirst(w);
    const turn = w.turn;

    expect(first.spawned).toBe(true);
    expect(runOf(w).quietFrom).toBe(turn);
    for (let i = 1; i < FURY_ROAD.pacing.quiet; i++) {
      w.turn = turn + i;
      advanceFuryRoad(w);
      expect(groupTrucks(w), `turn ${w.turn}`).toHaveLength(first.vehicles.length);
    }
  });
});

describe('the pace of encounters', () => {
  it('holds the first group of a level for twenty quiet turns', () => {
    let w = furyRoadWorld();
    for (let i = 1; i < FURY_ROAD.pacing.quiet; i++) {
      w = endTurn(w, still);
      expect(group(w).spawned, `turn ${w.turn}`).toBe(false);
    }
    w = endTurn(w, still);

    expect(group(w).spawned).toBe(true);
  });

  it('spawns hostile groups that hunt the hauler and hold the player a foe they do not shoot at', () => {
    const w = furyRoadWorld();
    const first = spawnFirst(w);

    for (const v of trucksOf(w, first)) {
      expect(stateOf(w, 'feud', v.id, haulerOf(w).id)).not.toBeNull();
      expect(stateOf(w, 'feud', v.id, w.player.vehicleId)).not.toBeNull();
      expect(v.brain!.attackers).toEqual({ [haulerOf(w).id]: false });
      expect(topGoal(v)).toMatchObject({ kind: 'fight', targetId: haulerOf(w).id });
    }
  });

  it('spawns no group while one is near, nor in the twenty turns after it leaves', () => {
    let w = furyRoadWorld(4);
    for (let k = 0; k < 4; k++) w = nextLevel(w);
    runOf(w).groups = planStretch(w.seed, runOf(w).window + 1, [1, 1]);
    const first = spawnFirst(w);
    const me = playerVehicle(w);
    for (let t = 0; t < 40; t++) {
      for (const v of trucksOf(w, first)) v.pos = { x: me.pos.x + 6, y: me.pos.y };
      w.turn++;
      advanceFuryRoad(w);
      expect(group(w, 1).spawned).toBe(false);
    }
    for (const v of trucksOf(w, first)) v.pos = { x: me.pos.x + FURY_ROAD.pacing.near + 5, y: me.pos.y };
    const lastNear = w.turn;
    while (w.turn < lastNear + FURY_ROAD.pacing.quiet - 1) {
      w.turn++;
      advanceFuryRoad(w);
      expect(group(w, 1).spawned, `turn ${w.turn}`).toBe(false);
    }
    w.turn++;
    advanceFuryRoad(w);

    expect(group(w, 1).spawned).toBe(true);
  });

  it('never puts more than the cap of trucks on the road at once', () => {
    let w = furyRoadWorld();
    for (let k = 0; k < 7; k++) w = nextLevel(w);
    const run = runOf(w);
    run.groups = planStretch(w.seed, run.window + 1, SIZES);
    for (const g of run.groups) {
      quietUntilDue(w);
      advanceFuryRoad(w);
      for (const v of trucksOf(w, g)) {
        const away = haulerOf(w).pos;
        const gap = dist(v.pos, away);
        const push = (3 * FURY_ROAD.pacing.near) / gap;
        v.pos = { x: away.x + (v.pos.x - away.x) * (1 + push), y: away.y + (v.pos.y - away.y) * (1 + push) };
      }
      run.quietFrom = -FURY_ROAD.pacing.quiet;
    }
    const late = { ...run.groups[0], id: 'late', spawned: false, vehicles: [], engaged: [], templates: ['buggy'] };
    run.groups.push(late);

    advanceFuryRoad(w);

    expect(groupTrucks(w).length).toBe(FURY_ROAD.maxAlive);
    expect(late.spawned).toBe(false);
  });

  it('keeps a group hunting a player it meets long after it spawns', () => {
    const sturdy = { ...startKit('furyRoad'), chassis: 'hauler', parts: ['cannon', 'heavyMg', 'mg', 'workhorseDiesel', 'ram', 'plates', 'plates', 'rack'], placed: [] };
    let w = newWorld(3, sturdy, highwayMap(3, 0), defaultSetup('furyRoad'));
    spawnFirst(w);
    for (let i = 0; i < 15; i++) w = endTurn(w, still);

    for (const v of trucksOf(w, group(w))) {
      expect(stateOf(w, 'feud', v.id, w.player.vehicleId)).not.toBeNull();
      expect(topGoal(v)?.kind).toBe('fight');
    }
  });
});

describe('a group racing in', () => {
  it('drives at its own speed near and far, with no overdrive', () => {
    const w = furyRoadWorld();
    const first = spawnFirst(w);
    const [v] = trucksOf(w, first);
    const me = playerVehicle(w);
    for (const gap of [FURY_ROAD.pacing.near + 40, TERRAIN.vision.radius + 1, 5]) {
      v.pos = { x: me.pos.x + gap, y: me.pos.y };
      w.turn++;
      advanceFuryRoad(w);

      expect(inOverdrive(w, v), `gap ${gap}`).toBe(false);
      expect(maxSpeedSteps(w, v).some((s) => s.kind === 'overdrive')).toBe(false);
    }
  });

  it('drives at full speed toward a player out of sight, never stopping at the hunted point', () => {
    const w = furyRoadWorld();
    const [v] = trucksOf(w, spawnFirst(w));
    const me = playerVehicle(w);
    v.pos = { x: me.pos.x, y: me.pos.y + FURY_ROAD.pacing.near + 10 };
    w.turn++;
    advanceFuryRoad(w);
    planNpcOrders(w);

    expect(v.order?.kind).toBe('through');
    expect(v.order && 'pace' in v.order ? v.order.pace : undefined).toBeUndefined();
  });

  it('leaves the overdrive of the player to its switch, and no Roaming truck overdrives', () => {
    const w = furyRoadWorld();
    const me = playerVehicle(w);
    w.player.overdrive = false;
    expect(inOverdrive(w, me)).toBe(false);
    w.player.overdrive = true;
    expect(inOverdrive(w, me)).toBe(true);

    const roaming = newWorld(7, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    expect(roaming.vehicles.filter((v) => v.id !== roaming.player.vehicleId).some((v) => inOverdrive(roaming, v))).toBe(false);
  });
});

function nextLevel(w: World): World {
  return driveOn(arrive(w));
}

describe('arriving at an outpost', () => {
  it('pays once and ends the level there, with the window left where it is', () => {
    const w = furyRoadWorld();
    const money = w.player.money;

    const after = arrive(w);

    expect(runOf(after).window).toBe(0);
    expect(after.mapHash).toBe(highwayHash(w.seed, 0));
    expect(after.player.money).toBe(money + payOf(1));
    expect(after.events).toContainEqual({ t: 'outpostReached', milestone: 1, pay: payOf(1), wrecks: 0 });
    expect(runOf(after).outposts.map((o) => [o.milestone, o.paid])).toEqual([[1, true]]);
    expect(runOf(after).groups).toEqual([]);
    expect(betweenLevels(after)).toBe(true);
    expect(canDriveOn(after)).toBe(true);
    expect(reachedOutpostAt(after)?.id).toBe('outpost-1');
  });

  it('wins the level in a fight, sends the hostiles off the road and ends their fight that turn', () => {
    let w = furyRoadWorld();
    const first = spawnFirst(w);
    const me = playerVehicle(w);
    parkOnNext(w);
    for (const v of trucksOf(w, first)) {
      v.pos = { x: me.pos.x + 5, y: me.pos.y };
      addState(w, 'combat', v.id, w.player.vehicleId, { kind: 'none' });
    }
    expect(inCombat(w, me)).toBe(true);

    w = endTurn(w, still);

    expect(w.events.some((e) => e.t === 'outpostReached')).toBe(true);
    expect(inCombat(w, playerVehicle(w))).toBe(false);
    expect(w.states.filter((s) => first.vehicles.includes(s.holder) || first.vehicles.includes(s.other))).toEqual([]);
    expect(w.vehicles.map((v) => v.id)).toEqual([w.player.vehicleId, haulerOf(w).id]);
    expect(runOf(w).window).toBe(0);
  });

  it('opens the next window on Drive on at the paid outpost, with the player in the same spot and on the same ground', () => {
    const w = arrive(furyRoadWorld());
    const before = playerVehicle(w).pos;
    const ground = w.terrain.types[Math.floor(before.y) * w.size + Math.floor(before.x)];
    w.player.explored[95 * w.size + 5] = 1;

    const after = driveOn(w);
    const me = playerVehicle(after);
    const shifted = (95 + WINDOW_SHIFT.y) * after.size + 5 + WINDOW_SHIFT.x;

    expect(runOf(after).window).toBe(1);
    expect(after.mapHash).toBe(highwayHash(w.seed, 1));
    expect(after.events).toEqual([{ t: 'roadOpened', stretch: 2 }]);
    expect(me.pos).toEqual({ x: before.x + WINDOW_SHIFT.x, y: before.y + WINDOW_SHIFT.y });
    expect(after.terrain.types[Math.floor(me.pos.y) * after.size + Math.floor(me.pos.x)]).toBe(ground);
    expect(heightAt(after.terrain, me.pos.x, me.pos.y)).toBeCloseTo(heightAt(w.terrain, before.x, before.y), 9);
    expect(after.player.explored[shifted]).toBe(1);
    expect(after.player.explored[5 * after.size + 5]).toBe(0);
    expect(runOf(after).outposts.map((o) => [o.milestone, o.paid])).toEqual([[1, true], [2, false]]);
    expect(runOf(after).groups.every((g) => g.stretch === 2)).toBe(true);
    expect(runOf(after).quietFrom).toBe(after.turn);
    expect(after.vehicles.every((v) => v.pos.x > 0 && v.pos.y > 0 && v.pos.x < after.size && v.pos.y < after.size)).toBe(true);
    expect(betweenLevels(after)).toBe(false);
    expect(reachedOutpostAt(after)).toBeNull();
  });

  it('spawns nothing between levels, even off the pad, and pays nothing more', () => {
    const w = arrive(furyRoadWorld());
    const money = w.player.money;
    moveTo(w, milestoneAt(1) + 20);
    for (let t = 0; t < 200; t++) {
      w.turn++;
      advanceFuryRoad(w);
    }
    playerVehicle(w).pos = yardSpots(w, 1).truck;
    advanceFuryRoad(w);

    expect(w.vehicles.map((v) => v.id)).toEqual([w.player.vehicleId, haulerOf(w).id]);
    expect(w.player.money).toBe(money);
    expect(runOf(w).window).toBe(0);
  });

  it('drives on only with both trucks parked in the yard of the paid next outpost', () => {
    const early = furyRoadWorld();
    parkOnNext(early);
    expect(canDriveOn(early)).toBe(false);
    expect(() => driveOn(early)).toThrow(/Drive on/);

    const off = arrive(furyRoadWorld());
    moveTo(off, milestoneAt(1) + 20);
    expect(canDriveOn(off)).toBe(false);
    expect(() => driveOn(off)).toThrow(/Drive on/);

    const opened = nextLevel(furyRoadWorld());
    expect(canDriveOn(opened)).toBe(false);
    expect(() => driveOn(opened)).toThrow(/Drive on/);
  });

  it('completes on reaching the yard at speed, but not outside it', () => {
    const moving = furyRoadWorld();
    parkOnNext(moving);
    haulerOf(moving).speed = 8;
    const off = furyRoadWorld();
    moveTo(off, milestoneAt(1) - 20);

    for (const w of [moving, off]) advanceFuryRoad(w);

    expect([moving, off].map((w) => runOf(w).outposts[0].paid)).toEqual([true, false]);
  });

  it('pays the base alone whatever the wrecks, and keeps the run totals', () => {
    const w = furyRoadWorld();
    runOf(w).groups[0].wrecked = 2;
    const money = w.player.money;

    const after = arrive(w);

    expect(after.player.money).toBe(money + payOf(1));
    expect(runOf(after).earned).toBe(payOf(1));
    expect(runOf(after).wrecks).toBe(2);
    expect(runEarnings(after)).toMatchObject({ pay: payOf(1), wrecks: 2, reached: 1 });
  });

  it('counts a wreck of a group truck toward the stretch', () => {
    const w = furyRoadWorld();
    const group = spawnFirst(w);
    w.events = [{ t: 'destroyed', vehicle: group.vehicles[0], by: w.player.vehicleId }];

    advanceFuryRoad(w);

    expect(group.wrecked).toBe(1);
  });

  it('removes the trucks of a finished stretch and awards no XP for it', () => {
    const w = furyRoadWorld();
    const group = spawnFirst(w);
    for (const v of w.vehicles) if (group.vehicles.includes(v.id)) v.pos = { x: v.pos.x + 100, y: v.pos.y };
    w.states = w.states.filter((s) => s.kind !== 'combat');
    const passing = cloneWorld(w);
    moveTo(passing, milestoneAt(1) - 10);

    const after = arrive(w);
    const passed = endTurn(passing, still);

    expect(after.vehicles.map((v) => v.id)).toEqual([after.player.vehicleId, haulerOf(after).id]);
    expect(passed.vehicles.some((v) => group.vehicles.includes(v.id))).toBe(true);
    expect(after.player.xp).toBe(passed.player.xp);
  });

  it('refuses to move the window before the outpost is paid or with the player off the pad', () => {
    const early = furyRoadWorld();
    parkOnNext(early);
    expect(() => moveWindow(early)).toThrow(/paid/);

    const off = arrive(furyRoadWorld());
    moveTo(off, milestoneAt(1) + 20);
    expect(() => moveWindow(off)).toThrow(/parked/);
  });

  it('discovers the outpost fort as any site, with its line and its XP', () => {
    const w = furyRoadWorld();
    parkOnNext(w);
    const xp = w.player.xp;

    const after = endTurn(w, still);

    expect(after.player.discovered).toContain('outpost-1');
    expect(after.events).toContainEqual({ t: 'discover', location: 'outpost-1' });
    expect(after.player.xp).toBeGreaterThan(xp);
  });

  it('names a move for every world field', () => {
    expect(Object.keys(WINDOW_MOVE).sort()).toEqual(Object.keys(furyRoadWorld()).sort());
  });
});

describe('the endless run', () => {
  it('stays bounded over thirty stretches', () => {
    let w = furyRoadWorld();
    const sizes: number[] = [];
    for (let k = 0; k < 30; k++) {
      w = nextLevel(w);
      sizes.push(JSON.stringify({ ...w, terrain: null, player: { ...w.player, explored: null } }).length);
    }

    expect(runOf(w).window).toBe(30);
    expect(w.size).toBe(HIGHWAY.size);
    expect(runOf(w).outposts).toHaveLength(2);
    expect(runOf(w).groups.map((g) => g.templates.length)).toEqual(groupSizes(enemyTrucks(w, 31)));
    expect(w.vehicles).toHaveLength(2);
    expect(w.obstacles.every((o) => o.pos.x >= 0 && o.pos.y >= 0 && o.pos.x <= w.size && o.pos.y <= w.size)).toBe(true);
    expect(Math.max(...sizes.slice(10))).toBeLessThan(Math.max(...sizes.slice(0, 10)) * 1.5);
  });

  it('arms up for eight stretches and then holds its gear rules', () => {
    expect(waveOf(9)).toBe(waveOf(8));
    expect(waveOf(40)).toBe(FURY_ROAD.waves[FURY_ROAD.waves.length - 1]);
    expect(() => waveOf(0)).toThrow(/no wave/);
  });

  it('reads the stretch and the distance to the next outpost, with no total', () => {
    const w = furyRoadWorld();
    moveTo(w, milestoneAt(1) - 50);

    const readout = furyRoadReadout(w)!;

    expect(readout).toMatchObject({ stretch: 1, outpostId: 'outpost-1' });
    expect(readout.toOutpost).toBeCloseTo(50, 0);
  });

  it('reads the next stretch at its full length between levels', () => {
    const w = arrive(furyRoadWorld());

    expect(furyRoadReadout(w)).toEqual({ stretch: 2, toOutpost: milestoneAt(2) - milestoneAt(1), outpostId: 'outpost-2' });
  });
});

describe('a Fury Road world on the highway', () => {
  it('shows no Icarus place in three hundred turns of the run', () => {
    let w = furyRoadWorld(5);
    const ids = w.obstacles.map((o) => o.id);
    for (let i = 0; i < 300 && w.player.state === 'active'; i++) {
      const me = playerVehicle(w);
      if (me.order === null) me.order = { kind: 'stopAt', dest: yardSpots(w, runOf(w).window + 1).truck };
      w = endTurn(w, still);
    }

    expect(ids.some((id) => /^(site|pond|cw)-/.test(id))).toBe(false);
    expect(w.player.discovered.every((id) => /^outpost-\d+$/.test(id))).toBe(true);
    expect(w.salvage).toEqual([]);
  }, 120_000);
});

describe('ending a Fury Road run', () => {
  it('lets only a stranded truck end the run', () => {
    const w = furyRoadWorld();

    expect(canAbandonRun(w)).toBe(false);
    expect(() => abandonRun(w)).toThrow(/stranded/);

    w.player.fuel = 0;
    const ended = abandonRun(w);

    expect(ended.player.state).toBe('dead');
    expect(ended.events).toEqual([{ t: 'runLost', stretch: 1, cause: 'abandoned' }]);
  });

  it('runs no more turns once the run is lost', () => {
    const w = furyRoadWorld();
    w.player.fuel = 0;
    const ended = abandonRun(w);

    expect(() => endTurn(ended, still)).toThrow(/dead/);
  });
});

describe('a Fury Road group truck between fights', () => {
  it('weighs its idle options with no shops in the world, and finds no trade', () => {
    const w = furyRoadWorld();
    const group = spawnFirst(w);
    const npc = w.vehicles.find((v) => v.id === group.vehicles[0])!;
    getResources(w, npc).money = 5000;

    expect(tradeOffers(w, npc)).toEqual([]);
    expect(() => optionWeights(w, npc, 'idle', null, null)).not.toThrow();
  });
});

describe('the gear money of a stretch', () => {
  const withGrowth = (growth: number): World => {
    const w = furyRoadWorld();
    return { ...w, setup: { ...w.setup, settings: { ...w.setup.settings, enemyGearGrowth: growth } } };
  };
  const partsValue = (v: Vehicle): number =>
    v.items.reduce((sum, item) => (item.kind === 'part' && PARTS[item.part.defId].kind !== 'core' ? sum + PARTS[item.part.defId].value : sum), 0);

  it('caps what each spawned truck spends on parts', () => {
    const w = nextLevel(withGrowth(0));
    const g = spawnFirst(w);

    expect(g.stretch).toBe(2);
    for (const v of trucksOf(w, g)) expect(partsValue(v)).toBeLessThanOrEqual(gearMoneyOf(w, g.stretch));
  });
});
