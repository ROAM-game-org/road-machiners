import { describe, expect, it } from 'vitest';
import { assignAutoOrders } from './combat';
import { haulerOf, isPlayerTruck, playerVehicle } from './damage';
import { alongOf, toRoad } from './highway';
import { repairContent } from './save-repair';
import { spawnGroup, waveOf } from './chaos-highway';
import { vehicleStats } from './stats';
import { chaosHighwayWorld } from './testkit';
import type { Vehicle, World } from './types';
import { setWeaponOrder } from './world';

function groupTruckBeside(w: World): Vehicle {
  const run = w.chaosHighway!;
  const group = { ...run.groups[0], stretch: 1, from: 'ahead' as const, templates: ['buggy'], level: waveOf(1).level };
  run.groups = [group];
  spawnGroup(w, run, group, alongOf(w.seed, toRoad(w.seed, 0, haulerOf(w).pos)));
  const truck = w.vehicles.find((v) => v.id === group.vehicles[0])!;
  const me = playerVehicle(w);
  truck.pos = { x: me.pos.x + 4, y: me.pos.y - 6 };
  truck.speed = 0;
  return truck;
}

function firstGun(w: World): string {
  return vehicleStats(w, playerVehicle(w)).weapons[0].part.id;
}

describe('the player and their own trucks', () => {
  it('owns the gun truck and the hauler, not a group truck', () => {
    const w = chaosHighwayWorld();
    const truck = groupTruckBeside(w);
    expect(isPlayerTruck(w, playerVehicle(w))).toBe(true);
    expect(isPlayerTruck(w, haulerOf(w))).toBe(true);
    expect(isPlayerTruck(w, truck)).toBe(false);
  });

  it('refuses a gun order on the hauler and accepts one on a group truck', () => {
    const w = chaosHighwayWorld();
    const truck = groupTruckBeside(w);
    expect(() => setWeaponOrder(w, firstGun(w), { targetId: haulerOf(w).id, aim: 'body' })).toThrow(/Bad target/);
    const next = setWeaponOrder(w, firstGun(w), { targetId: truck.id, aim: 'body' });
    expect(playerVehicle(next).weaponOrders[firstGun(w)].targetId).toBe(truck.id);
  });

  it('never picks the hauler for auto fire', () => {
    const w = chaosHighwayWorld();
    const hauler = haulerOf(w);
    const me = playerVehicle(w);
    me.pos = { x: hauler.pos.x + 3, y: hauler.pos.y };
    w.player.autoFire = true;
    assignAutoOrders(w);
    expect(Object.values(me.weaponOrders).filter((o) => o.targetId === hauler.id)).toEqual([]);
  });

  it('loads a save with a gun aimed at the hauler without that order', () => {
    const w = chaosHighwayWorld();
    const truck = groupTruckBeside(w);
    const me = playerVehicle(w);
    const guns = vehicleStats(w, me).weapons.map((mw) => mw.part.id);
    me.weaponOrders[guns[0]] = { targetId: haulerOf(w).id, aim: 'body' };
    me.weaponOrders[guns[1] ?? 'other'] = { targetId: truck.id, aim: 'body' };
    repairContent(w);
    expect(Object.values(me.weaponOrders).map((o) => o.targetId)).toEqual([truck.id]);
  });
});

describe('Roaming', () => {
  it('owns only the gun truck, so every stranger stays aimable', async () => {
    const { emptyWorld, addVehicle } = await import('./testkit');
    const w = emptyWorld();
    const stranger = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 33, y: 30 }, 0);
    expect(isPlayerTruck(w, playerVehicle(w))).toBe(true);
    expect(isPlayerTruck(w, stranger)).toBe(false);
  });
});
