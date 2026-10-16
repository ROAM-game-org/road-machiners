import { DIRECTIONS } from '../data/directions';
import { atlasOf, atlasSites } from './atlas';
import { propsAlong, propsAround } from './prop-index';
import { otherEnd, type RoadGraph } from './road-network';
import { siteGap, type Site } from './sites';
import type { Cue, LandmarkLook, Obstacle, Octant, RoadName, Span, World } from './types';
import { dist, type Vec } from './vec';

const OCTANTS: Octant[] = ['east', 'southEast', 'south', 'southWest', 'west', 'northWest', 'north', 'northEast'];

export function octantOf(v: Vec): Octant {
  const step = (2 * Math.PI) / OCTANTS.length;
  const i = Math.round(Math.atan2(v.y, v.x) / step);
  return OCTANTS[((i % OCTANTS.length) + OCTANTS.length) % OCTANTS.length];
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
