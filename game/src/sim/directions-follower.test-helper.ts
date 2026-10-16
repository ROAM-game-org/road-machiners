import { DIRECTIONS } from '../data/directions';
import { atlasOf, atlasSites } from './atlas';
import { roadName } from './direction-cues';
import { exitsAt, nearestRoadPoints, otherEnd, roadNetworkOf, splitAt, type RoadGraph } from './road-network';
import { propsAround } from './prop-index';
import { siteGap } from './sites';
import type { Cue, DirectionStep, RoadName, World } from './types';
import { angleDiff, dist, polylineDist, type Vec } from './vec';

const MAX_MOVES = 200;

type Turn = Extract<DirectionStep, { do: 'turn' }>;

export type Followed = { reached: boolean; node: number; closest: number; graph: RoadGraph };

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

export function followSteps(world: World, from: Vec, steps: readonly DirectionStep[], goal: { site: string } | { spot: Vec }): Followed {
  const net = roadNetworkOf(world);
  const [point] = nearestRoadPoints(net, from, DIRECTIONS.joinReach, 1);
  const { graph, nodes } = splitAt(net, [point]);
  const turns = steps.filter((s): s is Turn => s.do === 'turn');
  const first = steps.find((s) => s.do === 'follow');
  const spot = 'spot' in goal ? goal.spot : null;
  let node = nodes[0];
  let into: number | null = null;
  let forks = 0;
  let next = 0;
  let closest = Infinity;
  for (let move = 0; move < MAX_MOVES; move++) {
    const here = graph.nodes[node];
    if ('site' in goal && (here.site === goal.site || here.entry === goal.site)) return { reached: true, node, closest, graph };
    const exits = exitsAt(graph, node).filter((e) => e.edge !== into);
    if (exits.length === 0) break;
    let pick = exits[0];
    if (into === null) {
      if (first?.do === 'follow') pick = exits.find((e) => sameName(roadName(graph, e.edge, node), first.road)) ?? exits[0];
    } else if (exits.length > 1) {
      forks++;
      const turn = turns[next];
      if (turn && cueMatches(world, graph, node, turn.at, forks)) {
        pick = turnExit(graph, node, into, exits, turn);
        next++;
        forks = 0;
      } else pick = straightest(graph, node, into, exits);
    }
    if (spot && next === turns.length) closest = Math.min(closest, polylineDist(spot, graph.edges[pick.edge].points));
    into = pick.edge;
    node = otherEnd(graph.edges[pick.edge], node);
  }
  return { reached: false, node, closest, graph };
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
