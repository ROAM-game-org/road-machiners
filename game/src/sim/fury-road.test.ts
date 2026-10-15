import { describe, expect, it } from 'vitest';
import { FURY_ROAD, HIGHWAY } from '../data/modes';
import { NPCS } from '../data/npcs';
import { TERRAIN } from '../data/terrain';
import { PARTS } from '../data/parts';
import { startKit } from '../data/start';
import { TEST_MAP } from '../test/map';
import { defaultSetup } from './settings';
import { inOverdrive, maxSpeedSteps } from './stats';
import { groupPrey, inCombat } from './combat';
import { haulerOf, playerVehicle } from './damage';
import { abandonRun, advanceFuryRoad, betweenLevels, canAbandonRun, canWaitForRoad, furyRoadReadout, moveWindow, onOutpostPad, outpostPad, planStretch, reachedOutpostAt, runEarnings, spawnGroup, waitForRoad, waveOf, WINDOW_MOVE } from './fury-road';
import { cardsOf, directStretch, expectedGear, payOf, planWaves, stretchBudget, type PlannedWave } from './fury-road-director';
import { acrossOf, alongOf, highwayHash, highwayMap, milestoneAt, roadPoint, stretchLength, toRoad, windowShift } from './highway';
import { sightRadius } from './vision';
import { dist } from './vec';
import { topGoal } from './npc-activities';
import { planNpcOrders } from './ai';
import { optionWeights, tradeOffers } from './npc-decisions';
import { getResources } from './resources';
import { addState, stateOf } from './states';
import { furyRoadWorld } from './testkit';
import type { FuryRoadRun, Vehicle, WaveGroup, World } from './types';
import { heightAt } from './terrain';
import { endTurn, newWorld } from './world';

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
  const pad = outpostPad(w, runOf(w).window + 1);
  for (const [truck, shift] of [[haulerOf(w), 0], [playerVehicle(w), 2]] as const) {
    truck.pos = { x: pad.x + shift, y: pad.y };
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

function spawnFirst(w: World): WaveGroup {
  moveTo(w, group(w).at + 1);
  advanceFuryRoad(w);
  const first = group(w);
  if (!first.spawned) throw new Error('The first group did not spawn');
  return first;
}

function trucksOf(w: World, g: WaveGroup): Vehicle[] {
  return w.vehicles.filter((v) => g.vehicles.includes(v.id));
}

function roadSpot(w: World, v: Vehicle): { along: number; across: number } {
  const at = toRoad(w.seed, runOf(w).window, v.pos);
  return { along: alongOf(w.seed, at), across: acrossOf(w.seed, at) };
}

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const STRETCHES = Array.from({ length: 10 }, (_, i) => i + 1);
const PLAN_WORLD = furyRoadWorld();

function wavesOf(seed: number, j: number): PlannedWave[] {
  const { budget, base } = stretchBudget(PLAN_WORLD, j);
  return planWaves(seed, j, budget, base);
}

function plan(seed: number, j: number): WaveGroup[] {
  return planStretch(seed, j, wavesOf(seed, j));
}

function planned(sizes: number[], first: number): PlannedWave[] {
  return sizes.map((size, i) => ({ at: first + i * 20, template: 'buggy', size, money: FURY_ROAD.cards.buggy.floor, elite: false }));
}

describe('the Fury Road enemy cards', () => {
  it('names every NPC template, and draws each one over twenty runs', () => {
    const drawn = new Set(SEEDS.flatMap((seed) => STRETCHES.flatMap((j) => wavesOf(seed, j).map((wave) => wave.template))));

    expect(Object.keys(FURY_ROAD.cards).sort()).toEqual(Object.keys(NPCS).sort());
    expect([...drawn].sort()).toEqual(Object.keys(NPCS).sort());
  });

  it('draws each wave from the cards open at its stretch, at the wave gear level, within the wave size limits', () => {
    const { wave } = FURY_ROAD.director;
    for (const seed of SEEDS) {
      for (const j of STRETCHES) {
        const open = cardsOf(j).map(([template]) => template);
        const groups = plan(seed, j);
        expect(groups.length, `seed ${seed} stretch ${j}`).toBeGreaterThan(0);
        expect(groups.every((g) => g.level === waveOf(j).level)).toBe(true);
        expect(groups.every((g) => g.templates.every((id) => id === g.templates[0] && open.includes(id))), `seed ${seed} stretch ${j}`).toBe(true);
        expect(groups.every((g) => g.templates.length >= wave.min && g.templates.length <= wave.cap), `seed ${seed} stretch ${j}`).toBe(true);
      }
    }
  });

  it('sends light trucks first and army trucks and convoys only later', () => {
    const early = SEEDS.flatMap((seed) => [1, 2].flatMap((j) => wavesOf(seed, j).map((wave) => wave.template)));

    expect(early.some((id) => ['gunwagon', 'noseArmy', 'convoy', 'convoyGuard'].includes(id))).toBe(false);
  });

  it('opens the heavy cards at stretch 6', () => {
    expect(cardsOf(5).map(([id]) => id)).not.toContain('gunwagon');
    expect(cardsOf(6).map(([id]) => id)).toContain('gunwagon');
    expect(() => cardsOf(0)).toThrow(/no enemy cards/);
  });
});

describe('the stretch director', () => {
  it('sends no more trucks than the budget of the stretch', () => {
    for (const seed of SEEDS) {
      for (const j of STRETCHES) {
        const trucks = wavesOf(seed, j).reduce((sum, wave) => sum + wave.size, 0);
        expect(trucks, `seed ${seed} stretch ${j}`).toBeLessThanOrEqual(stretchBudget(PLAN_WORLD, j).budget);
      }
    }
  });

  it('places the waves in order along the road, inside the stretch and clear of both outposts', () => {
    for (const seed of SEEDS) {
      for (const j of STRETCHES) {
        const ats = wavesOf(seed, j).map((wave) => wave.at);
        expect(ats, `seed ${seed} stretch ${j}`).toEqual([...ats].sort((a, b) => a - b));
        expect(ats.every((at) => at > milestoneAt(seed, j - 1) && at < milestoneAt(seed, j)), `seed ${seed} stretch ${j}`).toBe(true);
      }
    }
  });

  it('pays each wave at least the floor of its card and the base share of the expected player gear', () => {
    for (const seed of SEEDS) {
      for (const j of STRETCHES) {
        const { base } = stretchBudget(PLAN_WORLD, j);
        for (const wave of wavesOf(seed, j)) {
          expect(wave.money, `seed ${seed} stretch ${j}`).toBeGreaterThanOrEqual(Math.max(FURY_ROAD.cards[wave.template].floor, base));
        }
      }
    }
  });

  it('makes waves elite only from the elite stretch, with the elite money', () => {
    const { elite } = FURY_ROAD.director;
    const all = (from: number, to: number) => SEEDS.flatMap((seed) => STRETCHES.filter((j) => j >= from && j <= to).flatMap((j) => wavesOf(seed, j)));

    expect(all(1, elite.from - 1).some((wave) => wave.elite)).toBe(false);
    const late = SEEDS.flatMap((seed) => STRETCHES.filter((j) => j >= elite.from).flatMap((j) => wavesOf(seed, j).map((wave) => ({ wave, j }))));
    expect(late.some(({ wave }) => wave.elite)).toBe(true);
    for (const { wave, j } of late.filter(({ wave: w }) => w.elite)) {
      expect(wave.money, `stretch ${j}`).toBe(Math.max(FURY_ROAD.cards[wave.template].floor, stretchBudget(PLAN_WORLD, j).base) * elite.money);
    }
  });

  it('plans the same stretch the same way for the same seed', () => {
    expect(wavesOf(7, 4)).toEqual(wavesOf(7, 4));
    expect(directStretch(PLAN_WORLD, 4)).toEqual(planWaves(PLAN_WORLD.seed, 4, stretchBudget(PLAN_WORLD, 4).budget, stretchBudget(PLAN_WORLD, 4).base));
  });

  it('grows the expected gear with each paid stretch and the truck money with the gear growth setting', () => {
    expect(expectedGear(2)).toBeGreaterThan(expectedGear(1));
    expect(() => expectedGear(0)).toThrow(/not a stretch/);
    const grown = (growth: number): World => ({ ...PLAN_WORLD, setup: { ...PLAN_WORLD.setup, settings: { ...PLAN_WORLD.setup.settings, enemyGearGrowth: growth } } });

    expect(stretchBudget(grown(0), 8).base).toBeLessThan(stretchBudget(grown(1), 8).base);
    expect(stretchBudget(grown(0), 8).base).toBe(stretchBudget(grown(0), 1).base);
  });
});

describe('the sides a group comes from', () => {
  it('never repeats the side of the group before it, but for a blocker, which always comes ahead', () => {
    const sides = new Set<string>();
    for (const seed of SEEDS) {
      for (const j of STRETCHES) {
        const groups = plan(seed, j);
        groups.forEach((g) => sides.add(g.from));
        groups.slice(1).forEach((g, i) => {
          if (FURY_ROAD.cards[g.templates[0]].chase) expect(g.from, `seed ${seed} stretch ${j}`).not.toBe(groups[i].from);
          else expect(g.from).toBe('ahead');
        });
      }
    }

    expect([...sides].sort()).toEqual(['ahead', 'left', 'right']);
  });

  it('spawns ahead of the player or out in the badlands ahead on its side, inside the window', () => {
    for (const from of ['ahead', 'left', 'right'] as const) {
      const w = furyRoadWorld();
      moveTo(w, milestoneAt(w.seed, 0) + 120);
      const first = group(w);
      first.from = from;
      first.templates = ['buggy', 'trader', 'merc'];
      const progress = alongOf(w.seed, toRoad(w.seed, 0, playerVehicle(w).pos));

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
      const at = milestoneAt(w.seed, 0) + 120;
      moveTo(w, at);
      placeGunTruck(w, at + lead, across);
      const first = group(w);
      first.from = from;
      first.templates = ['buggy', 'trader', 'merc'];

      spawnGroup(w, runOf(w), first, alongOf(w.seed, toRoad(w.seed, 0, haulerOf(w).pos)));

      expect(first.vehicles).toHaveLength(3);
      for (const v of trucksOf(w, first)) expect(dist(v.pos, playerVehicle(w).pos)).toBeGreaterThan(reach(w));
    }
  });

  it('waits with no failure clock while every spot is in sight, then spawns when one is not', () => {
    const w = furyRoadWorld();
    const first = group(w);
    first.from = 'ahead';
    moveTo(w, first.at + 1);
    placeGunTruck(w, first.at + 1 + FURY_ROAD.sides.ahead, HIGHWAY.road.lanes[1]);
    for (let i = 0; i < FURY_ROAD.spawnRetryTurns + 5; i++) {
      advanceFuryRoad(w);
      w.turn += 1;
    }
    expect(first.spawned).toBe(false);
    expect(first.retryUntil).toBeNull();

    placeGunTruck(w, first.at + 1, HIGHWAY.road.lanes[2]);
    advanceFuryRoad(w);

    expect(first.spawned).toBe(true);
  });

  it('clears a running failure clock once the only blocker is sight', () => {
    const w = furyRoadWorld();
    const first = group(w);
    first.from = 'ahead';
    moveTo(w, first.at + 1);
    placeGunTruck(w, first.at + 1 + FURY_ROAD.sides.ahead, HIGHWAY.road.lanes[1]);
    first.retryUntil = w.turn + FURY_ROAD.spawnRetryTurns;
    advanceFuryRoad(w);

    expect(first.spawned).toBe(false);
    expect(first.retryUntil).toBeNull();
  });
});

describe('the pace of encounters', () => {
  it('holds a group until the hauler reaches its road distance, however many turns pass', () => {
    const w = furyRoadWorld();
    moveTo(w, group(w).at - 5);
    for (let t = 0; t < 50; t++) {
      w.turn++;
      advanceFuryRoad(w);
    }
    expect(group(w).spawned).toBe(false);

    moveTo(w, group(w).at + 1);
    advanceFuryRoad(w);

    expect(group(w).spawned).toBe(true);
  });

  it('follows the hauler, not the player, for when a group is due', () => {
    const w = furyRoadWorld();
    const at = group(w).at;
    playerVehicle(w).pos = roadPoint(w.seed, runOf(w).window, at + 10, HIGHWAY.road.lanes[2]);
    haulerOf(w).pos = roadPoint(w.seed, runOf(w).window, at - 10, HIGHWAY.road.lanes[1]);
    advanceFuryRoad(w);

    expect(group(w).spawned).toBe(false);
  });

  it('spawns the groups in order, one per turn, even with the hauler past them all', () => {
    const w = furyRoadWorld();
    const run = runOf(w);
    expect(run.groups.length).toBeGreaterThan(1);
    moveTo(w, run.groups[run.groups.length - 1].at + 1);

    advanceFuryRoad(w);
    expect(run.groups.map((g) => g.spawned)).toEqual(run.groups.map((_, i) => i === 0));

    advanceFuryRoad(w);
    expect(run.groups.map((g) => g.spawned)).toEqual(run.groups.map((_, i) => i < 2));
  });

  it('spawns hostile groups that hunt their prey and hold both player trucks foes', () => {
    const w = furyRoadWorld();
    const first = spawnFirst(w);

    for (const v of trucksOf(w, first)) {
      expect(stateOf(w, 'feud', v.id, haulerOf(w).id)).not.toBeNull();
      expect(stateOf(w, 'feud', v.id, w.player.vehicleId)).not.toBeNull();
      expect(v.brain!.attackers).toEqual({ [haulerOf(w).id]: false });
      expect(topGoal(v)).toMatchObject({ kind: 'fight', targetId: groupPrey(w, v).id });
    }
  });

  it('spawns a due group while an earlier one still fights near the hauler, so not fighting holds nothing back', () => {
    let w = furyRoadWorld(4);
    for (let k = 0; k < 4; k++) w = nextLevel(w);
    const run = runOf(w);
    const first = milestoneAt(w.seed, run.window) + 100;
    run.groups = planStretch(w.seed, run.window + 1, planned([1, 1], first));
    moveTo(w, first + 1);
    advanceFuryRoad(w);
    moveTo(w, run.groups[1].at + 1);
    for (const v of trucksOf(w, run.groups[0])) v.pos = { x: haulerOf(w).pos.x + 6, y: haulerOf(w).pos.y };
    advanceFuryRoad(w);

    expect(run.groups[1].spawned).toBe(true);
  });

  it('never puts more than the cap of trucks on the road at once', () => {
    let w = furyRoadWorld();
    for (let k = 0; k < 7; k++) w = nextLevel(w);
    const run = runOf(w);
    const first = milestoneAt(w.seed, run.window) + 100;
    run.groups = planStretch(w.seed, run.window + 1, planned([3, 3, 2], first));
    for (const g of run.groups) {
      moveTo(w, g.at + 1);
      advanceFuryRoad(w);
    }
    const late = { ...run.groups[0], id: 'late', spawned: false, vehicles: [], engaged: [], templates: ['buggy'], at: run.groups[2].at };
    run.groups.push(late);

    advanceFuryRoad(w);

    expect(groupTrucks(w).length).toBe(FURY_ROAD.maxAlive);
    expect(late.spawned).toBe(false);
  });

  it('keeps a group hunting a player it meets long after it spawns', () => {
    const sturdy = { ...startKit('furyRoad'), chassis: 'hauler', parts: ['cannon', 'heavyMg', 'mg', 'workhorseDiesel', 'ram', 'plates', 'plates', 'rack'], placed: [] };
    let w = waitForRoad(newWorld(3, sturdy, highwayMap(3, 0), defaultSetup('furyRoad')));
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
  return waitForRoad(arrive(w));
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
    expect(runOf(after).outposts.map((o) => [o.milestone, o.paid])).toEqual([[0, true], [1, true]]);
    expect(runOf(after).groups).toEqual([]);
    expect(betweenLevels(after)).toBe(true);
    expect(canWaitForRoad(after)).toBe(true);
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

  it('opens the next window on a wait at the paid pad, with the player on the same pad and ground', () => {
    const w = arrive(furyRoadWorld());
    const before = playerVehicle(w).pos;
    const ground = w.terrain.types[Math.floor(before.y) * w.size + Math.floor(before.x)];
    w.player.explored[95 * w.size + 5] = 1;

    const after = waitForRoad(w);
    const me = playerVehicle(after);
    const shift = windowShift(w.seed, 0);
    const shifted = (95 + shift.y) * after.size + 5 + shift.x;

    expect(runOf(after).window).toBe(1);
    expect(after.mapHash).toBe(highwayHash(w.seed, 1));
    expect(after.events).toEqual([{ t: 'roadOpened', stretch: 2 }]);
    expect(me.pos).toEqual({ x: before.x + shift.x, y: before.y + shift.y });
    expect(after.terrain.types[Math.floor(me.pos.y) * after.size + Math.floor(me.pos.x)]).toBe(ground);
    expect(heightAt(after.terrain, me.pos.x, me.pos.y)).toBeCloseTo(heightAt(w.terrain, before.x, before.y), 9);
    expect(after.player.explored[shifted]).toBe(1);
    expect(after.player.explored[5 * after.size + 5]).toBe(0);
    expect(runOf(after).outposts.map((o) => [o.milestone, o.paid])).toEqual([[1, true], [2, false]]);
    expect(runOf(after).groups.every((g) => g.stretch === 2)).toBe(true);
    expect(runOf(after).groups.length).toBeGreaterThan(0);
    expect(runOf(after).groups.every((g) => !g.spawned && g.at > milestoneAt(w.seed, 1) && g.at < milestoneAt(w.seed, 2))).toBe(true);
    expect(after.vehicles.every((v) => v.pos.x > 0 && v.pos.y > 0 && v.pos.x < after.size && v.pos.y < after.size)).toBe(true);
    expect(betweenLevels(after)).toBe(false);
    expect(reachedOutpostAt(after)?.id).toBe('outpost-1');
  });

  it('keeps both trucks on the same pad and ground through several window moves on any stretch length', () => {
    for (const seed of [2, 5, 9]) {
      let w = furyRoadWorld(seed);
      for (let move = 0; move < 3; move++) {
        const arrived = arrive(w);
        const trucks = [haulerOf(arrived), playerVehicle(arrived)];
        const before = trucks.map((t) => ({ pos: { ...t.pos }, ground: heightAt(arrived.terrain, t.pos.x, t.pos.y) }));
        const shift = windowShift(seed, runOf(arrived).window);
        w = waitForRoad(arrived);
        [haulerOf(w), playerVehicle(w)].forEach((truck, i) => {
          const label = `seed ${seed} move ${move} truck ${i}`;
          expect(truck.pos, label).toEqual({ x: before[i].pos.x + shift.x, y: before[i].pos.y + shift.y });
          expect(onOutpostPad(w, truck.pos, runOf(w).window), label).toBe(true);
          expect(heightAt(w.terrain, truck.pos.x, truck.pos.y), label).toBeCloseTo(before[i].ground, 9);
        });
      }
    }
  });

  it('spawns nothing between levels, even off the pad, and pays nothing more', () => {
    const w = arrive(furyRoadWorld());
    const money = w.player.money;
    moveTo(w, milestoneAt(w.seed, 1) + 20);
    for (let t = 0; t < 200; t++) {
      w.turn++;
      advanceFuryRoad(w);
    }
    playerVehicle(w).pos = outpostPad(w, 1);
    advanceFuryRoad(w);

    expect(w.vehicles.map((v) => v.id)).toEqual([w.player.vehicleId, haulerOf(w).id]);
    expect(w.player.money).toBe(money);
    expect(runOf(w).window).toBe(0);
  });

  it('waits for the road only on the paid pad of the next outpost', () => {
    const early = furyRoadWorld();
    parkOnNext(early);
    expect(canWaitForRoad(early)).toBe(false);
    expect(() => waitForRoad(early)).toThrow(/wait/);

    const off = arrive(furyRoadWorld());
    moveTo(off, milestoneAt(off.seed, 1) + 20);
    expect(canWaitForRoad(off)).toBe(false);
    expect(() => waitForRoad(off)).toThrow(/wait/);

    const opened = nextLevel(furyRoadWorld());
    expect(canWaitForRoad(opened)).toBe(false);
    expect(() => waitForRoad(opened)).toThrow(/wait/);
  });

  it('completes on reaching the pad at speed, but not off the pad', () => {
    const moving = furyRoadWorld();
    parkOnNext(moving);
    haulerOf(moving).speed = 8;
    const off = furyRoadWorld();
    moveTo(off, milestoneAt(off.seed, 1) - 20);

    for (const w of [moving, off]) advanceFuryRoad(w);

    expect([moving, off].map((w) => runOf(w).outposts[1].paid)).toEqual([true, false]);
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
    const passing = structuredClone(w);
    moveTo(passing, milestoneAt(passing.seed, 1) - 10);

    const after = arrive(w);
    const passed = endTurn(passing, still);

    expect(after.vehicles.map((v) => v.id)).toEqual([after.player.vehicleId, haulerOf(after).id]);
    expect(passed.vehicles.some((v) => group.vehicles.includes(v.id))).toBe(true);
    const practiced = (x: World) => x.events.flatMap((e) => (e.t === 'practice' ? [`${e.source}:${e.target}`] : []));
    expect(practiced(passed)).toEqual(expect.arrayContaining(practiced(after)));
    expect(after.player.xp).toBeLessThanOrEqual(passed.player.xp);
  });

  it('refuses to move the window before the outpost is paid or with the player off the pad', () => {
    const early = furyRoadWorld();
    parkOnNext(early);
    expect(() => moveWindow(early)).toThrow(/waits at outpost 1/);

    const off = arrive(furyRoadWorld());
    moveTo(off, milestoneAt(off.seed, 1) + 20);
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
    expect(runOf(w).groups.map((g) => g.templates.length)).toEqual(directStretch(w, 31).map((wave) => wave.size));
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
    moveTo(w, milestoneAt(w.seed, 1) - 50);

    const readout = furyRoadReadout(w)!;

    expect(readout).toMatchObject({ stretch: 1, outpostId: 'outpost-1' });
    expect(readout.toOutpost).toBeCloseTo(50, 0);
  });

  it('reads the next stretch at its full length between levels', () => {
    const w = arrive(furyRoadWorld());

    expect(furyRoadReadout(w)).toEqual({ stretch: 2, toOutpost: stretchLength(w.seed, 2), outpostId: 'outpost-2' });
  });
});

describe('a Fury Road world on the highway', () => {
  it('shows no Icarus place in three hundred turns of the run', () => {
    let w = furyRoadWorld(5);
    const ids = w.obstacles.map((o) => o.id);
    for (let i = 0; i < 300 && w.player.state === 'active'; i++) {
      const me = playerVehicle(w);
      if (me.order === null) me.order = { kind: 'stopAt', dest: outpostPad(w, runOf(w).window + 1) };
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

  it('keeps driving at a moving player through a halt whim, which only parks a roaming truck', () => {
    const w = furyRoadWorld();
    const group = spawnFirst(w);
    const npc = w.vehicles.find((v) => v.id === group.vehicles[0])!;
    const me = playerVehicle(w);
    const at = roadSpot(w, me);
    npc.pos = roadPoint(w.seed, runOf(w).window, at.along + 8, at.across);
    me.speed = 4;
    haulerOf(w).speed = 4;
    planNpcOrders(w);
    npc.brain!.whim = { kind: 'halt', until: w.turn + 99, angle: 0 };

    planNpcOrders(w);

    expect(topGoal(npc)?.kind).toBe('fight');
    expect(npc.order?.kind).not.toBe('brake');
  });
});

describe('the gear money of a stretch', () => {
  const withGrowth = (growth: number): World => {
    const w = furyRoadWorld();
    return { ...w, setup: { ...w.setup, settings: { ...w.setup.settings, enemyGearGrowth: growth } } };
  };
  const partsValue = (v: Vehicle): number =>
    v.items.reduce((sum, item) => (item.kind === 'part' && PARTS[item.part.defId].kind !== 'core' ? sum + PARTS[item.part.defId].value : sum), 0);

  it('caps what each spawned truck spends on parts at the money of its group', () => {
    const w = nextLevel(withGrowth(0));
    const g = spawnFirst(w);

    expect(g.stretch).toBe(2);
    expect(g.money).toBeGreaterThan(0);
    for (const v of trucksOf(w, g)) expect(partsValue(v)).toBeLessThanOrEqual(g.money);
  });
});
