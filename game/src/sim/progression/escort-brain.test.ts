import { describe, expect, it } from 'vitest';
import { haulerOf, playerVehicle } from '../damage';
import { addVehicle, chaosHighwayWorld, npcBrain } from '../testkit';
import { followSpot } from '../tow';
import type { Vehicle, World } from '../types';
import { dist } from '../vec';
import { refreshVision } from '../vision';
import { endTurn } from '../world';
import { asFighter, escortFoe, escortMove as moveWith, hostilesSeen, lagBehind, leash, nearestToHauler, type Stall } from './escort-brain';
import { RULES } from '../../data/rules';

const freshStall = (me: Vehicle): Stall => ({ turn: -1, at: { ...me.pos }, stalled: 0, recovery: 0, goal: null });
const escortMove = (w: World, me: Vehicle) => moveWith(w, me, escortFoe(w, me), freshStall(me));

function started(): World {
  return endTurn(chaosHighwayWorld(), () => {});
}

function foeAt(w: World, dx: number, dy: number, from: Vehicle): Vehicle {
  const foe = addVehicle(w, 'scrapjaw', 'buggy', ['mg'], { x: from.pos.x + dx, y: from.pos.y + dy });
  foe.brain = npcBrain('merc', foe.pos, ['raider']);
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

  it('never puts a held pace on the follow order', () => {
    const w = started();
    haulerOf(w).speed = 5;
    refreshVision(w);
    const order = escortMove(w, playerVehicle(w));
    expect(order.kind).not.toBe('brake');
    expect('pace' in order).toBe(false);
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

  it('drives back to the hauler once it falls behind it by more than its gun reach, even with a foe in sight', () => {
    const w = started();
    const me = playerVehicle(w);
    const hauler = haulerOf(w);
    me.pos = { x: hauler.pos.x, y: hauler.pos.y + leash(w, me) + 5 };
    foeAt(w, 6, 0, me);
    refreshVision(w);
    expect(lagBehind(w, me, hauler)).toBeGreaterThan(leash(w, me));
    expect(dist(destOf(escortMove(w, me)), followSpot(w, me, hauler, 0))).toBe(0);
  });

  it('keeps fighting a foe off to the side of the hauler, since only falling behind pulls it back', () => {
    const w = started();
    const me = playerVehicle(w);
    const hauler = haulerOf(w);
    me.pos = { x: hauler.pos.x + leash(w, me) + 5, y: hauler.pos.y };
    foeAt(w, 6, 0, me);
    refreshVision(w);
    expect(dist(destOf(escortMove(w, me)), followSpot(w, me, hauler, 0))).toBeGreaterThan(0);
  });
});

describe('the escort stall', () => {
  function heldTurn(w: World, me: Vehicle, stall: Stall, turn: number) {
    w.turn = turn;
    me.order = { kind: 'through', dest: { x: me.pos.x + 30, y: me.pos.y } };
    return moveWith(w, me, null, stall);
  }

  it('backs out behind itself after the NPC stuck turns held in place, for the NPC recovery turns, then drives on', () => {
    const w = started();
    const me = playerVehicle(w);
    const stall = freshStall(me);
    const start = w.turn;
    const orders = [0, 1, 2, 3, 4, 5].map((k) => heldTurn(w, me, stall, start + k));
    const backs = orders.map((o) => o.kind === 'stopAt' && dist(o.dest, me.pos) === RULES.reverse.distance + RULES.minAimDistance);
    expect(backs.indexOf(true)).toBe(RULES.npcStuckTurns);
    expect(backs.filter(Boolean).length).toBeGreaterThanOrEqual(RULES.npcRecoveryTurns);
    expect(backs[RULES.npcStuckTurns + RULES.npcRecoveryTurns]).toBe(false);
  });

  it('backs out to a free side when a truck blocks the spot behind it', () => {
    const w = started();
    const me = playerVehicle(w);
    const back = RULES.reverse.distance + RULES.minAimDistance;
    const behind = { x: me.pos.x - Math.cos(me.heading) * back, y: me.pos.y - Math.sin(me.heading) * back };
    for (const v of w.vehicles) if (v.id !== me.id) v.pos = { x: me.pos.x + 200, y: me.pos.y };
    addVehicle(w, 'scrapjaw', 'buggy', [], behind);
    const stall = freshStall(me);
    const start = w.turn;
    const orders = [0, 1, 2].map((k) => heldTurn(w, me, stall, start + k));
    const out = orders[RULES.npcStuckTurns];
    if (out.kind !== 'stopAt') throw new Error(`expected a back-out, got ${out.kind}`);
    expect(dist(out.dest, me.pos)).toBeCloseTo(back);
    expect(dist(out.dest, behind)).toBeGreaterThan(1);
  });

  it('never backs out while it stands at its order point or after a gap in turns', () => {
    const w = started();
    const me = playerVehicle(w);
    const stall = freshStall(me);
    for (let k = 0; k < 5; k++) {
      w.turn += 1;
      me.order = { kind: 'stopAt', dest: { ...me.pos } };
      expect(moveWith(w, me, null, stall).kind === 'stopAt' && stall.recovery > 0).toBe(false);
    }
    for (let k = 0; k < 5; k++) expect(heldTurn(w, me, stall, w.turn + 2).kind === 'stopAt' && stall.recovery > 0).toBe(false);
  });
});
