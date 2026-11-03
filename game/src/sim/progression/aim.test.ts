import { describe, expect, it } from 'vitest';
import type { Vehicle, World } from '../types';
import { makePart } from '../factory';
import { mountPart } from '../inventory';
import { addVehicle, emptyWorld } from '../testkit';
import { isSoftTarget } from './aim';

function duel(foeParts: string[]) {
  const w = emptyWorld({ x: 30, y: 30 });
  const foe = addVehicle(w, 'scrapjaw', 'buggy', foeParts, { x: 50, y: 30 });
  foe.heading = Math.PI;
  return { w, foe };
}

function platedFully(foe: Vehicle, w: World): void {
  while (mountPart(w, foe, makePart(w, 'plates', 0)));
}

describe('isSoftTarget', () => {
  it('takes an unarmored foe and leaves one that stops most of the round', () => {
    const bare = duel(['mg', 'stockEngine']);
    const plated = duel(['mg', 'stockEngine']);
    platedFully(plated.foe, plated.w);

    expect(isSoftTarget(bare.w, bare.foe)).toBe(true);
    expect(isSoftTarget(plated.w, plated.foe)).toBe(false);
  });
});
