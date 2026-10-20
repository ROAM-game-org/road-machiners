
import { MEMORY } from '../data/npcs';
import type { Memory, MemoryFact, NpcBrain, SightingFact, Vehicle, World } from './types';

export function subjectOf(fact: MemoryFact): string {
  switch (fact.kind) {
    case 'prices': return `prices:${fact.shop}`;
    case 'stripped': return `stripped:${fact.stock}`;
    case 'sighting': return `sighting:${fact.vehicle}`;
    case 'wronged':
    case 'helped': return `${fact.kind}:${fact.by}:${fact.deed}`;
  }
}

function brainOf(vehicle: Vehicle): NpcBrain {
  if (!vehicle.brain) throw new Error(`${vehicle.id} has no brain to remember with`);
  return vehicle.brain;
}

export function remember(world: World, vehicle: Vehicle, fact: MemoryFact): void {
  const brain = brainOf(vehicle);
  const subject = subjectOf(fact);
  const old = brain.memories.findIndex((m) => subjectOf(m.fact) === subject);
  if (old >= 0) brain.memories.splice(old, 1);
  brain.memories.push({ turn: world.turn, fact });
}

export function recall<K extends MemoryFact['kind']>(vehicle: Vehicle, kind: K): (Memory & { fact: Extract<MemoryFact, { kind: K }> })[] {
  return brainOf(vehicle).memories
    .filter((m): m is Memory & { fact: Extract<MemoryFact, { kind: K }> } => m.fact.kind === kind)
    .reverse();
}

export function rememberSightings(world: World, vehicle: Vehicle, seen: Vehicle[]): void {
  for (const other of seen) {
    if (other.brain) remember(world, vehicle, { kind: 'sighting', vehicle: other.id, at: { ...other.pos }, heading: other.heading });
  }
}

export function sightingOf(vehicle: Vehicle, targetId: string): (Memory & { fact: SightingFact }) | null {
  return recall(vehicle, 'sighting').find((m) => m.fact.vehicle === targetId) ?? null;
}

export function reviseMemories(vehicle: Vehicle, revise: (memory: Memory) => Memory | null): void {
  const brain = brainOf(vehicle);
  brain.memories = brain.memories.flatMap((m) => revise(m) ?? []);
}

export function forgetOld(world: World): void {
  const fresh = (m: Memory): boolean => world.turn - m.turn < MEMORY.turns[m.fact.kind];
  for (const v of world.vehicles) {
    if (v.brain && !v.brain.memories.every(fresh)) v.brain.memories = v.brain.memories.filter(fresh);
  }
}
