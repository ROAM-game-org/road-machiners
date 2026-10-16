import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { planNpcOrders } from './ai';
import { topGoal } from './npc-activities';
import { addVehicle, emptyWorld, forceOption, npcBrain } from './testkit';
import { refreshVision } from './vision';

describe('a goal left stale under an interruption', () => {
  it('is dropped in the same think when the interruption ends, before it gives an order', () => {
    const w = emptyWorld({ x: 120, y: 120 });
    const raider = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 40, y: 40 });
    raider.brain = npcBrain('buggy', raider.pos, NPCS.buggy.traits);
    const lawman = addVehicle(w, 'bowl', 'scout', ['mg', 'stockEngine'], { x: 48, y: 40 });
    lawman.brain = npcBrain('bowlFarmer', lawman.pos, NPCS.bowlFarmer.traits);
    raider.brain.goals = [
      { kind: 'sell', targetId: 'kiln', destination: { x: 300, y: 300 }, phase: 'travel', reason: 'sellCargo' },
      { kind: 'loot', targetId: 'cargo-gone-1', destination: { x: 44, y: 44 }, phase: 'act', reason: 'takeHandedCargo' },
      { kind: 'investigate', targetId: lawman.id, destination: { ...lawman.pos }, phase: 'travel', reason: 'heardHostile' },
    ];
    forceOption('hostileSeen', 'keep');
    forceOption('resume', 'resume');
    refreshVision(w);

    expect(() => planNpcOrders(w)).not.toThrow();
    expect(topGoal(raider)?.kind).toBe('sell');
  });
});
