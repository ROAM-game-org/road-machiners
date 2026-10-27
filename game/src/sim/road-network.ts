import { DIRECTIONS } from '../data/directions';
import { atlasKeyString, atlasOf, atlasSites, type Atlas } from './atlas';
import { ObstacleBuckets, type Blocker } from './nav/buckets';
import { isTerritory, siteEdgeCrossings, siteGap, siteGates, type Site } from './sites';
import type { World } from './types';
import { dist, type Vec } from './vec';

export type RoadNode = { id: number; pos: Vec; site: string | null; entry: string | null };
export type RoadEdge = { id: number; road: number; from: number; to: number; points: Vec[]; length: number };
export type RoadGraph = { nodes: RoadNode[]; edges: RoadEdge[]; incident: number[][] };
export type SegmentSlot = Blocker & { edge: number; seg: number };
export type RoadNetwork = RoadGraph & { segments: ObstacleBuckets<SegmentSlot> };
export type RoadPoint = { edge: number; along: number; pos: Vec };
export type RoadPath = { nodes: number[]; edges: number[]; length: number };
export type RoadExit = { edge: number; heading: number };

type Cut = { seg: number; t: number };
type Projection = { road: number; seg: number; t: number; pos: Vec; gap: number };

const NETWORKS_KEPT = 4;
const networks = new Map<string, RoadNetwork>();

export function roadNetworkOf(world: World): RoadNetwork {
  const name = atlasKeyString(world.terrain.atlas);
  let net = networks.get(name);
  if (!net) {
    net = buildRoadNetwork(atlasOf(world.terrain), world.size);
    networks.set(name, net);
    while (networks.size > NETWORKS_KEPT) networks.delete(networks.keys().next().value as string);
  }
  return net;
}

export function buildRoadNetwork(atlas: Atlas, size: number): RoadNetwork {
  const lines = atlas.roads.map((r) => r.points);
  const cuts = lines.map((): Cut[] => []);
  const connectors: { road: number; from: Vec; to: Vec }[] = [];
  cutJoins(lines, cuts, connectors);
  cutCrossings(lines, cuts);
  const sites = atlasSites(atlas);
  cutSites(lines, cuts, sites);
  const gateCuts = cutGates(lines, cuts, sites);
  const nodes: RoadNode[] = [];
  const edges = [...piecesOf(lines, cuts, nodes), ...connectorEdges(connectors, nodes)];
  tagGates(nodes, gateCuts);
  tagEntries(nodes, sites);
  const kept = dropInsideSites(edges, sites).map((e, id) => ({ ...e, id }));
  const graph = graphOf(nodes, kept);
  requireReachable(graph, sites);
  return { ...graph, segments: segmentBuckets(kept, size) };
}

function projectOnRoads(lines: readonly (readonly Vec[])[], p: Vec, skip: number): Projection | null {
  let best: Projection | null = null;
  lines.forEach((line, road) => {
    if (road === skip) return;
    for (let seg = 0; seg + 1 < line.length; seg++) {
      const hit = projectOnSegment(p, line[seg], line[seg + 1]);
      if (!best || hit.gap < best.gap) best = { road, seg, t: hit.t, pos: hit.pos, gap: hit.gap };
    }
  });
  return best;
}

function projectOnSegment(p: Vec, a: Vec, b: Vec): { t: number; pos: Vec; gap: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const pos = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, pos, gap: dist(p, pos) };
}

function cutJoins(lines: readonly (readonly Vec[])[], cuts: Cut[][], connectors: { road: number; from: Vec; to: Vec }[]): void {
  lines.forEach((line, road) => {
    for (const end of [line[0], line[line.length - 1]]) {
      const hit = projectOnRoads(lines, end, road);
      if (!hit || hit.gap > DIRECTIONS.joinSnap) continue;
      cuts[hit.road].push({ seg: hit.seg, t: hit.t });
      if (hit.gap > DIRECTIONS.nodeMerge) connectors.push({ road, from: end, to: hit.pos });
    }
  });
}

function cutCrossings(lines: readonly (readonly Vec[])[], cuts: Cut[][]): void {
  for (let r1 = 0; r1 < lines.length; r1++)
    for (let r2 = r1 + 1; r2 < lines.length; r2++)
      for (let s1 = 0; s1 + 1 < lines[r1].length; s1++)
        for (let s2 = 0; s2 + 1 < lines[r2].length; s2++) {
          const hit = segmentCrossing(lines[r1][s1], lines[r1][s1 + 1], lines[r2][s2], lines[r2][s2 + 1]);
          if (!hit) continue;
          cuts[r1].push({ seg: s1, t: hit.t });
          cuts[r2].push({ seg: s2, t: hit.u });
        }
}

function segmentCrossing(a: Vec, b: Vec, c: Vec, d: Vec): { t: number; u: number } | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (den === 0) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { t, u } : null;
}

function cutSites(lines: readonly (readonly Vec[])[], cuts: Cut[][], sites: readonly Site[]): void {
  lines.forEach((line, road) => {
    for (const site of sites) {
      for (let seg = 0; seg + 1 < line.length; seg++) {
        for (const p of siteEdgeCrossings(site, line[seg], line[seg + 1])) cuts[road].push({ seg, t: projectOnSegment(p, line[seg], line[seg + 1]).t });
      }
    }
  });
}

function cutGates(lines: readonly (readonly Vec[])[], cuts: Cut[][], sites: readonly Site[]): { site: string; pos: Vec }[] {
  return sites.filter((s) => !isTerritory(s)).flatMap((site) =>
    siteGates(site).map((gate) => {
      const hit = projectOnRoads(lines, gate, -1);
      if (!hit || hit.gap > DIRECTIONS.joinSnap) throw new Error(`Gate of ${site.id} is not on a road`);
      cuts[hit.road].push({ seg: hit.seg, t: hit.t });
      return { site: site.id, pos: hit.pos };
    }),
  );
}

function nodeAt(nodes: RoadNode[], pos: Vec): number {
  const near = nodes.find((n) => dist(n.pos, pos) <= DIRECTIONS.nodeMerge);
  if (near) return near.id;
  nodes.push({ id: nodes.length, pos, site: null, entry: null });
  return nodes.length - 1;
}

function polylineLength(points: readonly Vec[]): number {
  return points.slice(1).reduce((sum, p, i) => sum + dist(points[i], p), 0);
}

function cutPos(line: readonly Vec[], cut: Cut): Vec {
  const a = line[cut.seg];
  const b = line[cut.seg + 1];
  return { x: a.x + (b.x - a.x) * cut.t, y: a.y + (b.y - a.y) * cut.t };
}

function piecesOf(lines: readonly (readonly Vec[])[], cuts: Cut[][], nodes: RoadNode[]): RoadEdge[] {
  const edges: RoadEdge[] = [];
  lines.forEach((line, road) => {
    const all = [{ seg: 0, t: 0 }, ...cuts[road], { seg: line.length - 2, t: 1 }].sort((a, b) => a.seg - b.seg || a.t - b.t);
    for (let k = 0; k + 1 < all.length; k++) {
      const a = all[k];
      const b = all[k + 1];
      const middle = line.slice(a.seg + 1, b.seg + 1);
      const points = [cutPos(line, a), ...middle, cutPos(line, b)].filter((p, i, arr) => i === 0 || dist(p, arr[i - 1]) > 1e-6);
      if (points.length < 2) continue;
      const from = nodeAt(nodes, points[0]);
      const to = nodeAt(nodes, points[points.length - 1]);
      if (from === to && polylineLength(points) < DIRECTIONS.nodeMerge * 2) continue;
      edges.push({ id: edges.length, road, from, to, points, length: polylineLength(points) });
    }
  });
  return edges;
}

function connectorEdges(connectors: { road: number; from: Vec; to: Vec }[], nodes: RoadNode[]): RoadEdge[] {
  return connectors.map((c) => ({ id: -1, road: c.road, from: nodeAt(nodes, c.from), to: nodeAt(nodes, c.to), points: [c.from, c.to], length: dist(c.from, c.to) }));
}

function tagGates(nodes: RoadNode[], gates: { site: string; pos: Vec }[]): void {
  for (const gate of gates) {
    const node = nodes.find((n) => dist(n.pos, gate.pos) <= DIRECTIONS.nodeMerge);
    if (node && node.site === null) node.site = gate.site;
  }
}

function tagEntries(nodes: RoadNode[], sites: readonly Site[]): void {
  for (const site of sites.filter(isTerritory)) {
    for (const node of nodes) {
      if (Math.abs(siteGap(site, node.pos)) <= DIRECTIONS.nodeMerge && dist(node.pos, site.pos) <= site.radius + 1) node.entry = site.id;
    }
  }
}

function midpoint(edge: RoadEdge): Vec {
  let left = edge.length / 2;
  for (let i = 0; i + 1 < edge.points.length; i++) {
    const a = edge.points[i];
    const b = edge.points[i + 1];
    const len = dist(a, b);
    if (left <= len) return len === 0 ? a : { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len };
    left -= len;
  }
  return edge.points[edge.points.length - 1];
}

function dropInsideSites(edges: RoadEdge[], sites: readonly Site[]): RoadEdge[] {
  const walled = sites.filter((s) => !isTerritory(s));
  return edges.filter((e) => {
    const mid = midpoint(e);
    return !walled.some((s) => siteGap(s, mid) < -DIRECTIONS.nodeMerge);
  });
}

function graphOf(nodes: RoadNode[], edges: RoadEdge[]): RoadGraph {
  const incident: number[][] = nodes.map(() => []);
  for (const e of edges) {
    incident[e.from].push(e.id);
    if (e.to !== e.from) incident[e.to].push(e.id);
  }
  return { nodes, edges, incident };
}

function requireReachable(graph: RoadGraph, sites: readonly Site[]): void {
  for (const site of sites) {
    const found = graph.nodes.some((n) => (isTerritory(site) ? n.entry === site.id : n.site === site.id) && graph.incident[n.id].length > 0);
    if (!found) throw new Error(`Site ${site.id} has no road node`);
  }
}

function segmentBuckets(edges: readonly RoadEdge[], size: number): ObstacleBuckets<SegmentSlot> {
  const slots: SegmentSlot[] = edges.flatMap((e) =>
    e.points.slice(1).map((b, seg) => {
      const a = e.points[seg];
      return { pos: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r: dist(a, b) / 2, edge: e.id, seg };
    }),
  );
  return new ObstacleBuckets(slots, size);
}

function alongOf(edge: RoadEdge, seg: number, t: number): number {
  return polylineLength(edge.points.slice(0, seg + 1)) + dist(edge.points[seg], edge.points[seg + 1]) * t;
}

export function nearestRoadPoints(net: RoadNetwork, pos: Vec, reach: number, count: number): RoadPoint[] {
  const best = new Map<number, RoadPoint & { gap: number }>();
  for (const slot of net.segments.alongSegment(pos, pos, reach)) {
    const edge = net.edges[slot.edge];
    const hit = projectOnSegment(pos, edge.points[slot.seg], edge.points[slot.seg + 1]);
    if (hit.gap > reach) continue;
    const known = best.get(edge.id);
    if (!known || hit.gap < known.gap) best.set(edge.id, { edge: edge.id, along: alongOf(edge, slot.seg, hit.t), pos: hit.pos, gap: hit.gap });
  }
  return [...best.values()].sort((a, b) => a.gap - b.gap || a.edge - b.edge).slice(0, count).map(({ edge, along, pos: p }) => ({ edge, along, pos: p }));
}

export function exitsAt(graph: RoadGraph, node: number): RoadExit[] {
  const out: RoadExit[] = [];
  for (const id of graph.incident[node]) {
    const e = graph.edges[id];
    if (e.from === node) out.push({ edge: id, heading: headingOf(e.points[0], e.points[1]) });
    if (e.to === node) out.push({ edge: id, heading: headingOf(e.points[e.points.length - 1], e.points[e.points.length - 2]) });
  }
  return out;
}

function headingOf(a: Vec, b: Vec): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function otherEnd(edge: RoadEdge, node: number): number {
  return edge.from === node ? edge.to : edge.from;
}

export function shortestPath(graph: RoadGraph, from: number, goals: readonly number[]): RoadPath | null {
  const cost = graph.nodes.map(() => Infinity);
  const via: (number | null)[] = graph.nodes.map(() => null);
  const done = graph.nodes.map(() => false);
  cost[from] = 0;
  for (;;) {
    let at = -1;
    for (let i = 0; i < cost.length; i++) if (!done[i] && cost[i] < Infinity && (at < 0 || cost[i] < cost[at])) at = i;
    if (at < 0) return null;
    if (goals.includes(at)) return pathTo(graph, via, cost, at);
    done[at] = true;
    for (const id of graph.incident[at]) {
      const e = graph.edges[id];
      const next = otherEnd(e, at);
      if (cost[at] + e.length < cost[next]) {
        cost[next] = cost[at] + e.length;
        via[next] = id;
      }
    }
  }
}

function pathTo(graph: RoadGraph, via: (number | null)[], cost: number[], end: number): RoadPath {
  const nodes = [end];
  const edges: number[] = [];
  for (let at = end; via[at] !== null; ) {
    const e = graph.edges[via[at] as number];
    edges.unshift(e.id);
    at = otherEnd(e, at);
    nodes.unshift(at);
  }
  return { nodes, edges, length: cost[end] };
}

function slicePoints(edge: RoadEdge, a: number, b: number): Vec[] {
  const out: Vec[] = [pointAlong(edge, a)];
  let run = 0;
  for (let i = 1; i < edge.points.length; i++) {
    run += dist(edge.points[i - 1], edge.points[i]);
    if (run > a && run < b) out.push(edge.points[i]);
  }
  out.push(pointAlong(edge, b));
  return out;
}

function pointAlong(edge: RoadEdge, along: number): Vec {
  let left = along;
  for (let i = 0; i + 1 < edge.points.length; i++) {
    const a = edge.points[i];
    const b = edge.points[i + 1];
    const len = dist(a, b);
    if (left <= len) return len === 0 ? a : { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len };
    left -= len;
  }
  return edge.points[edge.points.length - 1];
}

export function splitAt(net: RoadGraph, points: readonly RoadPoint[]): { graph: RoadGraph; nodes: number[] } {
  const nodes = net.nodes.map((n) => ({ ...n }));
  const nodeOf: number[] = [];
  const byEdge = new Map<number, number[]>();
  points.forEach((p, i) => byEdge.set(p.edge, [...(byEdge.get(p.edge) ?? []), i]));
  const edges: RoadEdge[] = [];
  for (const e of net.edges) {
    const here = (byEdge.get(e.id) ?? []).sort((a, b) => points[a].along - points[b].along);
    let start = 0;
    let from = e.from;
    const piece = (to: number, end: number) => {
      if (end - start <= 1e-9 && from === to) return;
      edges.push({ id: edges.length, road: e.road, from, to, points: slicePoints(e, start, end), length: end - start });
      from = to;
      start = end;
    };
    for (const i of here) {
      const along = points[i].along;
      if (along <= DIRECTIONS.nodeMerge) nodeOf[i] = e.from;
      else if (along >= e.length - DIRECTIONS.nodeMerge) nodeOf[i] = e.to;
      else {
        const known = here.find((j) => j < i && nodeOf[j] !== undefined && Math.abs(points[j].along - along) <= DIRECTIONS.nodeMerge);
        if (known !== undefined) nodeOf[i] = nodeOf[known];
        else {
          nodes.push({ id: nodes.length, pos: points[i].pos, site: null, entry: null });
          nodeOf[i] = nodes.length - 1;
          piece(nodeOf[i], along);
        }
      }
    }
    piece(e.to, e.length);
  }
  return { graph: graphOf(nodes, edges), nodes: nodeOf };
}

export function isJunction(graph: RoadGraph, node: number): boolean {
  return graph.incident[node].length >= 3;
}

export function roadPointAt(graph: RoadGraph, share: number): Vec {
  let left = share * graph.edges.reduce((sum, e) => sum + e.length, 0);
  for (const edge of graph.edges) {
    if (left <= edge.length) return { ...pointAlong(edge, left) };
    left -= edge.length;
  }
  return { ...graph.edges[graph.edges.length - 1].points.at(-1)! };
}

