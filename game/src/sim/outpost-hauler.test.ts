import { describe, expect, it } from 'vitest';
import { partDef } from '../data/parts';
import { haulerOf, playerVehicle } from './damage';
import { atGarage } from './garage';
import { getResources } from './resources';
import { baseGrid, gridOf, isMounted, mountedParts, placementError } from './grid';
import { installSpot, moveItem, storePart, takeFromStorage } from './inventory';
import { outpostBuyPart, outpostBuySupply, outpostRepairAll, outpostRepairBasics } from './outposts';
import { fuelCap } from './stats';
import { parkedAtOutpost, stockOfKind } from './testkit';
import { makePart } from './factory';
import type { PartInstance } from './types';
import { Refused } from './world';

function stockOf(w: ReturnType<typeof parkedAtOutpost>, kind: 'armor' | 'weapon' | 'engine' | 'cargo'): PartInstance {
  return stockOfKind(w, kind);
}

describe('refitting the hauler at an outpost', () => {
  it('is a garage for the hauler only while the hauler is parked on the pad', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    expect(atGarage(w, hauler.id)).toBe(true);

    hauler.pos = { x: 20, y: 20 };
    expect(atGarage(w, hauler.id)).toBe(false);
    expect(() => outpostRepairAll(w, hauler.id)).toThrow(/Not parked/);
    expect(() => storePart(w, mountedParts(hauler, 'armor').length ? hauler.items.find((it) => it.kind === 'part' && it.part.defId === 'plates')!.id : 'x', hauler.id)).toThrow(/Not parked/);
  });

  it('throws for a truck the player does not own', () => {
    const w = parkedAtOutpost();
    const other = w.vehicles.find((v) => v.id !== w.player.vehicleId && v.id !== haulerOf(w).id);
    const stranger = other ? other.id : 'v999';
    expect(() => outpostRepairBasics(w, stranger)).toThrow(/does not own/);
    expect(() => outpostBuySupply(w, 'fuel', 1, stranger)).toThrow(/does not own/);
    expect(() => outpostBuyPart(w, 'p1', stranger)).toThrow(/does not own/);
  });

  it('buys fuel into the hauler tank and the money from the shared wallet', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    getResources(w, hauler).fuel = fuelCap(hauler) - 10;
    const me = w.player.fuel;
    const money = w.player.money;

    const after = outpostBuySupply(w, 'fuel', 10, hauler.id);

    expect(getResources(after, haulerOf(after)).fuel).toBeCloseTo(fuelCap(hauler));
    expect(after.player.fuel).toBe(me);
    expect(after.player.money).toBeLessThan(money);
  });

  it('repairs the hauler parts from the shared wallet', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    const part = mountedParts(hauler, 'core')[0];
    part.hp = 1;
    const money = w.player.money;

    const after = outpostRepairAll(w, hauler.id);

    expect(mountedParts(haulerOf(after), 'core')[0].hp).toBeGreaterThan(1);
    expect(after.player.money).toBeLessThan(money);
  });

  it('buys armor, engines and cargo frames onto the hauler and refuses a gun', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    const armor = stockOf(w, 'armor');
    const bought = outpostBuyPart(w, armor.id, hauler.id);
    const items = haulerOf(bought).items.filter((it) => it.kind === 'part' && it.part.id === armor.id);
    expect(items.length + bought.player.storage.filter((p) => p.id === armor.id).length).toBe(1);
    expect(items.length).toBe(1);

    const gun = stockOf(w, 'weapon');
    expect(() => outpostBuyPart(w, gun.id, hauler.id)).toThrow(Refused);
  });

  it('gives the semi grid no deck cell, so no weapon part mounts on it', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    expect(baseGrid(hauler.chassisId).cells.flat()).not.toContain('D');
    const gun = makePart(w, 'mg', 0);
    expect(installSpot(hauler, { id: 'probe', x: 0, y: 0, rot: 0, kind: 'part', part: gun })).toBeNull();
  });

  it('keeps a gun stowed in a cargo bay out of the mounted parts', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    const gun = makePart(w, 'mg', 0);
    w.player.storage.push(gun);
    const grid = gridOf(hauler);
    const bays = grid.cells.flatMap((row, y) => row.flatMap((c, x) => (c === 'C' ? [{ x, y, rot: 0 as const }] : [])));
    const free = bays.find((spot) => placementError(grid, hauler.items, { id: 'probe', kind: 'part', part: gun, ...spot }, null) === null)!;
    const after = takeFromStorage(w, gun.id, free, hauler.id);
    const placed = haulerOf(after).items.find((it) => it.kind === 'part' && it.part.id === gun.id)!;
    expect(isMounted(hauler.chassisId, placed)).toBe(false);
    expect(mountedParts(haulerOf(after), 'weapon')).toEqual([]);
    expect(partDef(gun.defId).kind).toBe('weapon');
  });

  it('moves an armor plate on the hauler grid at once, and does not touch the player truck', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    const armor = stockOf(w, 'armor');
    const bought = outpostBuyPart(w, armor.id, hauler.id);
    const placed = haulerOf(bought).items.find((it) => it.kind === 'part' && it.part.id === armor.id)!;
    const playerItems = playerVehicle(bought).items.length;
    const spot = placed.kind === 'part' ? installSpot(haulerOf(bought), placed) : null;
    if (spot) expect(haulerOf(moveItem(bought, placed.id, spot, hauler.id)).job).toBeNull();
    expect(playerVehicle(bought).items.length).toBe(playerItems);
  });
});
