import { describe, expect, it } from 'vitest';
import { PARTS } from '../data/parts';
import { makePart, makeVehicle } from './factory';
import { gridOf, isMounted, layoutError, mountCellsOf, mountSpots, placementError } from './grid';
import { mountPart } from './inventory';
import { isMovable, repackWith } from './repack';
import { emptyWorld } from './testkit';
import type { GridItem, Vehicle, World } from './types';

type PartItem = Extract<GridItem, { kind: 'part' }>;

function bare(w: World, chassisId: string): Vehicle {
  return makeVehicle(w, { faction: 'independent', chassisId, parts: [], spares: [], cargo: {}, pos: { x: 0, y: 0 }, heading: 0, brain: null });
}

function loose(w: World, defId: string): PartItem {
  return { id: `new-${defId}`, x: 0, y: 0, rot: 0, kind: 'part', part: makePart(w, defId, 0) };
}

function legal(v: Vehicle): void {
  expect(layoutError(gridOf(v), v.items)).toBeNull();
  for (const item of v.items) expect(placementError(gridOf(v), v.items, item, item.id)).toBeNull();
  for (const item of v.items.filter((it) => it.kind === 'part' && isMovable(v, it))) expect(isMounted(v.chassisId, item)).toBe(true);
}

const UTILITY = Object.values(PARTS).find((d) => d.kind === 'utility' && mountCellsOf(d.id).includes('D'))!.id;

describe('repackWith', () => {
  it('moves a utility that blocks the only gun spot', () => {
    const w = emptyWorld();
    const blocked = Object.keys(PARTS).filter((id) => PARTS[id].kind === 'weapon').flatMap((gun) => {
      const v = bare(w, 'courier');
      return mountSpots(gridOf(v), v.items, loose(w, UTILITY), mountCellsOf(UTILITY)).flatMap((spot) => {
        const withUtility = { ...v, items: [...v.items, { ...loose(w, UTILITY), id: 'utility', ...spot }] };
        const gunSpots = mountSpots(gridOf(withUtility), withUtility.items, loose(w, gun), mountCellsOf(gun));
        return gunSpots.length === 0 ? [{ v: withUtility, gun }] : [];
      });
    });
    expect(blocked.length).toBeGreaterThan(0);
    const solved = blocked.map((b) => repackWith(b.v, loose(w, b.gun), () => true, new Map())).filter((v): v is Vehicle => v !== null);
    expect(solved.length).toBeGreaterThan(0);
    for (const v of solved) {
      expect(v.items.map((it) => it.id)).toContain('utility');
      legal(v);
    }
  });

  it('returns null when the deck has no room left', () => {
    const w = emptyWorld();
    const v = bare(w, 'niva');
    while (mountPart(w, v, makePart(w, 'mg', 0)));
    expect(repackWith(v, loose(w, 'mg'), () => true, new Map())).toBeNull();
  });

  it('keeps every item and every cell legal', () => {
    const w = emptyWorld();
    for (const chassisId of ['niva', 'hauler', 'wagon']) {
      const v = bare(w, chassisId);
      mountPart(w, v, makePart(w, UTILITY, 0));
      while (mountPart(w, v, makePart(w, 'mg', 0)));
      const before = v.items.map((it) => it.id);
      const after = repackWith({ ...v, items: v.items.slice(0, -1) }, loose(w, 'mg'), () => true, new Map());
      expect(after).not.toBeNull();
      expect(after!.items.map((it) => it.id).sort()).toEqual([...before.slice(0, -1), 'new-mg'].sort());
      legal(after!);
    }
  });

  it('honors the accept test', () => {
    const w = emptyWorld();
    const v = bare(w, 'hauler');
    mountPart(w, v, makePart(w, UTILITY, 0));
    expect(repackWith(v, loose(w, 'mg'), () => false, new Map())).toBeNull();
  });
});
