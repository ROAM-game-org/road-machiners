import { describe, expect, it } from 'vitest';
import { idleGoal } from './npc-activities';
import { addVehicle, emptyWorld, npcBrain } from './testkit';

describe('a supplier with no trade it can afford', () => {
  it('mostly goes exploring instead of standing idle until the watchdog gives up on it', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.salvage = [];
    const npc = addVehicle(w, 'independent', 'longbed', ['stockEngine'], { x: 40, y: 30 });
    npc.brain = npcBrain('convoy', npc.pos, ['supplier'], 'kind');
    if (!npc.resources) throw new Error('The supplier has no resources');
    npc.resources.money = 0;
    const kinds = Array.from({ length: 40 }, () => idleGoal(w, npc).kind);
    expect(kinds.filter((k) => k === 'explore').length).toBeGreaterThan(kinds.length / 2);
  });
});
