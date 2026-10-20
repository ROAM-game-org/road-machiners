import { DIRECTIONS } from '../data/directions';
import { REGION } from '../data/region';
import { atlasOf, atlasSites } from './atlas';
import { cueAt, headingAlong, octantOf, roadName, spanOf, type CueSpot } from './direction-cues';
import { exitsAt, isJunction, nearestRoadPoints, roadNetworkOf, shortestPath, splitAt, type RoadGraph, type RoadPath, type RoadPoint } from './road-network';
import { isTerritory } from './sites';
import { isCliff, tileAt } from './terrain';
import type { Cue, DirectionStep, DirectionTarget, TurnSide, World } from './types';
import { angleDiff, dist, type Vec } from './vec';

type Spoken = { at: number; side: TurnSide; cue: Cue | null; out: number };

const CLEAR_STEP = 1;

export function directionsTo(world: World, from: Vec, target: DirectionTarget): DirectionStep[] {
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y)) throw new Error('Directions need a finite start');
  const aim = targetPos(target);
  const rough = { octant: octantOf({ x: aim.x - from.x, y: aim.y - from.y }), span: spanOf(dist(from, aim)) };
  if (target.kind === 'spot' && dist(from, aim) <= DIRECTIONS.directReach && clearLine(world, from, aim)) {
    return [{ do: 'straight', ...rough }, wreckSearch()];
  }
  if (!onThisMap(world, target)) return [{ do: 'noRoad', ...rough }];
  const net = roadNetworkOf(world);
  const start = startPoint(world, from, net);
  const leave = target.kind === 'spot' ? leavePoint(world, net, target.pos) : null;
  if (!start || (target.kind === 'spot' && !leave)) return [{ do: 'noRoad', ...rough }];
  const { graph, nodes } = splitAt(net, leave ? [start.point, leave] : [start.point]);
  const goals = leave ? [nodes[1]] : goalNodes(graph, target.kind === 'site' ? target.id : '');
  const path = shortestPath(graph, nodes[0], goals);
  if (!path) return [{ do: 'noRoad', ...rough }];
  const head: DirectionStep[] = start.join ? [start.join] : [];
  return [...head, ...speakPath(world, graph, path, target, leave ? aim : null)];
}

function targetPos(target: DirectionTarget): Vec {
  if (target.kind === 'spot') return target.pos;
  const site = [...REGION.towns, ...REGION.locations].find((s) => s.id === target.id);
  if (!site) throw new Error(`Directions to unknown site ${target.id}`);
  return site.pos;
}

function onThisMap(world: World, target: DirectionTarget): boolean {
  return target.kind === 'spot' || atlasSites(atlasOf(world.terrain)).some((s) => s.id === target.id);
}

function goalNodes(graph: RoadGraph, site: string): number[] {
  return graph.nodes.filter((n) => (n.site === site || n.entry === site) && graph.incident[n.id].length > 0).map((n) => n.id);
}

function startPoint(world: World, from: Vec, net: ReturnType<typeof roadNetworkOf>): { point: RoadPoint; join: DirectionStep | null } | null {
  const near = nearestRoadPoints(net, from, DIRECTIONS.joinReach, DIRECTIONS.joinCandidates);
  if (near.length === 0) return null;
  if (dist(from, near[0].pos) <= DIRECTIONS.onRoad) return { point: near[0], join: null };
  const point = near.find((p) => clearLine(world, from, p.pos));
  if (!point) return null;
  const join: DirectionStep = { do: 'join', octant: octantOf({ x: point.pos.x - from.x, y: point.pos.y - from.y }), span: spanOf(dist(from, point.pos)) };
  return { point, join };
}

function leavePoint(world: World, net: ReturnType<typeof roadNetworkOf>, spot: Vec): RoadPoint | null {
  return nearestRoadPoints(net, spot, DIRECTIONS.leaveReach, DIRECTIONS.joinCandidates).find((p) => clearLine(world, p.pos, spot)) ?? null;
}

export function clearLine(world: World, a: Vec, b: Vec): boolean {
  const steps = Math.max(1, Math.ceil(dist(a, b) / CLEAR_STEP));
  for (let i = 0; i <= steps; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
    if (isCliff(world.terrain, tileAt(world.terrain, p))) return false;
  }
  return true;
}

function wreckSearch(): DirectionStep {
  return { do: 'search', clue: { kind: 'wreck' }, rough: true };
}

function travelHeading(graph: RoadGraph, edge: number, node: number): number {
  const exit = exitsAt(graph, node).find((e) => e.edge === edge);
  if (!exit) throw new Error(`Edge ${edge} does not meet node ${node}`);
  return exit.heading + Math.PI;
}

function sideOf(turn: number): TurnSide {
  if (Math.abs(turn) > DIRECTIONS.keepAngle) return turn > 0 ? 'right' : 'left';
  return turn > 0 ? 'keepRight' : 'keepLeft';
}

function decision(graph: RoadGraph, node: number, into: number, out: number): TurnSide | null {
  if (!isJunction(graph, node)) return null;
  const heading = travelHeading(graph, into, node);
  const exits = exitsAt(graph, node).filter((e) => e.edge !== into);
  const chosen = exits.find((e) => e.edge === out);
  if (!chosen) throw new Error(`Route leaves node ${node} by an edge it does not have`);
  const straightest = exits.reduce((a, b) => (Math.abs(angleDiff(heading, b.heading)) < Math.abs(angleDiff(heading, a.heading)) ? b : a));
  const turn = angleDiff(heading, chosen.heading);
  const sameRoad = graph.edges[into].road === graph.edges[out].road;
  return sameRoad && straightest.edge === chosen.edge ? null : sideOf(turn);
}

function legLines(graph: RoadGraph, leg: readonly number[], nodes: readonly number[], first: number): Vec[][] {
  return leg.map((id, i) => {
    const edge = graph.edges[id];
    return nodes[first + i] === edge.from ? edge.points : [...edge.points].reverse();
  });
}

function walkPath(world: World, graph: RoadGraph, path: RoadPath): { spoken: Spoken[]; legs: number[]; tail: CueSpot } {
  const spoken: Spoken[] = [];
  const legs: number[] = [];
  let first = 0;
  let earlier: Vec[] = [];
  let forks = 0;
  let legStart = graph.nodes[path.nodes[0]].pos;
  const last = path.nodes.length - 1;
  for (let i = 1; i < last; i++) {
    const node = path.nodes[i];
    const junction = isJunction(graph, node);
    if (junction) forks++;
    const side = decision(graph, node, path.edges[i - 1], path.edges[i]);
    if (side) {
      const leg = legLines(graph, path.edges.slice(first, i), path.nodes, first);
      const cue = cueAt(world, { pos: graph.nodes[node].pos, legStart, leg, earlier, forks, junctionHere: true });
      spoken.push({ at: i, side, cue, out: path.edges[i] });
      legs.push(lengthOf(graph, path.edges.slice(first, i)));
      first = i;
      legStart = graph.nodes[node].pos;
      earlier = [];
      forks = 0;
    } else if (junction) earlier.push(graph.nodes[node].pos);
  }
  legs.push(lengthOf(graph, path.edges.slice(first)));
  const pos = graph.nodes[path.nodes[last]].pos;
  const leg = legLines(graph, path.edges.slice(first), path.nodes, first);
  return { spoken, legs, tail: { pos, legStart, leg, earlier, forks, junctionHere: false } };
}

function firstLegOf(path: RoadPath, spoken: readonly Spoken[]): number[] {
  return path.edges.slice(0, spoken.length > 0 ? spoken[0].at : path.edges.length);
}

function lengthOf(graph: RoadGraph, edges: readonly number[]): number {
  return edges.reduce((sum, id) => sum + graph.edges[id].length, 0);
}

function speakPath(world: World, graph: RoadGraph, path: RoadPath, target: DirectionTarget, spot: Vec | null): DirectionStep[] {
  const { spoken, legs, tail } = walkPath(world, graph, path);
  const steps: DirectionStep[] = [];
  if (path.edges.length > 0) {
    const heading = headingAlong(legLines(graph, firstLegOf(path, spoken), path.nodes, 0), DIRECTIONS.headingReach);
    steps.push({ do: 'follow', road: roadName(graph, path.edges[0], path.nodes[0]), heading, span: spanOf(legs[0]) });
  }
  const firstUnreliable = spoken.findIndex((s) => s.cue === null);
  const allowed = spoken.slice(0, Math.min(DIRECTIONS.maxSteps, firstUnreliable < 0 ? spoken.length : firstUnreliable));
  allowed.forEach((s, j) => steps.push({ do: 'turn', side: s.side, at: s.cue as Cue, road: roadName(graph, s.out, path.nodes[s.at]), span: spanOf(legs[j + 1]) }));
  if (spoken.length > allowed.length) return [...steps, { do: 'askAgain' }];
  return [...steps, ...finish(world, target, tail, spot)];
}

function finish(world: World, target: DirectionTarget, tail: CueSpot, spot: Vec | null): DirectionStep[] {
  if (target.kind === 'site') {
    const site = atlasSites(atlasOf(world.terrain)).find((s) => s.id === target.id);
    if (!site) throw new Error(`Directions to unknown site ${target.id}`);
    return [{ do: 'arrive', site: site.id, area: isTerritory(site) }, { do: 'search', clue: { kind: 'site', id: site.id }, rough: false }];
  }
  if (!spot) throw new Error('A spot target needs its leave point');
  const aim = { x: spot.x - tail.pos.x, y: spot.y - tail.pos.y };
  const at = cueAt(world, tail);
  if (!at) return [{ do: 'askAgain' }];
  return [{ do: 'leave', at, octant: octantOf(aim), span: spanOf(Math.hypot(aim.x, aim.y)) }, wreckSearch()];
}
