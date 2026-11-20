import { describe, expect, it } from 'vitest';
import { PARTS } from '../data/parts';
import { haulerOf, playerVehicle } from './damage';
import { atGarage } from './garage';
import { getResources } from './resources';
import { baseGrid, gridOf, mountedParts, placementError } from './grid';
import { installSpot, moveItem, storePart, takeFromStorage } from './inventory';
import { outpostBuyPart, outpostBuySupply, outpostRepairAll, outpostRepairBasics } from './outposts';
import { fuelCap } from './stats';
import { parkedAtOutpost, stockOfKind } from './testkit';
import { makePart } from './factory';
import type { PartInstance } from './types';

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

  it('buys every kind of part into storage for the hauler and leaves the hauler as it was', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    for (const kind of ['armor', 'weapon', 'engine', 'cargo'] as const) {
      const part = stockOf(w, kind);
      const bought = outpostBuyPart(w, part.id, hauler.id);
      expect(bought.player.storage.filter((p) => p.id === part.id)).toHaveLength(1);
      expect(haulerOf(bought).items).toEqual(hauler.items);
    }
  });

  it('gives the semi deck cells on the hood, the cab and the trailer and none under the trailer front', () => {
    const w = parkedAtOutpost();
    const grid = baseGrid(haulerOf(w).chassisId);
    const deckRows = grid.cells.flatMap((row, y) => (row.includes('D') ? [y] : []));
    expect(deckRows).toEqual(expect.arrayContaining([1, 8, 20, 40]));
    for (let y = 13; y <= 17; y++) expect(grid.cells[y].slice(1, -1).every((c) => c === null)).toBe(true);
  });

  it('takes a stored gun onto any free deck spot of the hauler', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    const gun = makePart(w, 'mg', 0);
    w.player.storage.push(gun);
    const grid = gridOf(hauler);
    const decks = grid.cells.flatMap((row, y) => row.flatMap((c, x) => (c === 'D' ? [{ x, y, rot: 0 as const }] : [])));
    const free = decks.filter((spot) => placementError(grid, hauler.items, { id: 'probe', kind: 'part', part: gun, ...spot }, null) === null);
    expect(free.some((spot) => spot.y < 13)).toBe(true);
    expect(free.some((spot) => spot.y > 18)).toBe(true);

    const placed = takeFromStorage(w, gun.id, free[0], hauler.id);

    expect(placed.player.storage.map((p) => p.id)).not.toContain(gun.id);
    expect(mountedParts(haulerOf(placed), 'weapon').map((p) => p.id)).toContain(gun.id);
  });

  it('takes a stored scanner or utility part onto the hauler the same way', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    for (const kind of ['scanner', 'utility'] as const) {
      const defId = Object.keys(PARTS).find((id) => PARTS[id].kind === kind)!;
      const part = makePart(w, defId, 0);
      w.player.storage.push(part);
      const spot = installSpot(hauler, { id: 'probe', x: 0, y: 0, rot: 0, kind: 'part', part });
      expect(spot).not.toBeNull();
      const placed = takeFromStorage(w, part.id, spot!, hauler.id);
      expect(mountedParts(haulerOf(placed), kind).map((p) => p.id)).toContain(part.id);
    }
  });

  it('moves a bought armor plate from storage onto the hauler grid at once, and does not touch the player truck', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    const armor = stockOf(w, 'armor');
    const bought = outpostBuyPart(w, armor.id, hauler.id);
    const playerItems = playerVehicle(bought).items.length;
    const spot = installSpot(haulerOf(bought), { id: 'probe', kind: 'part', part: armor, x: 0, y: 0, rot: 0 });
    expect(spot).not.toBeNull();
    const placed = takeFromStorage(bought, armor.id, spot!, hauler.id);
    expect(haulerOf(placed).job).toBeNull();
    expect(haulerOf(placed).items.some((it) => it.kind === 'part' && it.part.id === armor.id)).toBe(true);
    expect(playerVehicle(placed).items.length).toBe(playerItems);
  });
});
