import { beforeEach, describe, expect, it } from 'vitest';
import { NPC_BEHAVIOR } from '../../data/npcs';
import { RULES } from '../../data/rules';
import { playerVehicle } from '../damage';
import { emptyWorld } from '../testkit';
import { forgetFlights, heldFlight, reachedFlight, sawThreat, startFlight } from './flee-memory';

describe('the flee memory', () => {
  beforeEach(forgetFlights);

  function setup() {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const point = { x: 10, y: 10 };
    startFlight(w, me, point);
    return { w, me, point };
  }

  it('holds the flight only while the truck drives to the point it fled to', () => {
    const { w, me, point } = setup();
    expect(heldFlight(w, me)).toBeNull();
    me.order = { kind: 'stopAt', dest: { x: 4, y: 4 } };
    expect(heldFlight(w, me)).toBeNull();
    me.order = { kind: 'stopAt', dest: { ...point } };
    expect(heldFlight(w, me)?.point).toEqual(point);
  });

  it('forgets the flight once the threat has been out of sight for the NPC calm turns', () => {
    const { w, me, point } = setup();
    me.order = { kind: 'stopAt', dest: { ...point } };
    w.turn += NPC_BEHAVIOR.fleeCalmTurns;
    expect(heldFlight(w, me)).not.toBeNull();
    w.turn += 1;
    expect(heldFlight(w, me)).toBeNull();
  });

  it('keeps the flight alive while the threat is seen', () => {
    const { w, me, point } = setup();
    me.order = { kind: 'stopAt', dest: { ...point } };
    w.turn += NPC_BEHAVIOR.fleeCalmTurns;
    sawThreat(w, me);
    w.turn += NPC_BEHAVIOR.fleeCalmTurns;
    expect(heldFlight(w, me)).not.toBeNull();
  });

  it('counts the point as reached only within the arrive distance', () => {
    const { w, me, point } = setup();
    me.order = { kind: 'stopAt', dest: { ...point } };
    me.pos = { x: point.x + RULES.arriveRadius * 2 + 1, y: point.y };
    expect(reachedFlight(w, me)).toBe(false);
    me.pos = { x: point.x + RULES.arriveRadius, y: point.y };
    expect(reachedFlight(w, me)).toBe(true);
  });
});
