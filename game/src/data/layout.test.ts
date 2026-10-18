import { describe, expect, it } from 'vitest';
import { ARRIVAL, FARM_TOWER_ID } from './arrival';
import { CONTRACTS } from './market';
import { MAP_SCALE, REGION, scalePoint } from './region';
import { STORY_WRECKS } from './salvage';
import { MAPGEN, TERRAIN } from './terrain';
import { BEACON } from './tow';

const SPREAD = 1.3;
const OLD_SCALE = 5;
const SNAP = 1;

const TODAY: Record<string, { at: [number, number]; radius: number }> = {
  bowl: { at: [16, 94], radius: 28 },
  nose: { at: [102, 35], radius: 32 },
  orchard: { at: [22.8, 56.8], radius: 83.4 },
  dustwell: { at: [33.8, 32], radius: 6 },
  granary: { at: [50, 32.8], radius: 6 },
  'glass-flats': { at: [81, 75.6], radius: 95 },
  'green-pit': { at: [71.8, 89], radius: 6 },
  'pump-station': { at: [40.7, 51.7], radius: 6 },
  'fallen-sun': { at: [64, 54], radius: 119 },
  'salvage-yard': { at: [82, 52.2], radius: 6 },
  scrapjaw: { at: [22, 14], radius: 6 },
  kiln: { at: [66, 76], radius: 6 },
};

const sites = [...REGION.towns, ...REGION.locations];
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const layoutPoint = (x: number, y: number) => ({ x: x * OLD_SCALE, y: y * OLD_SCALE });

describe('Icarus layout spread', () => {
  it('spreads the map 1.3 times with one scale', () => {
    expect(MAP_SCALE).toBe(OLD_SCALE * SPREAD);
    expect(REGION.size).toBe(120 * MAP_SCALE);
  });

  it('knows every place of today', () => {
    expect(sites.map((s) => s.id).sort()).toEqual(Object.keys(TODAY).sort());
  });

  it('stands every pair of places 1.3 times further apart centre to centre', () => {
    for (const a of sites)
      for (const b of sites) {
        if (a.id >= b.id) continue;
        const before = dist(layoutPoint(...TODAY[a.id].at), layoutPoint(...TODAY[b.id].at));
        expect(Math.abs(dist(a.pos, b.pos) - before * SPREAD), `${a.id} to ${b.id}`).toBeLessThan(SNAP);
      }
  });

  it('keeps every place its size', () => {
    for (const s of sites) expect(s.radius, s.id).toBeCloseTo(TODAY[s.id].radius, 1);
  });

  it('keeps the canyon bridge deck its length', () => {
    const [from, to] = TERRAIN.features.decks[0].line;
    expect(dist(from.at, to.at)).toBeCloseTo(dist(layoutPoint(97.9, 75.1), layoutPoint(101.5, 71.5)), 3);
  });

  it('writes the arrival, the story wreck and the close-ups in layout units', () => {
    const near = (a: { x: number; y: number }, b: { x: number; y: number }, within = 0.01) => expect(dist(a, b)).toBeLessThan(within);
    near(ARRIVAL.pose.pos, scalePoint({ x: 74, y: 108 }));
    const pose = ARRIVAL.pose.pos;
    const tower = ARRIVAL.farm.find((p) => p.id === FARM_TOWER_ID)!;
    near({ x: tower.pos.x - pose.x, y: tower.pos.y - pose.y }, { x: 3, y: 8 });
    near(STORY_WRECKS[0].pos, scalePoint({ x: 34.2, y: 76.2 }));
    const spot = (name: string) => MAPGEN.closeUps.find((c) => c.name === name)!.center;
    near(spot('canyon'), scalePoint({ x: 94, y: 48 }));
    near(spot('sand'), scalePoint({ x: 78, y: 70 }));
    near(sites.find((s) => s.id === 'orchard')!.pos, scalePoint({ x: 22.8, y: 56.8 }), SNAP);
    expect(REGION.playerStart.distance).toBeCloseTo(22 * MAP_SCALE, 6);
  });

  it('scales the ranges that span the map', () => {
    expect(BEACON.range).toBeCloseTo(250 * SPREAD, 6);
    expect(CONTRACTS.survey.range).toBeCloseTo(180 * SPREAD, 6);
    expect(CONTRACTS.survey.spread).toBeCloseTo(90 * SPREAD, 6);
    expect(CONTRACTS.survey.clue.range).toBeCloseTo(180 * SPREAD, 6);
    expect(CONTRACTS.rescue.range).toBeCloseTo(132 * SPREAD, 6);
  });
});
