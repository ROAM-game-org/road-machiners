import { describe, expect, it } from 'vitest';
import { along } from '../test/territory-kit';
import { ECONOMY } from '../data/goods';
import { CHASSIS } from '../data/chassis';
import { PHYSICS } from '../data/physics';
import { REGION } from '../data/region';
import { MAPGEN, TERRAIN } from '../data/terrain';
import { FALLEN_SUN_DECKS, TERRITORIES } from '../data/territory';
import { isRig } from '../sim/body';
import { deckAt, deckById } from '../sim/bridge';
import { boxDistance, onDeck, propBoxes, propReach, type PosedBox } from '../sim/mapgen';
import { CELL, navLayer } from '../sim/nav/layer';
import { siteGap } from '../sim/sites';
import { route } from '../sim/path';
import { ROAD_INDEX } from '../sim/road-index';
import { hazardZones, isLootSpot, landingStrips, reactorPos, territoryAt, territoryCaches, territoryEntries, territoryOfStock, territoryPieces, territoryRoads, type BakedPiece, type LandingStrip } from '../sim/territory';
import { groundAt, isCliff, type BakedProp, type Terrain } from '../sim/terrain';
import { dist, segmentDist, type Vec } from '../sim/vec';
import { TEST_MAP } from '../test/map';
import { newDraft, tileSteepness, type MapDraft } from './bake';
import { tilesWithin } from './oldworld';
import { territoryLayer } from './territory';
import { standardWorld } from '../test/world-cache';
import { ICARUS_DECKS } from '../sim/bridge';
import { icarusAtlas } from '../sim/atlas';
import { ICARUS_KEY } from '../sim/atlas';

const fallenSun = REGION.locations.find((l) => l.id === 'fallen-sun')!;
const t = fallenSun as never;

const rules = TERRITORIES['fallen-sun'].wreck!;
const reactor = TERRITORIES['fallen-sun'].reactor!;
const zone = hazardZones().find((z) => z.id === 'fallen-sun')!;
const pieces = territoryPieces(t);
const inside = TEST_MAP.props.filter((p) => siteGap(fallenSun, p.pos) < 0);
const DEBRIS_LOOKS = new Set<string>(rules.patches.flatMap((p) => p.debris.map((d) => d.look)));
const OLD_ORCHARD = { x: 114, y: 284 };
const ORCHARD_NOW = REGION.locations.find((l) => l.id === "orchard")!.pos;
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

function cornersUnder(p: BakedPiece, k: number): Vec[] {
  const boxes = lowBoxes(p, k);
  const reach = Math.max(...boxes.map((b) => dist(b.center, p.pos) + Math.hypot(b.half.x, b.half.y)));
  const out: Vec[] = [];
  for (let j = Math.floor(p.pos.y - reach); j <= p.pos.y + reach; j++) {
    for (let i = Math.floor(p.pos.x - reach); i <= p.pos.x + reach; i++) if (boxes.some((b) => boxDistance(b, { x: i, y: j }) === 0)) out.push({ x: i, y: j });
  }
  return out;
}

function drawnProps(): BakedProp[] {
  return inside.filter((p) => (DEBRIS_LOOKS.has(p.kind) || p.kind === rules.spotLook) && !pieces.some((q) => q.look === p.kind && dist(q.pos, p.pos) < 1e-3));
}

let laid: MapDraft | undefined;
const layerSeven = (): MapDraft => (laid ??= territoryLayer(7, rollingDraft()));

describe('the territory layer', () => {
  it('places the same props and heights for the same seed', () => {
    const [a, b] = [layerSeven(), territoryLayer(7, rollingDraft())];
    expect(a.props).toEqual(b.props);
    expect(a.heights).toEqual(b.heights);
    expect(a.props).not.toEqual(territoryLayer(8, rollingDraft()).props);
  });

  it('bakes the Fallen Sun as it would alone', () => {
    const alone = REGION.locations.filter((l) => l.kind !== 'territory' || l.id === 'fallen-sun');
    const all = REGION.locations.splice(0, REGION.locations.length, ...alone);
    let solo: MapDraft;
    try {
      solo = territoryLayer(7, rollingDraft());
    } finally {
      REGION.locations.splice(0, REGION.locations.length, ...all);
    }
    const full = layerSeven();
    const ofSun = (props: readonly BakedProp[]) => props.filter((p) => siteGap(fallenSun, p.pos) < 0);
    expect(ofSun(full.props).length).toBeGreaterThan(0);
    expect(ofSun(full.props)).toEqual(ofSun(solo.props));
    const w = full.size + 1;
    const sunCorners = Array.from(full.heights.keys()).filter((k) => siteGap(fallenSun, { x: k % w, y: Math.floor(k / w) }) < 1);
    expect(sunCorners.map((k) => full.heights[k])).toEqual(sunCorners.map((k) => solo.heights[k]));
  });

  it("levels the ground under every piece's low boxes to the height at its centre, less its sink", () => {
    const before = rollingDraft();
    const ground = terrainOf(before.size, before.heights);
    const after = layerSeven();
    const w = before.size + 1;
    pieces.forEach((p, k) => {
      const centre = groundAt(ground, p.pos.x, p.pos.y) - p.sink;
      const corners = cornersUnder(p, k);
      expect(corners.length, p.look).toBeGreaterThan(0);
      for (const c of corners) expect(after.heights[c.y * w + c.x], `${p.look} ${c.x},${c.y}`).toBeCloseTo(centre, 6);
    });
    const far = { x: Math.round(fallenSun.pos.x - 40), y: Math.round(fallenSun.pos.y - 30) };
    expect(after.heights[far.y * w + far.x]).toBe(before.heights[far.y * w + far.x]);
  });

  it("digs a sunk piece's pit no wider than its low boxes and the seat ease", () => {
    const before = rollingDraft();
    const after = layerSeven();
    const w = before.size + 1;
    const sunk = pieces.map((p, k) => ({ p, k })).filter(({ p }) => p.sink > 0);
    expect(sunk).toHaveLength(2);
    const gapTo = (k: number, c: Vec) => Math.min(...lowBoxes(pieces[k], k).map((b) => boxDistance(b, c)));
    for (const { p, k } of sunk) {
      const reach = Math.max(...lowBoxes(p, k).map((b) => dist(b.center, p.pos) + Math.hypot(b.half.x, b.half.y))) + rules.seatEase + 2;
      for (let j = Math.floor(p.pos.y - reach); j <= p.pos.y + reach; j++) {
        for (let i = Math.floor(p.pos.x - reach); i <= p.pos.x + reach; i++) {
          if (pieces.some((_, n) => gapTo(n, { x: i, y: j }) < rules.seatEase)) continue;
          expect(after.heights[j * w + i], `${i},${j}`).toBe(before.heights[j * w + i]);
        }
      }
    }
  });

  it('keeps the seat in the baked map, to the map file rounding', () => {
    const terrain = TEST_MAP.terrain;
    pieces.forEach((p, k) => {
      const centre = groundAt(terrain, p.pos.x, p.pos.y);
      for (const c of cornersUnder(p, k)) expect(Math.abs(terrain.heights[c.y * (terrain.size + 1) + c.x] - centre), `${p.look} ${c.x},${c.y}`).toBeLessThanOrEqual(2 / MAPGEN.heightScale);
    });
  });

  it('bakes every authored piece, the reactor, nine caches and fifteen field spots', () => {
    for (const p of pieces) expect(TEST_MAP.props.filter((o) => o.kind === p.look && dist(o.pos, p.pos) < 1e-3), p.look).toHaveLength(1);
    expect(inside.filter((p) => p.kind === reactor.look)).toHaveLength(1);
    expect(dist(inside.find((p) => p.kind === reactor.look)!.pos, reactorPos(t))).toBeLessThan(1e-3);
    expect(inside.filter((p) => p.kind === rules.cacheLook)).toHaveLength(9);
    expect(inside.filter((p) => p.kind === rules.spotLook)).toHaveLength(15);
    expect(TEST_MAP.props.filter((p) => p.kind === 'rimRock')).toHaveLength(rules.rimRocks!.count);
  });

  it('turns each hull cache to its authored yaw, and holds no crate-drawn army cache', () => {
    const baked = inside.filter((p) => p.kind === rules.cacheLook);
    for (const c of territoryCaches(t)) expect(baked.filter((o) => dist(o.pos, c.pos) < 1e-3 && Math.abs(o.yaw - c.yaw) < 0.01), `${c.pos.x},${c.pos.y}`).toHaveLength(1);
    expect(inside.filter((p) => p.kind === 'armyCache')).toHaveLength(0);
    expect(TEST_MAP.props.filter((p) => p.kind === 'hullCache' && territoryAt(p.pos)?.id !== 'fallen-sun')).toHaveLength(0);
  });

  it('gives each cache and field spot one stock after world creation', () => {
    const w = standardWorld(1337);
    const spots = w.obstacles.filter((o) => isLootSpot(o) && territoryAt(o.pos)?.id === 'fallen-sun');
    expect(spots).toHaveLength(24);
    for (const o of spots) expect(w.salvage.filter((s) => s.id === o.id), o.id).toHaveLength(1);
    expect(w.salvage.filter((s) => territoryOfStock(s)?.id === 'fallen-sun')).toHaveLength(24);
  });

  it("keeps every drawn prop off the roads, the pieces' boxes and the hazard", () => {
    const boxes = pieces.flatMap((p, k) => propBoxes({ id: `piece-${k}`, pos: p.pos, r: p.r, kind: 'landmark', look: p.look, yaw: p.yaw }));
    const drawn = drawnProps();
    expect(drawn).toHaveLength(rules.patches.reduce((n, p) => n + p.spots + p.debris.reduce((m, d) => m + d.count, 0), 0));
    for (const p of drawn) {
      const reach = REGION.roadWidth / 2 + p.r;
      expect(ROAD_INDEX.nearestWithin(p.pos.x, p.pos.y, reach), p.kind).toBe(Infinity);
      for (const b of boxes) expect(boxDistance(b, p.pos), `${p.kind} at ${p.pos.x},${p.pos.y}`).toBeGreaterThan(p.r);
      expect(dist(p.pos, zone.pos) - p.r, p.kind).toBeGreaterThan(zone.radius);
    }
  });

  it('keeps every loot spot apart and outside the hazard', () => {
    const spots = inside.filter((p) => p.kind === rules.spotLook || p.kind === rules.cacheLook);
    spots.forEach((a, i) => {
      expect(dist(a.pos, zone.pos), a.kind).toBeGreaterThan(zone.radius + a.r);
      for (const b of spots.slice(i + 1)) expect(dist(a.pos, b.pos)).toBeGreaterThanOrEqual(TERRITORIES['fallen-sun'].spotGap);
    });
  });

  it('keeps every prop but the reactor and its housing out of the hazard', () => {
    const housing = pieces.find((p) => p.look === 'shipBow')!;
    const others = inside.filter((p) => p.kind !== reactor.look && !(p.kind === housing.look && dist(p.pos, housing.pos) < 1e-3));
    for (const p of others) expect(dist(p.pos, zone.pos), `${p.kind} at ${p.pos.x},${p.pos.y}`).toBeGreaterThan(zone.radius);
  });

  it('lets a truck drive from each road to the side of every cache and field spot', () => {
    const w = standardWorld(1337);
    const spots = w.obstacles.filter((o) => isLootSpot(o) && siteGap(fallenSun, o.pos) < 0);
    const reach = (o: (typeof spots)[number]) => (propReach(o) + ECONOMY.useRange) * ECONOMY.interactionScale;
    for (const entry of territoryEntries(t)) {
      for (const spot of spots) {
        const end = route(w, entry, spot.pos, 0.6, []).at(-1)!;
        expect(dist(end, spot.pos), `${spot.id} from ${entry.x},${entry.y}`).toBeLessThanOrEqual(reach(spot));
      }
    }
  });

  it('lets a truck drive through the cage from end to end', () => {
    const w = standardWorld(1337);
    const cage = pieces.find((p) => p.look === 'shipCage')!;
    const along = { x: Math.cos(cage.yaw), y: Math.sin(cage.yaw) };
    const end = (side: number): Vec => ({ x: cage.pos.x + along.x * (cage.r + 2) * side, y: cage.pos.y + along.y * (cage.r + 2) * side });
    const path = [end(-1), ...route(w, end(-1), end(1), 0.6, [])];
    expect(dist(path.at(-1)!, end(1))).toBeLessThan(1);
    const offAxis = (p: Vec) => Math.abs((p.x - cage.pos.x) * along.y - (p.y - cage.pos.y) * along.x);
    const alongAxis = (p: Vec) => (p.x - cage.pos.x) * along.x + (p.y - cage.pos.y) * along.y;
    const samples = path.slice(1).flatMap((b, i) => Array.from({ length: 20 }, (_, k) => ({ x: path[i].x + ((b.x - path[i].x) * k) / 20, y: path[i].y + ((b.y - path[i].y) * k) / 20 })));
    const insideTube = samples.filter((p) => Math.abs(alongAxis(p)) < cage.r * 0.8);
    expect(insideTube.length).toBeGreaterThan(0);
    for (const p of insideTube) expect(offAxis(p)).toBeLessThan(3.5);
  });
});

describe("the Fallen Sun's dirt roads, decks and lanes on the baked map", () => {
  const terrain = TEST_MAP.terrain;
  const { roads, spurs } = territoryRoads(t);
  const web = [...roads, ...spurs];
  const strips = landingStrips(t);
  const pieceAt = (p: BakedProp) => pieces.some((q) => q.look === p.kind && dist(q.pos, p.pos) < 1e-3);
  const onRegionRoad = (c: Vec) => ROAD_INDEX.nearestWithin(c.x, c.y, REGION.roadWidth / 2) < REGION.roadWidth / 2;

  function roadTiles(road: { points: Vec[]; width: number }): number[] {
    const out = new Set<number>();
    for (let k = 1; k < road.points.length; k++) {
      const [a, b] = [road.points[k - 1], road.points[k]];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      for (const tile of tilesWithin(terrain.size, mid, dist(a, b) / 2 + road.width)) {
        const c = { x: (tile % terrain.size) + 0.5, y: Math.floor(tile / terrain.size) + 0.5 };
        if (segmentDist(c, a, b) <= road.width / 2) out.add(tile);
      }
    }
    return [...out];
  }
  const dirtTiles = new Set(web.flatMap(roadTiles));

  function touched(pos: Vec, r: number): number[] {
    const out: number[] = [];
    for (let y = Math.floor(pos.y - r); y <= Math.floor(pos.y + r); y++) {
      for (let x = Math.floor(pos.x - r); x <= Math.floor(pos.x + r); x++) {
        const near = { x: Math.min(Math.max(pos.x, x), x + 1), y: Math.min(Math.max(pos.y, y), y + 1) };
        if (dist(near, pos) < r || (x === Math.floor(pos.x) && y === Math.floor(pos.y))) out.push(y * terrain.size + x);
      }
    }
    return out;
  }

  it('marks every dirt road and spur tile as track, where no region road or deck makes it road (IV9)', () => {
    for (const road of web) {
      for (const tile of roadTiles(road)) {
        const c = { x: (tile % terrain.size) + 0.5, y: Math.floor(tile / terrain.size) + 0.5 };
        const want = deckAt(ICARUS_DECKS, c.x, c.y) !== null || onRegionRoad(c) ? 'road' : 'track';
        expect(terrain.types[tile], `${c.x},${c.y}`).toBe(want);
      }
    }
  });

  it('lays no dirt road or spur tile on a cliff, and climbs at most 0.2 height units per tile along each road (IV9)', () => {
    for (const road of web) {
      for (const tile of roadTiles(road)) expect(isCliff(terrain, tile), `cliff at ${tile % terrain.size},${Math.floor(tile / terrain.size)}`).toBe(false);
      const points = along(road.points, 1);
      for (let k = 1; k < points.length; k++) {
        const [a, b] = [points[k - 1], points[k]];
        const grade = Math.abs(groundAt(terrain, b.x, b.y) - groundAt(terrain, a.x, a.y)) / dist(a, b);
        expect(grade, `grade at ${a.x.toFixed(1)},${a.y.toFixed(1)}`).toBeLessThanOrEqual(0.2);
      }
    }
  });

  it('keeps each landing strip off cliffs, under half the cliff slope, and clear of props and decks (IV9)', () => {
    for (const s of strips) {
      const box = stripBox(s);
      for (const tile of tilesWithin(terrain.size, box.center, Math.hypot(box.half.x, box.half.y) + 1)) {
        const c = { x: (tile % terrain.size) + 0.5, y: Math.floor(tile / terrain.size) + 0.5 };
        if (boxDistance(box, c) > 0) continue;
        expect(tileSteepness(terrain.heights, terrain.size, tile), `strip at ${c.x},${c.y}`).toBeLessThan(TERRAIN.drive.maxSlope / 2);
      }
      for (const p of TEST_MAP.props.filter((o) => !pieceAt(o))) expect(boxDistance(box, p.pos), `${p.kind} at ${p.pos.x},${p.pos.y}`).toBeGreaterThan(p.r);
      for (let k = 0.25; k <= dist(s.a, s.b); k += 0.5) {
        for (let c = -s.width / 2; c <= s.width / 2; c += 0.5) {
          const at = { x: s.a.x + box.axis.x * k - box.axis.y * c, y: s.a.y + box.axis.y * k + box.axis.x * c };
          expect(deckAt(ICARUS_DECKS, at.x, at.y)?.deck.id ?? null, `a deck on the strip at ${at.x},${at.y}`).toBeNull();
        }
      }
    }
  });

  it('keeps every prop but the pieces and the reactor off the dirt road tiles, the decks and the landing strips (IV12)', () => {
    const near = TEST_MAP.props.filter((p) => !pieceAt(p) && p.kind !== reactor.look && dist(p.pos, fallenSun.pos) < fallenSun.radius + 40);
    expect(near.length).toBeGreaterThan(50);
    for (const p of near) {
      const where = `${p.kind} at ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)}`;
      expect(touched(p.pos, p.r).filter((tile) => dirtTiles.has(tile)), where).toEqual([]);
      expect(onDeck(icarusAtlas(), p.pos, p.r), where).toBe(false);
      for (const s of strips) expect(boxDistance(stripBox(s), p.pos), where).toBeGreaterThan(p.r);
    }
  });

  it('lets a truck drive from each road to both ends of the wing and to the run-up of every flap', () => {
    const w = standardWorld(1337);
    const decks = FALLEN_SUN_DECKS.map((d) => deckById(d.id));
    const wing = decks.filter((d) => d.lips.length === 0);
    const flaps = decks.filter((d) => d.lips.length > 0);
    const goals = [wing[0].from, wing.at(-1)!.to, ...flaps.map((f) => (f.stations[0].rise === 0 ? { x: f.from.x - f.axis.x * 3, y: f.from.y - f.axis.y * 3 } : { x: f.to.x + f.axis.x * 3, y: f.to.y + f.axis.y * 3 }))];
    for (const entry of territoryEntries(t)) {
      for (const goal of goals) {
        const end = route(w, entry, goal, 0.6, []).at(-1)!;
        expect(dist(end, goal), `${goal.x.toFixed(1)},${goal.y.toFixed(1)} from ${entry.x.toFixed(1)},${entry.y.toFixed(1)}`).toBeLessThanOrEqual(1);
      }
    }
  }, 120_000);

  it('routes from each entry to a 5-tile grid of free points without long detours (IV4)', () => {
    const w = standardWorld(1337);
    const layer = navLayer(w.terrain, w.obstacles, 0.6);
    const hulls = pieces.flatMap((p, k) => propBoxes({ id: `piece-${k}`, pos: p.pos, r: p.r, kind: 'landmark', look: p.look, yaw: p.yaw }));
    const free = (p: Vec) => layer.blocked[Math.floor(p.y / CELL) * layer.n + Math.floor(p.x / CELL)] === 0 && hulls.every((b) => boxDistance(b, p) > 0);
    const reach = Math.ceil(fallenSun.radius / 5) * 5;
    const points: Vec[] = [];
    for (let y = -reach; y <= reach; y += 5) for (let x = -reach; x <= reach; x += 5) {
      const p = { x: fallenSun.pos.x + x, y: fallenSun.pos.y + y };
      if (siteGap(fallenSun, p) < 0 && free(p)) points.push(p);
    }
    expect(points.length).toBeGreaterThan(200);
    const ratios: number[] = [];
    const unreached: string[] = [];
    for (const entry of territoryEntries(t)) {
      for (const p of points) {
        const path = [entry, ...route(w, entry, p, 0.6, [])];
        if (dist(path.at(-1)!, p) > 1) unreached.push(`${(p.x - fallenSun.pos.x).toFixed(0)},${(p.y - fallenSun.pos.y).toFixed(0)}`);
        else ratios.push(path.slice(1).reduce((sum, q, k) => sum + dist(path[k], q), 0) / Math.max(1, dist(entry, p)));
      }
    }
    ratios.sort((a, b) => a - b);
    expect(unreached).toEqual([]);
    expect(ratios[Math.floor(ratios.length * 0.9)]).toBeLessThanOrEqual(1.35);
    expect(ratios.at(-1)).toBeLessThanOrEqual(1.8);
  }, 300_000);
});

function stripBox(s: LandingStrip): PosedBox {
  const length = dist(s.a, s.b);
  const axis = { x: (s.b.x - s.a.x) / length, y: (s.b.y - s.a.y) / length };
  return { center: { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, axis, half: { x: length / 2, y: s.width / 2 }, z0: 0, z1: 1 };
}

describe('every territory road on the baked map', () => {
  const terrain = TEST_MAP.terrain;
  const territories = REGION.locations.filter((l) => l.kind === 'territory');

  function tilesUnder(road: { points: Vec[]; width: number }, def: (typeof territories)[number], inside: boolean): number[] {
    const out = new Set<number>();
    for (let k = 1; k < road.points.length; k++) {
      const [a, b] = [road.points[k - 1], road.points[k]];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      for (const tile of tilesWithin(terrain.size, mid, dist(a, b) / 2 + road.width)) {
        const c = { x: (tile % terrain.size) + 0.5, y: Math.floor(tile / terrain.size) + 0.5 };
        if (segmentDist(c, a, b) <= road.width / 2 && (!inside || siteGap(def, c) < 0)) out.add(tile);
      }
    }
    return [...out];
  }

  it('lays no web road or spur tile of any territory on a cliff (IV1)', () => {
    for (const def of territories) {
      const { roads, spurs } = territoryRoads(def as never);
      for (const road of [...roads, ...spurs]) {
        for (const tile of tilesUnder(road, def, true)) expect(isCliff(terrain, tile), `${def.id} cliff at ${tile % terrain.size},${Math.floor(tile / terrain.size)}`).toBe(false);
      }
    }
  });

  const glassFlats = REGION.locations.find((l) => l.id === 'glass-flats')!;
  const lane = territoryRoads(glassFlats as never).roads[5];

  it('climbs at most the road grade per tile along the centre line of every Glass Flats road (IV6)', () => {
    const limit = TERRAIN.roadGrade + 0.02;
    for (const road of territoryRoads(glassFlats as never).roads) {
      const points = along(road.points, 1);
      for (let k = 1; k < points.length; k++) {
        const [a, b] = [points[k - 1], points[k]];
        const grade = Math.abs(groundAt(terrain, b.x, b.y) - groundAt(terrain, a.x, a.y)) / dist(a, b);
        expect(grade, `grade at ${a.x.toFixed(1)},${a.y.toFixed(1)}`).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('routes the largest chassis along the lane from the ring corner to the engine end (IV3)', () => {
    const w = standardWorld(1337);
    const widest = Object.values(CHASSIS).filter((c) => !isRig(c.id)).reduce((a, b) => (b.radius > a.radius ? b : a));
    const [from, goal] = [lane.points[0], lane.points.at(-1)!];
    const path = route(w, from, goal, widest.radius, []);
    expect(dist(path.at(-1)!, goal)).toBeLessThanOrEqual(1);
    for (const p of path) expect(Math.min(...lane.points.slice(1).map((b, k) => segmentDist(p, lane.points[k], b)))).toBeLessThanOrEqual(3);
  }, 120_000);
});
