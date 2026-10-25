import { describe, expect, it } from 'vitest';
import { DIRECTIONS } from '../data/directions';
import { REGION } from '../data/region';
import { cardinalOf, cueAt, headingAlong, leanOf, octantOf, spanOf } from './direction-cues';
import { directionsFromSite, directionsTo } from './directions';
import { isTerritory } from './sites';
import { ambiguousStarts, followSteps } from './directions-follower.test-helper';
import { nearestRoadPoints, roadNetworkOf } from './road-network';
import { emptyWorld, chaosHighwayWorld } from './testkit';
import type { DirectionStep, DirectionTarget, Obstacle, World } from './types';
import { dist, type Vec } from './vec';

const OFF_ROAD: Vec = { x: 260, y: 420 };
const SITES = [...REGION.towns, ...REGION.locations];

function site(id: string): Vec {
  const found = SITES.find((s) => s.id === id);
  if (!found) throw new Error(id);
  return found.pos;
}

function to(id: string): DirectionTarget {
  return { kind: 'site', id };
}

function tower(id: string, pos: Vec): Obstacle {
  return { id, kind: 'landmark', look: 'waterTower', pos, r: 2, yaw: 0 };
}

function kinds(steps: DirectionStep[]): string[] {
  return steps.map((s) => s.do);
}

function pitWorld(center: Vec): World {
  const w = emptyWorld();
  const size = w.terrain.size;
  const heights = [...w.terrain.heights];
  for (let y = 0; y <= size; y++) for (let x = 0; x <= size; x++) {
    const d = dist({ x, y }, center);
    if (d >= 4 && d <= 8) heights[y * (size + 1) + x] = 100;
  }
  w.terrain = { ...w.terrain, heights };
  return w;
}

describe('directionsTo', () => {
  const w = emptyWorld();

  it('answers every start and site with at least one step and a cue for each turn', () => {
    for (const from of [OFF_ROAD, site('bowl'), site('nose'), site('scrapjaw')]) {
      for (const s of SITES) {
        const steps = directionsTo(w, from, to(s.id));
        expect(steps.length).toBeGreaterThan(0);
      }
    }
  });

  it('joins the road from off the road and follows it', () => {
    const steps = directionsTo(w, OFF_ROAD, to('nose'));
    expect(steps[0].do).toBe('join');
    expect(steps[1].do).toBe('follow');
    expect(steps[steps.length - 1]).toEqual({ do: 'search', clue: { kind: 'site', id: 'nose' }, rough: false });
  });

  it('starts on the road without a join', () => {
    const [point] = nearestRoadPoints(roadNetworkOf(w), OFF_ROAD, 100, 1);
    expect(directionsTo(w, point.pos, to('nose'))[0].do).toBe('follow');
  });

  it('speaks several turns for a long route', () => {
    const steps = directionsTo(w, site('scrapjaw'), to('green-pit'));
    expect(steps.filter((s) => s.do === 'turn').length).toBeGreaterThanOrEqual(2);
    expect(steps.find((s) => s.do === 'arrive')).toEqual({ do: 'arrive', site: 'green-pit', area: false });
  });

  it('says a territory is an area', () => {
    expect(directionsTo(w, site('bowl'), to('orchard')).find((s) => s.do === 'arrive')).toEqual({ do: 'arrive', site: 'orchard', area: true });
  });

  it('changes the first step when the start changes, and not on a repeat', () => {
    const a = directionsTo(w, OFF_ROAD, to('nose'));
    const b = directionsTo(w, site('scrapjaw'), to('nose'));
    expect(a[0]).not.toEqual(b[0]);
    expect(directionsTo(w, OFF_ROAD, to('nose'))).toEqual(a);
  });

  it('gives a wreck spot off the road a leave step and a rough search', () => {
    const net = roadNetworkOf(w);
    const [road] = nearestRoadPoints(net, { x: 300, y: 300 }, 200, 1);
    const spot = { x: road.pos.x, y: road.pos.y + 30 };
    const steps = directionsTo(w, site('bowl'), { kind: 'spot', pos: spot, clue: 'wreck' });
    expect(kinds(steps).slice(-2)).toEqual(['leave', 'search']);
    expect(steps[steps.length - 1]).toEqual({ do: 'search', clue: { kind: 'wreck' }, rough: true });
  });

  it('goes straight for a spot close by', () => {
    const steps = directionsTo(w, OFF_ROAD, { kind: 'spot', pos: { x: OFF_ROAD.x + 20, y: OFF_ROAD.y }, clue: 'wreck' });
    expect(kinds(steps)).toEqual(['straight', 'search']);
  });

  it('names the gates of Nose on different sides though both face south', () => {
    const steps = directionsFromSite(w, 'nose', to('bowl'));
    expect(steps[0]).toMatchObject({ do: 'gate' });
    const sides = [...new Set(['bowl', 'granary', 'marshal-post'].map((id) => (directionsFromSite(w, 'nose', to(id))[0] as { side: string }).side))];
    expect(sides.length).toBeGreaterThan(1);
  });

  it('says there is no road when a cliff ring shuts the start in', () => {
    const pit = pitWorld(OFF_ROAD);
    expect(directionsTo(pit, OFF_ROAD, to('nose'))).toEqual([{ do: 'noRoad', octant: octantOf({ x: site('nose').x - OFF_ROAD.x, y: site('nose').y - OFF_ROAD.y }), span: spanOf(dist(OFF_ROAD, site('nose'))) }]);
  });

  it('says there is no road when a spot is behind a cliff ring', () => {
    const pit = pitWorld(OFF_ROAD);
    const steps = directionsTo(pit, site('bowl'), { kind: 'spot', pos: OFF_ROAD, clue: 'wreck' });
    expect(kinds(steps)).toEqual(['noRoad']);
  });

  it('stops after the allowed turns with askAgain', () => {
    const steps = directionsTo(w, site('scrapjaw'), to('glass-flats'));
    expect(steps.filter((s) => s.do === 'turn').length).toBeLessThanOrEqual(DIRECTIONS.maxSteps);
    expect(steps[steps.length - 1].do).toBe('askAgain');
  });

  it('never counts a fork above the third, and reports how many answers ask again', () => {
    const asks = { answers: 0, askAgain: 0 };
    for (const from of [OFF_ROAD, site('bowl'), site('nose'), site('scrapjaw'), { x: 300, y: 300 }]) {
      for (const s of SITES) {
        const steps = directionsTo(w, from, to(s.id));
        asks.answers++;
        if (steps.some((x) => x.do === 'askAgain')) asks.askAgain++;
        for (const step of steps) if (step.do === 'turn' && step.at.kind === 'fork') expect(step.at.nth).toBeLessThanOrEqual(DIRECTIONS.maxCount);
      }
    }
    console.log('ask again counts', JSON.stringify(asks));
  });

  it('holds no coordinates, meters or bearings in a step', () => {
    const text = JSON.stringify(SITES.flatMap((s) => directionsTo(w, OFF_ROAD, to(s.id))));
    expect(text).not.toMatch(/"(x|y|rad|tiles|meters)"/);
  });

  it('knows no road to a town that is not on the highway map', () => {
    const steps = directionsTo(chaosHighwayWorld(), { x: 300, y: 300 }, to('bowl'));
    expect(kinds(steps)).toEqual(['noRoad']);
  });

  it('throws on an unknown site and on a start that is not a number', () => {
    expect(() => directionsTo(w, OFF_ROAD, to('nowhere'))).toThrow();
    expect(() => directionsTo(w, { x: NaN, y: 0 }, to('nose'))).toThrow();
  });

  it('serves a haul destination as a site target from each town', () => {
    for (const town of REGION.towns) {
      for (const dest of REGION.towns.filter((t) => t.id !== town.id)) {
        const steps = directionsTo(w, town.pos, to(dest.id));
        expect(steps.find((s) => s.do === 'arrive')).toEqual({ do: 'arrive', site: dest.id, area: false });
      }
    }
  });
});

describe('headingAlong', () => {
  it('gives the way along a straight road from either end', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(headingAlong([line], DIRECTIONS.headingReach)).toBe('east');
    expect(headingAlong([[...line].reverse()], DIRECTIONS.headingReach)).toBe('west');
  });

  it('reads the stretch, not a kink right at the start', () => {
    const line = [{ x: 0, y: 0 }, { x: 0, y: 3 }, { x: 40, y: 3 }];
    expect(headingAlong([line], DIRECTIONS.headingReach)).toBe('east');
  });

  it('stops at the reach on a road that bends later', () => {
    const line = [{ x: 0, y: 0 }, { x: 0, y: -30 }, { x: 200, y: -30 }];
    expect(headingAlong([line], DIRECTIONS.headingReach)).toBe('north');
  });

  it('walks on through the next line of the leg and stops at its end', () => {
    expect(headingAlong([[{ x: 0, y: 0 }, { x: 5, y: 0 }], [{ x: 5, y: 0 }, { x: 5, y: 10 }]], DIRECTIONS.headingReach)).toBe('southEast');
  });

  it('throws on a leg with no points or no length', () => {
    expect(() => headingAlong([], DIRECTIONS.headingReach)).toThrow();
    expect(() => headingAlong([[{ x: 1, y: 1 }, { x: 1, y: 1 }]], DIRECTIONS.headingReach)).toThrow();
  });
});

describe('the heading of the first road', () => {
  const w = emptyWorld();
  const follows = (steps: DirectionStep[]) => steps.filter((s): s is Extract<DirectionStep, { do: 'follow' }> => s.do === 'follow');

  it('carries the heading from the join point after a join', () => {
    const steps = directionsTo(w, OFF_ROAD, to('nose'));
    expect(steps[1]).toMatchObject({ do: 'follow', heading: expect.any(String) });
  });

  it('says the reported start on the road heads west for Bowl', () => {
    const [point] = nearestRoadPoints(roadNetworkOf(w), { x: 283, y: 572 }, DIRECTIONS.joinReach, 1);
    const [first] = directionsTo(w, point.pos, to('bowl'));
    expect(first).toMatchObject({ do: 'follow', heading: 'west' });
  });

  it('gives every follow step of every answer a heading', () => {
    for (const from of [OFF_ROAD, site('bowl'), site('nose'), site('scrapjaw'), { x: 300, y: 300 }]) {
      for (const s of SITES) {
        for (const step of follows(directionsTo(w, from, to(s.id)))) expect(typeof step.heading).toBe('string');
      }
    }
  });
});

describe('cues', () => {
  const quiet: Vec = { x: 10, y: 10 };
  const leg = [[{ x: 10, y: 10 }, { x: 70, y: 10 }]];

  it('names a prop standing at the node', () => {
    const world = emptyWorld();
    world.obstacles = [tower('t1', { x: 72, y: 12 })];
    expect(cueAt(world, { pos: { x: 70, y: 10 }, legStart: { x: -20, y: 10 }, leg, earlier: [], forks: 1, junctionHere: true })).toEqual({ kind: 'prop', look: 'waterTower' });
  });

  it('never names a look whose twin stands on the same leg', () => {
    const world = emptyWorld();
    world.obstacles = [tower('t1', { x: 30, y: 12 }), tower('t2', { x: 72, y: 12 })];
    expect(cueAt(world, { pos: { x: 70, y: 10 }, legStart: { x: -20, y: 10 }, leg, earlier: [{ x: 30, y: 10 }], forks: 2, junctionHere: true })).toEqual({ kind: 'fork', nth: 2 });
  });

  it('says the next turn at the first junction and counts forks after that', () => {
    const world = emptyWorld();
    expect(cueAt(world, { pos: quiet, legStart: { x: -100, y: 10 }, leg, earlier: [], forks: 1, junctionHere: true })).toEqual({ kind: 'none' });
    expect(cueAt(world, { pos: quiet, legStart: { x: -100, y: 10 }, leg, earlier: [], forks: 3, junctionHere: true })).toEqual({ kind: 'fork', nth: 3 });
  });

  it('counts the second and third fork when the forks are well apart', () => {
    const world = emptyWorld();
    const spot = (earlier: Vec[], forks: number) => ({ pos: { x: 200, y: 10 }, legStart: { x: -20, y: 10 }, leg, earlier, forks, junctionHere: true });
    expect(cueAt(world, spot([{ x: 60, y: 10 }], 2))).toEqual({ kind: 'fork', nth: 2 });
    expect(cueAt(world, spot([{ x: 60, y: 10 }, { x: 130, y: 10 }], 3))).toEqual({ kind: 'fork', nth: 3 });
  });

  it('gives no cue for a fourth fork', () => {
    const world = emptyWorld();
    const earlier = [{ x: 40, y: 10 }, { x: 80, y: 10 }, { x: 120, y: 10 }];
    expect(cueAt(world, { pos: { x: 160, y: 10 }, legStart: { x: -20, y: 10 }, leg, earlier, forks: 4, junctionHere: true })).toBeNull();
  });

  it('gives no cue when two junctions sit closer than a driver can tell apart', () => {
    const world = emptyWorld();
    expect(cueAt(world, { pos: { x: 70, y: 10 }, legStart: { x: -20, y: 10 }, leg, earlier: [{ x: 60, y: 10 }], forks: 2, junctionHere: true })).toBeNull();
  });

  it('gives no cue for the next fork when it is next to the leg start', () => {
    const world = emptyWorld();
    expect(cueAt(world, { pos: { x: 70, y: 10 }, legStart: { x: 60, y: 10 }, leg, earlier: [], forks: 1, junctionHere: true })).toBeNull();
  });

  it('counts forks passed before a leave point, and keeps it plain with one or none', () => {
    const world = emptyWorld();
    const at = (earlier: Vec[], forks: number) => ({ pos: { x: 200, y: 10 }, legStart: { x: -20, y: 10 }, leg, earlier, forks, junctionHere: false });
    expect(cueAt(world, at([], 0))).toEqual({ kind: 'none' });
    expect(cueAt(world, at([{ x: 90, y: 10 }], 1))).toEqual({ kind: 'none' });
    expect(cueAt(world, at([{ x: 60, y: 10 }, { x: 130, y: 10 }], 2))).toEqual({ kind: 'fork', nth: 2 });
    expect(cueAt(world, at([{ x: 180, y: 10 }, { x: 190, y: 10 }], 2))).toBeNull();
  });

  it('prefers a site to a prop', () => {
    const world = emptyWorld();
    const bowl = REGION.towns[0];
    world.obstacles = [tower('t1', { x: bowl.pos.x + bowl.radius, y: bowl.pos.y })];
    const cue = cueAt(world, { pos: { x: bowl.pos.x + bowl.radius, y: bowl.pos.y }, legStart: { x: bowl.pos.x - 200, y: bowl.pos.y }, leg: [], earlier: [], forks: 1, junctionHere: true });
    expect(cue).toEqual({ kind: 'site', id: bowl.id });
  });
});

describe('following the steps', () => {
  const w = emptyWorld();
  const grid: Vec[] = [];
  for (let i = 0; i < 40; i++) grid.push({ x: 30 + (i % 8) * 70, y: 40 + Math.floor(i / 8) * 110 });

  it('reaches every site from a grid of starts', () => {
    const misses: string[] = [];
    let cues: Record<string, number> = {};
    for (const from of grid) {
      for (const s of SITES) {
        const steps = directionsTo(w, from, to(s.id));
        if (steps.some((x) => x.do === 'askAgain' || x.do === 'noRoad')) continue;
        for (const step of steps) if (step.do === 'turn') cues[step.at.kind] = (cues[step.at.kind] ?? 0) + 1;
        const result = followSteps(w, from, steps, { site: s.id });
        if (!result.reached) misses.push(`${from.x},${from.y} -> ${s.id}`);
      }
    }
    console.log('cue coverage', JSON.stringify(cues));
    expect(misses).toEqual([]);
  });

  it('never gives a first road whose name and heading fit two exits', () => {
    const answers = grid.flatMap((from) => SITES.map((s) => ({ from, steps: directionsTo(w, from, to(s.id)) })));
    const ambiguous = ambiguousStarts(w, answers);
    console.log('ambiguous first roads', ambiguous.length, 'of', answers.length);
    expect(ambiguous).toEqual([]);
  });

  it('gets near each wreck spot off the road', () => {
    const net = roadNetworkOf(w);
    const spots = [0, 3, 6, 9, 12].map((k) => {
      const edge = net.edges[Math.min(k * 3, net.edges.length - 1)];
      const p = edge.points[Math.floor(edge.points.length / 2)];
      return { x: p.x + 25, y: p.y + 25 };
    });
    for (const spot of spots) {
      for (const from of [site('bowl'), site('nose'), OFF_ROAD]) {
        const steps = directionsTo(w, from, { kind: 'spot', pos: spot, clue: 'wreck' });
        if (!steps.some((s) => s.do === 'leave')) continue;
        expect(followSteps(w, from, steps, { spot }).closest).toBeLessThanOrEqual(DIRECTIONS.leaveReach);
      }
    }
  });
});

describe('lean', () => {
  const deg = (d: number): Vec => ({ x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180) });

  it('is null within a half step of the told octant', () => {
    expect(leanOf(deg(90), 'south')).toBeNull();
    expect(leanOf(deg(100), 'south')).toBeNull();
    expect(leanOf(deg(80), 'south')).toBeNull();
  });

  it('leans a cardinal octant toward the perpendicular cardinal on the side of the miss', () => {
    expect(leanOf(deg(70), 'south')).toBe('east');
    expect(leanOf(deg(110), 'south')).toBe('west');
    expect(leanOf(deg(-20), 'east')).toBe('north');
    expect(leanOf(deg(20), 'east')).toBe('south');
  });

  it('leans a diagonal octant toward the cardinal on the side of the miss', () => {
    expect(leanOf(deg(60), 'southEast')).toBe('south');
    expect(leanOf(deg(30), 'southEast')).toBe('east');
    expect(leanOf(deg(-60), 'northEast')).toBe('north');
  });

  it('names the cardinal side of a vector', () => {
    expect(cardinalOf(deg(10))).toBe('east');
    expect(cardinalOf(deg(100))).toBe('south');
    expect(cardinalOf(deg(-100))).toBe('north');
    expect(cardinalOf(deg(170))).toBe('west');
  });
});

describe('directionsFromSite', () => {
  const w = emptyWorld();
  const place = (pos: Vec): DirectionTarget => ({ kind: 'spot', pos, clue: 'place' });

  it('ends a place way on the leave step with no search step', () => {
    const net = roadNetworkOf(w);
    const [road] = nearestRoadPoints(net, { x: 300, y: 300 }, 200, 1);
    const steps = directionsFromSite(w, 'bowl', place({ x: road.pos.x, y: road.pos.y + 30 }));
    expect(steps.some((s) => s.do === 'search')).toBe(false);
    expect(steps[steps.length - 1].do).toBe('leave');
  });

  it('starts a two-gate town with a gate step and a one-gate town without', () => {
    const spot = place({ x: site('bowl').x + 40, y: site('bowl').y - 30 });
    expect(directionsFromSite(w, 'bowl', spot)[0].do).toBe('gate');
    expect(directionsFromSite(w, 'scrapjaw', spot)[0].do).not.toBe('gate');
  });

  it('gives two Bowl gates different first sentences', () => {
    const gates = roadNetworkOf(w).nodes.filter((n) => n.site === 'bowl' && roadNetworkOf(w).incident[n.id].length > 0);
    expect(new Set(gates.map((g) => cardinalOf({ x: g.pos.x - site('bowl').x, y: g.pos.y - site('bowl').y }))).size).toBe(gates.length);
  });

  it('throws for a territory and an unknown site', () => {
    const territory = SITES.find((s) => isTerritory(s));
    if (territory) expect(() => directionsFromSite(w, territory.id, place(site('nose')))).toThrow();
    expect(() => directionsFromSite(w, 'nowhere', place(site('nose')))).toThrow();
  });

  it('is the same twice and leaves the world as it was', () => {
    const spot = place({ x: site('nose').x + 90, y: site('nose').y + 10 });
    const before = JSON.stringify(w.player);
    const a = directionsFromSite(w, 'nose', spot);
    expect(directionsFromSite(w, 'nose', spot)).toEqual(a);
    expect(JSON.stringify(w.player)).toBe(before);
  });

  it('reaches a wreck spot 80 tiles off the road with a leave step', () => {
    const net = roadNetworkOf(w);
    const edge = net.edges[Math.floor(net.edges.length / 3)];
    const p = edge.points[Math.floor(edge.points.length / 2)];
    const found = [{ x: p.x + 80, y: p.y }, { x: p.x - 80, y: p.y }, { x: p.x, y: p.y + 80 }, { x: p.x, y: p.y - 80 }].map((spot) => directionsTo(w, site('bowl'), { kind: 'spot', pos: spot, clue: 'wreck' }));
    expect(found.some((steps) => steps.some((s) => s.do === 'leave'))).toBe(true);
  });
});
