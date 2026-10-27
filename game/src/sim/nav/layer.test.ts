import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../data/physics';
import { BROKEN_WING, BROKEN_WING_POINT, REGION } from '../../data/region';
import { START_KITS } from '../../data/start';
import { BREAKABLE } from '../../data/rules';
import { deckById } from '../bridge';
import { boxDistance, boxSegmentDistance, isBreakable, propBoxes } from '../mapgen';
import { perfSnapshot } from '../../perf';
import { route } from '../path';
import type { Obstacle, World } from '../types';
import { dist, type Vec } from '../vec';
import { stampOverlay } from './astar';
import { CELL, CLEARANCE, climbTaste, dynamicBlockers, makeTaste, navLayer, type NavLayer, tasteAt, tasted, tasteKey, tasteOf, terrainNav, tileIndex } from './layer';
import { editableTerrain, emptyWorld, npcBrain } from '../testkit';
import { newWorld } from '../world';
import { TEST_MAP } from '../../test/map';
import { standardWorld } from '../../test/world-cache';
import { budget } from '../../test/budget';
import { defaultSetup } from '../settings';

const { scale, strength } = REGION.navigation.taste;

describe('climb taste', () => {
  function sloped() {
    const w = emptyWorld();
    const t = editableTerrain(w);
    const n = t.size + 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) t.heights[j * n + i] = Math.max(0, i - 50) * 0.4;
    return terrainNav(t);
  }

  it('stores the steepness of each tile', () => {
    const nav = sloped();
    expect(nav.steep[tileIndex(nav.size, 10, 10)]).toBe(0);
    expect(nav.steep[tileIndex(nav.size, 60, 10)]).toBeCloseTo(0.4, 3);
  });

  it('multiplies cost only on tiles steeper than the limit', () => {
    const nav = sloped();
    const taste = climbTaste(null, nav, 0.3)!;
    expect(tasted(taste, 1, 10, 10)).toBe(1);
    expect(tasted(taste, 1, 60, 10)).toBe(REGION.navigation.overClimbCost);
    expect(tasted(climbTaste(null, nav, 0.45), 1, 60, 10)).toBe(1);
  });

  it('leaves a truck that climbs every walkable slope with its taste untouched', () => {
    const nav = sloped();
    const taste = makeTaste(3, nav.size);
    expect(climbTaste(taste, nav, 0.6)).toBe(taste);
    expect(climbTaste(null, nav, 0.6)).toBeNull();
  });

  it('keys the route cache by the limit', () => {
    const nav = sloped();
    expect(tasteKey(climbTaste(null, nav, 0.3))).not.toBe(tasteKey(climbTaste(null, nav, 0.35)));
  });
});

describe('route taste', () => {
  it('multiplies cost by 1 - strength / 2 to 1 + strength / 2 everywhere on the map', () => {
    const t = makeTaste(7, 600);
    for (let y = 0; y <= 600; y += 3.7)
      for (let x = 0; x <= 600; x += 3.7) {
        const v = tasteAt(t, x, y);
        expect(v).toBeGreaterThanOrEqual(1 - strength / 2);
        expect(v).toBeLessThanOrEqual(1 + strength / 2);
      }
  });

  it('changes smoothly, so neighbouring tiles cost nearly the same', () => {
    const t = makeTaste(7, 600);
    let biggest = 0;
    for (let x = 0; x < 600; x += 0.5) biggest = Math.max(biggest, Math.abs(tasteAt(t, x + 0.5, 123) - tasteAt(t, x, 123)));
    expect(biggest).toBeLessThanOrEqual((1.5 * strength * 0.5) / scale);
  });

  it('differs between drivers and stays the same for one driver', () => {
    const w = emptyWorld();
    const brain = npcBrain('trader', { x: 0, y: 0 }, ['trader']);
    const a = tasteOf(w, { id: 'v12', brain })!;
    const b = tasteOf(w, { id: 'v13', brain })!;
    expect(tasteOf(w, { id: 'v12', brain })!.values).toEqual(a.values);
    expect(b.values).not.toEqual(a.values);
  });

  it('gives the player and brainless vehicles no taste', () => {
    expect(tasteOf(emptyWorld(), { id: 'v1', brain: null })).toBeNull();
  });
});

describe('prop footprints', () => {
  const S = PHYSICS.metersPerTile;
  const radius = 0.2;
  const cellAt = (n: number, p: Vec) => Math.floor(p.y / CELL) * n + Math.floor(p.x / CELL);
  const center = (p: Vec) => ({ x: (Math.floor(p.x / CELL) + 0.5) * CELL, y: (Math.floor(p.y / CELL) + 0.5) * CELL });

  const ruin: Obstacle = { id: 'ruin-0', pos: { x: 40.2, y: 40.3 }, r: 2.4, kind: 'landmark', look: 'ruin', yaw: 0 };
  const courtyard = center({ x: 40.2 + (-1.8 * 2) / S, y: 40.3 - (0.75 * 2) / S });
  const westWall = center({ x: 40.2 + (-4 * 2) / S, y: 40.3 });

  it('stamps a ruin by its walls, so its courtyard stays open where a circle would close it', () => {
    const w = emptyWorld();
    w.obstacles = [ruin];
    const layer = navLayer(w.terrain, w.obstacles, radius);

    expect(dist(courtyard, ruin.pos)).toBeLessThan(ruin.r);
    expect(layer.blocked[cellAt(layer.n, courtyard)]).toBe(0);
    expect(layer.blocked[cellAt(layer.n, westWall)]).toBe(1);
  });

  it('stamps a road or kill wreck by its boxes too', () => {
    const w = emptyWorld();
    w.obstacles = [{ id: 'wreck9', pos: { x: 40.2, y: 40.3 }, r: 1.2, kind: 'wreck' }];
    const layer = navLayer(w.terrain, w.obstacles, radius);
    const overlay = stampOverlay(layer, dynamicBlockers(w.obstacles, w.terrain, []), radius);
    const boxes = propBoxes(w.obstacles[0]);
    const near = (p: Vec) => boxes.some((b) => boxDistance(b, p) < radius + CLEARANCE);

    let stamped = 0;
    const wrong: number[] = [];
    for (let c = 0; c < layer.n * layer.n; c++) {
      const p = { x: ((c % layer.n) + 0.5) * CELL, y: (Math.floor(c / layer.n) + 0.5) * CELL };
      const isNear = near(p);
      if ((overlay.stamp[c] === overlay.gen) !== isNear) wrong.push(c);
      if (isNear) stamped++;
    }
    expect(wrong).toEqual([]);
    expect(stamped).toBeGreaterThan(0);
  });

  it('leaves the Broken Wing road under the hoop and along the deck open, and blocks the hoop feet and the deck rails', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const layer = navLayer(w.terrain, w.obstacles, radius);
    const hoop = w.obstacles.find((o) => o.kind === 'landmark' && o.look === 'shipWing');
    if (hoop === undefined) throw new Error('The baked map has no hoop');
    const roof = propBoxes(hoop).filter((b) => b.z0 >= PHYSICS.truckClearance);
    const open = REGION.roadWidth / 2 - radius - CLEARANCE;
    for (const along of [-1, 0, 1]) {
      for (const across of [-open, 0, open]) {
        const spot = center(BROKEN_WING_POINT(BROKEN_WING.hoopAt + along, across));
        expect(roof.some((b) => boxDistance(b, spot) === 0)).toBe(true);
        expect(layer.blocked[cellAt(layer.n, spot)]).toBe(0);
      }
    }
    for (const foot of [{ x: -4, y: -19 }, { x: 4, y: 17 }]) {
      expect(layer.blocked[cellAt(layer.n, { x: hoop.pos.x + foot.x / S, y: hoop.pos.y - foot.y / S })]).toBe(1);
    }
    const deck = deckById('broken-wing');
    for (let along = -BROKEN_WING.deckHalf + 1; along <= BROKEN_WING.deckHalf - 1; along += 1) {
      expect(layer.blocked[cellAt(layer.n, BROKEN_WING_POINT(along, 0))]).toBe(0);
      for (const side of [-1, 1]) expect(layer.blocked[cellAt(layer.n, BROKEN_WING_POINT(along, (side * deck.width) / 2))]).toBe(1);
    }
  }, budget(60_000));

  it('leaves the ground under a canopy open', () => {
    const w = emptyWorld();
    const spot = { x: 40.25, y: 40.25 };
    const station: Obstacle = { id: 'gasStation-0', pos: { x: spot.x + 3.1 / S, y: spot.y - 4.8 / S }, r: (7.2 * 3) / S, kind: 'landmark', look: 'gasStation', yaw: 0 };
    w.obstacles = [station];
    const layer = navLayer(w.terrain, w.obstacles, radius);
    const roof = propBoxes(station).filter((b) => b.z0 >= PHYSICS.truckClearance);

    expect(roof.some((b) => boxDistance(b, spot) === 0)).toBe(true);
    expect(layer.blocked[cellAt(layer.n, spot)]).toBe(0);
  });

  it('builds a new layer when a prop turns in place', () => {
    const w = emptyWorld();
    w.obstacles = [ruin];
    const before = navLayer(w.terrain, w.obstacles, radius);
    w.obstacles = [{ ...ruin, yaw: 1 }];

    expect(navLayer(w.terrain, w.obstacles, radius) === before).toBe(false);
  });
});

describe('breakable props', () => {
  const radius = 0.6;
  const grow = radius + CLEARANCE;
  const cellAt = (n: number, p: Vec) => Math.floor(p.y / CELL) * n + Math.floor(p.x / CELL);

  const fenceAt = (id: string, pos: Vec): Obstacle => ({ id, pos, r: 0.5, kind: 'landmark', look: 'fence', yaw: Math.PI / 2 });

  function fenceLine(x: number, y: number, half: number): Obstacle[] {
    const count = Math.ceil((2 * half) / 0.95) + 1;
    return Array.from({ length: count }, (_, k) => fenceAt(`fence-${k}`, { x, y: y - half + (2 * half * k) / (count - 1) }));
  }

  function crosses(fences: Obstacle[], from: Vec, points: Vec[]): boolean {
    let prev = from;
    for (const p of points) {
      if (fences.some((f) => propBoxes(f).some((b) => boxSegmentDistance(b, prev, p) === 0))) return true;
      prev = p;
    }
    return false;
  }

  it('stamps a fence as costly cells, not blocked ones', () => {
    const w = emptyWorld();
    const fence = fenceAt('fence-0', { x: 40.2, y: 40.3 });
    w.obstacles = [fence];
    const open = navLayer(w.terrain, [], radius);
    const layer = navLayer(w.terrain, w.obstacles, radius);
    const cell = cellAt(layer.n, fence.pos);

    expect(layer.blocked[cell]).toBe(0);
    expect(layer.slow[cell]).toBeCloseTo(open.slow[cell] * BREAKABLE.routeCost);
  });

  it('keeps a shack blocked', () => {
    const w = emptyWorld();
    const shack: Obstacle = { id: 'shack-0', pos: { x: 40.2, y: 40.3 }, r: 0.9, kind: 'landmark', look: 'shack', yaw: 0 };
    w.obstacles = [shack];
    const layer = navLayer(w.terrain, w.obstacles, radius);

    expect(layer.blocked[cellAt(layer.n, shack.pos)]).toBe(1);
  });

  const crossExtra = (2 * grow + 0.1) * (BREAKABLE.routeCost - 1);
  const halfFor = (gap: number, extra: number) => Math.sqrt(((2 * gap + extra) / 2) ** 2 - gap ** 2) - grow;

  it('goes around a short fence line, whose detour costs less than crossing', () => {
    const w = emptyWorld();
    const gap = 6;
    w.obstacles = fenceLine(60, 60, halfFor(gap, crossExtra / 2));
    const from = { x: 60 - gap, y: 60 };

    expect(crosses(w.obstacles, from, route(w, from, { x: 60 + gap, y: 60 }, radius, []))).toBe(false);
  });

  it('crosses a long fence line, whose detour costs more than crossing', () => {
    const w = emptyWorld();
    const gap = 6;
    w.obstacles = fenceLine(60, 120, halfFor(gap, crossExtra * 2));
    const from = { x: 60 - gap, y: 120 };

    expect(crosses(w.obstacles, from, route(w, from, { x: 60 + gap, y: 120 }, radius, []))).toBe(true);
  });

  it('builds a new layer when a fence breaks in place and the same one when it grows back', () => {
    const w = emptyWorld();
    const fence = fenceAt('fence-0', { x: 40.2, y: 40.3 });
    const other = fenceAt('fence-1', { x: 80.2, y: 80.3 });
    w.obstacles = [fence];
    const whole = navLayer(w.terrain, w.obstacles, radius);
    w.obstacles = [other];
    const broken = navLayer(w.terrain, w.obstacles, radius);
    w.obstacles = [fence];

    expect(broken === whole).toBe(false);
    expect(broken.slow[cellAt(broken.n, fence.pos)]).toBeCloseTo(whole.slow[cellAt(whole.n, fence.pos)] / BREAKABLE.routeCost);
    expect(navLayer(w.terrain, w.obstacles, radius)).toBe(whole);
  });
});

describe('patched layers', () => {
  const radii = [0.5, 0.7, 0.9];
  const patches = () => perfSnapshot()['nav-layer-patch']?.calls ?? 0;
  const builds = () => perfSnapshot()['nav-layer-build']?.calls ?? 0;

  function breakablesOf(w: World): Obstacle[] {
    return w.obstacles.filter(isBreakable);
  }

  function pickSpread(w: World): Obstacle[] {
    const all = breakablesOf(w);
    const picks = [0.1, 0.3, 0.5, 0.7, 0.9].map((share) => all[Math.floor(all.length * share)]);
    const near = all.find((o) => o !== picks[0] && dist(o.pos, picks[0].pos) < 3);
    return near ? [...picks, near] : picks;
  }

  function without(w: World, gone: Obstacle[]): Obstacle[] {
    return w.obstacles.filter((o) => !gone.includes(o));
  }

  function freshLayer(w: World, obstacles: Obstacle[], radius: number) {
    return navLayer({ ...w.terrain }, obstacles, radius);
  }

  function expectSameLayer(a: NavLayer, b: NavLayer) {
    expect(a.slow).toEqual(b.slow);
    expect(a.blocked).toEqual(b.blocked);
    expect(a.coarse.slow).toEqual(b.coarse.slow);
    expect(a.coarse.region).toEqual(b.coarse.region);
    expect(a.coarse.comp).toEqual(b.coarse.comp);
    expect(a.coarse.edges).toEqual(b.coarse.edges);
  }

  function warmed(seed: number) {
    const w = standardWorld(seed);
    const before = radii.map((r) => navLayer(w.terrain, w.obstacles, r));
    return { w, before };
  }

  it('a break patches the layer to equal a fresh build', () => {
    const { w } = warmed(11);
    const gone = pickSpread(w);
    expect(gone.length).toBeGreaterThanOrEqual(5);
    const rest = without(w, gone);
    const patchesBefore = patches();
    const buildsBefore = builds();
    const patched = radii.map((r) => navLayer(w.terrain, rest, r));

    expect(patches() - patchesBefore).toBe(radii.length);
    expect(builds()).toBe(buildsBefore);
    radii.forEach((r, i) => expectSameLayer(patched[i], freshLayer(w, rest, r)));
  }, budget(120_000));

  it('a regrown prop at the end of the list patches back to the costs before the break', () => {
    const { w, before } = warmed(12);
    const gone = pickSpread(w);
    const rest = without(w, gone);
    radii.forEach((r) => navLayer(w.terrain, rest, r));
    const regrown = [...rest, ...gone.slice().reverse()];
    const patchesBefore = patches();
    const again = radii.map((r) => navLayer(w.terrain, regrown, r));

    expect(patches() - patchesBefore).toBe(radii.length);
    radii.forEach((r, i) => {
      expectSameLayer(again[i], freshLayer(w, regrown, r));
      expect(again[i].slow).toEqual(before[i].slow);
    });
  }, budget(120_000));

  it('routes on a patched layer equal routes on a fresh build', () => {
    const { w } = warmed(13);
    const gone = pickSpread(w);
    const rest = without(w, gone);
    const patchedWorld: World = { ...w, obstacles: rest };
    radii.forEach((r) => navLayer(w.terrain, rest, r));
    const copy: World = { ...w, obstacles: rest, terrain: { ...w.terrain } };
    const spots = gone.map((o) => o.pos);
    const pairs = spots.flatMap((p, i) => [
      [{ x: p.x - 6, y: p.y - 4 }, { x: p.x + 6, y: p.y + 4 }],
      [p, spots[(i + 1) % spots.length]],
    ]);
    const drivers = [undefined, w.vehicles.find((v) => v.brain)];

    for (const [from, to] of pairs) {
      for (const r of radii) for (const driver of drivers) {
        expect(route(patchedWorld, from, to, r, [], driver)).toEqual(route(copy, from, to, r, [], driver));
      }
    }
  }, budget(120_000));

  it('a patch leaves the old layer untouched', () => {
    const { w, before } = warmed(14);
    const slow = before.map((l) => l.slow.slice());
    const coarse = before.map((l) => l.coarse.slow.slice());
    const rest = without(w, pickSpread(w));
    radii.forEach((r) => navLayer(w.terrain, rest, r));

    before.forEach((l, i) => {
      expect(l.slow).toEqual(slow[i]);
      expect(l.coarse.slow).toEqual(coarse[i]);
    });
  }, budget(120_000));

  it('the base survives a full layer cache', () => {
    const { w } = warmed(15);
    const all = breakablesOf(w);
    for (let k = 0; k < 20; k++) navLayer(w.terrain, without(w, [all[k]]), 0.5 + 0.01 * k);
    const patchesBefore = patches();
    const rest = without(w, [all[40]]);
    const layer = navLayer(w.terrain, rest, 0.5);

    expect(patches()).toBe(patchesBefore + 1);
    expectSameLayer(layer, freshLayer(w, rest, 0.5));
  }, budget(120_000));

  it('a solid change builds in full', () => {
    const { w } = warmed(16);
    const shack: Obstacle = { id: 'shack-patch', pos: { x: 60.2, y: 60.3 }, r: 0.9, kind: 'landmark', look: 'shack', yaw: 0 };
    const withShack = [...without(w, pickSpread(w).slice(0, 1)), shack];
    const buildsBefore = builds();
    const layer = navLayer(w.terrain, withShack, 0.5);

    expect(builds()).toBe(buildsBefore + 1);
    expectSameLayer(layer, freshLayer(w, withShack, 0.5));
  }, budget(120_000));
});
