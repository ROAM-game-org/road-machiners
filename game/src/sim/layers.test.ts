import { describe, expect, it } from 'vitest';
import { partDef, type ShieldDef } from '../data/parts';
import { RULES } from '../data/rules';
import { planLane, ramMult } from './armor';
import { makePart } from './factory';
import { cellCount, freeCells, gridOf, isMounted, itemCells, layerOf, mountedItems, mountSpots, placementError } from './grid';
import { installSpot, planItemMove } from './inventory';
import { addVehicle, emptyWorld } from './testkit';
import type { GridItem, Rot, Vehicle, World } from './types';

const RAM_MULT = (partDef('ram') as ShieldDef).ramMult;

function part(w: World, defId: string, x: number, y: number, rot: Rot = 0): GridItem {
  return { id: `i-${defId}-${x}-${y}`, x, y, rot, kind: 'part', part: makePart(w, defId, 0) };
}

function platedNose(chassis = 'scout', width = 4): { w: World; v: Vehicle } {
  const w = emptyWorld();
  const v = addVehicle(w, 'scrapjaw', chassis, [], { x: 40, y: 40 });
  for (let x = 1; x <= width; x++) v.items.push(part(w, 'steelPlate', x, 0));
  return { w, v };
}

function withRam(w: World, v: Vehicle, x = 1): GridItem {
  const ram = part(w, 'ram', x, 0);
  v.items.push(ram);
  return ram;
}

function coreAt(v: Vehicle, role: string): GridItem {
  const found = v.items.find((it) => it.kind === 'part' && (partDef(it.part.defId) as { role?: string }).role === role);
  if (!found) throw new Error(`${v.chassisId} has no ${role}`);
  return found;
}

describe('below-deck layer', () => {
  it('puts wheels below deck and keeps the cab and drawn tank on the base layer', () => {
    const w = emptyWorld();
    const scout = addVehicle(w, 'scrapjaw', 'scout', [], { x: 40, y: 40 });
    const g = gridOf(scout);
    expect(layerOf(g, coreAt(scout, 'wheel'))).toBe('below');
    expect(layerOf(g, coreAt(scout, 'cab'))).toBe('base');
    expect(layerOf(g, coreAt(scout, 'tank'))).toBe('base');
  });

  it('puts a hidden tank and transmission below deck', () => {
    const w = emptyWorld();
    const hauler = addVehicle(w, 'scrapjaw', 'hauler', [], { x: 40, y: 40 });
    const g = gridOf(hauler);
    expect(layerOf(g, coreAt(hauler, 'tank'))).toBe('below');
    expect(layerOf(g, coreAt(hauler, 'transmission'))).toBe('below');
  });

  it('keeps every below part mounted', () => {
    const w = emptyWorld();
    const hauler = addVehicle(w, 'scrapjaw', 'hauler', [], { x: 40, y: 40 });
    expect(isMounted('hauler', coreAt(hauler, 'wheel'))).toBe(true);
  });

  it('counts a loose wheel away from its spot on the base layer, unmounted', () => {
    const w = emptyWorld();
    const hauler = addVehicle(w, 'scrapjaw', 'hauler', [], { x: 40, y: 40 });
    const loose = part(w, 'wheel', 2, 1);
    expect(layerOf(gridOf(hauler), loose)).toBe('base');
    expect(isMounted('hauler', loose)).toBe(false);
  });

  it('takes no crate room for below parts', () => {
    const w = emptyWorld();
    const hauler = addVehicle(w, 'scrapjaw', 'hauler', [], { x: 40, y: 40 });
    const g = gridOf(hauler);
    const base = hauler.items.filter((it) => layerOf(g, it) === 'base');
    const baseCells = base.flatMap((it) => itemCells(it)).length;
    expect(freeCells(hauler)).toBe(cellCount(g) - baseCells);
  });

  it('lets a good lie over a wheel and refuses a second part below on one cell', () => {
    const w = emptyWorld();
    const hauler = addVehicle(w, 'scrapjaw', 'hauler', [], { x: 40, y: 40 });
    const wheel = coreAt(hauler, 'wheel');
    const good: GridItem = { id: 'crate', x: wheel.x, y: wheel.y, rot: 0, kind: 'good', good: 'scrap' };
    expect(placementError(gridOf(hauler), hauler.items, good, null)).toBeNull();
    const again: GridItem = { ...wheel, id: 'other-wheel' };
    expect(placementError(gridOf(hauler), hauler.items, again, null)).toEqual({ id: 'inTheWay' });
  });

  it('seats the buggy engine below deck in its bay', () => {
    const w = emptyWorld();
    const buggy = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], { x: 40, y: 40 });
    const engine = mountedItems(buggy, 'engine')[0];
    expect(layerOf(gridOf(buggy), engine)).toBe('below');
    expect(sameCells(itemCells(engine), { x: 2, y: 2, w: 2, h: 3 })).toBe(true);
  });

  it('keeps two engines out of one hidden bay', () => {
    const w = emptyWorld();
    const buggy = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], { x: 40, y: 40 });
    const engine = mountedItems(buggy, 'engine')[0];
    const second = { ...engine, id: 'second-engine', part: makePart(w, 'stockEngine', 0) };
    expect(mountSpots(gridOf(buggy), buggy.items, second, ['E'])).toEqual([]);
  });
});

function sameCells(cells: { x: number; y: number }[], bay: { x: number; y: number; w: number; h: number }): boolean {
  return cells.every((c) => c.x >= bay.x && c.x < bay.x + bay.w && c.y >= bay.y && c.y < bay.y + bay.h);
}

describe('accessory layer', () => {
  it('lets a ram sit on the nose over a full row of plates', () => {
    const { w, v } = platedNose();
    const ram = part(w, 'ram', 1, 0);
    expect(placementError(gridOf(v), v.items, ram, null)).toBeNull();
    v.items.push(ram);
    expect(isMounted(v.chassisId, ram)).toBe(true);
    expect(layerOf(gridOf(v), ram)).toBe('accessory');
    expect(mountedItems(v, 'armor')).toHaveLength(4);
  });

  it('keeps two accessories off the same cell', () => {
    const { w, v } = platedNose();
    withRam(w, v);
    expect(placementError(gridOf(v), v.items, part(w, 'ram', 1, 0), null)).toEqual({ id: 'inTheWay' });
  });

  it('keeps two plates off the same cell', () => {
    const { w, v } = platedNose();
    expect(placementError(gridOf(v), v.items, part(w, 'scrapSheet', 3, 0), null)).toEqual({ id: 'inTheWay' });
  });

  it('keeps rams off the side edges, where they would lie on the base layer', () => {
    const { w, v } = platedNose();
    const onSide = part(w, 'ram', 0, 1, 1);
    expect(layerOf(gridOf(v), onSide)).toBe('base');
    expect(placementError(gridOf(v), v.items, onSide, null)).toEqual({ id: 'armorOnly' });
  });

  it('takes no cargo room for a ram over the plates', () => {
    const { w, v } = platedNose();
    const before = freeCells(v);
    withRam(w, v);
    expect(freeCells(v)).toBe(before);
  });

  it('moves a ram along a wider nose without swapping out the plates under it', () => {
    const { w, v } = platedNose('van', 5);
    const ram = withRam(w, v, 1);
    const plan = planItemMove(v, ram.id, { x: 2, y: 0, rot: 0 });
    expect(plan.error).toBeNull();
  });

  it('installs a ram over the whole four-cell nose', () => {
    const { w, v } = platedNose();
    const ram = part(w, 'ram', 0, 0) as Extract<GridItem, { kind: 'part' }>;
    expect(installSpot(v, ram)).toEqual({ x: 1, y: 0, rot: 0 });
    v.items.push({ ...ram, ...installSpot(v, ram)! });
    const covered = gridOf(v).cells[0].map((c, x) => (c === 'F' ? x : -1)).filter((x) => x >= 0);
    expect(covered).toEqual([1, 2, 3, 4]);
  });
});

describe('lanes through two layers', () => {
  it('meets the ram before the plate under it and charges the cell once', () => {
    const { w, v } = platedNose();
    const ram = withRam(w, v);
    const plate = v.items.find((it) => it.x === 3 && it.y === 0 && it !== ram)!;
    const pen = RULES.cellPen + partDef('ram').armor + RULES.cellPen / 2;
    const hits = planLane(v, 'front', 3, { damage: 50, pen, blast: false, armorShare: 1 });
    expect(hits.map((h) => h.part.id)).toEqual([(ram as Extract<GridItem, { kind: 'part' }>).part.id, (plate as Extract<GridItem, { kind: 'part' }>).part.id]);
  });
});

describe('ram multiplier by lane', () => {
  it('counts a ram only where the crash touches its lanes', () => {
    const { w, v } = platedNose('van', 5);
    withRam(w, v);
    expect(ramMult(v, { side: 'front', lanes: [3] })).toBe(RAM_MULT);
    expect(ramMult(v, { side: 'front', lanes: [5] })).toBe(1);
    expect(ramMult(v, { side: 'front', lanes: [4, 5] })).toBe(RAM_MULT);
  });

  it('ignores a broken ram', () => {
    const { w, v } = platedNose();
    const ram = withRam(w, v) as Extract<GridItem, { kind: 'part' }>;
    ram.part.hp = 0;
    expect(ramMult(v, { side: 'front', lanes: [3] })).toBe(1);
  });
});
