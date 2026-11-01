import { describe, expect, it } from 'vitest';
import { along } from '../test/territory-kit';
import { ECONOMY } from '../data/goods';
import { PHYSICS } from '../data/physics';
import { REGION, scalePoint, type TerritoryDef } from '../data/region';
import { TERRITORIES, type TerritoryRules } from '../data/territory';
import { boxDistance, propBoxes, propReach } from '../sim/mapgen';
import { siteGap } from '../sim/sites';
import { route } from '../sim/path';
import { ROAD_INDEX } from '../sim/road-index';
import { isLootSpot, territoryAt, territoryCaches, territoryEntries, territoryOfStock, territoryPieces, territoryRoads, type BakedPiece } from '../sim/territory';
import type { BakedProp } from '../sim/terrain';
import { dist, type Vec } from '../sim/vec';
import { TEST_MAP } from '../test/map';
import { newDraft, type MapDraft } from './bake';
import { BUILT_GLASS } from './newworld';
import { tileCenter, tilesWithin } from './oldworld';
import { territoryLayer } from './territory';
import { standardWorld } from '../test/world-cache';

const OLD_ORCHARD = { x: 114, y: 284 };
const ORCHARD_NOW = REGION.locations.find((l) => l.id === 'orchard')!.pos;
const ORCHARD_AT_SPREAD = { x: 148, y: 369 };
const FALLEN_SUN_AT_SPREAD = { x: 416, y: 351 };
const FALLEN_SUN_NOW = REGION.locations.find((l) => l.id === 'fallen-sun')!.pos;

function rollingDraft(): MapDraft {
  const d = newDraft(REGION.size);
  const w = d.size + 1;
  const orchardShift = { x: ORCHARD_NOW.x - OLD_ORCHARD.x, y: ORCHARD_NOW.y - OLD_ORCHARD.y };
  const crashShift = { x: FALLEN_SUN_NOW.x - FALLEN_SUN_AT_SPREAD.x + ORCHARD_AT_SPREAD.x - OLD_ORCHARD.x, y: FALLEN_SUN_NOW.y - FALLEN_SUN_AT_SPREAD.y + ORCHARD_AT_SPREAD.y - OLD_ORCHARD.y };
  for (let j = 0; j <= d.size; j++)
    for (let i = 0; i <= d.size; i++) {
      const s = Math.hypot(i - FALLEN_SUN_NOW.x, j - FALLEN_SUN_NOW.y) < Math.hypot(i - ORCHARD_NOW.x, j - ORCHARD_NOW.y) ? crashShift : orchardShift;
      d.heights[j * w + i] = 0.6 * Math.sin((i - s.x) / 9) + 0.4 * Math.cos((j - s.y) / 7);
    }
  return d;
}

function lowBoxes(p: BakedPiece, k: number) {
  return propBoxes({ id: `piece-${k}`, pos: p.pos, r: p.r, kind: 'landmark', look: p.look, yaw: p.yaw }).filter((b) => b.z0 < PHYSICS.truckClearance);
}

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
        gradeRoads: false,
        rimRocks: null,
        scree: null,
        roads: [{ points: [{ x: -20, y: 3 }, { x: 20, y: 3 }], width: 2.5, surface: 'track' }],
        spurs: [],
        spurFade: 5,
        decks: [],
        landing: 0,
      },
      farm: null,
      glass: { cell: 6, cover: [0.25, 0.55], clear: 1.5, fade: { band: 6, warp: 2, cell: 8 }, spires: { look: 'hullShard', count: 4, radius: [0.8, 1.1] } },
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

  let sharedWithIt: MapDraft | undefined;
  function withIt(): MapDraft {
    sharedWithIt ??= withFlats(flatsRules(), rollingDraft);
    return sharedWithIt;
  }

  it('bakes the Fallen Sun and the orchard as without it (IV1)', () => {
    const without = territoryLayer(7, rollingDraft());

    const full = withIt();

    expect(full.props.filter((p) => outside(p.pos))).toEqual(without.props);
    const tilesOutside = (d: MapDraft) => Array.from(d.built).filter((_, tile) => outside(tileCenter(d.size, tile)));
    expect(tilesOutside(full)).toEqual(tilesOutside(without));
  });

  it('bakes a wreck with no basin and no rim rocks, with its piece, building, cache, field spot and glass', () => {
    const d = withIt();

    const inside = d.props.filter((p) => !outside(p.pos));
    const kinds = new Set(inside.map((p) => p.kind));
    for (const kind of ['hullDrum', 'barn', 'hullCache', 'shipCache', 'junk', 'hullShard']) expect(kinds.has(kind as BakedProp['kind']), kind).toBe(true);
    expect(kinds.has('rimRock')).toBe(false);
    expect(tilesWithin(d.size, flats.pos, flats.radius).some((tile) => d.built[tile] === BUILT_GLASS)).toBe(true);
  });

  it('keeps the field spots the spot gap from the buildings', () => {
    const rules = flatsRules();
    const d = withIt();

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

  it('marks every dirt road centreline tile inside the outline and every spur centreline tile as track, or road where a region road crosses it', () => {
    const { roads, spurs } = territoryRoads(gt);
    const tileCentre = (p: Vec): Vec => ({ x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 });
    for (const road of roads) {
      for (const p of along(road.points, 0.5).filter((q) => siteGap(flats, tileCentre(q)) < 0)) expect(['track', 'road'], `${p.x.toFixed(1)},${p.y.toFixed(1)}`).toContain(typeAt(p));
    }
    for (const road of spurs) {
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

  it('lets a truck drive from its one entry off the road to the side of every loot spot, the cache in the nozzle mouth included (IV3)', () => {
    const w = standardWorld(1337);
    const spots = w.obstacles.filter((o) => isLootSpot(o) && siteGap(flats, o.pos) < 0);
    const nozzle = flatsPieces.find((p) => p.look === 'engineNozzle')!;
    const mouth = spots.find((o) => o.kind === 'landmark' && o.look === wreck.cacheLook && dist(o.pos, nozzle.pos) < nozzle.r);
    expect(mouth).toBeDefined();
    const reach = (o: (typeof spots)[number]) => (propReach(o) + ECONOMY.useRange) * ECONOMY.interactionScale;
    const entries = territoryEntries(gt);
    expect(entries).toHaveLength(1);
    for (const entry of entries) {
      for (const spot of spots) {
        const end = route(w, entry, spot.pos, 0.6, []).at(-1)!;
        expect(dist(end, spot.pos), `${spot.id} from ${entry.x},${entry.y}`).toBeLessThanOrEqual(reach(spot));
      }
    }
  }, 120_000);
});
