import { describe, expect, it } from 'vitest';
import { CHAOS_HIGHWAY, HIGHWAY } from '../data/modes';
import { assignAutoOrders, inCombat, noteCollision } from './combat';
import { damagePart } from './damage';
import { haulerOf, playerTrucks, playerVehicle } from './damage';
import { isDefeated } from './defeat';
import { advanceChaosHighway, betweenLevels, canAbandonRun, canDriveOn, driveOn, haulerWedged, moveWindow, spawnGroup, turnedOnPlayer, waveOf } from './chaos-highway';
import { inYard, yardSpots } from './outpost-gates';
import { chassisDef } from '../data/chassis';
import { alongOf, milestoneAt, roadPoint, toRoad } from './highway';
import { topGoal } from './npc-activities';
import { corePart, mountedParts } from './grid';
import { maxHp } from './wear';
import { chaosHighwayWorld } from './testkit';
import type { Vehicle, World } from './types';
import { endTurn, hostileToPlayer } from './world';
import { dist } from './vec';

const still = () => {};
const LANES = HIGHWAY.road.lanes;

function onPad(w: World, truck: Vehicle): boolean {
  return inYard(w, truck.pos, w.chaosHighway!.window + 1);
}

function park(w: World, truck: Vehicle, spot: 'hauler' | 'truck' | 'away'): void {
  const spots = yardSpots(w, w.chaosHighway!.window + 1);
  const at = spot === 'away' ? { x: spots.truck.x, y: spots.truck.y + 40 } : spots[spot];
  truck.pos = { ...at };
  truck.speed = 0;
  truck.order = null;
}

function spawnOne(w: World, template = 'buggy'): Vehicle {
  const run = w.chaosHighway!;
  const group = { ...run.groups[0], stretch: 1, from: 'ahead' as const, templates: [template], level: waveOf(1).level };
  run.groups = [group];
  spawnGroup(w, run, group, alongOf(w.seed, toRoad(w.seed, 0, haulerOf(w).pos)));
  return w.vehicles.find((v) => v.id === group.vehicles[0])!;
}

function nearBoth(w: World, truck: Vehicle): void {
  const hauler = haulerOf(w);
  const me = playerVehicle(w);
  me.pos = { x: hauler.pos.x + 3, y: hauler.pos.y };
  truck.pos = { x: hauler.pos.x + 2, y: hauler.pos.y - 6 };
  truck.speed = 0;
}

describe('winning a stretch', () => {
  it('needs both trucks in the yard, and keeps the groups on the road while only one is there', () => {
    const alone = chaosHighwayWorld();
    park(alone, playerVehicle(alone), 'truck');
    advanceChaosHighway(alone);
    expect(alone.chaosHighway!.outposts[1].paid).toBe(false);

    const hauled = chaosHighwayWorld();
    const truck = spawnOne(hauled);
    park(hauled, haulerOf(hauled), 'hauler');
    advanceChaosHighway(hauled);
    expect(hauled.chaosHighway!.outposts[1].paid).toBe(false);
    expect(hauled.vehicles.some((v) => v.id === truck.id)).toBe(true);

    park(hauled, playerVehicle(hauled), 'truck');
    advanceChaosHighway(hauled);
    expect(hauled.chaosHighway!.outposts[1].paid).toBe(true);
    expect(betweenLevels(hauled)).toBe(true);
    expect(hauled.vehicles.some((v) => v.id === truck.id)).toBe(false);
  });

  it('seats the parked semi and the player truck in the yard together on three seeds', () => {
    for (const seed of [1, 2, 3]) {
      const w = chaosHighwayWorld(seed);
      park(w, haulerOf(w), 'hauler');
      park(w, playerVehicle(w), 'truck');
      expect(playerTrucks(w).every((t) => onPad(w, t)), `seed ${seed}`).toBe(true);
    }
  });
});

describe('who a group truck shoots', () => {
  it('fires at the gun truck in its sights and hunts it before the hauler', () => {
    const w = chaosHighwayWorld();
    const truck = spawnOne(w);
    nearBoth(w, truck);
    const hauler = haulerOf(w);
    const me = playerVehicle(w);
    me.pos = { x: (truck.pos.x + hauler.pos.x) / 2, y: (truck.pos.y + hauler.pos.y) / 2 };
    assignAutoOrders(w);
    const targets = Object.values(truck.weaponOrders).map((o) => o.targetId);
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(new Set([me.id]));
    expect(hostileToPlayer(w, truck)).toBe(true);
    advanceChaosHighway(w);
    expect(topGoal(truck)).toMatchObject({ kind: 'fight', targetId: me.id });
  });

  it('fires at the hauler when it is the nearer player truck', () => {
    const w = chaosHighwayWorld();
    const truck = spawnOne(w);
    nearBoth(w, truck);
    const me = playerVehicle(w);
    const hauler = haulerOf(w);
    truck.pos = { x: hauler.pos.x + 2, y: hauler.pos.y - 6 };
    me.pos = { x: hauler.pos.x + 2, y: hauler.pos.y + 14 };
    assignAutoOrders(w);
    const targets = Object.values(truck.weaponOrders).map((o) => o.targetId);
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(new Set([hauler.id]));
  });

  it('a shot at the gun truck puts it in combat while it never fired', () => {
    const w = chaosHighwayWorld();
    const truck = spawnOne(w);
    nearBoth(w, truck);
    const me = playerVehicle(w);
    const hauler = haulerOf(w);
    me.pos = { x: (truck.pos.x + hauler.pos.x) / 2, y: (truck.pos.y + hauler.pos.y) / 2 };
    w.player.autoFire = false;
    expect(inCombat(w, me)).toBe(false);
    let now = w;
    for (let i = 0; i < 6 && !inCombat(now, playerVehicle(now)); i++) now = endTurn(now, still);
    expect(inCombat(now, playerVehicle(now))).toBe(true);
    expect(now.events.some((e) => e.t === 'shot' && e.shooter === playerVehicle(now).id)).toBe(false);
  });

  it('turns on the player once the player shoots it, then goes back to the hauler when the player leaves its sight', () => {
    const w = chaosHighwayWorld();
    const truck = spawnOne(w);
    nearBoth(w, truck);
    const me = playerVehicle(w);
    noteCollision(w, me, truck, [], [{ part: corePart(truck, 'cab').id, damage: 3 }]);

    expect(turnedOnPlayer(w, truck)).toBe(true);
    advanceChaosHighway(w);
    expect(topGoal(truck)).toMatchObject({ kind: 'fight', targetId: me.id });
    assignAutoOrders(w);
    expect(Object.values(truck.weaponOrders).some((o) => o.targetId === me.id)).toBe(true);

    me.pos = roadPoint(w.seed, 0, alongOf(w.seed, toRoad(w.seed, 0, me.pos)) - 400, LANES[2]);
    delete truck.brain!.attackers[me.id];
    advanceChaosHighway(w);
    expect(topGoal(truck)).toMatchObject({ kind: 'fight', targetId: haulerOf(w).id });
  });

  it('forgets the player in its attackers when the player is out of its sight', () => {
    const w = chaosHighwayWorld();
    const truck = spawnOne(w);
    nearBoth(w, truck);
    truck.brain!.attackers[w.player.vehicleId] = false;
    playerVehicle(w).pos = roadPoint(w.seed, 0, milestoneAt(w.seed, 0) - 30, LANES[2]);
    const after = endTurn(w, still);
    const same = after.vehicles.find((v) => v.id === truck.id)!;
    expect(same).toBeDefined();
    expect(turnedOnPlayer(after, same)).toBe(false);
  });
});

describe('losing the run', () => {
  it('ends the run with haulerLost when the hauler cab breaks, and never lays the hauler down', () => {
    const w = chaosHighwayWorld();
    const hauler = haulerOf(w);
    corePart(hauler, 'cab').hp = 0;

    const after = endTurn(w, still);

    expect(after.player.state).toBe('dead');
    expect(after.events).toContainEqual({ t: 'runLost', stretch: 1, cause: 'haulerLost' });
    expect(isDefeated(haulerOf(after))).toBe(false);
  });

  it('keeps the run going while the hauler cab holds, however hurt its other parts are', () => {
    const w = chaosHighwayWorld();
    const cab = corePart(haulerOf(w), 'cab');
    for (const part of mountedParts(haulerOf(w)).filter((p) => p.id !== cab.id)) part.hp = Math.min(part.hp, 1);
    expect(cab.hp).toBe(maxHp(cab));
    const after = endTurn(w, still);
    expect(after.player.state).toBe('active');
    expect(after.events.some((e) => e.t === 'runLost')).toBe(false);
  });

  it('ends the run with wrecked when the player truck is beaten, as before', () => {
    const w = chaosHighwayWorld();
    corePart(playerVehicle(w), 'cab').hp = 0;
    const after = endTurn(w, still);
    expect(after.events).toContainEqual({ t: 'runLost', stretch: 1, cause: 'wrecked' });
  });

  it('never knocks the hauler out to wake it again, whatever the driver health', () => {
    const w = chaosHighwayWorld();
    const hauler = haulerOf(w);
    hauler.resources!.health = 0;
    const after = endTurn(w, still);
    expect(isDefeated(haulerOf(after))).toBe(false);
    expect(after.player.state).toBe('active');
  });

  it('hurts the hauler driver, not the player, when its cab takes damage', () => {
    const w = chaosHighwayWorld();
    const hauler = haulerOf(w);
    const before = { player: w.player.health, driver: hauler.resources!.health };
    damagePart(w, hauler, corePart(hauler, 'cab'), 40);
    expect(w.player.health).toBe(before.player);
    expect(hauler.resources!.health).toBeLessThan(before.driver);
  });

  it('lets a stranded hauler end the run', () => {
    const w = chaosHighwayWorld();
    expect(canAbandonRun(w)).toBe(false);
    haulerOf(w).resources!.fuel = 0;
    expect(canAbandonRun(w)).toBe(true);
  });

  it('lets a stopped hauler with a prop inside its radius end the run, and not one with the prop just outside or still moving', () => {
    const w = chaosHighwayWorld();
    const hauler = haulerOf(w);
    const radius = chassisDef(hauler.chassisId).radius;
    const trap = { id: 'trap-test', kind: 'landmark', look: 'tankTrap', pos: { x: hauler.pos.x + radius + 0.1, y: hauler.pos.y }, r: 0.25 } as World['obstacles'][number];
    w.obstacles = [...w.obstacles, trap];
    hauler.speed = 0;
    expect(haulerWedged(w)).toBe(false);
    expect(canAbandonRun(w)).toBe(false);
    trap.pos = { x: hauler.pos.x + radius / 2, y: hauler.pos.y };
    expect(haulerWedged(w)).toBe(true);
    expect(canAbandonRun(w)).toBe(true);
    hauler.speed = 3;
    expect(canAbandonRun(w)).toBe(false);
  });

  it('never counts a hauler parked on the next pad or between levels as wedged, walls or not', () => {
    const w = chaosHighwayWorld();
    const hauler = haulerOf(w);
    const radius = chassisDef(hauler.chassisId).radius;
    hauler.speed = 0;
    w.obstacles = [...w.obstacles, { id: 'trap-test', kind: 'landmark', look: 'tankTrap', pos: { x: hauler.pos.x + radius / 2, y: hauler.pos.y }, r: 0.25 } as World['obstacles'][number]];
    w.chaosHighway!.waitingAt = 0;
    expect(betweenLevels(w)).toBe(true);
    expect(haulerWedged(w)).toBe(false);
    w.chaosHighway!.waitingAt = null;
    expect(haulerWedged(w)).toBe(true);
    hauler.pos = { ...yardSpots(w, 1).hauler };
    w.obstacles = [...w.obstacles, { id: 'wall-test', kind: 'landmark', look: 'tankTrap', pos: { x: hauler.pos.x + radius / 2, y: hauler.pos.y }, r: 0.25 } as World['obstacles'][number]];
    expect(haulerWedged(w)).toBe(false);
  });
});

describe('where the trouble spawns', () => {
  it('measures from the hauler, so a player far ahead leaves it alone with the groups', () => {
    const w = chaosHighwayWorld();
    const hauler = haulerOf(w);
    const me = playerVehicle(w);
    me.pos = roadPoint(w.seed, 0, milestoneAt(w.seed, 0) + 180, LANES[2]);
    w.chaosHighway!.groups[0].at = 0;
    advanceChaosHighway(w);

    const group = w.chaosHighway!.groups[0];
    expect(group.spawned).toBe(true);
    const spawned = w.vehicles.filter((v) => group.vehicles.includes(v.id));
    const alongHauler = alongOf(w.seed, toRoad(w.seed, 0, hauler.pos));
    for (const v of spawned) expect(Math.abs(alongOf(w.seed, toRoad(w.seed, 0, v.pos)) - alongHauler)).toBeLessThan(CHAOS_HIGHWAY.sides.ahead + 40);
    expect(dist(spawned[0].pos, me.pos)).toBeGreaterThan(100);
  });

  it('holds a group until the hauler reaches its place, however far ahead the player is', () => {
    const w = chaosHighwayWorld();
    const me = playerVehicle(w);
    const group = w.chaosHighway!.groups[0];
    me.pos = roadPoint(w.seed, 0, group.at + 50, LANES[2]);
    advanceChaosHighway(w);
    expect(group.spawned).toBe(false);

    group.at = alongOf(w.seed, toRoad(w.seed, 0, haulerOf(w).pos));
    advanceChaosHighway(w);
    expect(group.spawned).toBe(true);
  });

  it('holds a group while the live trucks plus the group would pass the cap', () => {
    const w = chaosHighwayWorld();
    const run = w.chaosHighway!;
    const size = CHAOS_HIGHWAY.maxAlive;
    run.groups[0].templates = Array.from({ length: size }, () => 'buggy');
    run.groups[0].at = 0;
    run.groups[1].at = 0;
    advanceChaosHighway(w);
    expect(run.groups[0].spawned).toBe(true);
    advanceChaosHighway(w);
    expect(run.groups[1].spawned).toBe(false);
  });
});

describe('driving on from the outpost', () => {
  it('needs both trucks parked in the yard of the paid outpost, and the window move keeps both', () => {
    const w = chaosHighwayWorld();
    park(w, haulerOf(w), 'hauler');
    park(w, playerVehicle(w), 'truck');
    let after = endTurn(w, still);
    expect(canDriveOn(after)).toBe(true);

    park(after, playerVehicle(after), 'away');
    expect(canDriveOn(after)).toBe(false);
    expect(() => driveOn(after)).toThrow(/Drive on/);

    park(after, playerVehicle(after), 'truck');
    after = driveOn(after);
    expect(after.chaosHighway!.window).toBe(1);
    expect(after.vehicles.map((v) => v.id)).toEqual([after.player.vehicleId, haulerOf(after).id]);
    expect(playerTrucks(after).every((t) => t.order === null && t.trail.length === 0)).toBe(true);
    expect(dist(haulerOf(after).pos, playerVehicle(after).pos)).toBeLessThan(10);
    expect(() => moveWindow(after)).toThrow(/waits at outpost 2/);
  });

  it('refuses to drive on while the hauler is outside the yard', () => {
    const w = chaosHighwayWorld();
    park(w, haulerOf(w), 'hauler');
    park(w, playerVehicle(w), 'truck');
    const after = endTurn(w, still);
    haulerOf(after).pos = roadPoint(after.seed, 1, milestoneAt(after.seed, 1) + 30, LANES[1]);
    expect(canDriveOn(after)).toBe(false);
  });
});
