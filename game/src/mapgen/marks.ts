
import { REGION, type TerritoryDef } from '../data/region';
import type { FarmRoad } from '../data/territory';
import { TERRAIN } from '../data/terrain';
import { ICARUS_KEY } from '../sim/atlas';
import { flattenFalloff } from '../sim/elevation';
import { gradePaths, type GradedPad } from '../sim/road-grade';
import { ROAD_INDEX } from '../sim/road-index';
import { siteGap } from '../sim/sites';
import { dist, segmentDist, type Vec } from '../sim/vec';
import { tileSteepness, type MapDraft } from './bake';
import { BUILT_SCRUB, BUILT_TRACK } from './newworld';
import { BUILT_NONE, BUILT_OLD_ROAD, tileCenter, tileOf, tilesWithin } from './oldworld';

const ROAD_END_SLACK = 1;
const NEW_ROAD_SURFACE = REGION.roadWidth / 2 + 1;

export type Touch = (pos: Vec, r: number) => boolean;
export type Line = { points: Vec[]; width: number };
export type Reach = 'inside' | 'spur';

export function markRoads(d: MapDraft, t: TerritoryDef, roads: readonly FarmRoad[], reach: Reach): Touch {
  const lines = roads.map((road) => {
    const line = { points: road.points.map((p) => roadPoint(d, t, p, reach)), width: road.width };
    markLine(d, t, line, road.surface === 'oldRoad' ? BUILT_OLD_ROAD : BUILT_TRACK, reach);
    return line;
  });
  return (pos, r) => lines.some((line) => line.points.slice(1).some((b, k) => segmentDist(pos, line.points[k], b) < line.width / 2 + r));
}

export function gradeTerritoryRoads(d: MapDraft, t: TerritoryDef, roads: readonly FarmRoad[], pads: readonly GradedPad[]): void {
  const paths = roads.map((road) => ({ points: road.points, width: road.width, grade: road.grade ?? TERRAIN.roadGrade }));
  const graded = gradePaths({ size: d.size, heights: Array.from(d.heights), types: [], atlas: ICARUS_KEY }, paths, TERRAIN.farmGradeMargin, pads);
  const reach = Math.max(ROAD_END_SLACK + Math.max(...roads.map((road) => road.width / 2)) + TERRAIN.farmGradeMargin, Math.SQRT2 + TERRAIN.levelMargin);
  graded.forEach((h, k) => {
    if (h === d.heights[k]) return;
    const corner = { x: k % (d.size + 1), y: Math.floor(k / (d.size + 1)) };
    if (siteGap(t, corner) > reach) throw new Error(`${t.id} road grading moves the ground at ${at(corner)}, outside the territory`);
    const onPad = pads.some((pad) => dist(pad.pos, corner) <= pad.r);
    d.heights[k] += (h - d.heights[k]) * (onPad ? 1 : 1 - newRoadHold(corner));
  });
}

export function newRoadHold(p: Vec): number {
  const nearest = ROAD_INDEX.nearestWithin(p.x, p.y, NEW_ROAD_SURFACE + TERRAIN.farmGradeMargin);
  return nearest === Infinity ? 0 : flattenFalloff(nearest - NEW_ROAD_SURFACE, TERRAIN.farmGradeMargin);
}

export function throwOnRoadCliffs(d: MapDraft, t: TerritoryDef, roads: readonly FarmRoad[]): void {
  for (const road of roads) {
    for (let k = 1; k < road.points.length; k++) {
      const [a, b] = [road.points[k - 1], road.points[k]];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      for (const tile of tilesWithin(d.size, mid, dist(a, b) / 2 + road.width)) {
        const c = tileCenter(d.size, tile);
        if (segmentDist(c, a, b) > road.width / 2 || siteGap(t, c) >= 0) continue;
        if (steep(d, tile)) throw new Error(`${t.id} road at ${at(c)} runs over a cliff`);
      }
    }
  }
}

function roadPoint(d: MapDraft, t: TerritoryDef, p: Vec, reach: Reach): Vec {
  const gap = siteGap(t, p);
  if (reach === 'inside' && gap > ROAD_END_SLACK) throw new Error(`${t.id} road point at ${at(p)} lies outside the territory`);
  if ((reach === 'spur' || gap < 0) && steep(d, tileOf(d.size, p))) throw new Error(`${t.id} road point at ${at(p)} lies on a cliff`);
  return p;
}

export function markLine(d: MapDraft, t: TerritoryDef, line: Line, code: number, reach: Reach): void {
  for (let k = 1; k < line.points.length; k++) markLeg(d, t, line.points[k - 1], line.points[k], line.width, code, reach);
}

function markLeg(d: MapDraft, t: TerritoryDef, a: Vec, b: Vec, width: number, code: number, reach: Reach): void {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  for (const tile of tilesWithin(d.size, mid, dist(a, b) / 2 + width)) {
    const c = tileCenter(d.size, tile);
    if (segmentDist(c, a, b) > width / 2) continue;
    if (reach === 'inside') {
      if (siteGap(t, c) < 0) mark(d, tile, code);
      continue;
    }
    spurTile(d, t, tile, c);
    mark(d, tile, code);
  }
}

function spurTile(d: MapDraft, t: TerritoryDef, tile: number, c: Vec): void {
  const where = `${t.id} spur at ${at(c)}`;
  const blocker = landBlocker(d, t, tile, c) ?? builtBlocker(d, tile, c);
  if (blocker) throw new Error(`${where} ${blocker}`);
  if (d.built[tile] === BUILT_SCRUB) d.built[tile] = BUILT_NONE;
}

function landBlocker(d: MapDraft, t: TerritoryDef, tile: number, c: Vec): string | null {
  if (steep(d, tile)) return 'runs over a cliff';
  if (onNewRoad(c, REGION.obstacles.roadClearance)) return 'runs onto a region road';
  const site = [...REGION.towns, ...REGION.locations].find((s) => s.id !== t.id && siteGap(s, c) < 0);
  return site ? `runs into ${site.id}` : null;
}

function builtBlocker(d: MapDraft, tile: number, c: Vec): string | null {
  const under = d.props.find((p) => dist(p.pos, c) < p.r);
  if (under) return `runs under a ${under.kind} at ${at(under.pos)}`;
  return [BUILT_NONE, BUILT_SCRUB, BUILT_TRACK].includes(d.built[tile]) ? null : `runs over ground marked ${d.built[tile]}`;
}

export function mark(d: MapDraft, tile: number, code: number): void {
  if (d.built[tile] === BUILT_NONE) d.built[tile] = code;
}

export function onNewRoad(pos: Vec, r: number): boolean {
  const reach = REGION.roadWidth / 2 + r;
  return ROAD_INDEX.nearestWithin(pos.x, pos.y, reach) < reach;
}

export function steep(d: MapDraft, tile: number): boolean {
  return tileSteepness(d.heights, d.size, tile) > TERRAIN.drive.maxSlope;
}

export function at(p: Vec): string {
  return `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`;
}
