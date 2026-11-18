import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { TERRITORIES } from '../data/territory';
import { TEST_MAP } from '../test/map';
import { trackEdgeAt } from '../render/roadPaint';
import { blockingBoxes, boxDistance, mapObstacles } from './mapgen';
import { straightClear } from './path';
import { heightAt, tileAt } from './terrain';
import { emptyWorld } from './testkit';
import { fullRoadEnds, isTerritory, territoryTracks, type TrackLine } from './territory';
import type { World } from './types';
import { dist, polylineDist, type Vec } from './vec';

const terrain = TEST_MAP.terrain;
const world: World = { ...emptyWorld(), terrain, obstacles: mapObstacles(TEST_MAP) };
const boxes = world.obstacles.flatMap((o) => blockingBoxes(o, terrain));
const TRUCK_RADIUS = 1.2;
const BACK = 6;
const INTO = 4;
const territory = (id: string) => REGION.locations.filter(isTerritory).find((l) => l.id === id)!;
const sun = territory('fallen-sun');
const orchard = territory('orchard');

type Join = { name: string; end: Vec; road: Vec[]; way: Vec[]; lines: TrackLine[] };

function regionRoadInto(end: Vec): Vec[] {
  const road = REGION.roads.find((r) => dist(r[0], end) < 1e-9 || dist(r[r.length - 1], end) < 1e-9)!;
  return dist(road[road.length - 1], end) < 1e-9 ? road : [...road].reverse();
}

function alongFrom(points: readonly Vec[], length: number): Vec {
  let left = length;
  for (let i = 1; i < points.length; i++) {
    const d = dist(points[i - 1], points[i]);
    if (d >= left) return { x: points[i - 1].x + ((points[i].x - points[i - 1].x) * left) / d, y: points[i - 1].y + ((points[i].y - points[i - 1].y) * left) / d };
    left -= d;
  }
  return points[points.length - 1];
}

function sunJoins(): Join[] {
  const lines = territoryTracks(sun);
  return fullRoadEnds(sun).map((end, k) => {
    const line = lines.find((l) => (l.joins.start && dist(l.points[0], end) < 1) || (l.joins.end && dist(l.points.at(-1)!, end) < 1))!;
    return { name: `Fallen Sun join ${k}`, end, road: regionRoadInto(end), way: line.joins.start ? line.points : [...line.points].reverse(), lines };
  });
}

function orchardJoin(): Join {
  const old = TERRITORIES.orchard.farm!.roads.find((road) => road.surface === 'oldRoad')!;
  const way = old.points.map((p) => ({ x: orchard.pos.x + p.x, y: orchard.pos.y + p.y }));
  const end = fullRoadEnds(orchard).reduce((a, b) => (dist(a, way[0]) <= dist(b, way[0]) ? a : b));
  return { name: 'Orchard old road', end, road: regionRoadInto(end), way, lines: [] };
}

const joins = [...sunJoins(), orchardJoin()];

function tilesUnder(join: Join): number[] {
  const near = (c: Vec) => polylineDist(c, [join.end, ...join.way.slice(0, 2)]) < 8;
  const firstTiles = [join.end, ...cut(join.way, INTO)];
  const width = join.lines.length ? join.lines.find((l) => l.points.includes(join.way[0]))!.width : 3;
  const out: number[] = [];
  const r = 10;
  for (let y = Math.floor(join.end.y - r); y <= join.end.y + r; y++)
    for (let x = Math.floor(join.end.x - r); x <= join.end.x + r; x++) {
      const c = { x: x + 0.5, y: y + 0.5 };
      const inMouth = join.lines.length > 0 && near(c) && trackEdgeAt(join.lines, c) < 0;
      if (inMouth || polylineDist(c, firstTiles) < width / 2) out.push(tileAt(terrain, c));
    }
  return out;
}

function cut(points: readonly Vec[], length: number): Vec[] {
  const out = [points[0]];
  let gone = 0;
  for (let i = 1; i < points.length; i++) {
    const d = dist(points[i - 1], points[i]);
    if (gone + d >= length) return [...out, alongFrom(points, length)];
    out.push(points[i]);
    gone += d;
  }
  return out;
}

describe('the ground under each join of a track and a full road', () => {
  it('finds the three Fallen Sun joins and the Orchard old road', () => {
    expect(joins.map((j) => j.name)).toHaveLength(4);
  });

  for (const join of joins)
    it(`keeps the tiles under ${join.name} paved or tracked and clear of props (IV13)`, () => {
      const tiles = tilesUnder(join);
      const near = boxes.filter((b) => dist(b.center, join.end) < 30);
      expect(tiles.length).toBeGreaterThan(10);
      for (const i of tiles) {
        const c = { x: (i % terrain.size) + 0.5, y: Math.floor(i / terrain.size) + 0.5 };
        expect(['road', 'track', 'asphalt'], `${join.name} tile ${c.x},${c.y}`).toContain(terrain.types[i]);
        expect(near.reduce((least, b) => Math.min(least, boxDistance(b, c)), Infinity), `${join.name} prop at ${c.x},${c.y}`).toBeGreaterThan(0.5);
      }
    });

  for (const join of joins)
    it(`drives straight through ${join.name} from the road into its track (IV13)`, () => {
      const back = alongFrom([...join.road].reverse(), BACK);
      const into = alongFrom(join.way, INTO);
      const step = Math.abs(heightAt(terrain, into.x, into.y) - heightAt(terrain, join.end.x, join.end.y));
      expect(straightClear(world, back, join.end, TRUCK_RADIUS, []), `${join.name} road leg, height step ${step.toFixed(2)}`).toBe(true);
      expect(straightClear(world, join.end, join.way[0], TRUCK_RADIUS, []) && straightClear(world, join.way[0], into, TRUCK_RADIUS, []), `${join.name} track leg, height step ${step.toFixed(2)}`).toBe(true);
    });
});
