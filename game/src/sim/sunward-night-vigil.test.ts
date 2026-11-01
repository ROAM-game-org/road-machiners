import { beforeAll, describe, expect, it } from 'vitest';
import { SUNWARD } from '../data/sunward';
import { RULES } from '../data/rules';
import { topGoal } from './npc-activities';
import { followingOf } from './companies';
import { isSheltered } from './sites';
import { dawnAfter, duskTurn, gateOrder, isHunterCar, membersOf, nextRideOut, returnTurn, rideOutTurn, sunwardFacts, vigilPosts } from './sunward';
import type { World } from './types';
import { dist } from './vec';
import { firstLeg, orderWorld, playLeg, riderAt, runTo, seen, type Leg } from '../test/sunward-kit';

type Vigil = { members: string[]; order: string[] };

const DUSK = duskTurn(1);
const OUT = rideOutTurn(DUSK);
const BACK = returnTurn(DUSK) - 5;
const HOME = nextRideOut(dawnAfter(DUSK)) - 1;
const LATE_NIGHT = Math.floor((OUT + BACK) / 2);
const BEFORE_DAWN = Math.floor((BACK + HOME) / 2);

function runUntil(turn: number): (w: World) => World {
  return (w) => runTo(w, turn);
}

function beforeTheRide(): Leg<Vigil> {
  return playLeg(
    'vigil, before the ride',
    () => firstLeg(orderWorld(5), { members: [], order: [] } as Vigil),
    (start, vigil) => {
      const w = runTo(start, OUT - 1);
      vigil.members = membersOf(w).map((v) => v.id);
      return w;
    },
  );
}

function ridingOut(): Leg<Vigil> {
  return playLeg('vigil, riding out', beforeTheRide, (start, vigil) => {
    const w = runTo(start, OUT + 3);
    vigil.order = gateOrder(w, sunwardFacts(w).night!);
    return w;
  });
}

const throughTheFirstHalf = () => playLeg('vigil, first half of the night', ridingOut, runUntil(LATE_NIGHT));
const atTheReturn = () => playLeg('vigil, to the return', throughTheFirstHalf, runUntil(BACK));
const throughTheSecondHalf = () => playLeg('vigil, second half of the night', atTheReturn, runUntil(BEFORE_DAWN));
const atHome = () => playLeg('vigil, home', throughTheSecondHalf, runUntil(HOME));

describe('the night schedule, vigil', () => {
  beforeAll(() => {
    orderWorld(5);
  });

  it('rides out before dusk', () => {
    const before = beforeTheRide();
    for (const id of before.notes.members) expect(isSheltered(before.world, id)).toBe(true);

    const { world: w, notes } = ridingOut();

    const night = sunwardFacts(w).night!;
    expect(night.roster).toHaveLength(SUNWARD.cavalcade);
    expect(topGoal(riderAt(w, notes.order[0]))?.reason).toBe('rideVigil');
    for (const v of membersOf(w).filter(isHunterCar)) expect(isSheltered(w, v.id)).toBe(true);
    expect(seen.stalls).toBe(0);
  });

  it('keeps the cars out on the ride through the first half of the night', () => {
    const { world: w, notes } = throughTheFirstHalf();

    for (const id of notes.order) expect(isSheltered(w, id)).toBe(false);
    expect(seen.stalls).toBe(0);
  });

  it('keeps the vigil at the posts', () => {
    const { world: w, notes } = atTheReturn();

    notes.order.forEach((id, seat) => {
      const v = riderAt(w, id);
      expect(dist(v.pos, vigilPosts(w)[seat])).toBeLessThanOrEqual(RULES.arriveRadius * 2);
      expect(topGoal(v)?.reason).toBe('keepVigil');
      expect(followingOf(w, v)).toBeNull();
    });
    expect(seen.stalls).toBe(0);
  });

  it('keeps the column on the road back through the second half of the night', () => {
    const { world: w, notes } = throughTheSecondHalf();

    for (const v of membersOf(w)) expect(notes.members).toContain(v.id);
    expect(seen.stalls).toBe(0);
  });

  it('leaves before dawn and rests inside by the morning', () => {
    const { world: w, notes } = atHome();

    for (const v of membersOf(w).filter((x) => !seen.broken.has(x.id))) expect(isSheltered(w, v.id)).toBe(true);
    expect(membersOf(w).map((v) => v.id).sort()).toEqual([...notes.members].sort());
    expect(seen.stalls).toBe(0);
  });
});
