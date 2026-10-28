import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { GEOLOGY, TERRAIN, type ZoneKind } from '../data/terrain';
import { ZONE_KINDS, zoneWeight } from '../sim/zones';
import { deckById } from '../sim/bridge';
import { ROAD_INDEX } from '../sim/road-index';
import { isCliff, tileAt, type BakedProp, type Terrain } from '../sim/terrain';
import { siteGap } from '../sim/sites';
import { dist, segmentDist } from '../sim/vec';
import { newDraft, rockLayer, zoneBoulderOdds, type MapDraft } from './bake';
import { BUILT_GLASS, BUILT_TRACK } from './newworld';
import { tileOf, tilesWithin } from './oldworld';
import { budget } from '../test/budget';
import { TEST_MAP } from '../test/map';

const SIZE = REGION.size;
const O = REGION.obstacles;
const SITES = [...REGION.towns, ...REGION.locations];

const BUCKET = 8;

function expectClear(rocks: BakedProp[]): void {
  const bridge = deckById('canyon-bridge');
  const broken: string[] = [];
  const at = (rock: BakedProp) => `${rock.kind} at ${rock.pos.x.toFixed(1)},${rock.pos.y.toFixed(1)}`;
  for (const rock of rocks) {
    const { x, y } = rock.pos;
    if (Math.min(x, y, SIZE - x, SIZE - y) < O.edgeMargin) broken.push(`${at(rock)} is inside the margin`);
    if (ROAD_INDEX.nearestWithin(x, y, Infinity) < REGION.roadWidth / 2 + O.roadClearance + rock.r) broken.push(`${at(rock)} is on a road`);
    for (const site of SITES) if (siteGap(site, rock.pos) <= O.siteClearance + rock.r) broken.push(`${at(rock)} is on site ${site.id}`);
    if (segmentDist(rock.pos, bridge.from, bridge.to) < bridge.width / 2 + rock.r) broken.push(`${at(rock)} is on the bridge`);
  }
  expect(broken).toEqual([]);
  expect(crowded(rocks)).toEqual([]);
}

function crowded(rocks: BakedProp[]): string[] {
  const buckets = new Map<number, number[]>();
  rocks.forEach((rock, i) => {
    const key = Math.floor(rock.pos.y / BUCKET) * 4096 + Math.floor(rock.pos.x / BUCKET);
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  });
  const widest = Math.max(0, ...rocks.map((rock) => rock.r));
  const reach = Math.ceil((2 * widest + O.gap) / BUCKET);
  const tooClose: string[] = [];
  rocks.forEach((a, i) => {
    const cx = Math.floor(a.pos.x / BUCKET);
    const cy = Math.floor(a.pos.y / BUCKET);
    for (let y = cy - reach; y <= cy + reach; y++) for (let x = cx - reach; x <= cx + reach; x++) {
      for (const j of buckets.get(y * 4096 + x) ?? []) {
        if (j > i && dist(a.pos, rocks[j].pos) < a.r + rocks[j].r + O.gap) tooClose.push(`${a.kind} at ${a.pos.x.toFixed(1)},${a.pos.y.toFixed(1)} meets ${rocks[j].kind}`);
      }
    }
  });
  return tooClose;
}

const FOOT = 300;
const FACE = 10;
const RISE = TERRAIN.drive.maxSlope * 2;

function cliffDraft(foot = FOOT): MapDraft {
  const d = newDraft(SIZE);
  const n = SIZE + 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) d.heights[j * n + i] = Math.min(FACE, Math.max(0, foot - i)) * RISE;
  return d;
}

describe('boulders', () => {
  it('puts rocks along the foot of a cliff', () => {
    const d = rockLayer(1337, cliffDraft());

    expect(d.props.every((p) => p.kind === 'rock')).toBe(true);
    const atFoot = d.props.filter((rock) => rock.pos.x >= FOOT && rock.pos.x < FOOT + 1);
    expect(atFoot.length).toBeGreaterThan(10);
  });

  it('puts no boulder on the cliff face or on the flat ground away from it', () => {
    const d = rockLayer(1337, cliffDraft());

    const onFace = d.props.filter((rock) => rock.pos.x >= FOOT - FACE && rock.pos.x < FOOT);
    const away = d.props.filter((rock) => rock.pos.x > FOOT + 1 || rock.pos.x < FOOT - FACE - 1);
    expect(onFace).toEqual([]);
    expect(away).toEqual([]);
  });

  it('puts no boulder where deep sand covers the cliff foot', () => {
    const d = cliffDraft();
    d.sand.fill(GEOLOGY.ground.looseSand);

    expect(rockLayer(1337, d).props).toEqual([]);
  });

  it('puts no boulder on flat ground', () => {
    const d = rockLayer(1337, newDraft(SIZE));

    expect(d.props).toEqual([]);
  });

  it('keeps every boulder clear of roads, sites, the bridge, the margin and other rocks', () => {
    const d = rockLayer(1337, cliffDraft());

    expectClear(d.props);
  });

  it('places every boulder at the precision the map file stores, so spacing survives saving', () => {
    const d = rockLayer(1337, cliffDraft());

    expect(d.props.length).toBeGreaterThan(5);
    for (const rock of d.props) {
      expect(rock.pos.x).toBe(Math.fround(rock.pos.x));
      expect(rock.pos.y).toBe(Math.fround(rock.pos.y));
      expect(rock.r).toBe(Math.fround(rock.r));
    }
  });

  it('keeps every boulder off dirt track tiles, and places every other boulder as without the track', () => {
    const marked = cliffDraft();
    for (let y = 200; y < 206; y++) for (let x = FOOT - 20; x < FOOT + 20; x++) marked.built[y * SIZE + x] = BUILT_TRACK;
    const onTrack = (d: MapDraft, rock: BakedProp) => [tileOf(SIZE, rock.pos), ...tilesWithin(SIZE, rock.pos, rock.r)].some((tile) => d.built[tile] === BUILT_TRACK);

    const withTrack = rockLayer(1337, marked).props;
    const without = rockLayer(1337, cliffDraft()).props;

    expect(withTrack.filter((rock) => onTrack(marked, rock))).toEqual([]);
    const away = (rock: BakedProp) => rock.pos.y < 200 - 3 || rock.pos.y > 206 + 3;
    expect(without.filter((rock) => !away(rock)).length).toBeGreaterThan(0);
    expect(withTrack.filter(away)).toEqual(without.filter(away));
  });

  it('keeps every boulder off fused glass', () => {
    const marked = cliffDraft();
    for (let y = 200; y < 230; y++) for (let x = FOOT - 20; x < FOOT + 20; x++) marked.built[y * SIZE + x] = BUILT_GLASS;
    const onGlass = (rock: BakedProp) => [tileOf(SIZE, rock.pos), ...tilesWithin(SIZE, rock.pos, rock.r)].some((tile) => marked.built[tile] === BUILT_GLASS);
    const without = rockLayer(1337, cliffDraft()).props;

    const withGlass = rockLayer(1337, marked).props;

    expect(without.filter(onGlass).length).toBeGreaterThan(0);
    expect(withGlass.filter(onGlass)).toEqual([]);
  });

  it('puts more boulders on mountain slopes than on plain ground, and far fewer in swamp and farm belt', () => {
    const MOUNTAIN_FOOT = 1500;
    const density = (foot: number, inZone: (y: number) => boolean) => {
      const ys = Array.from({ length: SIZE }, (_, y) => y).filter(inZone);
      expect(ys.length).toBeGreaterThan(50);
      const placed = rockLayer(1337, cliffDraft(foot)).props.filter((p) => Math.abs(p.pos.x - foot) < 1 && inZone(Math.floor(p.pos.y)));
      return placed.length / ys.length;
    };
    const plain = density(FOOT, (y) => ZONE_KINDS.every((kind) => zoneWeight(kind, FOOT, y) === 0));
    const swamp = density(FOOT, (y) => zoneWeight('swamp', FOOT, y) > 0.95);
    const farm = density(FOOT, (y) => zoneWeight('farmBelt', FOOT, y) > 0.95);
    const mountains = density(MOUNTAIN_FOOT, (y) => zoneWeight('mountains', MOUNTAIN_FOOT, y) > 0.95);

    expect(plain).toBeGreaterThan(0.05);
    expect(mountains).toBeGreaterThan(1.5 * plain);
    expect(swamp).toBeLessThan(0.3 * plain);
    expect(farm).toBeLessThan(0.3 * plain);
  });

  it('weights boulder odds by zone: double in mountains, a tenth in swamp', () => {
    const n = SIZE + 1;
    const where = (kind: ZoneKind) => {
      for (let y = 0; y < SIZE; y += 8) for (let x = 0; x < SIZE; x += 8) if (zoneWeight(kind, x, y) > 0.99) return y * n + x;
      throw new Error(`No ${kind} ground found`);
    };

    expect(zoneBoulderOdds(n, where('mountains'))).toBeCloseTo(GEOLOGY.boulders.zoneOdds.mountains, 1);
    expect(zoneBoulderOdds(n, where('swamp'))).toBeCloseTo(GEOLOGY.boulders.zoneOdds.swamp, 1);
    expect(zoneBoulderOdds(n, where('farmBelt'))).toBeCloseTo(GEOLOGY.boulders.zoneOdds.farmBelt, 1);
  });

  it('places the same boulders for the same seed', () => {
    const a = rockLayer(1337, cliffDraft());
    const b = rockLayer(1337, cliffDraft());

    expect(a.props).toEqual(b.props);
  });
});

const RIDGE = 300;
const FLANK = 0.3;

function ridgeDraft(crest: number): MapDraft {
  const d = newDraft(SIZE);
  const n = SIZE + 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) d.heights[j * n + i] = crest - Math.abs(i - RIDGE) * FLANK;
  return d;
}

describe('crags', () => {
  const C = GEOLOGY.boulders.crag;

  it('turns ridge-top boulders on high ground into crags, each with a spire radius and a facing', () => {
    const d = rockLayer(1337, ridgeDraft(C.above + 1));

    expect(d.props.length).toBeGreaterThan(5);
    for (const p of d.props) {
      expect(p.kind).toBe('crag');
      expect(Math.abs(p.pos.x - RIDGE)).toBeLessThanOrEqual(0.5);
      expect(p.r).toBeGreaterThanOrEqual(C.radius[0]);
      expect(p.r).toBeLessThanOrEqual(C.radius[1]);
      expect(p.yaw).toBeGreaterThanOrEqual(0);
      expect(p.yaw).toBeLessThan(Math.PI * 2);
    }
  });

  it('keeps ridge-top boulders below the crag height as rocks', () => {
    const d = rockLayer(1337, ridgeDraft(C.above - 1));

    expect(d.props.length).toBeGreaterThan(5);
    expect(d.props.every((p) => p.kind === 'rock')).toBe(true);
  });

  it('keeps every crag clear of roads, sites, the bridge, the margin and other props', () => {
    expectClear(rockLayer(1337, ridgeDraft(C.above + 1)).props);
  });
});

describe('boulders on the baked map', () => {
  const map = TEST_MAP;
  const boulders = map.props.filter((p) => p.kind === 'rock' || p.kind === 'crag');

  it('holds both rocks and crags', () => {
    expect(boulders.some((p) => p.kind === 'rock')).toBe(true);
    expect(boulders.some((p) => p.kind === 'crag')).toBe(true);
  });

  it('keeps every boulder clear of roads, sites, the bridge, the margin and other rocks', () => {
    expectClear(boulders);
  }, budget(120_000));

  it('puts no boulder on or beside a dirt track tile', () => {
    const terrain: Terrain = map.terrain;
    const onTrack = boulders.filter((rock) => [tileAt(terrain, rock.pos), ...tilesWithin(terrain.size, rock.pos, rock.r)].some((tile) => terrain.types[tile] === 'track'));

    expect(onTrack).toEqual([]);
  }, budget(120_000));

  it('puts no boulder on a cliff tile', () => {
    const onCliff = boulders.filter((rock) => isCliff(map.terrain, tileAt(map.terrain, rock.pos)));

    expect(onCliff).toEqual([]);
  }, budget(120_000));
});
