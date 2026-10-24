import { DIRECTIONS } from '../data/directions';
import { atlasOf, atlasSites } from './atlas';
import { propsAlong, propsAround } from './prop-index';
import { otherEnd, type RoadGraph } from './road-network';
import { siteGap, type Site } from './sites';
import type { Cardinal, Cue, LandmarkLook, Obstacle, Octant, RoadName, Span, World } from './types';
import { dist, type Vec } from './vec';

const OCTANTS: Octant[] = ['east', 'southEast', 'south', 'southWest', 'west', 'northWest', 'north', 'northEast'];

export function octantOf(v: Vec): Octant {
  const step = (2 * Math.PI) / OCTANTS.length;
  const i = Math.round(Math.atan2(v.y, v.x) / step);
  return OCTANTS[((i % OCTANTS.length) + OCTANTS.length) % OCTANTS.length];
}

const OCTANT_ANGLE: Record<Octant, number> = Object.fromEntries(OCTANTS.map((o, i) => [o, (i * 2 * Math.PI) / OCTANTS.length])) as Record<Octant, number>;
const CARDINAL_ANGLES: [Cardinal, number][] = [['east', 0], ['south', Math.PI / 2], ['west', Math.PI], ['north', -Math.PI / 2]];

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function cardinalOf(v: Vec): Cardinal {
  const angle = Math.atan2(v.y, v.x);
  return CARDINAL_ANGLES.reduce((best, c) => (Math.abs(wrap(angle - c[1])) < Math.abs(wrap(angle - best[1])) ? c : best))[0];
}

export function leanOf(v: Vec, octant: Octant): Cardinal | null {
  const angle = OCTANT_ANGLE[octant];
  const off = wrap(Math.atan2(v.y, v.x) - angle);
  if (Math.abs(off) <= DIRECTIONS.leanAngle) return null;
  const isCardinal = CARDINAL_ANGLES.some((c) => Math.abs(wrap(angle - c[1])) < 1e-9);
  const toward = isCardinal ? angle + Math.sign(off) * (Math.PI / 2) : angle + off;
  return cardinalOf({ x: Math.cos(toward), y: Math.sin(toward) });
}

export function headingAlong(lines: readonly (readonly Vec[])[], reach: number): Octant {
  const points = lines.flat();
  if (points.length === 0) throw new Error('A heading needs a line to read');
  const start = points[0];
  const end = pointAlong(points, reach);
  if (dist(start, end) === 0) throw new Error('A heading needs a line with length');
  return octantOf({ x: end.x - start.x, y: end.y - start.y });
}

function pointAlong(points: readonly Vec[], reach: number): Vec {
  let left = reach;
  for (let i = 1; i < points.length; i++) {
    const step = dist(points[i - 1], points[i]);
    if (step >= left) {
      const t = left / step;
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, y: points[i - 1].y + (points[i].y - points[i - 1].y) * t };
    }
    left -= step;
  }
  return points[points.length - 1];
}

export function spanOf(tiles: number): Span {
  if (tiles < DIRECTIONS.spans.near) return 'near';
  return tiles < DIRECTIONS.spans.fair ? 'fair' : 'far';
}

export type CueSpot = { pos: Vec; legStart: Vec; leg: readonly (readonly Vec[])[]; earlier: readonly Vec[]; forks: number; junctionHere: boolean };

export function cueAt(world: World, spot: CueSpot): Cue | null {
  return siteCue(world, spot) ?? deckCue(world, spot) ?? propCue(world, spot) ?? countCue(spot);
}

function seenFromEarlier(spot: CueSpot, gapAt: (p: Vec) => number): boolean {
  return spot.earlier.some((p) => gapAt(p) <= DIRECTIONS.cueReach);
}

function siteCue(world: World, spot: CueSpot): Cue | null {
  const sites = atlasSites(atlasOf(world.terrain))
    .map((site) => ({ site, gap: siteGap(site, spot.pos) }))
    .filter((s) => s.gap <= DIRECTIONS.cueReach)
    .sort((a, b) => a.gap - b.gap || (a.site.id < b.site.id ? -1 : 1));
  const pick = sites.find((s) => !seenFromEarlier(spot, (p) => siteGap(s.site as Site, p)));
  return pick ? { kind: 'site', id: pick.site.id } : null;
}

function deckCue(world: World, spot: CueSpot): Cue | null {
  const decks = atlasOf(world.terrain).decks.decks;
  const gap = (deck: (typeof decks)[number], p: Vec) => Math.min(dist(p, deck.from), dist(p, deck.to), dist(p, { x: (deck.from.x + deck.to.x) / 2, y: (deck.from.y + deck.to.y) / 2 }));
  const near = decks
    .filter((d) => gap(d, spot.pos) <= DIRECTIONS.cueReach)
    .sort((a, b) => gap(a, spot.pos) - gap(b, spot.pos) || (a.id < b.id ? -1 : 1));
  const pick = near.find((d) => !seenFromEarlier(spot, (p) => gap(d, p)));
  return pick ? { kind: 'deck', id: pick.id } : null;
}

function landmarksOf(props: readonly Obstacle[], look: LandmarkLook): Obstacle[] {
  return props.filter((o) => o.kind === 'landmark' && o.look === look);
}

function propCue(world: World, spot: CueSpot): Cue | null {
  const around = propsAround(world, 'sight', spot.pos, DIRECTIONS.cueReach);
  for (const look of DIRECTIONS.cueLooks) {
    const mine = landmarksOf(around, look).sort((a, b) => dist(a.pos, spot.pos) - dist(b.pos, spot.pos) || (a.id < b.id ? -1 : 1))[0];
    if (mine && !otherOfLookOnLeg(world, spot, look, mine.id)) return { kind: 'prop', look };
  }
  return null;
}

function otherOfLookOnLeg(world: World, spot: CueSpot, look: LandmarkLook, except: string): boolean {
  const segments = [...spot.leg.flatMap((line) => line.slice(1).map((b, i): [Vec, Vec] => [line[i], b])), [spot.pos, spot.pos] as [Vec, Vec]];
  return segments.some(([a, b]) => landmarksOf(propsAlong(world, 'sight', a, b, DIRECTIONS.cueReach), look).some((o) => o.id !== except));
}

function countable(spot: CueSpot): boolean {
  const places = [spot.legStart, ...spot.earlier, spot.pos];
  return places.every((place, i) => i === 0 || dist(places[i - 1], place) >= DIRECTIONS.cueReach);
}

function countCue(spot: CueSpot): Cue | null {
  if (spot.forks === 0 || (!spot.junctionHere && spot.forks === 1)) return { kind: 'none' };
  if (!countable(spot)) return null;
  if (spot.forks === 1) return { kind: 'none' };
  return spot.forks <= DIRECTIONS.maxCount ? { kind: 'fork', nth: spot.forks } : null;
}

export function roadName(graph: RoadGraph, edge: number, fromNode: number): RoadName {
  const road = graph.edges[edge].road;
  let current = edge;
  let at = fromNode;
  const seen = new Set<number>();
  while (!seen.has(current)) {
    seen.add(current);
    at = otherEnd(graph.edges[current], at);
    const node = graph.nodes[at];
    const site = node.site ?? node.entry;
    if (site) return { kind: 'to', site };
    const next = graph.incident[at].find((id) => id !== current && graph.edges[id].road === road);
    if (next === undefined) break;
    current = next;
  }
  const first = graph.edges[edge];
  const a = graph.nodes[fromNode].pos;
  const b = graph.nodes[otherEnd(first, fromNode)].pos;
  return { kind: 'heading', octant: octantOf({ x: b.x - a.x, y: b.y - a.y }) };
}
