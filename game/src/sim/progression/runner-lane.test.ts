import { describe, expect, it } from 'vitest';
import { HIGHWAY } from '../../data/modes';
import { haulerOf } from '../damage';
import { acrossOf, alongOf, roadPoint, toRoad } from '../highway';
import { chaosHighwayWorld } from '../testkit';
import { laneAwayFromHauler } from './runner';

describe('sprinter lane choice', () => {
  const lanes = HIGHWAY.road.lanes;

  function haulerIn(lane: number) {
    const w = chaosHighwayWorld(3);
    const hauler = haulerOf(w);
    const along = alongOf(w.seed, toRoad(w.seed, 0, hauler.pos));
    hauler.pos = roadPoint(w.seed, 0, along, lane);
    return w;
  }

  it('picks the lane farthest from the hauler, so the gun truck clears its width', () => {
    for (const lane of lanes) {
      const w = haulerIn(lane);
      const pick = laneAwayFromHauler(w, 0);
      const hauler = acrossOf(w.seed, toRoad(w.seed, 0, haulerOf(w).pos));
      for (const other of lanes) expect(Math.abs(pick - hauler)).toBeGreaterThanOrEqual(Math.abs(other - hauler));
    }
  });

  it('puts the gun truck on the far side of the road from a hauler in an inner lane', () => {
    expect(laneAwayFromHauler(haulerIn(lanes[1]), 0)).toBe(lanes[3]);
    expect(laneAwayFromHauler(haulerIn(lanes[2]), 0)).toBe(lanes[0]);
  });
});
