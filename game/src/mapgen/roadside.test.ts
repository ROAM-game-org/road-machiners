import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { ROADSIDE } from '../data/terrain';
import { icarusAtlas } from '../sim/atlas';
import { onDeck } from '../sim/mapgen';
import { ROAD_INDEX } from '../sim/road-index';
import { siteGap } from '../sim/sites';
import { isCliff, tileAt, type BakedProp, type PropKind, type Terrain } from '../sim/terrain';
import { dist, type Vec } from '../sim/vec';
import { budget } from '../test/budget';
import { TEST_MAP } from '../test/map';

const NEW_KINDS: readonly PropKind[] = ['roadSign', 'routeSign', 'barrel'];
const O = REGION.obstacles;
const SITES = [...REGION.towns, ...REGION.locations];
const BUILT_TYPES = ['road', 'asphalt', 'field', 'track', 'canal', 'concrete', 'glass', 'dirtyWater', 'toxic', 'mud'];
const ROW_LINE = 0.1;
const ROW_TURN = 0.02;

const map = TEST_MAP;
const BOAT_KINDS: readonly PropKind[] = ['fishingBoat', 'riverBarge', 'skiff'];
const FIRST = map.props.findIndex((p) => p.kind === 'roadSign');
const legacy = map.props.slice(0, FIRST);
const added = map.props.slice(FIRST).filter((p) => !BOAT_KINDS.includes(p.kind));
const BUCKET = 8;
const terrain: Terrain = map.terrain;

function count(props: BakedProp[], kind: PropKind): number {
  return props.filter((p) => p.kind === kind).length;
}

function inBand(n: number, [low, high]: readonly [number, number]): boolean {
  return n >= low && n <= high;
}

function turnGap(a: number, b: number): number {
  const d = (2 * (a - b)) % (2 * Math.PI);
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) / 2;
}

function lineGap(a: Vec, b: Vec, c: Vec): number {
  const length = dist(a, b);
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / length;
}

describe('the roadside layer on the baked map', () => {
  it('finds the roadside block: the first road sign opens it and nothing but boats follows it', () => {
    expect(FIRST).toBeGreaterThan(0);
    expect(added.length).toBeGreaterThan(0);
    expect(map.props.slice(FIRST + added.length).every((p) => BOAT_KINDS.includes(p.kind))).toBe(true);
  });

  it('only appends: no legacy prop is a roadside kind, and every added prop is one of the layer kinds', () => {
    expect(legacy.some((p) => NEW_KINDS.includes(p.kind))).toBe(false);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((p) => p.kind === 'deadTree' || p.kind === 'drums' || NEW_KINDS.includes(p.kind))).toBe(true);
  });

  it('lands every group in its count band', () => {
    expect(inBand(count(added, 'roadSign'), ROADSIDE.signs.band)).toBe(true);
    expect(inBand(count(added, 'routeSign'), ROADSIDE.boards.band)).toBe(true);
    expect(inBand(count(added, 'barrel'), ROADSIDE.barrels.band)).toBe(true);
    expect(inBand(count(added, 'drums'), ROADSIDE.heaps.band)).toBe(true);
    expect(inBand(count(added, 'deadTree'), ROADSIDE.trees.band)).toBe(true);
  });

  it('keeps every added prop clear of roads, sites, decks and cliffs, and off built ground', () => {
    const atlas = icarusAtlas();
    for (const p of added) {
      const road = REGION.roadWidth / 2 + p.r;
      expect(ROAD_INDEX.nearestWithin(p.pos.x, p.pos.y, road)).toBeGreaterThanOrEqual(road);
      expect(onDeck(atlas, p.pos, p.r)).toBe(false);
      for (const site of SITES) expect(siteGap(site, p.pos)).toBeGreaterThan(O.siteClearance + p.r);
      expect(isCliff(terrain, tileAt(terrain, p.pos))).toBe(false);
      expect(BUILT_TYPES).not.toContain(terrain.types[tileAt(terrain, p.pos)]);
    }
  }, budget(120_000));

  it('keeps the prop gap from every other prop', () => {
    const buckets = new Map<number, number[]>();
    map.props.forEach((p, i) => {
      const key = Math.floor(p.pos.y / BUCKET) * 4096 + Math.floor(p.pos.x / BUCKET);
      const list = buckets.get(key);
      if (list) list.push(i);
      else buckets.set(key, [i]);
    });
    const widest = Math.max(...map.props.map((p) => p.r));
    const tooClose: string[] = [];
    const roadside = new Set(added);
    map.props.forEach((p, k) => {
      if (!roadside.has(p)) return;
      const reach = Math.ceil((p.r + O.gap + widest) / BUCKET);
      const cx = Math.floor(p.pos.x / BUCKET);
      const cy = Math.floor(p.pos.y / BUCKET);
      for (let y = cy - reach; y <= cy + reach; y++) for (let x = cx - reach; x <= cx + reach; x++) {
        for (const i of buckets.get(y * 4096 + x) ?? []) {
          const o = map.props[i];
          if (i < k && dist(p.pos, o.pos) < o.r + p.r + O.gap) tooClose.push(`${p.kind} at ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)} meets ${o.kind}`);
        }
      }
    });

    expect(tooClose).toEqual([]);
  }, budget(120_000));

  it('forms no ruled row of signs, barrels or trees', () => {
    for (const kind of ['roadSign', 'barrel', 'deadTree'] as const) {
      const same = added.filter((p) => p.kind === kind);
      const rows: string[] = [];
      for (let i = 0; i < same.length; i++) for (let j = i + 1; j < same.length; j++) {
        if (turnGap(same[i].yaw, same[j].yaw) > ROW_TURN) continue;
        for (let k = j + 1; k < same.length; k++) {
          if (turnGap(same[i].yaw, same[k].yaw) <= ROW_TURN && lineGap(same[i].pos, same[j].pos, same[k].pos) <= ROW_LINE) rows.push(`${kind} ${i} ${j} ${k}`);
        }
      }
      expect(rows).toEqual([]);
    }
  }, budget(120_000));

  it('stands road signs and barrels where a truck drives, not only in the far corners', () => {
    const nearRoad = added.filter((p) => p.kind === 'roadSign' && ROAD_INDEX.nearestWithin(p.pos.x, p.pos.y, 12) < 12);

    expect(nearRoad.length).toBeGreaterThan(ROADSIDE.signs.band[0] / 2);
  });
});
