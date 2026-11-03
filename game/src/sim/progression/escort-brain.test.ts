import { describe, expect, it } from 'vitest';
import { haulerOf, playerVehicle } from '../damage';
import { addVehicle, chaosHighwayWorld, npcBrain } from '../testkit';
import { followSpot } from '../tow';
import type { Vehicle, World } from '../types';
import { dist } from '../vec';
import { refreshVision } from '../vision';
import { endTurn } from '../world';
import { escortFoe, escortMove as moveWith, type Stall } from './escort-brain';
import { asFighter } from './fighter';
import { RULES } from '../../data/rules';
import { NPC_BEHAVIOR } from '../../data/npcs';

const freshStall = (_me: Vehicle): Stall => ({});
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

describe('escortFoe', () => {
  it('picks a hostile truck in sight and skips one out of sight', () => {
    const w = started();
    const near = foeAt(w, 6, 0, playerVehicle(w));
    foeAt(w, 0, -300, haulerOf(w));
    refreshVision(w);
    expect(escortFoe(w, playerVehicle(w))?.id).toBe(near.id);
  });

  it('finds no foe when none is in sight', () => {
    const w = started();
    foeAt(w, 0, -300, haulerOf(w));
    refreshVision(w);
    expect(escortFoe(w, playerVehicle(w))).toBeNull();
  });
});

describe('escortMove', () => {
  it('follows the hauler at the NPC escort spot with no foe in sight', () => {
    const w = started();
    refreshVision(w);
    expect(destOf(escortMove(w, playerVehicle(w)))).toEqual(followSpot(w, playerVehicle(w), haulerOf(w), 0));
  });

  it('stops at its follow spot while the hauler is parked and drives through it while the hauler moves', () => {
    const w = started();
    const me = playerVehicle(w);
    const hauler = haulerOf(w);
    refreshVision(w);
    hauler.speed = 0;
    expect(escortMove(w, me).kind).toBe('stopAt');
    hauler.speed = 4.5;
    expect(escortMove(w, me).kind).toBe('through');
  });

  it('paces itself to the hauler like an NPC guard once it is close', () => {
    const w = started();
    const me = playerVehicle(w);
    haulerOf(w).speed = 5;
    me.pos = { ...followSpot(w, me, haulerOf(w), 0) };
    refreshVision(w);
    const order = escortMove(w, me);
    expect(order.kind).toBe('through');
    expect('pace' in order).toBe(true);
  });

  it('fights a foe in sight from a spot within the wait gap of its place beside the hauler', () => {
    const w = started();
    const me = playerVehicle(w);
    me.pos = { x: haulerOf(w).pos.x + 4, y: haulerOf(w).pos.y };
    foeAt(w, 8, 0, me);
    refreshVision(w);
    const dest = destOf(escortMove(w, me));
    const post = followSpot(w, me, haulerOf(w), 0);
    expect(dest).not.toEqual(post);
    expect(dist(dest, post)).toBeLessThanOrEqual(NPC_BEHAVIOR.escortWaitGap);
  });

  it('keeps its target while it lags behind the hauler', () => {
    const w = started();
    const me = playerVehicle(w);
    const hauler = haulerOf(w);
    me.pos = { x: hauler.pos.x, y: hauler.pos.y + NPC_BEHAVIOR.escortWaitGap + 2 };
    const foe = foeAt(w, 6, 0, me);
    refreshVision(w);
    expect(escortFoe(w, me)?.id).toBe(foe.id);
  });

  it('gives the gun truck a merc brain only on a copy, so the player truck keeps none', () => {
    const w = started();
    expect(asFighter(playerVehicle(w)).brain?.templateId).toBe('merc');
    expect(playerVehicle(w).brain).toBeNull();
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
      expect(moveWith(w, me, null, stall).kind === 'stopAt' && !!stall.recovery).toBe(false);
    }
    for (let k = 0; k < 5; k++) expect(heldTurn(w, me, stall, w.turn + 2).kind === 'stopAt' && !!stall.recovery).toBe(false);
  });
});
