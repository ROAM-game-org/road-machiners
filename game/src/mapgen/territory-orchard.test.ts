import { beforeAll, describe, expect, it } from 'vitest';
import { along } from '../test/territory-kit';
import { ECONOMY } from '../data/goods';
import { PHYSICS } from '../data/physics';
import { ORCHARD_HEADING, REGION, scalePoint, type TerritoryDef } from '../data/region';
import { MAPGEN, TERRAIN } from '../data/terrain';
import { EMPLACEMENT, onOrchardRoad, PERIMETER, TERRITORIES, type Run, type TerritoryRules } from '../data/territory';
import { boxDistance, propBoxes, propPose, propReach } from '../sim/mapgen';
import { siteGap } from '../sim/sites';
import { route } from '../sim/path';
import { ROAD_INDEX } from '../sim/road-index';
import { isLootSpot, territoryAt, territoryCaches, territoryEntries, territoryOfStock, territoryPieces, territoryRoads, type BakedPiece } from '../sim/territory';
import { groundAt, type BakedProp, type Terrain } from '../sim/terrain';
import { angleDiff, dist, lerp, segmentDist, type Vec } from '../sim/vec';
import { TEST_MAP } from '../test/map';
import { footprintRelief, groundForTerritories, newDraft, tileSteepness, type MapDraft } from './bake';
import { fillFarm } from './farm';
import { newRoadHold } from './marks';
import { BUILT_CANAL, BUILT_GLASS, BUILT_PAD, BUILT_TRACK } from './newworld';
import { BUILT_FIELD, BUILT_OLD_ROAD, ruleRng, tileCenter, tileOf, tilesWithin } from './oldworld';
import { TERRITORY_SEED_OFFSET, territoryLayer } from './territory';
import { budget } from '../test/budget';
import { standardWorld } from '../test/world-cache';
import { ICARUS_KEY } from '../sim/atlas';


let groundHeights: Float32Array | undefined;
function territoryGround(): Float32Array {
  groundHeights ??= groundForTerritories(MAPGEN.seed).heights;
  return groundHeights;
}
beforeAll(() => void territoryGround(), budget(120_000));
const OLD_ORCHARD = { x: 114, y: 284 };
const ORCHARD_NOW = REGION.locations.find((l) => l.id === 'orchard')!.pos;
function rollingDraft(): MapDraft {
  const d = newDraft(REGION.size);
  const w = d.size + 1;
  const [dx, dy] = [ORCHARD_NOW.x - OLD_ORCHARD.x, ORCHARD_NOW.y - OLD_ORCHARD.y];
  for (let j = 0; j <= d.size; j++) for (let i = 0; i <= d.size; i++) d.heights[j * w + i] = 0.6 * Math.sin((i - dx) / 9) + 0.4 * Math.cos((j - dy) / 7);
  return d;
}

function terrainOf(size: number, heights: ArrayLike<number>): Terrain {
  return { size, heights: Array.from(heights), types: [], atlas: ICARUS_KEY };
}

function lowBoxes(p: BakedPiece, k: number) {
  return propBoxes({ id: `piece-${k}`, pos: p.pos, r: p.r, kind: 'landmark', look: p.look, yaw: p.yaw }).filter((b) => b.z0 < PHYSICS.truckClearance);
}

describe('the orchard farm', () => {
  const orchard = REGION.locations.find((l) => l.id === 'orchard') as TerritoryDef;
  const rules = TERRITORIES.orchard;
  const farm = rules.farm!;
  const groves = farm.groves;
  const abs = (at: Vec): Vec => ({ x: orchard.pos.x + at.x, y: orchard.pos.y + at.y });
  const MAIN_ROADS = 5;

  function groundDraft(): MapDraft {
    const d = newDraft(REGION.size);
    d.heights.set(territoryGround());
    return d;
  }

  function frameOf(pos: Vec, turn = 0): { s: number; c: number } {
    const [x, y] = [pos.x - orchard.pos.x, pos.y - orchard.pos.y];
    const yaw = ORCHARD_HEADING + turn;
    return { s: x * Math.cos(yaw) + y * Math.sin(yaw), c: x * Math.sin(yaw) - y * Math.cos(yaw) };
  }

  function footprint(d: MapDraft, p: BakedProp): number[] {
    return [tileOf(d.size, p.pos), ...tilesWithin(d.size, p.pos, p.r)];
  }

  const baked = territoryLayer(7, groundDraft());
  const props = baked.props.filter((p) => siteGap(orchard, p.pos) < 0);
  const trees = props.filter((p) => p.kind === groves.look);
  const buildingLooks = new Set(farm.buildings.map((b) => b.look));
  const spots = props.filter((p) => buildingLooks.has(p.kind));
  const runRadius = new Map(farm.runs.map((run) => [run.look, run.segment / 2]));
  const clutterLooks = new Set(farm.clutter.map((rule) => rule.look));
  const debrisLooks = new Set(farm.debris.map((rule) => rule.look));
  const loose = props.filter((p) => (clutterLooks.has(p.kind) || debrisLooks.has(p.kind)) && !(runRadius.has(p.kind) && p.r === runRadius.get(p.kind)));
  const segments = props.filter((p) => runRadius.has(p.kind) && p.r === runRadius.get(p.kind));

  const arcs = props.filter((p) => p.kind === 'sandbags');
  const traps = props.filter((p) => p.kind === 'tankTrap');
  const barriers = props.filter((p) => p.kind === 'barrier');
  const ahead = (arc: BakedProp, p: Vec): number => (p.x - arc.pos.x) * Math.cos(arc.yaw) + (p.y - arc.pos.y) * Math.sin(arc.yaw);
  const isPerimeter = (run: Run): boolean => run.look === PERIMETER.look && run.broken === PERIMETER.broken && run.knocked.share === PERIMETER.knocked.share;

  it('bakes the same farm for the same seed', () => {
    const again = territoryLayer(7, groundDraft());
    expect(again.props).toEqual(baked.props);
    expect(again.built).toEqual(baked.built);
  });

  it('stands one building near each authored pose, turned with the road and jittered within its group', () => {
    for (const group of farm.buildings) {
      expect(props.filter((p) => p.kind === group.look), group.look).toHaveLength(group.poses.length);
      for (const pose of group.poses) {
        const found = props.filter((p) => p.kind === group.look && dist(p.pos, abs(pose.at)) <= group.shift * Math.SQRT2 + 1e-9);
        expect(found, `${group.look} at ${pose.at.x},${pose.at.y}`).toHaveLength(1);
        expect(found[0].r).toBe(pose.r);
        expect(Math.abs(angleDiff(ORCHARD_HEADING + pose.turn, found[0].yaw))).toBeLessThanOrEqual(group.turnJitter + 1e-9);
      }
    }
  });

  it('lays five roads out of the orchard, each ending on its edge, and marks them', () => {
    expect(farm.roads.slice(0, MAIN_ROADS).map((r) => r.surface)).toEqual(['oldRoad', 'track', 'track', 'track', 'track']);
    const ends = farm.roads.slice(0, MAIN_ROADS).map((road) => abs(road.points.at(-1)!));
    for (const end of ends) expect(Math.abs(siteGap(orchard, end)), `${end.x},${end.y}`).toBeLessThanOrEqual(1);
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) expect(dist(ends[i], ends[j])).toBeGreaterThan(20);
    const [entry] = territoryEntries(orchard);
    expect(dist(abs(farm.roads[0].points[0]), entry)).toBeLessThan(1);
    for (const road of farm.roads) {
      const code = road.surface === 'oldRoad' ? BUILT_OLD_ROAD : BUILT_TRACK;
      for (let k = 1; k < road.points.length; k++) {
        for (const t of [0.25, 0.5, 0.75]) {
          const p = { x: lerp(abs(road.points[k - 1]).x, abs(road.points[k]).x, t), y: lerp(abs(road.points[k - 1]).y, abs(road.points[k]).y, t) };
          const onNewRoad = ROAD_INDEX.nearestWithin(p.x, p.y, REGION.roadWidth / 2) < REGION.roadWidth / 2;
          const built = baked.built[tileOf(baked.size, p)];
          expect(onNewRoad || built === code || built === BUILT_OLD_ROAD || built === BUILT_TRACK, `road at ${p.x},${p.y}`).toBe(true);
          if (!onNewRoad && road === farm.roads[0]) expect(built, `old road at ${p.x},${p.y}`).toBe(BUILT_OLD_ROAD);
        }
      }
    }
  });

  it('marks the pads as concrete, the canals as canal and the blocks as field', () => {
    const at = (p: Vec) => baked.built[tileOf(baked.size, abs(p))];
    for (const pad of farm.pads) expect(at(pad.at)).toBe(BUILT_PAD);
    for (const canal of farm.canals) expect(at({ x: (canal.points[0].x + canal.points[1].x) / 2, y: (canal.points[0].y + canal.points[1].y) / 2 })).toBe(BUILT_CANAL);
    for (const block of farm.blocks) {
      const centre = frameOf(abs(block.at), block.turn);
      const inside = tilesWithin(baked.size, abs(block.at), Math.hypot(block.size.x, block.size.y) / 2).filter((tile) => {
        const f = frameOf({ x: (tile % baked.size) + 0.5, y: Math.floor(tile / baked.size) + 0.5 }, block.turn);
        return Math.abs(f.s - centre.s) <= block.size.x / 2 && Math.abs(f.c - centre.c) <= block.size.y / 2;
      });
      const field = inside.filter((tile) => baked.built[tile] === BUILT_FIELD);
      expect(field.length, `block at ${centre.s},${centre.c}`).toBeGreaterThanOrEqual(inside.length * 0.8);
    }
  });

  it('digs at least 14 canals, at least 300 tiles in all', () => {
    expect(farm.canals.length).toBeGreaterThanOrEqual(14);
    expect(baked.built.filter((b) => b === BUILT_CANAL).length).toBeGreaterThanOrEqual(300);
  });

  it('keeps everything drawn inside the outline, off roads, tracks, canals and cliffs, and clear of every spot', () => {
    for (const p of [...loose, ...trees, ...segments]) {
      const where = `${p.kind} at ${p.pos.x},${p.pos.y}`;
      expect(siteGap(orchard, p.pos), where).toBeLessThan(-p.r);
      if (!segments.includes(p)) for (const tile of footprint(baked, p)) expect([BUILT_OLD_ROAD, BUILT_TRACK, BUILT_CANAL, BUILT_PAD], where).not.toContain(baked.built[tile]);
      expect(ROAD_INDEX.nearestWithin(p.pos.x, p.pos.y, REGION.roadWidth / 2 + p.r), where).toBe(Infinity);
      expect(tileSteepness(baked.heights, baked.size, tileOf(baked.size, p.pos)), where).toBeLessThanOrEqual(TERRAIN.drive.maxSlope);
    }
    for (const p of [...loose, ...trees]) {
      for (const spot of spots) expect(dist(p.pos, spot.pos), `${p.kind} at ${p.pos.x},${p.pos.y} by ${spot.kind}`).toBeGreaterThanOrEqual(spot.r + p.r + rules.debrisGap);
    }
    for (const seg of segments) {
      for (const o of [-seg.r * 0.99, 0, seg.r * 0.99]) {
        const p = { x: seg.pos.x + Math.cos(seg.yaw) * o, y: seg.pos.y + Math.sin(seg.yaw) * o };
        expect([BUILT_OLD_ROAD, BUILT_TRACK, BUILT_CANAL, BUILT_PAD], `${seg.kind} at ${p.x},${p.y}`).not.toContain(baked.built[tileOf(baked.size, p)]);
      }
    }
  });

  it('plants 500 trees or more in blocks and strays, within the cap', () => {
    expect(trees.length).toBeGreaterThanOrEqual(500);
    expect(trees.length).toBeLessThanOrEqual(groves.maxTrees);
    for (const block of farm.blocks) {
      const centre = frameOf(abs(block.at), block.turn);
      const mine = trees.map((t) => frameOf(t.pos, block.turn)).filter((f) => Math.abs(f.s - centre.s) <= block.size.x / 2 + groves.jitter && Math.abs(f.c - centre.c) <= block.size.y / 2 + groves.jitter);
      expect(mine.length, `block at ${centre.s},${centre.c}`).toBeGreaterThan(0);
    }
  });

  it('throws on a block whose ground rejects too many of its trees', () => {
    const moved = structuredClone(rules);
    moved.farm!.blocks[0] = { at: onOrchardRoad(-15, 0), size: { x: 10, y: 6 }, rows: 'along', turn: 0 };
    expect(() => fillFarm(groundDraft(), orchard, moved, moved.farm!, ruleRng(7, TERRITORY_SEED_OFFSET + TERRITORIES.orchard.seed))).toThrow(/keeps/);
  });

  it('leaves a lane between rows wider than the widest truck under the tree crowns', () => {
    const lane = 2 * 0.8 + 0.5;
    for (const block of farm.blocks) {
      const yaw = ORCHARD_HEADING + block.turn;
      const across = block.rows === 'along' ? { x: Math.sin(yaw), y: -Math.cos(yaw) } : { x: Math.cos(yaw), y: Math.sin(yaw) };
      const rowOffset = (p: Vec) => (p.x - orchard.pos.x - block.at.x) * across.x + (p.y - orchard.pos.y - block.at.y) * across.y;
      const rowSpan = block.rows === 'along' ? block.size.y : block.size.x;
      const rows = Math.floor(rowSpan / groves.rowGap) + 1;
      const spans = trees
        .map((t) => ({ t, k: Math.round(rowOffset(t.pos) / groves.rowGap + (rows - 1) / 2) }))
        .filter(({ t, k }) => k >= 0 && k < rows && Math.abs(rowOffset(t.pos) - (k - (rows - 1) / 2) * groves.rowGap) < 1e-6)
        .map(({ t, k }) => {
          const low = propBoxes({ id: `tree-${t.pos.x}`, kind: 'landmark', look: 'deadTree', pos: t.pos, r: t.r, yaw: t.yaw }).filter((b) => b.z0 < PHYSICS.truckClearance);
          const ext = low.map((b) => Math.abs(b.axis.x * across.x + b.axis.y * across.y) * b.half.x + Math.abs(b.axis.y * across.x - b.axis.x * across.y) * b.half.y);
          const mids = low.map((b) => (b.center.x - orchard.pos.x - block.at.x) * across.x + (b.center.y - orchard.pos.y - block.at.y) * across.y);
          return { k, lo: Math.min(...mids.map((m, i) => m - ext[i])), hi: Math.max(...mids.map((m, i) => m + ext[i])) };
        });
      for (let k = 1; k < rows; k++) {
        const below = spans.filter((s) => s.k === k - 1);
        const above = spans.filter((s) => s.k === k);
        if (below.length === 0 || above.length === 0) continue;
        expect(Math.min(...above.map((s) => s.lo)) - Math.max(...below.map((s) => s.hi)), `block at ${block.at.x},${block.at.y} rows ${k - 1}-${k}`).toBeGreaterThanOrEqual(lane);
      }
    }
  });

  it('never stands three run or clutter pieces of one look in a straight line at one turn', () => {
    const turnOf = (yaw: number) => ((yaw % Math.PI) + Math.PI) % Math.PI;
    for (const look of new Set([...runRadius.keys(), ...clutterLooks])) {
      const all = props.filter((p) => p.kind === look);
      for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) for (let c = b + 1; c < all.length; c++) {
        const [p, q, r] = [all[a], all[b], all[c]];
        const sameTurn = [[p, q], [p, r], [q, r]].every(([u, v]) => Math.abs(angleDiff(turnOf(u.yaw) * 2, turnOf(v.yaw) * 2)) / 2 <= 0.02);
        if (!sameTurn) continue;
        const line = Math.min(...[[p, q, r], [p, r, q], [q, r, p]].map(([u, v, w]) => Math.abs((v.pos.x - u.pos.x) * (w.pos.y - u.pos.y) - (v.pos.y - u.pos.y) * (w.pos.x - u.pos.x)) / dist(u.pos, v.pos)));
        expect(line, `${look} at ${p.pos.x},${p.pos.y}, ${q.pos.x},${q.pos.y} and ${r.pos.x},${r.pos.y}`).toBeGreaterThan(0.1);
      }
    }
  });

  it('scatters clutter round the buildings it belongs to', () => {
    const pieces = loose.filter((p) => clutterLooks.has(p.kind) && !debrisLooks.has(p.kind));
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of pieces) {
      const rule = farm.clutter.find((r) => r.look === p.kind)!;
      const near = spots.filter((s) => rule.near.includes(s.kind));
      const gap = Math.min(...near.map((s) => dist(p.pos, s.pos) - s.r - p.r));
      expect(gap, `${p.kind} at ${p.pos.x},${p.pos.y}`).toBeLessThanOrEqual(rules.debrisGap + rule.reach + REGION.obstacles.gap + 1e-9);
    }
  });

  it('draws each fence and barrier segment at the size of its model', () => {
    for (const look of ['fence', 'barrier'] as const) {
      const pieces = segments.filter((p) => p.kind === look);
      expect(pieces.length, look).toBeGreaterThan(0);
      for (const p of pieces) {
        const pose = propPose({ id: `${look}-test`, pos: p.pos, r: p.r, kind: 'landmark', look, yaw: p.yaw });
        expect(pose.scale.x, `${look} at ${p.pos.x},${p.pos.y}`).toBeCloseTo(1, 6);
      }
    }
  });

  it('lets a truck drive from the spur road to the side of every orchard spot and to the outer end of each road', () => {
    const w = standardWorld(1337);
    const found = w.obstacles.filter((o) => isLootSpot(o) && siteGap(orchard, o.pos) < 0);
    expect(found.length).toBe(farm.buildings.reduce((n, b) => n + b.poses.length, 0));
    const reach = (o: (typeof found)[number]) => (propReach(o) + ECONOMY.useRange) * ECONOMY.interactionScale;
    const [entry] = territoryEntries(orchard);
    for (const spot of found) {
      const end = route(w, entry, spot.pos, 0.6, []).at(-1)!;
      expect(dist(end, spot.pos), spot.id).toBeLessThanOrEqual(reach(spot));
    }
    for (const road of farm.roads.slice(0, MAIN_ROADS)) {
      const goal = abs(road.points.at(-1)!);
      const end = route(w, entry, goal, 0.6, []).at(-1)!;
      expect(dist(end, goal), `road end at ${goal.x},${goal.y}`).toBeLessThanOrEqual(1);
    }
  }, budget(120_000));

  it('grades each farm road so its centre line holds its grade', () => {
    const t = terrainOf(baked.size, baked.heights);
    const JUNCTION_LIMIT = 0.15;
    const inFade = (p: Vec) => [[0, 0], [1, 0], [0, 1], [1, 1]].some(([i, j]) => newRoadHold({ x: Math.floor(p.x) + i, y: Math.floor(p.y) + j }) > 0);
    for (const road of farm.roads) {
      const points = road.points.map(abs);
      for (let k = 1; k < points.length; k++) {
        const steps = Math.ceil(dist(points[k - 1], points[k]) / 0.5);
        for (let i = 1; i <= steps; i++) {
          const [a, b] = [lerp(0, 1, (i - 1) / steps), lerp(0, 1, i / steps)];
          const p = { x: lerp(points[k - 1].x, points[k].x, a), y: lerp(points[k - 1].y, points[k].y, a) };
          const q = { x: lerp(points[k - 1].x, points[k].x, b), y: lerp(points[k - 1].y, points[k].y, b) };
          const grade = Math.abs(groundAt(t, q.x, q.y) - groundAt(t, p.x, p.y)) / dist(p, q);
          const limit = [p, q].some(inFade) ? JUNCTION_LIMIT : (road.grade ?? TERRAIN.roadGrade) + 0.01;
          expect(grade, `${road.surface} at ${frameOf(p).s.toFixed(1)},${frameOf(p).c.toFixed(1)}`).toBeLessThanOrEqual(limit);
        }
      }
    }
  });

  it('keeps the surface of every farm road under the cliff slope, though its cuttings may be cliffs', () => {
    for (const road of farm.roads) {
      const points = road.points.map(abs);
      for (let k = 1; k < points.length; k++) {
        const mid = { x: (points[k - 1].x + points[k].x) / 2, y: (points[k - 1].y + points[k].y) / 2 };
        for (const tile of tilesWithin(baked.size, mid, dist(points[k - 1], points[k]) / 2 + road.width)) {
          const c = { x: (tile % baked.size) + 0.5, y: Math.floor(tile / baked.size) + 0.5 };
          if (segmentDist(c, points[k - 1], points[k]) > road.width / 2 || siteGap(orchard, c) >= 0) continue;
          expect(tileSteepness(baked.heights, baked.size, tile), `${road.surface} at ${frameOf(c).s.toFixed(1)},${frameOf(c).c.toFixed(1)}`).toBeLessThanOrEqual(TERRAIN.drive.maxSlope);
        }
      }
    }
  });

  it('levels the ground under every building within the relief limit', () => {
    const buildings = props.filter((p) => buildingLooks.has(p.kind));
    expect(buildings).toHaveLength(farm.buildings.reduce((n, b) => n + b.poses.length, 0));
    for (const p of buildings) expect(footprintRelief(baked.heights, baked.size, p, false), `${p.kind} at ${frameOf(p.pos).s.toFixed(1)},${frameOf(p.pos).c.toFixed(1)}`).toBeLessThanOrEqual(rules.relief!);
  });

  it('keeps run and clutter pieces off ground that lies off their seat past the relief limit', () => {
    for (const p of [...loose.filter((q) => clutterLooks.has(q.kind)), ...segments]) {
      expect(footprintRelief(baked.heights, baked.size, p, segments.includes(p)), `${p.kind} at ${p.pos.x},${p.pos.y}`).toBeLessThanOrEqual(rules.relief!);
    }
  });

  it('digs about 30 emplacements of sandbag arcs, sets 20 tank traps and stands 60 barriers', () => {
    const group = arcs.map((_, i) => i);
    const root = (i: number): number => (group[i] === i ? i : root(group[i]));
    arcs.forEach((a, i) => arcs.forEach((b, j) => {
      if (j > i && dist(a.pos, b.pos) <= 1.5) group[root(j)] = root(i);
    }));
    expect(new Set(arcs.map((_, i) => root(i))).size).toBeGreaterThanOrEqual(28);
    expect(arcs.length).toBeGreaterThanOrEqual(52);
    expect(traps.length).toBeGreaterThanOrEqual(20);
    expect(barriers.length).toBeGreaterThanOrEqual(60);
  });

  it('stands every tank trap out ahead of its nearest sandbag arc and never behind one', () => {
    for (const trap of traps) {
      const where = `tankTrap at ${frameOf(trap.pos).s.toFixed(1)},${frameOf(trap.pos).c.toFixed(1)}`;
      const nearest = arcs.reduce((a, b) => (dist(b.pos, trap.pos) < dist(a.pos, trap.pos) ? b : a));
      expect(ahead(nearest, trap.pos), where).toBeGreaterThan(EMPLACEMENT.arcRadius);
      expect(EMPLACEMENT.behindClear).toBe(2);
      for (const arc of arcs) if (ahead(arc, trap.pos) <= 0) expect(dist(arc.pos, trap.pos), where).toBeGreaterThanOrEqual(EMPLACEMENT.behindClear);
    }
  });

  it("keeps every arc, trap and barrier off roads, tracks, canals and pads and out of every spot's parking gap", () => {
    const marks = [BUILT_OLD_ROAD, BUILT_TRACK, BUILT_CANAL, BUILT_PAD];
    for (const p of [...arcs, ...traps]) {
      const where = `${p.kind} at ${frameOf(p.pos).s.toFixed(1)},${frameOf(p.pos).c.toFixed(1)}`;
      for (const tile of footprint(baked, p)) expect(marks, where).not.toContain(baked.built[tile]);
      for (const spot of spots) expect(dist(p.pos, spot.pos), `${where} by ${spot.kind}`).toBeGreaterThanOrEqual(spot.r + p.r + rules.debrisGap);
    }
    for (const p of barriers) {
      const where = `barrier at ${frameOf(p.pos).s.toFixed(1)},${frameOf(p.pos).c.toFixed(1)}`;
      const [a, b] = [-1, 1].map((k) => ({ x: p.pos.x + k * p.r * Math.cos(p.yaw), y: p.pos.y + k * p.r * Math.sin(p.yaw) }));
      const reach = segments.includes(p) ? 0 : p.r;
      for (const spot of spots) expect(segmentDist(spot.pos, a, b), `${where} by ${spot.kind}`).toBeGreaterThanOrEqual(spot.r + reach + rules.debrisGap - 1e-9);
    }
  });

  it('leaves the perimeter open at every main road and at least every 25 tiles along it', () => {
    const COVER = 1;
    const closed = (p: Vec) => barriers.some((b) => segmentDist(p, ...([-1, 1].map((k) => ({ x: b.pos.x + k * b.r * Math.cos(b.yaw), y: b.pos.y + k * b.r * Math.sin(b.yaw) })) as [Vec, Vec])) < COVER);
    const lines = farm.runs.filter(isPerimeter).map((run) => run.points.map(abs));
    expect(lines.length).toBeGreaterThan(0);
    const sides: Vec[][] = [];
    for (const line of lines) {
      const last = sides.at(-1);
      if (last && dist(last.at(-1)!, line[0]) <= 15) last.push(...line);
      else sides.push([...line]);
    }
    const roads = farm.roads.slice(0, MAIN_ROADS).map((road) => road.points.map(abs));
    for (const side of sides) {
      const walk: { p: Vec; open: boolean }[] = [];
      for (let k = 1; k < side.length; k++) {
        const steps = Math.ceil(dist(side[k - 1], side[k]) / 0.5);
        for (let i = 0; i < steps; i++) {
          const p = { x: lerp(side[k - 1].x, side[k].x, i / steps), y: lerp(side[k - 1].y, side[k].y, i / steps) };
          walk.push({ p, open: !closed(p) });
        }
      }
      const where = (i: number) => `perimeter at ${frameOf(walk[i].p).s.toFixed(1)},${frameOf(walk[i].p).c.toFixed(1)}`;
      walk.forEach(({ p }, i) => {
        const onRoad = roads.some((road) => road.slice(1).some((b, k) => segmentDist(p, road[k], b) < 1.5));
        if (onRoad) expect(walk.slice(Math.max(0, i - 3), i + 4).every((w) => w.open), where(i)).toBe(true);
      });
      let since = 0;
      let run = 0;
      walk.forEach(({ open }, i) => {
        run = open ? run + 0.5 : 0;
        since = run >= 3 ? 0 : since + 0.5;
        expect(since, where(i)).toBeLessThanOrEqual(25);
      });
    }
  });

  it("draws the same values for every run segment, so knocking one run's segments shifts no other's", () => {
    const last = farm.runs.length - 1;
    const moved = structuredClone(rules);
    moved.farm!.runs[last].knocked = { share: 1, turn: 0.5, shift: 0.5 };
    const d = groundDraft();
    fillFarm(d, orchard, moved, moved.farm!, ruleRng(7, TERRITORY_SEED_OFFSET + TERRITORIES.orchard.seed));
    const line = farm.runs[last].points.map(abs);
    const far = (p: BakedProp) => line.slice(1).every((b, k) => segmentDist(p.pos, line[k], b) > 5);
    const before = territoryLayer(7, groundDraft()).props.filter((p) => siteGap(orchard, p.pos) < 0 && far(p) && !debrisLooks.has(p.kind));
    expect(d.props.filter((p) => far(p) && !debrisLooks.has(p.kind))).toEqual(before);
  });

  it('throws on a building whose ring cannot level its ground', () => {
    const moved = structuredClone(rules);
    moved.farm!.buildings.find((b) => b.look === 'quonset')!.poses[3].at = onOrchardRoad(51, -33);
    expect(() => fillFarm(groundDraft(), orchard, moved, moved.farm!, ruleRng(7, 5))).toThrow(/levels its ground into a cliff/);
  });

  it('throws on a building off the outline', () => {
    const moved = structuredClone(rules);
    moved.farm!.buildings[0].poses[0].at = onOrchardRoad(-30, 40);
    expect(() => fillFarm(groundDraft(), orchard, moved, moved.farm!, ruleRng(7, 1))).toThrow(/outside/);
  });
});

describe('a third territory', () => {
  const flats: TerritoryDef = { id: 'test-flats', kind: 'territory', pos: scalePoint({ x: 40, y: 76 }), radius: 22, outline: null };
  function flatsRules(): TerritoryRules {
    return {
      seed: 2,
      wreck: {
        pieces: [{ look: 'hullDrum', at: { x: -9, y: -4 }, yaw: 0, r: 3 }],
        buildings: [{ look: 'barn', table: 'farmStores', turnJitter: 0.06, shift: 0.3, poses: [{ at: { x: 7, y: -7 }, r: 2.5, turn: 0, shoulder: false }] }],
        caches: [{ at: { x: 0, y: 9 }, yaw: 0 }],
        cacheLook: 'hullCache',
        cacheTable: 'landmark',
        cacheRadius: 0.7,
        patches: [{ at: { x: 9, y: 9 }, radius: 5, debris: [{ look: 'junk', count: 2, radius: [0.5, 0.8] }], spots: 1 }],
        spotLook: 'shipCache',
        spotTable: 'hullScrap',
        spotRadius: [0.6, 0.8],
        seatEase: 3,
        rimRocks: null,
        scree: null,
        roads: [{ points: [{ x: -20, y: 3 }, { x: 20, y: 3 }], width: 2.5, surface: 'track' }],
        spurs: [],
        spurFade: 5,
        decks: [],
        landing: 0,
      },
      farm: null,
      glass: { cell: 6, cover: [0.25, 0.55], clear: 1.5, spires: { look: 'hullShard', count: 4, radius: [0.8, 1.1] } },
      spotGap: 6,
      debrisGap: 1.5,
      reactor: null,
      relief: null,
    };
  }

  function withFlats(rules: TerritoryRules, draft: () => MapDraft): MapDraft {
    REGION.locations.push(flats);
    TERRITORIES[flats.id] = rules;
    try {
      return territoryLayer(7, draft());
    } finally {
      REGION.locations.splice(REGION.locations.indexOf(flats), 1);
      delete TERRITORIES[flats.id];
    }
  }

  const outside = (p: Vec): boolean => siteGap(flats, p) >= 0;

  it('bakes the Fallen Sun and the orchard as without it (IV1)', () => {
    const without = territoryLayer(7, rollingDraft());

    const withIt = withFlats(flatsRules(), rollingDraft);

    expect(withIt.props.filter((p) => outside(p.pos))).toEqual(without.props);
    const tilesOutside = (d: MapDraft) => Array.from(d.built).filter((_, tile) => outside(tileCenter(d.size, tile)));
    expect(tilesOutside(withIt)).toEqual(tilesOutside(without));
  });

  it('bakes a wreck with no basin and no rim rocks, with its piece, building, cache, field spot and glass', () => {
    const d = withFlats(flatsRules(), rollingDraft);

    const inside = d.props.filter((p) => !outside(p.pos));
    const kinds = new Set(inside.map((p) => p.kind));
    for (const kind of ['hullDrum', 'barn', 'hullCache', 'shipCache', 'junk', 'hullShard']) expect(kinds.has(kind as BakedProp['kind']), kind).toBe(true);
    expect(kinds.has('rimRock')).toBe(false);
    expect(tilesWithin(d.size, flats.pos, flats.radius).some((tile) => d.built[tile] === BUILT_GLASS)).toBe(true);
  });

  it('keeps the field spots the spot gap from the buildings', () => {
    const rules = flatsRules();
    const d = withFlats(rules, rollingDraft);

    const [barn] = d.props.filter((p) => p.kind === 'barn' && !outside(p.pos));
    const spots = d.props.filter((p) => p.kind === 'shipCache' && !outside(p.pos));
    for (const s of spots) expect(dist(s.pos, barn.pos)).toBeGreaterThanOrEqual(rules.spotGap);
  });

  it('throws on a building that touches a piece (IV10)', () => {
    const rules = flatsRules();
    rules.wreck!.buildings[0].poses[0].at = { x: -9, y: -6 };

    expect(() => withFlats(rules, rollingDraft)).toThrow(/touches a wreck piece/);
  });
});

describe('Glass Flats on the baked map', () => {
  const flats = REGION.locations.find((l) => l.id === 'glass-flats')!;
  const gt = flats as never;
  const flatsRules = TERRITORIES['glass-flats'];
  const wreck = flatsRules.wreck!;
  const glass = flatsRules.glass!;
  const terrain = TEST_MAP.terrain;
  const flatsPieces = territoryPieces(gt);
  const props = TEST_MAP.props.filter((p) => siteGap(flats, p.pos) < 0);
  const isPiece = (p: BakedProp) => flatsPieces.some((q) => q.look === p.kind && dist(q.pos, p.pos) < 1e-3);
  const tileOfPoint = (c: Vec) => Math.floor(c.y) * terrain.size + Math.floor(c.x);
  const typeAt = (c: Vec) => terrain.types[tileOfPoint(c)];
  const insideTiles: Vec[] = [];
  for (let y = Math.floor(flats.pos.y - flats.radius); y <= flats.pos.y + flats.radius; y++) {
    for (let x = Math.floor(flats.pos.x - flats.radius); x <= flats.pos.x + flats.radius; x++) if (siteGap(flats, { x: x + 0.5, y: y + 0.5 }) < 0) insideTiles.push({ x: x + 0.5, y: y + 0.5 });
  }
  function touched(pos: Vec, r: number): Vec[] {
    const out: Vec[] = [];
    for (let y = Math.floor(pos.y - r); y <= Math.floor(pos.y + r); y++) {
      for (let x = Math.floor(pos.x - r); x <= Math.floor(pos.x + r); x++) {
        const near = { x: Math.min(Math.max(pos.x, x), x + 1), y: Math.min(Math.max(pos.y, y), y + 1) };
        if (dist(near, pos) < r || (x === Math.floor(pos.x) && y === Math.floor(pos.y))) out.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
    return out;
  }
  const kept = () => {
    const looks = new Set<string>(wreck.buildings.map((b) => b.look));
    return props.filter((p) => isPiece(p) || p.kind === wreck.cacheLook || looks.has(p.kind));
  };

  it('bakes every authored piece, compound and cache', () => {
    for (const p of flatsPieces) expect(props.filter((o) => isPiece(o) && o.kind === p.look && dist(o.pos, p.pos) < 1e-3), `${p.look} at ${p.pos.x},${p.pos.y}`).toHaveLength(1);
    const poses = wreck.buildings.flatMap((b) => b.poses.map((pose) => ({ look: b.look, at: { x: flats.pos.x + pose.at.x, y: flats.pos.y + pose.at.y } })));
    for (const pose of poses) expect(props.filter((o) => o.kind === pose.look && dist(o.pos, pose.at) < 0.5), `${pose.look} at ${pose.at.x},${pose.at.y}`).toHaveLength(1);
    const caches = props.filter((o) => o.kind === wreck.cacheLook);
    expect(caches).toHaveLength(wreck.caches.length);
    for (const c of territoryCaches(gt)) expect(caches.filter((o) => dist(o.pos, c.pos) < 1e-3 && Math.abs(o.yaw - c.yaw) < 0.01), `cache at ${c.pos.x},${c.pos.y}`).toHaveLength(1);
  });

  it('gives each of its 21 loot spots one stock after world creation (IV5)', () => {
    const w = standardWorld(1337);
    const spots = w.obstacles.filter((o) => isLootSpot(o) && territoryAt(o.pos)?.id === 'glass-flats');
    expect(spots).toHaveLength(21);
    for (const o of spots) expect(w.salvage.filter((s) => s.id === o.id), o.id).toHaveLength(1);
    expect(w.salvage.filter((s) => territoryOfStock(s)?.id === 'glass-flats')).toHaveLength(21);
  });

  it('marks every dirt road and spur centreline tile as track, or road where a region road crosses it', () => {
    const { roads, spurs } = territoryRoads(gt);
    for (const road of [...roads, ...spurs]) {
      for (const p of along(road.points, 0.5)) expect(['track', 'road'], `${p.x.toFixed(1)},${p.y.toFixed(1)}`).toContain(typeAt(p));
    }
  });

  it("keeps every prop but the pieces off the dirt road, spur and region road tiles, and the pieces' low boxes off the roads (IV4)", () => {
    const { roads, spurs } = territoryRoads(gt);
    const web = [...roads, ...spurs];
    for (const p of props.filter((o) => !isPiece(o))) {
      const where = `${p.kind} at ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)}`;
      expect(touched(p.pos, p.r).filter((c) => ['track', 'road'].includes(typeAt(c))), where).toEqual([]);
      expect(ROAD_INDEX.nearestWithin(p.pos.x, p.pos.y, REGION.roadWidth / 2 + p.r), where).toBe(Infinity);
    }
    flatsPieces.forEach((p, k) => {
      for (const b of lowBoxes(p, k)) for (const road of web) for (const q of along(road.points, 0.25)) expect(boxDistance(b, q), `${p.look} at ${q.x},${q.y}`).toBeGreaterThan(road.width / 2);
    });
  });

  it('stands every spire wholly on glass, keeps glass out of the yards round the pieces, compounds and caches, and no boulder on glass (IV4)', () => {
    const spires = props.filter((p) => p.kind === glass.spires.look);
    expect(spires).toHaveLength(glass.spires.count);
    for (const s of spires) for (const c of touched(s.pos, s.r)) expect(typeAt(c), `spire at ${s.pos.x.toFixed(1)},${s.pos.y.toFixed(1)}`).toBe('glass');
    const yards = kept();
    expect(yards.length).toBe(flatsPieces.length + wreck.caches.length + 11);
    for (const c of insideTiles.filter((p) => typeAt(p) === 'glass')) {
      for (const o of yards) expect(dist(o.pos, c), `glass at ${c.x},${c.y} by ${o.kind}`).toBeGreaterThan(o.r + glass.clear);
    }
    for (const rock of props.filter((p) => p.kind === 'rock')) for (const c of touched(rock.pos, rock.r)) expect(typeAt(c), `rock at ${rock.pos.x},${rock.pos.y}`).not.toBe('glass');
  });

  it('covers between a fifth and a half of its ground with glass', () => {
    const share = insideTiles.filter((p) => typeAt(p) === 'glass').length / insideTiles.length;
    expect(share).toBeGreaterThanOrEqual(0.2);
    expect(share).toBeLessThanOrEqual(0.5);
  });

  it('lets a truck drive from each road to the side of every loot spot, the cache in the nozzle mouth included (IV3)', () => {
    const w = standardWorld(1337);
    const spots = w.obstacles.filter((o) => isLootSpot(o) && siteGap(flats, o.pos) < 0);
    const nozzle = flatsPieces.find((p) => p.look === 'engineNozzle')!;
    const mouth = spots.find((o) => o.kind === 'landmark' && o.look === wreck.cacheLook && dist(o.pos, nozzle.pos) < nozzle.r);
    expect(mouth).toBeDefined();
    const reach = (o: (typeof spots)[number]) => (propReach(o) + ECONOMY.useRange) * ECONOMY.interactionScale;
    const entries = territoryEntries(gt);
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      for (const spot of spots) {
        const end = route(w, entry, spot.pos, 0.6, []).at(-1)!;
        expect(dist(end, spot.pos), `${spot.id} from ${entry.x},${entry.y}`).toBeLessThanOrEqual(reach(spot));
      }
    }
  }, 120_000);
});
