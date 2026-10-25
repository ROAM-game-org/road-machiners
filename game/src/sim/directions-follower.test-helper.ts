import { DIRECTIONS } from '../data/directions';
import { atlasOf, atlasSites } from './atlas';
import { headingAlong, roadName } from './direction-cues';
import { exitsAt, isJunction, nearestRoadPoints, otherEnd, roadNetworkOf, splitAt, type RoadExit, type RoadGraph } from './road-network';
import { propsAround } from './prop-index';
import { siteGap } from './sites';
import type { Cue, DirectionStep, Octant, RoadName, World } from './types';
import { angleDiff, dist, type Vec } from './vec';

const MAX_MOVES = 200;

function nearestOnLine(p: Vec, line: readonly Vec[]): Vec {
  let best = line[0];
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2));
    const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (dist(p, q) < dist(p, best)) best = q;
  }
  return best;
}

type Turn = Extract<DirectionStep, { do: 'turn' }>;
type Follow = Extract<DirectionStep, { do: 'follow' }>;

export type Followed = { reached: boolean; node: number; closest: number; closestAt: Vec; graph: RoadGraph };

function sameName(a: RoadName, b: RoadName): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function cueMatches(world: World, graph: RoadGraph, node: number, cue: Cue, forks: number): boolean {
  const pos = graph.nodes[node].pos;
  const atlas = atlasOf(world.terrain);
  if (cue.kind === 'site') return atlasSites(atlas).some((s) => s.id === cue.id && siteGap(s, pos) <= DIRECTIONS.cueReach);
  if (cue.kind === 'deck') return atlas.decks.decks.some((d) => d.id === cue.id && Math.min(dist(pos, d.from), dist(pos, d.to)) <= DIRECTIONS.cueReach);
  if (cue.kind === 'prop') return propsAround(world, 'sight', pos, DIRECTIONS.cueReach).some((o) => o.kind === 'landmark' && o.look === cue.look);
  if (cue.kind === 'fork') return forks === cue.nth;
  return forks === 1;
}

function sideFits(side: Turn['side'], turn: number): boolean {
  return side === 'left' || side === 'keepLeft' ? turn < 0 : turn > 0;
}

function startOn(world: World, from: Vec): { graph: RoadGraph; node: number } {
  const net = roadNetworkOf(world);
  const [point] = nearestRoadPoints(net, from, DIRECTIONS.joinReach, 1);
  const { graph, nodes } = splitAt(net, [point]);
  return { graph, node: nodes[0] };
}

function lookDown(graph: RoadGraph, node: number, exit: RoadExit): Octant {
  const lines: Vec[][] = [];
  let edge = exit.edge;
  let at = node;
  let length = 0;
  for (;;) {
    const e = graph.edges[edge];
    lines.push(at === e.from ? e.points : [...e.points].reverse());
    length += e.length;
    at = otherEnd(e, at);
    const on = onwardOf(graph, at, edge);
    if (length >= DIRECTIONS.headingReach || on === null) break;
    edge = on;
  }
  return headingAlong(lines, DIRECTIONS.headingReach);
}

function onwardOf(graph: RoadGraph, node: number, into: number): number | null {
  const exits = exitsAt(graph, node).filter((e) => e.edge !== into);
  if (exits.length === 0) return null;
  if (!isJunction(graph, node)) return exits[0].edge;
  const ahead = straightest(graph, node, into, exits);
  return graph.edges[ahead.edge].road === graph.edges[into].road ? ahead.edge : null;
}

function firstExits(graph: RoadGraph, node: number, first: Follow): RoadExit[] {
  return exitsAt(graph, node).filter((e) => sameName(roadName(graph, e.edge, node), first.road) && lookDown(graph, node, e) === first.heading);
}

export function ambiguousStarts(world: World, answers: readonly { from: Vec; steps: readonly DirectionStep[] }[]): string[] {
  return answers.flatMap(({ from, steps }) => {
    const first = steps.find((s): s is Follow => s.do === 'follow');
    if (!first) return [];
    const { graph, node } = startOn(world, from);
    return firstExits(graph, node, first).length > 1 ? [`${from.x},${from.y} ${JSON.stringify(first)}`] : [];
  });
}

export function followSteps(world: World, from: Vec, steps: readonly DirectionStep[], goal: { site: string } | { spot: Vec }): Followed {
  const start = startOn(world, from);
  const graph = start.graph;
  const turns = steps.filter((s): s is Turn => s.do === 'turn');
  const first = steps.find((s): s is Follow => s.do === 'follow');
  const spot = 'spot' in goal ? goal.spot : null;
  let node = start.node;
  let into: number | null = null;
  let forks = 0;
  let next = 0;
  let closest = Infinity;
  let closestAt = from;
  for (let move = 0; move < MAX_MOVES; move++) {
    const here = graph.nodes[node];
    if ('site' in goal && (here.site === goal.site || here.entry === goal.site)) return { reached: true, node, closest, closestAt, graph };
    const exits = exitsAt(graph, node).filter((e) => e.edge !== into);
    if (exits.length === 0) break;
    let pick = exits[0];
    if (into === null) {
      if (first) {
        const [named] = firstExits(graph, node, first);
        if (!named) throw new Error(`No exit at ${from.x},${from.y} fits ${JSON.stringify(first)}`);
        pick = named;
      }
    } else if (exits.length > 1) {
      forks++;
      const turn = turns[next];
      if (turn && cueMatches(world, graph, node, turn.at, forks)) {
        pick = turnExit(graph, node, into, exits, turn);
        next++;
        forks = 0;
      } else pick = straightest(graph, node, into, exits);
    }
    if (spot && next === turns.length) {
      const near = nearestOnLine(spot, graph.edges[pick.edge].points);
      if (dist(spot, near) < closest) {
        closest = dist(spot, near);
        closestAt = near;
      }
    }
    into = pick.edge;
    node = otherEnd(graph.edges[pick.edge], node);
  }
  return { reached: false, node, closest, closestAt, graph };
}

function turnExit(graph: RoadGraph, node: number, into: number, exits: { edge: number; heading: number }[], turn: Turn) {
  const heading = travel(graph, node, into);
  const onSide = exits.filter((e) => sideFits(turn.side, angleDiff(heading, e.heading)));
  return onSide.find((e) => sameName(roadName(graph, e.edge, node), turn.road)) ?? onSide[0] ?? straightest(graph, node, into, exits);
}

function straightest(graph: RoadGraph, node: number, into: number, exits: { edge: number; heading: number }[]) {
  const heading = travel(graph, node, into);
  return exits.reduce((a, b) => (Math.abs(angleDiff(heading, b.heading)) < Math.abs(angleDiff(heading, a.heading)) ? b : a));
}

function travel(graph: RoadGraph, node: number, into: number): number {
  const back = exitsAt(graph, node).find((e) => e.edge === into);
  if (!back) throw new Error('Lost the road');
  return back.heading + Math.PI;
}
