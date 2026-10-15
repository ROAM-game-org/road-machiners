import { describe, expect, it } from 'vitest';
import { haulerOf, playerVehicle } from '../damage';
import { addVehicle, furyRoadWorld, npcBrain } from '../testkit';
import type { Vehicle, World } from '../types';
import { dist } from '../vec';
import { refreshVision } from '../vision';
import { endTurn } from '../world';
import { fightOrder, fightPoint, hostilesSeen, nearestToHauler } from './escort-brain';

function started(): World {
  return endTurn(furyRoadWorld(), () => {});
}

function foeAt(w: World, dx: number, dy: number, from: Vehicle): Vehicle {
  const foe = addVehicle(w, 'raiders', 'buggy', ['mg'], { x: from.pos.x + dx, y: from.pos.y + dy });
  foe.brain = npcBrain('merc', foe.pos, []);
  return foe;
}

describe('hostilesSeen', () => {
  it('lists a hostile truck in sight and skips one out of sight', () => {
    const w = started();
    const near = foeAt(w, 6, 0, playerVehicle(w));
    const far = foeAt(w, 0, -300, haulerOf(w));
    refreshVision(w);
    const ids = hostilesSeen(w).map((v) => v.id);
    expect(ids).toContain(near.id);
    expect(ids).not.toContain(far.id);
  });
});

describe('nearestToHauler', () => {
  it('picks the foe closest to the hauler', () => {
    const w = started();
    const hauler = haulerOf(w);
    const close = foeAt(w, 4, 0, hauler);
    const farther = foeAt(w, 12, 0, hauler);
    expect(nearestToHauler(w, [farther, close])?.id).toBe(close.id);
    expect(nearestToHauler(w, [])).toBeNull();
  });
});

describe('fightPoint', () => {
  it('lies within the gun reach of the foe', () => {
    const w = started();
    const me = playerVehicle(w);
    const foe = foeAt(w, 8, 0, me);
    expect(dist(fightPoint(w, me, foe), foe.pos)).toBeLessThanOrEqual(12);
  });
});

describe('fightOrder', () => {
  it('stops at the point for a parked foe and drives through for a moving one', () => {
    const w = started();
    const me = playerVehicle(w);
    const foe = foeAt(w, 8, 0, me);
    const dest = { x: foe.pos.x, y: foe.pos.y };
    foe.speed = 0;
    expect(fightOrder(foe, me, dest).kind).toBe('stopAt');
    foe.speed = 5;
    expect(fightOrder(foe, me, dest).kind).toBe('through');
  });
});
