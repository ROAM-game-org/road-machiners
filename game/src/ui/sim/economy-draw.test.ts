import { describe, expect, it } from "vitest";
import { SHOPS } from "../../data/market";
import { siteOf } from "../../sim/market";
import { isRoadTile } from "../../sim/terrain";
import { dist } from "../../sim/vec";
import { TEST_MAP } from "../../test/map";
import { nearestOnRoute, pointAtShare, remainingFrom, RoadPaths, routeLength, type Spot } from "./economy-draw";

const spots: Spot[] = Object.keys(SHOPS).map((id) => ({ id, ...siteOf(id).pos }));
const paths = new RoadPaths(TEST_MAP.terrain);

describe("road paths between shops", () => {
  it("joins every pair of shops from one site center to the other", () => {
    for (const from of spots) {
      for (const to of spots.filter((s) => s.id !== from.id)) {
        const route = paths.between(from, to);
        expect(route.points[0]).toEqual({ x: from.x, y: from.y });
        expect(route.points[route.points.length - 1]).toEqual({ x: to.x, y: to.y });
        expect(routeLength(route)).toBeGreaterThanOrEqual(dist(from, to) - 1e-6);
      }
    }
  });

  it("keeps most vertices on road ground", () => {
    const [from, to] = [spots[0]!, spots[spots.length - 1]!];
    const inner = paths.between(from, to).points.slice(1, -1);
    expect(inner.length).toBeGreaterThan(2);
    const onRoad = inner.filter((p) => isRoadTile(TEST_MAP.terrain, p)).length;
    expect(onRoad / inner.length).toBeGreaterThan(0.8);
  });

  it("caches a pair so the second ask returns the same route", () => {
    const [from, to] = [spots[0]!, spots[1]!];
    expect(paths.between(from, to)).toBe(paths.between(from, to));
  });

  it("cuts the route at the point nearest a truck", () => {
    const [from, to] = [spots[0]!, spots[1]!];
    const route = paths.between(from, to);
    const middle = pointAtShare(route, 0.5).at;
    const rest = remainingFrom(route, middle);
    expect(dist(rest[0]!, middle)).toBeLessThan(1e-6);
    expect(rest[rest.length - 1]).toEqual({ x: to.x, y: to.y });
    expect(nearestOnRoute(route, middle).along).toBeCloseTo(routeLength(route) / 2, 3);
  });
});
