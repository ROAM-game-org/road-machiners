import { describe, expect, it } from 'vitest';
import { idleGoal } from './npc-activities';
import { addVehicle, emptyWorld, forceOption, npcBrain } from './testkit';
import type { Vehicle, World } from './types';

function trader(money: number): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  w.salvage = [];
  const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 40, y: 30 });
  npc.brain = npcBrain('convoy', npc.pos, ['supplier'], 'kind');
  if (!npc.resources) throw new Error('The trader has no resources');
  npc.resources.money = money;
  return { w, npc };
}

describe('an idle driver with nothing to do', () => {
  it('goes exploring when it has no money left, so it does not stand idle until the watchdog gives up on it', () => {
    const { w, npc } = trader(0);
    forceOption('idle', 'wait');
    expect(idleGoal(w, npc).kind).toBe('explore');
  });

  it('waits when it still has money', () => {
    const { w, npc } = trader(10_000);
    forceOption('idle', 'wait');
    expect(idleGoal(w, npc)).toMatchObject({ kind: 'wait', reason: 'nothingToDo' });
  });
});
