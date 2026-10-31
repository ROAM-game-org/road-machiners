import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../data/physics';
import { BROKEN_WING, BROKEN_WING_POINT, REGION } from '../../data/region';
import { START_KITS } from '../../data/start';
import { BREAKABLE } from '../../data/rules';
import { TERRAIN_TYPES } from '../../data/terrain';
import { deckById } from '../bridge';
import { boxDistance, boxSegmentDistance, isBreakable, propBoxes } from '../mapgen';
import { perfSnapshot } from '../../perf';
import { route } from '../path';
import type { Obstacle, World } from '../types';
import { dist, type Vec } from '../vec';
import { stampOverlay } from './astar';
import { CELL, CLEARANCE, climbTaste, cutTaste, dynamicBlockers, makeTaste, navLayer, type NavLayer, tasteAt, tasted, tasteKey, tasteOf, terrainNav, tileIndex } from './layer';
import { editableTerrain, emptyWorld, npcBrain } from '../testkit';
import { newWorld } from '../world';
import { TEST_MAP } from '../../test/map';
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

describe('cut taste', () => {
  const nav = () => {
    const w = emptyWorld();
    const t = editableTerrain(w);
    for (let i = 0; i < t.types.length; i++) t.types[i] = i % t.size < 100 ? 'road' : 'hardpan';
    return terrainNav(t);
  };

  it('keeps open ground between the road cost and the plain open cost, never under a road tile', () => {
    const { offRoadCost, shortcutCost } = REGION.navigation;
    const openSpeeds = Object.values(TERRAIN_TYPES).filter((type) => type.id !== 'road').map((type) => type.speed);
    expect(shortcutCost).toBeGreaterThanOrEqual(Math.max(...openSpeeds));
    expect(shortcutCost).toBeLessThan(offRoadCost);
  });

  it('prices open tiles at the shortcut share of the plain price and leaves road tiles alone', () => {
    const n = nav();
    const plain = makeTaste(3, n.size);
    const cut = cutTaste(plain, n);
    const open = tasted(cut, 10, 150.5, 20.5) / tasted(plain, 10, 150.5, 20.5);
    expect(open).toBeCloseTo(REGION.navigation.shortcutCost / REGION.navigation.offRoadCost, 6);
    expect(tasted(cut, 10, 50.5, 20.5)).toBe(tasted(plain, 10, 50.5, 20.5));
  });

  it('builds the mask once per terrain and keeps cut routes apart in the cache', () => {
    const n = nav();
    const plain = makeTaste(3, n.size);
    expect(cutTaste(plain, n).cut).toBe(cutTaste(plain, n).cut);
    expect(tasteKey(cutTaste(plain, n))).not.toBe(tasteKey(plain));
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

  const prop = (id: string, look: 'fence' | 'junk', x: number, y: number, yaw: number): Obstacle => ({ id, pos: { x, y }, r: 0.5, kind: 'landmark', look, yaw });

  function line(name: string, from: Vec, step: Vec, count: number, yaw: number): Obstacle[] {
    return Array.from({ length: count }, (_, k) => prop(`${name}-${k}`, 'fence', from.x + step.x * k, from.y + step.y * k, yaw));
  }

  function patchField(): Obstacle[] {
    const shack: Obstacle = { id: 'shack-field', pos: { x: 47.1, y: 44.2 }, r: 0.9, kind: 'landmark', look: 'shack', yaw: 0 };
    return [
      ...line('up', { x: 40.2, y: 36.3 }, { x: 0, y: 0.9 }, 10, Math.PI / 2),
      ...line('across', { x: 35.3, y: 40.3 }, { x: 0.9, y: 0 }, 10, 0),
      ...line('border', { x: 63.8, y: 60.3 }, { x: 0.3, y: 0.9 }, 6, Math.PI / 2),
      prop('junk-border', 'junk', 64.1, 62.2, 0),
      prop('junk-corner', 'junk', 55.9, 51.9, 0),
      prop('junk-far', 'junk', 20.2, 20.3, 0),
      ...line('twin', { x: 40.2, y: 37.1 }, { x: 0, y: 1.8 }, 4, Math.PI / 2),
      shack,
    ];
  }

  const field = patchField();
  const w = emptyWorld();
  const without = (gone: string[], list: Obstacle[] = field) => list.filter((o) => !gone.includes(o.id));
  const goneSet = ['up-3', 'across-4', 'border-2', 'junk-border', 'twin-1'];

  function freshLayer(copy: World['terrain'], obstacles: Obstacle[], radius: number) {
    return navLayer(copy, obstacles, radius);
  }

  function differsAt(a: ArrayLike<number>, b: ArrayLike<number>): number {
    if (a.length !== b.length) return -2;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
    return -1;
  }

  function expectSameLayer(a: NavLayer, b: NavLayer) {
    expect(differsAt(a.slow, b.slow)).toBe(-1);
    expect(differsAt(a.blocked, b.blocked)).toBe(-1);
    expect(differsAt(a.coarse.slow, b.coarse.slow)).toBe(-1);
    expect(differsAt(a.coarse.region, b.coarse.region)).toBe(-1);
    expect(a.coarse.comp).toEqual(b.coarse.comp);
    expect(a.coarse.edges).toEqual(b.coarse.edges);
  }

  function warmed(list: Obstacle[] = field) {
    return radii.map((r) => navLayer(w.terrain, list, r));
  }

  it('a break patches the layer to equal a fresh build', () => {
    warmed();
    const rest = without(goneSet);
    const copy = { ...w.terrain };
    const patchesBefore = patches();
    const buildsBefore = builds();
    const patched = radii.map((r) => navLayer(w.terrain, rest, r));

    expect(patches() - patchesBefore).toBe(radii.length);
    expect(builds()).toBe(buildsBefore);
    radii.forEach((r, i) => expectSameLayer(patched[i], freshLayer(copy, rest, r)));
  }, budget(30_000));

  it('a regrown prop at the end of the list patches back to the costs before the break', () => {
    const before = warmed();
    const rest = without(goneSet);
    radii.forEach((r) => navLayer(w.terrain, rest, r));
    const regrown = [...rest, ...field.filter((o) => goneSet.includes(o.id)).reverse()];
    const copy = { ...w.terrain };
    const patchesBefore = patches();
    const again = radii.map((r) => navLayer(w.terrain, regrown, r));

    expect(patches() - patchesBefore).toBe(radii.length);
    radii.forEach((r, i) => {
      expectSameLayer(again[i], freshLayer(copy, regrown, r));
      expect(differsAt(again[i].slow, before[i].slow)).toBe(-1);
    });
  }, budget(30_000));

  it('routes on a patched layer equal routes on a fresh build', () => {
    warmed();
    const rest = without(goneSet);
    const patchedWorld: World = { ...w, obstacles: rest };
    radii.forEach((r) => navLayer(w.terrain, rest, r));
    const copy: World = { ...w, obstacles: rest, terrain: { ...w.terrain } };
    const spots = field.filter((o) => goneSet.includes(o.id)).map((o) => o.pos);
    const pairs = spots.flatMap((p, i) => [
      [{ x: p.x - 6, y: p.y - 4 }, { x: p.x + 6, y: p.y + 4 }],
      [p, spots[(i + 1) % spots.length]],
    ]);
    const brain = npcBrain('trader', { x: 0, y: 0 }, ['trader']);
    const drivers = [undefined, { ...w.vehicles[0], id: 'v-driver', brain }];

    for (const [from, to] of pairs) {
      for (const r of radii) for (const driver of drivers) {
        expect(route(patchedWorld, from, to, r, [], driver)).toEqual(route(copy, from, to, r, [], driver));
      }
    }
  }, budget(30_000));

  it('a patch leaves the old layer untouched', () => {
    const before = warmed();
    const slow = before.map((l) => l.slow.slice());
    const coarse = before.map((l) => l.coarse.slow.slice());
    const rest = without(goneSet);
    radii.forEach((r) => navLayer(w.terrain, rest, r));

    before.forEach((l, i) => {
      expect(differsAt(l.slow, slow[i])).toBe(-1);
      expect(differsAt(l.coarse.slow, coarse[i])).toBe(-1);
    });
  }, budget(30_000));

  it('the base survives a full layer cache', () => {
    navLayer(w.terrain, field, 0.6);
    const breakables = field.filter(isBreakable);
    for (let k = 0; k < 17; k++) navLayer(w.terrain, without([breakables[k].id]), 0.8);
    const patchesBefore = patches();
    const rest = without([breakables[20].id]);
    const layer = navLayer(w.terrain, rest, 0.6);

    expect(patches()).toBe(patchesBefore + 1);
    expectSameLayer(layer, freshLayer({ ...w.terrain }, rest, 0.6));
  }, budget(30_000));

  it('a solid change builds in full', () => {
    warmed();
    const shack: Obstacle = { id: 'shack-patch', pos: { x: 60.2, y: 30.3 }, r: 0.9, kind: 'landmark', look: 'shack', yaw: 0 };
    const withShack = [...without(['up-1']), shack];
    const buildsBefore = builds();
    const layer = navLayer(w.terrain, withShack, 0.5);

    expect(builds()).toBe(buildsBefore + 1);
    expectSameLayer(layer, freshLayer({ ...w.terrain }, withShack, 0.5));
  }, budget(30_000));
});
