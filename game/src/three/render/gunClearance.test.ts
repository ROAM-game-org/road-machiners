import { describe, expect, it } from 'vitest';
import { bare, clips, fill, lineWithArmor, place, SLOW } from '../../test/gun-clearance-kit';
import { CHASSIS } from '../../data/chassis';
import { baseGrid, mountSpots, MOUNT_CELLS } from '../../sim/grid';
import type { GridItem } from '../../sim/types';

describe('gun heads clear what they sweep over', () => {
  it.each(Object.keys(CHASSIS))('%s: a gun on a deck spot among tall goods', (id) => {
    const problems: string[] = [];
    for (const gunId of ['mg', 'amRifle']) {
      for (const rot of [0, 1] as const) {
        const { world, v } = bare(id);
        const g = baseGrid(id);
        const probe = { id: 'probe', kind: 'part', x: 0, y: 0, rot, part: { id: 'probe', defId: gunId, hp: 1, wear: 0 } } as GridItem;
        const spots = mountSpots(g, v.items, probe, MOUNT_CELLS.weapon).filter((s) => s.rot === rot);
        const step = Math.max(1, Math.floor(spots.length / 4));
        for (let i = 0; i < spots.length; i += step) {
          const t = bare(id);
          if (!place(t.world, t.v, gunId, null, spots[i].x, spots[i].y, rot)) continue;
          fill(t.world, t.v);
          problems.push(...clips(t.world, t.v));
        }
        void world;
      }
    }
    expect(problems).toEqual([]);
  }, SLOW);

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

  it('the scout pickup layout of the player screenshot', () => {
    const { world, v } = bare('scout');
    const g = baseGrid('scout');
    const deck: [number, number][] = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.cells[y][x] === 'D') deck.push([x, y]);
    const mgs = [deck[0], deck[Math.floor(deck.length / 2)], deck[deck.length - 1]];
    for (const [x, y] of mgs) place(world, v, 'mg', null, x, y, 0);
    place(world, v, 'panniers', null, 0, 0, 0);
    fill(world, v);
    expect(clips(world, v)).toEqual([]);
  });

  it('the gunwagon layout of the committee screenshot', () => {
    const { world, v } = bare('wagon');
    const g = baseGrid('wagon');
    const deck: [number, number][] = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.cells[y][x] === 'D') deck.push([x, y]);
    for (const i of [0, Math.floor(deck.length / 3), Math.floor((2 * deck.length) / 3), deck.length - 1]) place(world, v, 'mg', null, deck[i][0], deck[i][1], 0);
    fill(world, v);
    expect(clips(world, v)).toEqual([]);
  });
});
