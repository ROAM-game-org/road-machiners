import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { spawnNpcs } from './spawn';
import { emptyWorld, testDrive } from './testkit';
import type { World } from './types';
import { endTurn } from './world';

function pairedWorld(): World {
  const w = emptyWorld({ x: 5, y: 5 });
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = id === 'courier' ? 1 : Number.MAX_SAFE_INTEGER;
  spawnNpcs(w);
  return w;
}

function run(w: World, turns: number): World {
  let next = w;
  for (let i = 0; i < turns; i++) next = endTurn(next, testDrive);
  return next;
}

const couriers = (w: World) => w.vehicles.filter((v) => v.brain?.templateId === 'courier');

describe('a courier pair in a save', () => {
  it('loads to the same pair and awards nothing', () => {
    const w = pairedWorld();
    expect(couriers(w)).toHaveLength(2);
    const loaded = JSON.parse(JSON.stringify(w)) as World;
    expect(loaded.states).toEqual(w.states);
    expect(couriers(loaded).map((v) => [v.id, v.brain!.goals, v.resources])).toEqual(couriers(w).map((v) => [v.id, v.brain!.goals, v.resources]));
    expect(loaded.events).toEqual(w.events);
    expect(loaded.player.xp).toEqual(w.player.xp);
  });

  it('runs the same from a loaded copy', () => {
    const w = pairedWorld();
    const loaded = JSON.parse(JSON.stringify(w)) as World;
    const a = run(w, 30);
    const b = run(loaded, 30);
    expect(b.states).toEqual(a.states);
    expect(couriers(b).map((v) => [v.pos, v.brain!.goals])).toEqual(couriers(a).map((v) => [v.pos, v.brain!.goals]));
  }, 60_000);
});
