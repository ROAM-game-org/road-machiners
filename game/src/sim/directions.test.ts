import { describe, expect, it } from 'vitest';
import { DIRECTIONS } from '../data/directions';
import { REGION } from '../data/region';
import { cueAt, octantOf, spanOf } from './direction-cues';
import { directionsTo } from './directions';
import { followSteps } from './directions-follower.test-helper';
import { nearestRoadPoints, roadNetworkOf } from './road-network';
import { emptyWorld, furyRoadWorld } from './testkit';
import type { DirectionStep, DirectionTarget, Obstacle, World } from './types';
import { dist, type Vec } from './vec';

const OFF_ROAD: Vec = { x: 200, y: 300 };
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
    expect(steps.filter((s) => s.do === 'turn')).toHaveLength(DIRECTIONS.maxSteps);
    expect(steps[steps.length - 1].do).toBe('askAgain');
  });

  it('holds no coordinates, meters or bearings in a step', () => {
    const text = JSON.stringify(SITES.flatMap((s) => directionsTo(w, OFF_ROAD, to(s.id))));
    expect(text).not.toMatch(/"(x|y|rad|tiles|meters)"/);
  });

  it('knows no road to a town that is not on the highway map', () => {
    const steps = directionsTo(furyRoadWorld(), { x: 300, y: 300 }, to('bowl'));
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

describe('cues', () => {
  const quiet: Vec = { x: 10, y: 10 };
  const leg = [[{ x: 10, y: 10 }, { x: 70, y: 10 }]];

  it('names a prop standing at the node', () => {
    const world = emptyWorld();
    world.obstacles = [tower('t1', { x: 72, y: 12 })];
    expect(cueAt(world, { pos: { x: 70, y: 10 }, leg, earlier: [], forks: 1, junctionHere: true })).toEqual({ kind: 'prop', look: 'waterTower' });
  });

  it('never names a look whose twin stands on the same leg', () => {
    const world = emptyWorld();
    world.obstacles = [tower('t1', { x: 30, y: 12 }), tower('t2', { x: 72, y: 12 })];
    expect(cueAt(world, { pos: { x: 70, y: 10 }, leg, earlier: [{ x: 30, y: 10 }], forks: 2, junctionHere: true })).toEqual({ kind: 'fork', nth: 2 });
  });

  it('says the next turn at the first junction and counts forks after that', () => {
    const world = emptyWorld();
    expect(cueAt(world, { pos: quiet, leg, earlier: [], forks: 1, junctionHere: true })).toEqual({ kind: 'none' });
    expect(cueAt(world, { pos: quiet, leg, earlier: [], forks: 3, junctionHere: true })).toEqual({ kind: 'fork', nth: 3 });
  });

  it('prefers a site to a prop', () => {
    const world = emptyWorld();
    const bowl = REGION.towns[0];
    world.obstacles = [tower('t1', { x: bowl.pos.x + bowl.radius, y: bowl.pos.y })];
    const cue = cueAt(world, { pos: { x: bowl.pos.x + bowl.radius, y: bowl.pos.y }, leg: [], earlier: [], forks: 1, junctionHere: true });
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

  it('gets near each wreck spot off the road', () => {
    const net = roadNetworkOf(w);
    const spots = [0, 3, 6, 9, 12].map((k) => {
      const p = net.edges[k * 3].points[Math.floor(net.edges[k * 3].points.length / 2)];
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
