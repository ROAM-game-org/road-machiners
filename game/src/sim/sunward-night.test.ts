import { beforeAll, describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { followingOf } from './companies';
import { isSheltered } from './sites';
import { duskTurn, gateOrder, isCavalcadeCar, membersOf, returnTurn, rideOutTurn, sunwardFacts, vigilPosts } from './sunward';
import type { World } from './types';
import { dist, type Vec } from './vec';
import { firstLeg, orderWorld, playLeg, riderAt, runTo, seen, watchedFromTheGate, type Leg } from '../test/sunward-kit';

type Watch = {
  order: string[];
  posts: Vec[];
  left: Record<string, number>;
  arrived: Record<string, number>;
  away: Record<string, { best: number; worse: number; most: number }>;
};

const DUSK = duskTurn(1);
const OUT = rideOutTurn(DUSK);
const HALFWAY = Math.floor((OUT + returnTurn(DUSK)) / 2);

function noteRiders(w: World, watch: Watch): void {
  watch.order.forEach((id, seat) => {
    const v = riderAt(w, id);
    if (!(id in watch.left) && !isSheltered(w, id)) watch.left[id] = w.turn - OUT;
    if (!(id in watch.arrived) && dist(v.pos, watch.posts[seat]) <= RULES.arriveRadius * 2) watch.arrived[id] = w.turn - OUT;
    if (id in watch.arrived || !(id in watch.left)) return;
    const gap = dist(v.pos, watch.posts[seat]);
    const track = watch.away[id] ?? { best: gap, worse: 0, most: 0 };
    track.worse = gap > track.best + 0.5 ? track.worse + 1 : 0;
    track.best = Math.min(track.best, gap);
    track.most = Math.max(track.most, track.worse);
    watch.away[id] = track;
  });
}

function watchUntil(turn: number): (w: World, watch: Watch) => World {
  return (start, watch) => {
    let w = start;
    while (w.turn < turn) {
      w = runTo(w, w.turn + 1);
      noteRiders(w, watch);
    }
    return w;
  };
}

function firstHalfOfTheRide(): Leg<Watch> {
  return playLeg(
    'watched ride, first half',
    () => firstLeg(watchedFromTheGate(orderWorld(5)), { order: [], posts: [], left: {}, arrived: {}, away: {} } as Watch),
    (start, watch) => {
      const w = runTo(start, OUT);
      watch.order = gateOrder(w, sunwardFacts(w).night!);
      watch.posts = vigilPosts(w);
      return watchUntil(HALFWAY)(w, watch);
    },
  );
}

function secondHalfOfTheRide(): Leg<Watch> {
  return playLeg('watched ride, second half', firstHalfOfTheRide, watchUntil(returnTurn(DUSK)));
}

describe('the night schedule', () => {
  beforeAll(() => {
    orderWorld(5);
  });

  it('lets one car out of the Hollow at a time while the player watches', () => {
    const { notes } = firstHalfOfTheRide();

    expect(notes.left[notes.order[0]]).toBeLessThanOrEqual(6);
    expect(Math.max(...notes.order.map((id) => notes.left[id]))).toBeLessThanOrEqual(45);
    expect(seen.stalls).toBe(0);
  });

  it('rides to the light without turning back and holds a post until the return', () => {
    const { notes } = secondHalfOfTheRide();

    expect(Object.keys(notes.arrived).sort()).toEqual([...notes.order].sort());
    expect(Math.max(...Object.values(notes.away).map((t) => t.most))).toBeLessThanOrEqual(5);
    expect(seen.stalls).toBe(0);
  });

  it('closes the column up behind a car beaten on the ride', () => {
    let w = runTo(watchedFromTheGate(orderWorld(5)), rideOutTurn(duskTurn(1)) + 1);
    const order = gateOrder(w, sunwardFacts(w).night!);
    while (followingOf(w, riderAt(w, order[4]))?.other !== order[3]) w = runTo(w, w.turn + 1);
    const beaten = riderAt(w, order[3]);
    beaten.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };

    w = runTo(w, w.turn + 1);

    expect(followingOf(w, riderAt(w, order[4]))?.other).toBe(order[2]);
  }, 600_000);

  it('rides the cars out in roster order, skipping a car the order no longer holds', () => {
    const w = orderWorld(5);
    const roster = membersOf(w).filter(isCavalcadeCar).map((v) => v.id).reverse();
    const night = { dusk: duskTurn(1), roster: [...roster, 'gone-car'], beaten: [], calls: {}, hunt: null, shouted: [], offered: [] };

    expect(gateOrder(w, night)).toEqual(roster);
  });
});

