import { afterEach, describe, expect, it } from 'vitest';
import { laneCount, planLane } from './armor';
import { setLoadoutMemo } from './loadout-memo';
import { mountedParts } from './grid';
import { addVehicle, emptyWorld } from './testkit';
import type { Vehicle } from './types';

afterEach(() => setLoadoutMemo(true));

const ROUND = { damage: 40, pen: 6, blast: false, armorShare: 1 };

function truck(): Vehicle {
  return addVehicle(emptyWorld({ x: 80, y: 80 }), 'scrapjaw', 'hauler', ['mg', 'stockEngine', 'plowRam', 'cannon'], { x: 40, y: 40 }, 0);
}

function plans(v: Vehicle): [string, number][][] {
  return (['front', 'left'] as const).flatMap((side) =>
    Array.from({ length: laneCount(v, side) }, (_, lane) => planLane(v, side, lane, ROUND).map((hit): [string, number] => [hit.part.id, hit.amount])),
  );
}

describe('cell owners follow the loadout', () => {
  const changes: Record<string, (v: Vehicle) => void> = {
    moved: (v) => { Object.assign(v.items.find((it) => it.kind === 'part' && it.part.defId === 'mg')!, { x: 3, y: 1 }); },
    rotated: (v) => { const it = v.items.find((i) => i.kind === 'part' && i.part.defId === 'cannon')!; it.rot = it.rot === 1 ? 0 : 1; },
    removed: (v) => { v.items.splice(v.items.findIndex((it) => it.kind === 'part' && it.part.defId === 'plowRam'), 1); },
    damaged: (v) => { for (const part of mountedParts(v)) part.hp = Math.ceil(part.hp / 3); },
  };

  for (const [name, change] of Object.entries(changes)) {
    it(`a warm truck plans like a cold one after a part is ${name}`, () => {
      const v = truck();
      plans(v);
      change(v);
      const warm = plans(v);
      setLoadoutMemo(false);
      expect(warm).toEqual(plans(v));
    });
  }

  it('a repeat read plans the same lanes', () => {
    const v = truck();
    expect(plans(v)).toEqual(plans(v));
  });
});
