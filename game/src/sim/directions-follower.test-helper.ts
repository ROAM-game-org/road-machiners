import { DIRECTIONS } from '../data/directions';
import { atlasOf, atlasSites } from './atlas';
import { headingAlong, roadName } from './direction-cues';
import { exitsAt, isJunction, nearestRoadPoints, otherEnd, roadNetworkOf, splitAt, type RoadExit, type RoadGraph } from './road-network';
import { propsAround } from './prop-index';
import { gridEntries, sameGridSquare } from './map-grid';
import { siteGap } from './sites';
import type { Cue, DirectionStep, LandmarkCue, Octant, RoadName, World } from './types';
import { angleDiff, dist, type Vec } from './vec';

const MAX_MOVES = 200;

type Turn = Extract<DirectionStep, { do: 'turn' }>;
type Follow = Extract<DirectionStep, { do: 'follow' }>;

export type Followed = { reached: boolean; node: number; leftAt: Vec | null; graph: RoadGraph };

type Leave = Extract<DirectionStep, { do: 'leave' }>;

const SAMPLE_STEP = 1;
const SETTLE = 0.5;

function landmarkGap(world: World, cue: LandmarkCue, pos: Vec): number {
  const atlas = atlasOf(world.terrain);
  if (cue.kind === 'site') return Math.min(...atlasSites(atlas).filter((s) => s.id === cue.id).map((s) => siteGap(s, pos)));
  if (cue.kind === 'deck') return Math.min(...atlas.decks.decks.filter((d) => d.id === cue.id).map((d) => Math.min(dist(pos, d.from), dist(pos, d.to), dist(pos, { x: (d.from.x + d.to.x) / 2, y: (d.from.y + d.to.y) / 2 }))));
  return Math.min(...propsAround(world, 'sight', pos, DIRECTIONS.cueReach).filter((o) => o.kind === 'landmark' && o.look === cue.look).map((o) => dist(o.pos, pos) - o.r));
}

function sampled(line: readonly Vec[]): Vec[] {
  return line.slice(1).flatMap((b, i) => {
    const a = line[i];
    const n = Math.max(1, Math.ceil(dist(a, b) / SAMPLE_STEP));
    return Array.from({ length: n }, (_, k) => ({ x: a.x + ((b.x - a.x) * (k + 1)) / n, y: a.y + ((b.y - a.y) * (k + 1)) / n }));
  });
}

type Approach = { best: number; at: Vec | null };

function settled(world: World, cue: LandmarkCue, line: readonly Vec[], approach: Approach): boolean {
  for (const p of sampled(line)) {
    const gap = landmarkGap(world, cue, p);
    if (gap > DIRECTIONS.cueReach && approach.at === null) continue;
    if (gap < approach.best) {
      approach.best = gap;
      approach.at = p;
    } else if (gap > approach.best + SETTLE) return true;
  }
  return false;
}

function leaveStop(world: World, leave: Leave, line: readonly Vec[], approach: Approach): Vec | null {
  if (leave.at.kind === 'square') {
    const { column, row } = leave.at;
    return gridEntries(line).find((e) => sameGridSquare(e.square, { column, row }))?.pos ?? null;
  }
  return settled(world, leave.at, line, approach) ? approach.at : null;
}

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

function lookDown(graph: RoadGraph, node: number, exit: RoadExit, reach: number = DIRECTIONS.headingReach): Octant {
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
    if (length >= reach || on === null) break;
    edge = on;
  }
  return headingAlong(lines, reach);
}

function onwardOf(graph: RoadGraph, node: number, into: number): number | null {
  const exits = exitsAt(graph, node).filter((e) => e.edge !== into);
  if (exits.length === 0) return null;
  if (!isJunction(graph, node)) return exits[0].edge;
  const ahead = straightest(graph, node, into, exits);
  return graph.edges[ahead.edge].road === graph.edges[into].road ? ahead.edge : null;
}

function firstExits(graph: RoadGraph, node: number, first: Follow): RoadExit[] {
  const named = exitsAt(graph, node).filter((e) => sameName(roadName(graph, e.edge, node), first.road));
  return named.length === 1 ? named : named.filter((e) => [DIRECTIONS.headingReach, DIRECTIONS.headingReach / 2].some((reach) => lookDown(graph, node, e, reach) === first.heading));
}

function onlyRoadExit(graph: RoadGraph, node: number, first: Follow): RoadExit[] {
  const named = exitsAt(graph, node).filter((e) => sameName(roadName(graph, e.edge, node), first.road));
  return named.length === 1 ? named : [];
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
  const leave = 'spot' in goal ? steps.find((s): s is Leave => s.do === 'leave') : undefined;
  const approach: Approach = { best: Infinity, at: null };
  let node = start.node;
  let into: number | null = null;
  let forks = 0;
  let next = 0;
  for (let move = 0; move < MAX_MOVES; move++) {
    const here = graph.nodes[node];
    if ('site' in goal && (here.site === goal.site || here.entry === goal.site)) return { reached: true, node, leftAt: null, graph };
    const exits = exitsAt(graph, node).filter((e) => e.edge !== into);
    if (exits.length === 0) break;
    let pick = exits[0];
    if (into === null) {
      if (first) {
        const [named] = firstExits(graph, node, first);
        const onRoad = exitsAt(graph, node).filter((e) => sameName(roadName(graph, e.edge, node), first.road));
        const exit = named ?? (onRoad.length === 1 ? onRoad[0] : undefined);
        if (!exit) throw new Error(`No exit at ${from.x},${from.y} fits ${JSON.stringify(first)}`);
        pick = exit;
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
    if (leave && next === turns.length) {
      const edge = graph.edges[pick.edge];
      const stop = leaveStop(world, leave, node === edge.from ? edge.points : [...edge.points].reverse(), approach);
      if (stop) return { reached: false, node, leftAt: stop, graph };
    }
    into = pick.edge;
    node = otherEnd(graph.edges[pick.edge], node);
  }
  return { reached: false, node, leftAt: approach.at, graph };
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
