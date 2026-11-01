import { describe, expect, it } from 'vitest';
import { partDef, type ShieldDef } from '../data/parts';
import { RULES } from '../data/rules';
import { planLane, ramMult } from './armor';
import { makePart } from './factory';
import { freeCells, gridOf, isMounted, layerOf, mountedItems, placementError } from './grid';
import { installSpot, planItemMove } from './inventory';
import { addVehicle, emptyWorld } from './testkit';
import type { GridItem, Rot, Vehicle, World } from './types';

const RAM_MULT = (partDef('ram') as ShieldDef).ramMult;

function part(w: World, defId: string, x: number, y: number, rot: Rot = 0): GridItem {
  return { id: `i-${defId}-${x}-${y}`, x, y, rot, kind: 'part', part: makePart(w, defId, 0) };
}

function platedNose(): { w: World; v: Vehicle } {
  const w = emptyWorld();
  const v = addVehicle(w, 'scrapjaw', 'scout', [], { x: 40, y: 40 });
  for (let x = 1; x <= 4; x++) v.items.push(part(w, 'steelPlate', x, 0));
  return { w, v };
}

function withRam(w: World, v: Vehicle, x = 2): GridItem {
  const ram = part(w, 'ram', x, 0);
  v.items.push(ram);
  return ram;
}

describe('accessory layer', () => {
  it('lets a ram sit on the nose over a full row of plates', () => {
    const { w, v } = platedNose();
    const ram = part(w, 'ram', 2, 0);
    expect(placementError(gridOf(v), v.items, ram, null)).toBeNull();
    v.items.push(ram);
    expect(isMounted(v.chassisId, ram)).toBe(true);
    expect(layerOf(gridOf(v), ram)).toBe('accessory');
    expect(mountedItems(v, 'armor')).toHaveLength(4);
  });

  it('keeps two accessories off the same cell', () => {
    const { w, v } = platedNose();
    withRam(w, v, 1);
    expect(placementError(gridOf(v), v.items, part(w, 'ram', 2, 0), null)).toEqual({ id: 'inTheWay' });
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

  it('moves a ram along the nose without swapping out the plates under it', () => {
    const { w, v } = platedNose();
    const ram = withRam(w, v, 1);
    const plan = planItemMove(v, ram.id, { x: 2, y: 0, rot: 0 });
    expect(plan.error).toBeNull();
  });

  it('installs a ram in the middle of the nose', () => {
    const { w, v } = platedNose();
    const ram = part(w, 'ram', 0, 0);
    expect(installSpot(v, ram as Extract<GridItem, { kind: 'part' }>)).toEqual({ x: 1, y: 0, rot: 0 });
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
    const { w, v } = platedNose();
    withRam(w, v, 2);
    expect(ramMult(v, { side: 'front', lanes: [3] })).toBe(RAM_MULT);
    expect(ramMult(v, { side: 'front', lanes: [1] })).toBe(1);
    expect(ramMult(v, { side: 'front', lanes: [1, 2] })).toBe(RAM_MULT);
  });

  it('ignores a broken ram', () => {
    const { w, v } = platedNose();
    const ram = withRam(w, v, 2) as Extract<GridItem, { kind: 'part' }>;
    ram.part.hp = 0;
    expect(ramMult(v, { side: 'front', lanes: [3] })).toBe(1);
  });
});
