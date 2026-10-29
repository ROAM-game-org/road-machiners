import { describe, expect, it } from 'vitest';
import { bare, clips, fill, lineWithArmor, place, SLOW } from '../../test/gun-clearance-kit';
import { CHASSIS } from '../../data/chassis';
import { baseGrid, mountSpots, MOUNT_CELLS } from '../../sim/grid';
import type { GridItem } from '../../sim/types';

describe('gun heads clear what they sweep over with armor on', () => {
  it.each(Object.keys(CHASSIS))('%s: a gun on a deck spot among tall goods and armor on every ring cell', (id) => {
    const problems: string[] = [];
    for (const gunId of ['mg', 'amRifle']) {
      for (const rot of [0, 1] as const) {
        const probe = { id: 'probe', kind: 'part', x: 0, y: 0, rot, part: { id: 'probe', defId: gunId, hp: 1, wear: 0 } } as GridItem;
        const spots = mountSpots(baseGrid(id), bare(id).v.items, probe, MOUNT_CELLS.weapon).filter((s) => s.rot === rot);
        const step = Math.max(1, Math.floor(spots.length / 4));
        for (let i = 0; i < spots.length; i += step) {
          const t = bare(id);
          if (!place(t.world, t.v, gunId, null, spots[i].x, spots[i].y, rot)) continue;
          lineWithArmor(t.world, t.v, 'steelPlate');
          fill(t.world, t.v);
          problems.push(...clips(t.world, t.v));
        }
      }
    }
    expect(problems).toEqual([]);
  }, SLOW);
});
