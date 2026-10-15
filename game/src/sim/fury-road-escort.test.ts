import { describe, expect, it } from 'vitest';
import { FURY_ROAD, HIGHWAY } from '../data/modes';
import { assignAutoOrders, noteCollision } from './combat';
import { damagePart } from './damage';
import { haulerOf, playerTrucks, playerVehicle } from './damage';
import { isDefeated } from './defeat';
import { advanceFuryRoad, betweenLevels, canAbandonRun, canDriveOn, driveOn, moveWindow, spawnGroup, turnedOnPlayer, waveOf } from './fury-road';
import { inYard, yardSpots } from './outpost-gates';
import { alongOf, milestoneAt, roadPoint, toRoad } from './highway';
import { topGoal } from './npc-activities';
import { corePart } from './grid';
import { furyRoadWorld } from './testkit';
import type { Vehicle, World } from './types';
import { endTurn, hostileToPlayer } from './world';
import { dist } from './vec';

const still = () => {};
const LANES = HIGHWAY.road.lanes;

function onPad(w: World, truck: Vehicle): boolean {
  return inYard(w, truck.pos, w.furyRoad!.window + 1);
}

function park(w: World, truck: Vehicle, spot: 'hauler' | 'truck' | 'away'): void {
  const spots = yardSpots(w, w.furyRoad!.window + 1);
  const at = spot === 'away' ? { x: spots.truck.x, y: spots.truck.y + 40 } : spots[spot];
  truck.pos = { ...at };
  truck.speed = 0;
  truck.order = null;
}

function spawnOne(w: World, template = 'buggy'): Vehicle {
  const run = w.furyRoad!;
  const group = { ...run.groups[0], stretch: 1, from: 'ahead' as const, templates: [template], level: waveOf(1).level };
  run.groups = [group];
  spawnGroup(w, run, group, alongOf(w.seed, toRoad(0, haulerOf(w).pos)));
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
  it('needs the hauler in the yard, and the player alone does not win', () => {
    const alone = furyRoadWorld();
    park(alone, playerVehicle(alone), 'truck');
    advanceFuryRoad(alone);
    expect(alone.furyRoad!.outposts[0].paid).toBe(false);

    const hauled = furyRoadWorld();
    park(hauled, haulerOf(hauled), 'hauler');
    advanceFuryRoad(hauled);
    expect(hauled.furyRoad!.outposts[0].paid).toBe(true);
    expect(betweenLevels(hauled)).toBe(true);
  });

  it('seats the parked semi and the player truck in the yard together on three seeds', () => {
    for (const seed of [1, 2, 3]) {
      const w = furyRoadWorld(seed);
      park(w, haulerOf(w), 'hauler');
      park(w, playerVehicle(w), 'truck');
      expect(playerTrucks(w).every((t) => onPad(w, t)), `seed ${seed}`).toBe(true);
    }
  });
});

describe('who a group truck shoots', () => {
  it('fires only at the hauler while the player leaves it alone', () => {
    const w = furyRoadWorld();
    const truck = spawnOne(w);
    nearBoth(w, truck);
    assignAutoOrders(w);

    const targets = Object.values(truck.weaponOrders).map((o) => o.targetId);
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(new Set([haulerOf(w).id]));
    expect(hostileToPlayer(w, truck)).toBe(true);
    expect(turnedOnPlayer(w, truck)).toBe(false);
  });

  it('turns on the player once the player shoots it, then goes back to the hauler when the player leaves its sight', () => {
    const w = furyRoadWorld();
    const truck = spawnOne(w);
    nearBoth(w, truck);
    const me = playerVehicle(w);
    noteCollision(w, me, truck, [], [{ part: corePart(truck, 'cab').id, damage: 3 }]);

    expect(turnedOnPlayer(w, truck)).toBe(true);
    advanceFuryRoad(w);
    expect(topGoal(truck)).toMatchObject({ kind: 'fight', targetId: me.id });
    assignAutoOrders(w);
    expect(Object.values(truck.weaponOrders).some((o) => o.targetId === me.id)).toBe(true);

    me.pos = roadPoint(w.seed, 0, alongOf(w.seed, toRoad(0, me.pos)) - 400, LANES[2]);
    delete truck.brain!.attackers[me.id];
    advanceFuryRoad(w);
    expect(topGoal(truck)).toMatchObject({ kind: 'fight', targetId: haulerOf(w).id });
  });

  it('forgets the player in its attackers when the player is out of its sight', () => {
    const w = furyRoadWorld();
    const truck = spawnOne(w);
    nearBoth(w, truck);
    truck.brain!.attackers[w.player.vehicleId] = false;
    playerVehicle(w).pos = roadPoint(w.seed, 0, milestoneAt(0) - 30, LANES[2]);
    const after = endTurn(w, still);
    const same = after.vehicles.find((v) => v.id === truck.id)!;
    expect(same).toBeDefined();
    expect(turnedOnPlayer(after, same)).toBe(false);
  });
});

describe('losing the run', () => {
  it('ends the run with haulerLost when the hauler cab breaks, and never lays the hauler down', () => {
    const w = furyRoadWorld();
    const hauler = haulerOf(w);
    corePart(hauler, 'cab').hp = 0;

    const after = endTurn(w, still);

    expect(after.player.state).toBe('dead');
    expect(after.events).toContainEqual({ t: 'runLost', stretch: 1, cause: 'haulerLost' });
    expect(isDefeated(haulerOf(after))).toBe(false);
  });

  it('ends the run with wrecked when the player truck is beaten, as before', () => {
    const w = furyRoadWorld();
    corePart(playerVehicle(w), 'cab').hp = 0;
    const after = endTurn(w, still);
    expect(after.events).toContainEqual({ t: 'runLost', stretch: 1, cause: 'wrecked' });
  });

  it('never knocks the hauler out to wake it again, whatever the driver health', () => {
    const w = furyRoadWorld();
    const hauler = haulerOf(w);
    hauler.resources!.health = 0;
    const after = endTurn(w, still);
    expect(isDefeated(haulerOf(after))).toBe(false);
    expect(after.player.state).toBe('active');
  });

  it('hurts the hauler driver, not the player, when its cab takes damage', () => {
    const w = furyRoadWorld();
    const hauler = haulerOf(w);
    const before = { player: w.player.health, driver: hauler.resources!.health };
    damagePart(w, hauler, corePart(hauler, 'cab'), 40);
    expect(w.player.health).toBe(before.player);
    expect(hauler.resources!.health).toBeLessThan(before.driver);
  });

  it('lets a stranded hauler end the run', () => {
    const w = furyRoadWorld();
    expect(canAbandonRun(w)).toBe(false);
    haulerOf(w).resources!.fuel = 0;
    expect(canAbandonRun(w)).toBe(true);
  });
});

describe('where the trouble spawns', () => {
  it('measures from the hauler, so a player far ahead leaves it alone with the groups', () => {
    const w = furyRoadWorld();
    const hauler = haulerOf(w);
    const me = playerVehicle(w);
    me.pos = roadPoint(w.seed, 0, milestoneAt(0) + 150, LANES[2]);
    w.turn = w.furyRoad!.quietFrom + FURY_ROAD.pacing.quiet;
    advanceFuryRoad(w);

    const group = w.furyRoad!.groups[0];
    expect(group.spawned).toBe(true);
    const spawned = w.vehicles.filter((v) => group.vehicles.includes(v.id));
    const alongHauler = alongOf(w.seed, toRoad(0, hauler.pos));
    for (const v of spawned) expect(Math.abs(alongOf(w.seed, toRoad(0, v.pos)) - alongHauler)).toBeLessThan(FURY_ROAD.sides.ahead + 40);
    expect(dist(spawned[0].pos, me.pos)).toBeGreaterThan(100);
  });

  it('counts an encounter only near the hauler', () => {
    const w = furyRoadWorld();
    const truck = spawnOne(w);
    const me = playerVehicle(w);
    me.pos = { x: truck.pos.x + 2, y: truck.pos.y };
    haulerOf(w).pos = { x: truck.pos.x, y: truck.pos.y + FURY_ROAD.pacing.near + 20 };
    w.furyRoad!.quietFrom = w.turn - FURY_ROAD.pacing.quiet - 5;
    advanceFuryRoad(w);
    expect(w.furyRoad!.quietFrom).toBe(w.turn - FURY_ROAD.pacing.quiet - 5);
  });
});

describe('driving on from the outpost', () => {
  it('needs both trucks parked in the yard of the paid outpost, and the window move keeps both', () => {
    const w = furyRoadWorld();
    park(w, haulerOf(w), 'hauler');
    park(w, playerVehicle(w), 'truck');
    let after = endTurn(w, still);
    expect(canDriveOn(after)).toBe(true);

    park(after, playerVehicle(after), 'away');
    expect(canDriveOn(after)).toBe(false);
    expect(() => driveOn(after)).toThrow(/Drive on/);

    park(after, playerVehicle(after), 'truck');
    after = driveOn(after);
    expect(after.furyRoad!.window).toBe(1);
    expect(after.vehicles.map((v) => v.id)).toEqual([after.player.vehicleId, haulerOf(after).id]);
    expect(playerTrucks(after).every((t) => t.order === null && t.trail.length === 0)).toBe(true);
    expect(dist(haulerOf(after).pos, playerVehicle(after).pos)).toBeLessThan(10);
    expect(() => moveWindow(after)).toThrow(/paid/);
  });

  it('refuses to drive on while the hauler is outside the yard', () => {
    const w = furyRoadWorld();
    park(w, haulerOf(w), 'hauler');
    park(w, playerVehicle(w), 'truck');
    const after = endTurn(w, still);
    haulerOf(after).pos = roadPoint(after.seed, 1, milestoneAt(1) + 30, LANES[1]);
    expect(canDriveOn(after)).toBe(false);
  });
});
