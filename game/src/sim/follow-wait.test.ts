import { describe, expect, it } from 'vitest';
import { NPC_BEHAVIOR, NPCS, type TraitId } from '../data/npcs';
import { planNpcOrders } from './ai';
import { getResources } from './resources';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { startEscort, steerFollow } from './tow';
import type { NpcActivity, Vehicle, World } from './types';
import type { Vec } from './vec';

function createNpc(w: World, templateId: string, traits: TraitId[], chassis: string, parts: string[], pos: Vec): Vehicle {
  const npc = addVehicle(w, NPCS[templateId].faction, chassis, parts, pos);
  npc.brain = npcBrain(templateId, pos, traits);
  return npc;
}

const SELL: NpcActivity = { kind: 'sell', targetId: 'nose', destination: { x: 150, y: 60 }, phase: 'travel', reason: 'tripToSite' };

function convoyWithGuardAt(guardX: number): { w: World; convoy: Vehicle; guard: Vehicle } {
  const w = emptyWorld({ x: 200, y: 200 });
  const convoy = createNpc(w, 'convoy', ['supplier'], 'hauler', ['mg', 'workhorseDiesel', 'trailerBox'], { x: 60, y: 60 });
  convoy.brain!.goals = [{ ...SELL }];
  const guard = createNpc(w, 'convoyGuard', ['guard'], 'scout', ['mg', 'stockEngine'], { x: guardX, y: 60 });
  startEscort(w, guard, convoy, null, 0);
  return { w, convoy, guard };
}

describe('a leader waiting for its escort', () => {
  it('brakes for a mobile escort 20 tiles back', () => {
    const { w, convoy } = convoyWithGuardAt(40);
    planNpcOrders(w);
    expect(convoy.order?.kind).toBe('brake');
  });

  it('keeps its drive order for a stranded escort 20 tiles back', () => {
    const { w, convoy, guard } = convoyWithGuardAt(40);
    getResources(w, guard).fuel = 0;
    planNpcOrders(w);
    expect(convoy.order?.kind).not.toBe('brake');
  });
});

describe('a far follower', () => {
  function farFollower() {
    const w = emptyWorld({ x: 300, y: 300 });
    const leader = createNpc(w, 'convoy', ['supplier'], 'hauler', ['mg', 'workhorseDiesel', 'trailerBox'], { x: 200, y: 60 });
    const guard = createNpc(w, 'convoyGuard', ['guard'], 'scout', ['mg', 'stockEngine'], { x: 100, y: 60 });
    const goal = startEscort(w, guard, leader, null, 0);
    steerFollow(w, guard, goal);
    return { w, leader, guard, goal };
  }

  it('keeps its aim while the leader moves 10 tiles', () => {
    const { w, leader, guard, goal } = farFollower();
    const held = goal.destination && { ...goal.destination };
    leader.pos = { x: leader.pos.x + 10, y: leader.pos.y };
    steerFollow(w, guard, goal);
    expect(goal.destination).toEqual(held);
  });

  it('re-aims once the leader has moved 40 tiles', () => {
    const { w, leader, guard, goal } = farFollower();
    const held = goal.destination && { ...goal.destination };
    leader.pos = { x: leader.pos.x + 40, y: leader.pos.y };
    steerFollow(w, guard, goal);
    expect(goal.destination).not.toEqual(held);
    expect(goal.destination!.x).toBeGreaterThan(held!.x + 30);
  });

  it('re-aims every turn within the catch-up gap', () => {
    const { w, leader, guard, goal } = farFollower();
    guard.pos = { x: leader.pos.x - NPC_BEHAVIOR.escortCatchUpGap + 5, y: 60 };
    steerFollow(w, guard, goal);
    const first = { ...goal.destination };
    leader.pos = { x: leader.pos.x + 1, y: leader.pos.y };
    steerFollow(w, guard, goal);
    expect(goal.destination).not.toEqual(first);
  });
});

describe('a courier waiting for its partner', () => {
  function courierPair(gap: number) {
    const w = emptyWorld({ x: 400, y: 200 });
    const leader = createNpc(w, 'courier', ['courier'], 'scout', ['mg', 'stockEngine'], { x: 200, y: 60 });
    leader.brain!.goals = [{ ...SELL }];
    const partner = createNpc(w, 'courier', ['courier'], 'scout', ['mg', 'stockEngine'], { x: 200 - gap, y: 60 });
    startEscort(w, partner, leader, null, 0);
    return { w, leader };
  }

  it('brakes for a partner beyond the catch-up gap', () => {
    const { w, leader } = courierPair(NPC_BEHAVIOR.escortCatchUpGap + 30);
    planNpcOrders(w);
    expect(leader.order?.kind).toBe('brake');
  });

  it('drives on once the partner is beyond the wait limit', () => {
    const { w, leader } = courierPair(NPC_BEHAVIOR.pairWaitLimit + 10);
    planNpcOrders(w);
    expect(leader.order?.kind).not.toBe('brake');
  });
});

describe('a far partner driving to catch up', () => {
  it('sets no pace while the partner heads toward it', () => {
    const w = emptyWorld({ x: 400, y: 200 });
    const leader = createNpc(w, 'courier', ['courier'], 'scout', ['mg', 'stockEngine'], { x: 60, y: 60 });
    leader.heading = Math.PI;
    leader.speed = 5;
    const partner = createNpc(w, 'courier', ['courier'], 'scout', ['mg', 'stockEngine'], { x: 60 + NPC_BEHAVIOR.escortCatchUpGap + 60, y: 60 });
    startEscort(w, partner, leader, null, 0);
    planNpcOrders(w);
    expect(partner.order).toMatchObject({ kind: 'through' });
    expect(partner.order).not.toHaveProperty('pace');
  });
});
