import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { HIGHWAY } from '../data/modes';
import { TERRAIN } from '../data/terrain';
import { atlasOf } from './atlas';
import { fortressProps } from './fortress';
import { FORTRESS, FORTRESS_STYLES } from '../data/fortress';
import { deckAt } from './bridge';
import { acrossOf, bendCells, centerU, fromRoad, highwayAtlas, highwayMap, milestoneAt, nearestMilestone, outpostFort, outpostGateSpots, outpostYardHalf, roadAt, roadHeading, roadHeight, roadPoint, roadVector, stretchLength, stretchOf, toRoad, windowShift, windowSpan } from './highway';
import { isBakedObstacle, mapObstacles } from './mapgen';
import { sceneAt } from './road-hazards';
import { sitePads } from './sites';
import { CELL, componentOf, navLayer } from './nav/layer';
import { groundAt, heightAt, isCliff, type BakedMap, type BakedProp } from './terrain';

const SIZE = HIGHWAY.size;
const STRETCH = HIGHWAY.stretch;
const ROAD = HIGHWAY.road;
const NORTH = -Math.PI / 2;
const DEGREE = Math.PI / 180;

function propKey(p: BakedProp, shiftY: number): string {
  return [p.kind, p.pos.x.toFixed(4), (p.pos.y + shiftY).toFixed(4), p.yaw.toFixed(4), p.r.toFixed(4)].join(':');
}

function inBand(p: BakedProp, from: number, to: number): boolean {
  return p.pos.y >= from + 3 && p.pos.y <= to - 3 && p.pos.x >= 3 && p.pos.x <= SIZE - 3;
}

function typeAt(map: BakedMap, p: { x: number; y: number }): string {
  return map.terrain.types[Math.floor(p.y) * SIZE + Math.floor(p.x)];
}

describe('the road frame', () => {
  it('turns a map spot into along and across distances and back', () => {
    for (const window of [0, 3]) {
      const p = { x: 123.5, y: 77.25 };
      const at = toRoad(5, window, p);
      const back = fromRoad(5, window, at.n, at.u);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('runs map north, toward the top right of the screen, with the south milestone at the same spot of every window', () => {
    expect(roadVector(1, 0)).toEqual({ x: 0, y: -1 });
    for (const seed of [1, 5, 9]) {
      for (const k of [0, 1, 4]) {
        const south = fromRoad(seed, k, milestoneAt(seed, k), 0);
        const north = fromRoad(seed, k, milestoneAt(seed, k + 1), 0);
        const shift = windowShift(seed, k);
        expect([south.x, south.y].map((v) => +v.toFixed(6))).toEqual([SIZE / 2, SIZE - HIGHWAY.milestoneInset]);
        expect([north.x, north.y].map((v) => +v.toFixed(6))).toEqual([SIZE / 2, SIZE - HIGHWAY.milestoneInset - stretchLength(seed, k + 1)]);
        expect(shift).toEqual({ x: 0, y: stretchLength(seed, k + 1) });
        expect(toRoad(seed, k + 1, { x: north.x + shift.x, y: north.y + shift.y }).n).toBeCloseTo(milestoneAt(seed, k + 1), 9);
        expect(windowSpan(seed, k)).toEqual({ from: milestoneAt(seed, k) - HIGHWAY.milestoneInset, to: milestoneAt(seed, k) - HIGHWAY.milestoneInset + SIZE });
      }
    }
  });
});

describe('the stretch lengths', () => {
  it('differ from stretch to stretch, stay in range and hold a whole stretch inside a window', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const lengths = Array.from({ length: 12 }, (_, i) => stretchLength(seed, i + 1));
      expect(new Set(lengths).size, `seed ${seed}`).toBeGreaterThanOrEqual(8);
      for (const length of lengths) {
        expect(length).toBeGreaterThanOrEqual(STRETCH.min);
        expect(length).toBeLessThanOrEqual(STRETCH.max);
        expect(length + 2 * HIGHWAY.milestoneInset).toBeLessThanOrEqual(SIZE);
      }
    }
  });

  it('differ between seeds for the same stretch', () => {
    const firsts = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => stretchLength(seed, 1));
    expect(new Set(firsts).size).toBeGreaterThan(3);
  });

  it('put each milestone at the running sum of the stretch lengths', () => {
    for (const seed of [1, 7]) {
      let sum = HIGHWAY.milestoneInset;
      for (let j = 1; j <= 12; j++) {
        sum += stretchLength(seed, j);
        expect(milestoneAt(seed, j)).toBe(sum);
      }
    }
  });

  it('find the stretch and the nearest milestone from the real positions', () => {
    for (const seed of [1, 2, 3]) {
      for (let j = 1; j <= 10; j++) {
        const from = milestoneAt(seed, j - 1);
        const to = milestoneAt(seed, j);
        expect(stretchOf(seed, from)).toBe(j);
        expect(stretchOf(seed, to - 0.01)).toBe(j);
        expect(stretchOf(seed, to)).toBe(j + 1);
        expect(nearestMilestone(seed, from + 1)).toBe(j - 1);
        expect(nearestMilestone(seed, to - 1)).toBe(j);
      }
      expect(stretchOf(seed, 0)).toBe(0);
      expect(nearestMilestone(seed, 0)).toBe(0);
    }
  });

  it('keep a truck on the same outpost pad in map space after the window moves', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const k of [0, 1, 2, 5]) {
        const shift = windowShift(seed, k);
        const pad = outpostFort(seed, k, k + 1).pos;
        const after = outpostFort(seed, k + 1, k + 1).pos;
        expect(after.x, `seed ${seed} window ${k}`).toBeCloseTo(pad.x + shift.x, 6);
        expect(after.y, `seed ${seed} window ${k}`).toBeCloseTo(pad.y + shift.y, 6);
        expect(highwayAtlas(seed, k + 1).origin.y - highwayAtlas(seed, k).origin.y).toBe(-shift.y);
      }
    }
  });

  it('keep the road line at one spot of the world across a window move', () => {
    for (const seed of [2, 3]) {
      for (const k of [0, 1]) {
        const shift = windowShift(seed, k);
        const road = (n: number, window: number) => roadPoint(seed, window, n, 0);
        const n = milestoneAt(seed, k + 1) - 80;
        expect(road(n, k + 1).y).toBeCloseTo(road(n, k).y + shift.y, 6);
        expect(road(n, k + 1).x).toBeCloseTo(road(n, k).x, 6);
      }
    }
  });
});

describe('a highway window', () => {
  it('builds the same land every time, in any order', () => {
    const later = [3, 1, 2].map((w) => highwayMap(5, w));
    const first = [1, 2, 3].map((w) => highwayMap(5, w));

    expect(later).toEqual([first[2], first[0], first[1]]);
    expect(highwayMap(5, 0)).toEqual(highwayMap(5, 0));
  });

  it('agrees with the next window in their overlap square, but for the shut gates', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const k of [0, 1, 2, 3, 4]) {
        const a = highwayMap(seed, k);
        const b = highwayMap(seed, k + 1);
        const row = SIZE + 1;
        const stride = windowShift(seed, k).y;
        const overlap = SIZE - stride;
        expect(a.terrain.heights.slice(0, (overlap + 1) * row), `seed ${seed} window ${k}`).toEqual(b.terrain.heights.slice(stride * row));
        expect(a.terrain.types.slice(0, overlap * SIZE), `seed ${seed} window ${k}`).toEqual(b.terrain.types.slice(stride * SIZE));
        const fromA = a.props.filter((p) => inBand(p, 0, overlap) && p.kind !== 'fortOutpostShut');
        const fromB = b.props.filter((p) => inBand(p, stride, SIZE) && p.kind !== 'fortOutpostShut');
        expect(fromB.map((p) => propKey(p, -stride)).sort(), `seed ${seed} window ${k}`).toEqual(fromA.map((p) => propKey(p, 0)).sort());
      }
    }
  });

  it('lays four lanes of asphalt, a flat verge, badlands and ridges by the distance from the centerline', () => {
    for (const seed of [1, 2, 3]) {
      const map = highwayMap(seed, 1);
      const span = windowSpan(seed, 1);
      for (let n = span.from + 60; n < span.to - 60; n += 9) {
        if ([1, 2].some((j) => Math.abs(n - milestoneAt(seed, j)) < 14) || sceneAt(seed, n, 4) !== null) continue;
        const at = (d: number) => roadPoint(seed, 1, n, d);
        for (const side of [-1, 1]) {
          expect(typeAt(map, at(side * 4.2))).toBe('asphalt');
          for (const d of [5.8, 9, 13, 17.2]) expect(['hardpan', 'sand']).toContain(typeAt(map, at(side * d)));
          for (const d of [18.8, 22, 25.2]) expect(['gravel', 'scrub', 'scree']).toContain(typeAt(map, at(side * d)));
          expect(typeAt(map, at(side * 30))).toBe('scree');
          for (const d of [3, 8, 14]) expect(heightAt(map.terrain, at(side * d).x, at(side * d).y)).toBeCloseTo(roadHeight(seed, roadAt(seed, n, side * d).n), 1);
          const ridge = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => at(side * (ROAD.badlands + 0.5 * k)));
          expect(ridge.some((p) => isCliff(map.terrain, Math.floor(p.y) * SIZE + Math.floor(p.x))), `seed ${seed} n ${n} side ${side}`).toBe(true);
          for (let d = 0; d <= ROAD.verge; d += 1.5) {
            const p = at(side * d);
            expect(isCliff(map.terrain, Math.floor(p.y) * SIZE + Math.floor(p.x)), `seed ${seed} n ${n} d ${d}`).toBe(false);
          }
        }
      }
    }
  });

  it('makes every prop a baked obstacle with its own id, inside the window', () => {
    const map = highwayMap(4, 3);
    const obstacles = mapObstacles(map);

    expect(obstacles.every(isBakedObstacle)).toBe(true);
    expect(obstacles.every((o) => o.pos.x >= o.r && o.pos.y >= o.r && o.pos.x <= SIZE - o.r && o.pos.y <= SIZE - o.r)).toBe(true);
  });

  it('shows no Icarus feature', () => {
    const map = highwayMap(3, 1);
    const atlas = atlasOf(map.terrain);

    expect([atlas.towns, atlas.hazards]).toEqual([[], []]);
    expect(atlas.decks.decks.every((d) => d.id.startsWith('ramp-') && d.look === 'ship_flap')).toBe(true);
    expect(atlas.locations.map((l) => l.id)).toEqual(['outpost-1', 'outpost-2']);
    expect(atlas.oldSpots || atlas.landforms).toBe(false);
    expect(atlas.roads).toHaveLength(1);
    expect(atlas.roads[0].lanes).toBe(4);
    expect(atlas.roads[0].width).toBe(10);
    const offRamps = (x: number, y: number) => deckAt(atlas.decks, x, y) === null;
    for (let y = 0; y < SIZE; y += 7) for (let x = 0; x < SIZE; x += 7) if (offRamps(x + 0.3, y + 0.6)) expect(heightAt(map.terrain, x + 0.3, y + 0.6)).toBe(groundAt(map.terrain, x + 0.3, y + 0.6));
  });

  it('builds an outpost at the start milestone, beside the road at its milestone', () => {
    const fort = outpostFort(7, 0, 0);

    expect(fort.id).toBe('outpost-0');
    expect(toRoad(7, 0, fort.pos).n).toBeCloseTo(milestoneAt(7, 0), 0);
    expect(highwayAtlas(7, 0).locations.map((l) => l.id)).toEqual(['outpost-0', 'outpost-1']);
  });

  it('builds a window in well under the boot budget', () => {
    const started = performance.now();
    highwayMap(11, 7);
    const ms = performance.now() - started;
    console.info(`highway window built in ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1000);
  });
});

describe('the highway road', () => {
  it('keeps within 35 degrees of north, its bends wide and its grade under the road limit', () => {
    const bendRadius = 22;
    for (let seed = 1; seed <= 30; seed++) {
      for (let n = milestoneAt(seed, 0); n < milestoneAt(seed, 8); n += 1) {
        expect(Math.abs(roadHeight(seed, n + 1) - roadHeight(seed, n))).toBeLessThan(TERRAIN.roadGrade);
        expect(Math.abs(roadHeading(seed, n) - NORTH), `seed ${seed} n ${n}`).toBeLessThanOrEqual(35 * DEGREE);
        const bend = Math.abs(centerU(seed, n + 1) - 2 * centerU(seed, n) + centerU(seed, n - 1));
        expect(1 / Math.max(bend, 1e-9), `seed ${seed} n ${n}`).toBeGreaterThanOrEqual(bendRadius);
      }
    }
  });

  it('runs straight in the middle of the window near every milestone', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (let j = 0; j <= 8; j++) {
        for (let d = -ROAD.bend.ends; d <= ROAD.bend.ends; d += 2) expect(centerU(seed, milestoneAt(seed, j) + d), `seed ${seed} milestone ${j} d ${d}`).toBe(0);
      }
    }
  });

  it('bends in most stretches, swinging to one side and then the other at least twice, more on longer stretches', () => {
    let bentStretches = 0;
    let stretches = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (let j = 1; j <= 8; j++) {
        const length = stretchLength(seed, j);
        const cells = bendCells(length);
        const cell = (length - 2 * ROAD.bend.ends) / cells;
        expect(cells).toBeGreaterThanOrEqual(3);
        expect(cell).toBeGreaterThanOrEqual(ROAD.bend.cell);
        const swing = (i: number) => centerU(seed, milestoneAt(seed, j - 1) + ROAD.bend.ends + i * cell);
        const swings = Array.from({ length: cells - 1 }, (_, k) => swing(k + 1));
        stretches++;
        expect(swings.every((w) => Math.abs(w) <= ROAD.bend.shift[1] + 1e-9)).toBe(true);
        if (swings.every((w) => w === 0)) continue;
        bentStretches++;
        expect(swings.every((w) => Math.abs(w) >= ROAD.bend.shift[0] - 1e-9)).toBe(true);
        swings.slice(1).forEach((w, k) => expect(Math.sign(w), `seed ${seed} stretch ${j}`).toBe(-Math.sign(swings[k])));
      }
    }
    expect(bentStretches).toBeGreaterThanOrEqual(stretches * 0.8);
  });

  it('keeps the lanes on asphalt and the verge off it on bends', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const k of [0, 1, 2]) {
        const map = highwayMap(seed, k);
        for (let n = milestoneAt(seed, k) + ROAD.bend.ends; n < milestoneAt(seed, k + 1) - ROAD.bend.ends; n += 2) {
          if (sceneAt(seed, n, 4) !== null) continue;
          for (const side of [-1, 1]) {
            expect(typeAt(map, roadPoint(seed, k, n, side * 4.2)), `seed ${seed} n ${n} side ${side}`).toBe('asphalt');
            expect(typeAt(map, roadPoint(seed, k, n, side * 5.8)), `seed ${seed} n ${n} side ${side}`).not.toBe('asphalt');
          }
        }
      }
    }
  });

  it('lets the widest truck drive from the south milestone to the north outpost yard', () => {
    const radius = CHASSIS.hauler.radius;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const k of [0, 1, 2, 3]) {
        const map = highwayMap(seed, k);
        const layer = navLayer(map.terrain, mapObstacles(map), radius);
        const from = outpostFort(seed, k, k).pos;
        const to = outpostFort(seed, k, k + 1).pos;
        const start = componentOf(layer, cellOf(from));
        expect(start, `seed ${seed} window ${k} start`).not.toBe(0);
        expect(componentOf(layer, cellOf(to)), `seed ${seed} window ${k}`).toBe(start);
      }
    }
  });
});

function cellOf(p: { x: number; y: number }): number {
  const n = Math.ceil(SIZE / CELL);
  return Math.floor(p.y / CELL) * n + Math.floor(p.x / CELL);
}

const FORT_KINDS = new Set(['fortOutpostWall', 'fortOutpostTower', 'fortOutpostGate', 'fortOutpostShut']);

function alongAcross(seed: number, window: number, j: number, p: { x: number; y: number }): { along: number; across: number } {
  const at = toRoad(seed, window, p);
  return { along: at.n - milestoneAt(seed, j), across: acrossOf(seed, at) };
}

function fortsOf(window: number): number[] {
  return [window, window + 1].filter((j) => j >= 1);
}

describe('an outpost fort', () => {
  const half = outpostYardHalf();
  const outer = half + FORTRESS.wallDepth / 2;

  it('stands across the road, centered on it, with its walls parallel and square to the heading (IV1)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const window of [0, 1, 2, 3]) {
        for (const j of fortsOf(window)) {
          const fort = outpostFort(seed, window, j);
          const center = fromRoad(seed, window, milestoneAt(seed, j), 0);
          expect(fort.look).toBe('outpost');
          expect(Math.hypot(fort.pos.x - center.x, fort.pos.y - center.y)).toBeLessThan(0.05);
          const heading = roadHeading(seed, milestoneAt(seed, j));
          const walls = fortressProps(fort).filter((p) => p.kind === 'fortOutpostWall');
          expect(walls.length).toBeGreaterThan(6);
          for (const wall of walls) {
            const off = ((wall.yaw - heading) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2);
            expect(Math.min(off, Math.PI / 2 - off), `seed ${seed} window ${window} fort ${j}`).toBeLessThan(0.01);
          }
        }
      }
    }
  });

  it('has a gate on the road axis in each of its south and north walls, six tiles wide (IV1)', () => {
    for (const seed of [1, 2, 3]) {
      for (const j of [1, 2]) {
        const spots = outpostGateSpots(seed, j - 1, j);
        const gates = fortressProps(outpostFort(seed, j - 1, j)).filter((p) => p.kind === 'fortOutpostGate');
        expect(gates).toHaveLength(2);
        for (const [side, sign] of [['south', -1], ['north', 1]] as const) {
          const spot = alongAcross(seed, j - 1, j, spots[side].center);
          expect(spot.along).toBeCloseTo(sign * half, 3);
          expect(spot.across).toBeCloseTo(0, 3);
          expect(spots[side].width).toBe(6);
          const gate = gates.find((g) => Math.abs(alongAcross(seed, j - 1, j, g.pos).along - sign * half) < 0.5);
          expect(gate, `seed ${seed} fort ${j} ${side}`).toBeDefined();
        }
      }
    }
    expect(FORTRESS_STYLES.outpost.gate.width).toBe(6);
  });

  it('has no town pad, since the yard is the place a truck uses', () => {
    expect(sitePads(outpostFort(3, 0, 1))).toEqual([]);
  });

  it('holds the widest truck at both park spots, inside its walls', () => {
    expect(half - FORTRESS.wallDepth / 2 - Math.max(...Object.values(CHASSIS).map((c) => c.radius))).toBeGreaterThan(Math.abs(HIGHWAY.road.lanes[1]) + 3);
  });

  it('puts concrete outside the lanes and asphalt in them, on flat ground across the road (IV1)', () => {
    for (const seed of [1, 2, 3]) {
      const map = highwayMap(seed, 1);
      for (const j of [1, 2]) {
        const n = milestoneAt(seed, j);
        for (const along of [-3, 0, 3]) {
          expect(typeAt(map, roadPoint(seed, 1, n + along, 3))).toBe('asphalt');
          expect(typeAt(map, roadPoint(seed, 1, n + along, 6.5))).toBe('concrete');
          expect(typeAt(map, roadPoint(seed, 1, n + along, -6.5))).toBe('concrete');
          const here = roadPoint(seed, 1, n + along, 0);
          for (const across of [-7, 7]) {
            const there = roadPoint(seed, 1, n + along, across);
            expect(heightAt(map.terrain, there.x, there.y)).toBeCloseTo(heightAt(map.terrain, here.x, here.y), 1);
          }
        }
      }
    }
  });

  it('keeps every loose prop out of the footprint and the gateways, and builds one fort and line in both windows that hold it (IV8)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const window of [0, 1, 2, 3]) {
        const map = highwayMap(seed, window);
        for (const j of fortsOf(window)) {
          const loose = map.props.filter((p) => !FORT_KINDS.has(p.kind));
          const inside = loose.filter((p) => {
            const at = alongAcross(seed, window, j, p.pos);
            return Math.abs(at.along) < outer + p.r && Math.abs(at.across) < outer + p.r;
          });
          expect(inside.map((p) => p.kind), `seed ${seed} window ${window} fort ${j}`).toEqual([]);
        }
      }
      for (const j of [1, 2, 3]) {
        const near = (window: number) => (p: BakedProp) => p.kind !== 'fortOutpostShut' && Math.abs(alongAcross(seed, window, j, p.pos).along) < 40;
        const a = highwayMap(seed, j - 1).props.filter(near(j - 1));
        const b = highwayMap(seed, j).props.filter(near(j));
        expect(b.map((p) => propKey(p, -windowShift(seed, j - 1).y)).sort(), `seed ${seed} fort ${j}`).toEqual(a.map((p) => propKey(p, 0)).sort());
      }
    }
  });

  it('closes the north gate of the next fort and the south gate of the last one with a shut gate prop (IV3)', () => {
    for (const window of [0, 1, 2]) {
      const shut = highwayMap(3, window).props.filter((p) => p.kind === 'fortOutpostShut');
      expect(shut).toHaveLength(window === 0 ? 1 : 2);
      const north = outpostGateSpots(3, window, window + 1).north.center;
      expect(shut.some((p) => Math.hypot(p.pos.x - north.x, p.pos.y - north.y) < 0.01)).toBe(true);
    }
  });

  it('can be reached from the asphalt by the widest truck', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const map = highwayMap(seed, 0);
      const layer = navLayer(map.terrain, mapObstacles(map), CHASSIS.hauler.radius);
      const road = roadPoint(seed, 0, milestoneAt(seed, 1) - 20, ROAD.lanes[0]);
      expect(componentOf(layer, cellOf(outpostFort(seed, 0, 1).pos)), `seed ${seed}`).toBe(componentOf(layer, cellOf(road)));
    }
  });
});
