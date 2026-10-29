import { describe, expect, it } from 'vitest';
import { bare, clips, fill, place } from '../../test/gun-clearance-kit';
import { baseGrid } from '../../sim/grid';

describe('gun heads clear what they sweep over', () => {
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
