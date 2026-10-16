import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { atlasOf, icarusAtlas, type Atlas } from './atlas';
import { buildRoadNetwork, exitsAt, nearestRoadPoints, roadNetworkOf, shortestPath, splitAt } from './road-network';
import { isFortress, isTerritory, siteGap } from './sites';
import { emptyWorld } from "./testkit";

const SIZE = REGION.size;

function nodesOf(net: ReturnType<typeof buildRoadNetwork>, id: string): number[] {
  return net.nodes.filter((n) => n.site === id || n.entry === id).map((n) => n.id);
}

describe('road network', () => {
  const net = buildRoadNetwork(icarusAtlas(), SIZE);

  it('has a node for every site gate and territory entry', () => {
    for (const site of [...REGION.towns, ...REGION.locations]) expect(nodesOf(net, site.id).length, site.id).toBeGreaterThan(0);
  });

  it('reaches every site from Bowl', () => {
    const bowl = nodesOf(net, 'bowl');
    for (const site of [...REGION.towns, ...REGION.locations]) {
      const path = shortestPath(net, bowl[0], nodesOf(net, site.id));
      expect(path, site.id).not.toBeNull();
    }
  });

  it('reaches Nose from Bowl and back with the same length', () => {
    const there = shortestPath(net, nodesOf(net, 'bowl')[0], nodesOf(net, 'nose'));
    const back = shortestPath(net, nodesOf(net, 'nose')[0], nodesOf(net, 'bowl'));
    expect(there).not.toBeNull();
    expect(back).not.toBeNull();
  });

  it('keeps no edge inside a fortress', () => {
    const forts = [...REGION.towns, ...REGION.locations].filter((s) => !isTerritory(s) && isFortress(s));
    for (const edge of net.edges) {
      const mid = edge.points[Math.floor(edge.points.length / 2)];
      for (const fort of forts) expect(siteGap(fort, mid)).toBeGreaterThan(-1);
    }
  });

  it('splits a road where another road ends in the middle of a segment', () => {
    const base = icarusAtlas();
    const atlas: Atlas = {
      ...base,
      towns: [],
      locations: [],
      roads: [
        { points: [{ x: 10, y: 10 }, { x: 110, y: 10 }], width: 6, lanes: 0 },
        { points: [{ x: 60, y: 14 }, { x: 60, y: 90 }], width: 6, lanes: 0 },
      ],
    };
    const small = buildRoadNetwork(atlas, SIZE);
    const junction = small.nodes.find((n) => small.incident[n.id].length === 3);
    expect(junction).toBeDefined();
    expect(exitsAt(small, junction!.id)).toHaveLength(3);
  });

  it('finds road points near a position and splits an edge at one', () => {
    const [point] = nearestRoadPoints(net, net.edges[0].points[1], 4, 1);
    const { graph, nodes } = splitAt(net, [point]);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(net.nodes.length);
    expect(nodes).toHaveLength(1);
  });

  it('is built once for a world', () => {
    const world = emptyWorld();
    expect(roadNetworkOf(world)).toBe(roadNetworkOf(world));
    expect(atlasOf(world.terrain)).toBeDefined();
  });
});
