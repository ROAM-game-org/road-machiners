import { REGION } from '../data/region';
import { nearestRoadPoints, roadNetworkOf, shortestPath, splitAt, type RoadGraph, type RoadPath } from './road-network';
import type { World } from './types';
import { dist, type Vec } from './vec';

export type Waypoint = { pos: Vec; partial: boolean };

export function farWaypoint(w: World, from: Vec, dest: Vec, offRoad: boolean): Waypoint {
  const window = REGION.navigation.farWindow;
  if (dist(from, dest) <= window) return { pos: dest, partial: false };
  const line = offRoad ? null : roadLine(w, from, dest, window);
  return pointAhead(line ?? [from, dest], window);
}

function roadLine(w: World, from: Vec, dest: Vec, reach: number): Vec[] | null {
  const net = roadNetworkOf(w);
  const [a] = nearestRoadPoints(net, from, reach, 1);
  const [b] = nearestRoadPoints(net, dest, reach, 1);
  if (!a || !b) return null;
  const { graph, nodes } = splitAt(net, [a, b]);
  const path = shortestPath(graph, nodes[0], [nodes[1]]);
  return path ? [from, ...pathPoints(graph, path), dest] : null;
}

function pathPoints(graph: RoadGraph, path: RoadPath): Vec[] {
  const out: Vec[] = [graph.nodes[path.nodes[0]].pos];
  path.edges.forEach((id, i) => {
    const edge = graph.edges[id];
    const points = edge.from === path.nodes[i] ? edge.points : [...edge.points].reverse();
    out.push(...points.slice(1));
  });
  return out;
}

function pointAhead(line: readonly Vec[], window: number): Waypoint {
  let left = window;
  for (let i = 1; i < line.length; i++) {
    const step = dist(line[i - 1], line[i]);
    if (left < step) return { pos: { x: line[i - 1].x + ((line[i].x - line[i - 1].x) * left) / step, y: line[i - 1].y + ((line[i].y - line[i - 1].y) * left) / step }, partial: true };
    left -= step;
  }
  return { pos: line[line.length - 1], partial: false };
}
