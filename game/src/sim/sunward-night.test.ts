import { describe, expect, it } from 'vitest';
import { SUNWARD } from '../data/sunward';
import { RULES } from '../data/rules';
import { topGoal } from './npc-activities';
import { followingOf } from './companies';
import { isSheltered } from './sites';
import { dawnAfter, duskTurn, gateOrder, holdsPost, isCavalcadeCar, membersOf, nextRideOut, returnTurn, rideOutTurn, sunwardFacts, vigilPosts, isHunterCar } from './sunward';
import type { Vehicle, World } from './types';
import { dist } from './vec';
import { orderWorld, riderAt, runFarTo, runTo, seen, watchedFromTheGate } from '../test/sunward-kit';

describe('the night schedule', () => {
  it('lets one car out of the Hollow at a time while the player watches, rides to the light without turning back and holds a post until the return', () => {
    let w = watchedFromTheGate(orderWorld(5));
    const dusk = duskTurn(1);
    const out = rideOutTurn(dusk);
    seen.stalls = 0;
    w = runTo(w, out);
    const order = gateOrder(w, sunwardFacts(w).night!);
    const posts = vigilPosts(w);
    const left = new Map<string, number>();
    const arrived = new Map<string, number>();
    const away = new Map<string, { best: number; worse: number; most: number }>();
    while (w.turn < returnTurn(dusk)) {
      w = runTo(w, w.turn + 1);
      order.forEach((id, seat) => {
        const v = riderAt(w, id);
        if (!left.has(id) && !isSheltered(w, id)) left.set(id, w.turn - out);
        if (!arrived.has(id) && dist(v.pos, posts[seat]) <= RULES.arriveRadius * 2) arrived.set(id, w.turn - out);
        if (arrived.has(id) || !left.has(id)) return;
        const gap = dist(v.pos, posts[seat]);
        const track = away.get(id) ?? { best: gap, worse: 0, most: 0 };
        track.worse = gap > track.best + 0.5 ? track.worse + 1 : 0;
        track.best = Math.min(track.best, gap);
        track.most = Math.max(track.most, track.worse);
        away.set(id, track);
      });
    }

    expect(left.get(order[0])).toBeLessThanOrEqual(6);
    expect(Math.max(...order.map((id) => left.get(id)!))).toBeLessThanOrEqual(45);
    expect([...arrived.keys()].sort()).toEqual([...order].sort());
    expect(Math.max(...[...away.values()].map((t) => t.most))).toBeLessThanOrEqual(5);
    expect(seen.stalls).toBe(0);
  }, 600_000);

  it('rides out before dusk, keeps the vigil at the posts, leaves before dawn and rests inside by the morning', () => {
    let w = runTo(orderWorld(5), rideOutTurn(duskTurn(1)) - 1);
    const members = membersOf(w);
    for (const v of members) expect(isSheltered(w, v.id)).toBe(true);
    seen.stalls = 0;
    seen.broken.clear();

    w = runTo(w, rideOutTurn(duskTurn(1)) + 3);
    const night = sunwardFacts(w).night!;
    expect(night.roster).toHaveLength(SUNWARD.cavalcade);
    const order = gateOrder(w, night);
    expect(topGoal(riderAt(w, order[0]))?.reason).toBe('rideVigil');
    for (const v of membersOf(w).filter(isHunterCar)) expect(isSheltered(w, v.id)).toBe(true);

    w = runTo(w, returnTurn(duskTurn(1)) - 5);
    order.forEach((id, seat) => {
      const v = riderAt(w, id);
      expect(dist(v.pos, vigilPosts(w)[seat])).toBeLessThanOrEqual(RULES.arriveRadius * 2);
      expect(topGoal(v)?.reason).toBe('keepVigil');
      expect(followingOf(w, v)).toBeNull();
    });

    w = runTo(w, nextRideOut(dawnAfter(duskTurn(1))) - 1);
    for (const v of membersOf(w).filter((x) => !seen.broken.has(x.id))) expect(isSheltered(w, v.id)).toBe(true);
    expect(membersOf(w).map((v) => v.id).sort()).toEqual(members.map((v) => v.id).sort());
    expect(seen.stalls).toBe(0);
  }, 600_000);

  it('holds every post from dusk to the return and is home before the next ride-out, on far travel with nobody near', () => {
    const seed = 5;
    const dusk = duskTurn(1);
    seen.stalls = 0;
    seen.broken.clear();
    const stopped = new Set<string>();
    const noteStopped = (w: World) => {
      for (const v of membersOf(w)) if (topGoal(v)?.kind === 'fight') stopped.add(v.id);
    };
    let w = runFarTo(orderWorld(seed), rideOutTurn(dusk) + 1, noteStopped);
    const order = gateOrder(w, sunwardFacts(w).night!);
    const onTime = (): Vehicle[] => order.map((id) => riderAt(w, id)).filter((v) => !seen.broken.has(v.id) && !stopped.has(v.id));
    const lateAt: string[] = [];
    const checkPosts = (x: World) => {
      if (x.turn < dusk || x.turn >= returnTurn(dusk)) return;
      for (const v of onTime()) if (!holdsPost(riderAt(x, v.id))) lateAt.push(`${v.id}@${x.turn - dusk}`);
    };
    w = runFarTo(w, returnTurn(dusk), (x) => {
      noteStopped(x);
      checkPosts(x);
    });
    expect(lateAt).toEqual([]);

    w = runFarTo(w, returnTurn(dusk) + 1, noteStopped);
    expect(topGoal(riderAt(w, order[0]))?.reason).not.toBe('keepVigil');

    w = runFarTo(w, nextRideOut(dawnAfter(dusk)) - 1, noteStopped);
    for (const v of onTime()) expect(isSheltered(w, v.id)).toBe(true);
    expect(seen.stalls).toBe(0);
  }, 600_000);

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

