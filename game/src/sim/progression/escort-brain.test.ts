import { describe, expect, it } from 'vitest';
import { haulerOf, playerVehicle } from '../damage';
import { addVehicle, furyRoadWorld, npcBrain } from '../testkit';
import { followSpot } from '../tow';
import type { Vehicle, World } from '../types';
import { dist } from '../vec';
import { refreshVision } from '../vision';
import { endTurn } from '../world';
import { asFighter, escortMove, hostilesSeen, leash, nearestToHauler } from './escort-brain';

function started(): World {
  return endTurn(furyRoadWorld(), () => {});
}

function foeAt(w: World, dx: number, dy: number, from: Vehicle): Vehicle {
  const foe = addVehicle(w, 'raiders', 'buggy', ['mg'], { x: from.pos.x + dx, y: from.pos.y + dy });
  foe.brain = npcBrain('merc', foe.pos, []);
  return foe;
}

function destOf(order: ReturnType<typeof escortMove>) {
  if (order.kind !== 'through' && order.kind !== 'stopAt') throw new Error(`Expected a move with a destination, got ${order.kind}`);
  return order.dest;
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

describe('escortMove', () => {
  it('follows the hauler at the NPC escort spot with no foe in sight', () => {
    const w = started();
    refreshVision(w);
    expect(destOf(escortMove(w, playerVehicle(w)))).toEqual(followSpot(w, playerVehicle(w), haulerOf(w), 0));
  });

  it('fights a foe in sight by the NPC fight point while within its gun reach of the hauler', () => {
    const w = started();
    const me = playerVehicle(w);
    me.pos = { x: haulerOf(w).pos.x + 4, y: haulerOf(w).pos.y };
    const foe = foeAt(w, 8, 0, me);
    refreshVision(w);
    const dest = destOf(escortMove(w, me));
    expect(dest).not.toEqual(followSpot(w, me, haulerOf(w), 0));
    expect(dist(dest, foe.pos)).toBeLessThanOrEqual(leash(w, me) + foe.speed);
  });

  it('gives the gun truck a merc brain only on a copy, so the player truck keeps none', () => {
    const w = started();
    expect(asFighter(playerVehicle(w)).brain?.templateId).toBe('merc');
    expect(playerVehicle(w).brain).toBeNull();
  });

  it('drives back to the hauler past the leash, even with a foe in sight', () => {
    const w = started();
    const me = playerVehicle(w);
    const hauler = haulerOf(w);
    me.pos = { x: hauler.pos.x + leash(w, me) + 5, y: hauler.pos.y };
    foeAt(w, 6, 0, me);
    refreshVision(w);
    expect(dist(destOf(escortMove(w, me)), followSpot(w, me, hauler, 0))).toBe(0);
  });
});
