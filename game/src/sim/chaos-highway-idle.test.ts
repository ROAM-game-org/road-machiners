import { describe, expect, it } from 'vitest';
import { ICARUS_OPTIONS, NPC_BEHAVIOR } from '../data/npcs';
import { REGION } from '../data/region';
import { playerVehicle } from './damage';
import { idleGoal } from './npc-activities';
import { optionWeights, raiderGrounds, raiderPatrolPosts } from './npc-decisions';
import { watchStalls } from './npc-watchdog';
import { thinkEvery } from './fidelity';
import { addVehicle, chaosHighwayWorld, npcBrain } from './testkit';
import type { Vehicle, World } from './types';

const kiln = REGION.locations.find((l) => l.id === 'kiln')!;

function highwayTruck(w: World, traits: Parameters<typeof npcBrain>[2], home = kiln.pos): Vehicle {
  const me = playerVehicle(w);
  const truck = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: me.pos.x + 30, y: me.pos.y });
  truck.brain = npcBrain('buggy', home, traits);
  truck.brain.goals = [];
  return truck;
}

describe('a Chaos Highway truck with an empty goal stack', () => {
  it.each([['raider', ['raider']], ['lawman', ['lawman', 'brave']]] as const)('offers no Icarus option to a %s and waits', (_, traits) => {
    const w = chaosHighwayWorld();
    const truck = highwayTruck(w, [...traits]);
    const options = Object.keys(optionWeights(w, truck, 'idle', null, null));
    for (const option of ICARUS_OPTIONS) expect(options).not.toContain(option);
    expect(idleGoal(w, truck).kind).toBe('wait');
  });

  it('gets no explore goal from the stall watchdog', () => {
    const w = chaosHighwayWorld();
    const truck = highwayTruck(w, ['lawman', 'brave']);
    watchStalls(w);
    w.turn += NPC_BEHAVIOR.stallTurns * thinkEvery(w, truck);
    watchStalls(w);
    expect(w.events.some((e) => e.t === 'stall')).toBe(true);
    expect(truck.brain!.goals.map((g) => g.kind)).not.toContain('explore');
  });
});

describe('camp posts on a map without Icarus', () => {
  it('throw an error that names the map', () => {
    const w = chaosHighwayWorld();
    expect(() => raiderPatrolPosts(w, kiln)).toThrow(/Icarus map.*highway map/);
    expect(() => raiderGrounds(w, kiln)).toThrow(/Icarus map.*highway map/);
  });
});
