import { describe, expect, it } from 'vitest';
import { standardWorld } from '../test/world-cache';
import { ownExplored } from './explored';
import { cloneWorld, endTurn, update } from './world';
import { refreshVision } from './vision';

describe('explored tiles across turns', () => {
  it('leaves the earlier world untouched when a turn explores a tile', () => {
    const before = standardWorld(1);
    const tile = before.player.explored.indexOf(0);
    const after = update(before, (w) => {
      ownExplored(w.player)[tile] = 1;
    });
    expect(after.player.explored[tile]).toBe(1);
    expect(before.player.explored[tile]).toBe(0);
  });

  it('keeps a turn that explores nothing from copying the tiles', () => {
    const before = standardWorld(1);
    const after = update(before, () => undefined);
    expect(after.player.explored).toBe(before.player.explored);
    const again = update(after, (w) => {
      refreshVision(w);
    });
    expect(again.player.explored.length).toBe(before.player.explored.length);
  });

  it('keeps a played turn from reaching the tiles of the world before it', () => {
    const before = standardWorld(1);
    const tiles = before.player.explored.slice();
    const after = endTurn(before, () => undefined);
    expect(before.player.explored).toEqual(tiles);
    if (after.player.explored.some((t, i) => t !== tiles[i])) expect(after.player.explored).not.toBe(before.player.explored);
    else expect(after.player.explored).toBe(before.player.explored);
  });

  it('gives a plain clone its own tiles', () => {
    const before = standardWorld(1);
    const copy = cloneWorld(before);
    const tile = before.player.explored.indexOf(0);
    copy.player.explored[tile] = 1;
    expect(before.player.explored[tile]).toBe(0);
  });

  it('keeps a cheat that explores everything from reaching earlier worlds', () => {
    const before = standardWorld(1);
    const after = update(before, (w) => {
      ownExplored(w.player).fill(1);
    });
    expect(after.player.explored.every((t) => t === 1)).toBe(true);
    expect(before.player.explored.every((t) => t === 1)).toBe(false);
  });
});
