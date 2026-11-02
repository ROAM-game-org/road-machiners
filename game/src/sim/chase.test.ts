import { describe, expect, it } from 'vitest';
import { NPC_BEHAVIOR } from '../data/npc-behavior';
import { chaseStalled, startChase } from './chase';
import { createActivity } from './npc-activities';
import { addVehicle, emptyWorld } from './testkit';
import type { NpcActivity, Vehicle, World } from './types';

function chaserAt(gap: number): { w: World; chaser: Vehicle; goal: NpcActivity } {
  const w = emptyWorld({ x: 100, y: 100 });
  const chaser = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], { x: 100 - gap, y: 100 });
  const goal = { ...createActivity('investigate', 'prey', { x: 100, y: 100 }, 'heardHostile'), chase: startChase(w, chaser, { x: 100, y: 100 }) };
  return { w, chaser, goal };
}

const spot = { x: 100, y: 100 };

describe('chase progress', () => {
  it('records the turn and the gap to the spot when the chase starts', () => {
    const { w, goal } = chaserAt(30);
    expect(goal.chase).toEqual({ turn: w.turn, gap: 30 });
  });

  it('stalls once the gap has not shrunk for more than the stall turns', () => {
    const { w, chaser, goal } = chaserAt(30);
    w.turn += NPC_BEHAVIOR.chaseStallTurns;
    expect(chaseStalled(w, chaser, goal, spot, 0)).toBe(false);
    w.turn++;
    expect(chaseStalled(w, chaser, goal, spot, 0)).toBe(true);
  });

  it('renews the record when the gap shrinks by the gain', () => {
    const { w, chaser, goal } = chaserAt(30);
    w.turn += NPC_BEHAVIOR.chaseStallTurns + 1;
    chaser.pos = { x: 100 - 30 + NPC_BEHAVIOR.chaseGainTiles, y: 100 };
    expect(chaseStalled(w, chaser, goal, spot, 0)).toBe(false);
    expect(goal.chase).toEqual({ turn: w.turn, gap: 30 - NPC_BEHAVIOR.chaseGainTiles });
  });

  it('keeps the record on a gain smaller than the gain tiles', () => {
    const { w, chaser, goal } = chaserAt(30);
    w.turn += NPC_BEHAVIOR.chaseStallTurns + 1;
    chaser.pos = { x: 100 - 30 + NPC_BEHAVIOR.chaseGainTiles / 2, y: 100 };
    expect(chaseStalled(w, chaser, goal, spot, 0)).toBe(true);
  });

  it('renews the record while the driver is close enough', () => {
    const { w, chaser, goal } = chaserAt(8);
    w.turn += NPC_BEHAVIOR.chaseStallTurns + 1;
    expect(chaseStalled(w, chaser, goal, spot, 10)).toBe(false);
  });

  it('throws on a chase goal with no record', () => {
    const { w, chaser } = chaserAt(30);
    const bare = createActivity('sizeUp', 'prey', spot, 'sizingUp');
    expect(() => chaseStalled(w, chaser, bare, spot, 0)).toThrow(/no chase record/);
  });
});
