import { beforeAll, describe, expect, it } from 'vitest';
import { topGoal } from './npc-activities';
import { isSheltered } from './sites';
import { dawnAfter, duskTurn, gateOrder, holdsPost, membersOf, nextRideOut, returnTurn, rideOutTurn, sunwardFacts } from './sunward';
import type { World } from './types';
import { firstLeg, orderWorld, playLeg, riderAt, runFarTo, seen, type Leg } from '../test/sunward-kit';

type Far = { order: string[]; stopped: string[]; lateAt: string[] };

const DUSK = duskTurn(1);
const RETURN = returnTurn(DUSK);
const HOME = nextRideOut(dawnAfter(DUSK)) - 1;
const LATE_NIGHT = Math.floor((rideOutTurn(DUSK) + RETURN) / 2);
const BEFORE_DAWN = Math.floor((RETURN + HOME) / 2);

function noteStopped(w: World, far: Far): void {
  for (const v of membersOf(w)) if (topGoal(v)?.kind === 'fight' && !far.stopped.includes(v.id)) far.stopped.push(v.id);
}

function onTime(far: Far): string[] {
  return far.order.filter((id) => !seen.broken.has(id) && !far.stopped.includes(id));
}

function checkPosts(w: World, far: Far): void {
  if (w.turn < DUSK || w.turn >= RETURN) return;
  for (const id of onTime(far)) if (!holdsPost(riderAt(w, id))) far.lateAt.push(`${id}@${w.turn - DUSK}`);
}

function farUntil(turn: number): (w: World, far: Far) => World {
  return (w, far) =>
    runFarTo(w, turn, (x) => {
      noteStopped(x, far);
      checkPosts(x, far);
    });
}

function rideOut(): Leg<Far> {
  return playLeg(
    'far night, ride out',
    () => firstLeg(orderWorld(5), { order: [], stopped: [], lateAt: [] } as Far),
    (start, far) => {
      const w = runFarTo(start, rideOutTurn(DUSK) + 1, (x) => noteStopped(x, far));
      far.order = gateOrder(w, sunwardFacts(w).night!);
      return w;
    },
  );
}

const atDusk = () => playLeg('far night, to dusk', rideOut, farUntil(DUSK));
const throughTheFirstHalf = () => playLeg('far night, first half', atDusk, farUntil(LATE_NIGHT));
const atTheReturn = () => playLeg('far night, to the return', throughTheFirstHalf, farUntil(RETURN));
const afterTheReturn = () => playLeg('far night, after the return', atTheReturn, farUntil(RETURN + 1));
const throughTheSecondHalf = () => playLeg('far night, second half', afterTheReturn, farUntil(BEFORE_DAWN));
const atHome = () => playLeg('far night, home', throughTheSecondHalf, farUntil(HOME));

describe('the night schedule on far travel with nobody near', () => {
  beforeAll(() => {
    orderWorld(5);
  });

  it('rides out and keeps the column from stalling until dusk', () => {
    const { world: w, notes } = atDusk();

    expect(notes.order.length).toBeGreaterThan(0);
    expect(notes.order.some((id) => !isSheltered(w, id))).toBe(true);
    expect(seen.stalls).toBe(0);
  });

  it('holds every post from dusk through the first half of the night', () => {
    expect(throughTheFirstHalf().notes.lateAt).toEqual([]);
  });

  it('holds every post until the return', () => {
    expect(atTheReturn().notes.lateAt).toEqual([]);
  });

  it('stops keeping the vigil once the return begins', () => {
    const { world: w, notes } = afterTheReturn();

    expect(topGoal(riderAt(w, notes.order[0]))?.reason).not.toBe('keepVigil');
  });

  it('brings the column home through the second half of the night', () => {
    const { world: w, notes } = throughTheSecondHalf();

    for (const id of onTime(notes)) expect(riderAt(w, id).id).toBe(id);
    expect(seen.stalls).toBe(0);
  });

  it('is home before the next ride-out', () => {
    const { world: w, notes } = atHome();

    for (const id of onTime(notes)) expect(isSheltered(w, id)).toBe(true);
    expect(seen.stalls).toBe(0);
  });
});
