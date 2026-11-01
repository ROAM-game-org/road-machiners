import { describe, expect, it } from 'vitest';
import { SITE_FACTIONS, TURF } from '../data/npc-behavior';
import { MAP_SPREAD, REGION } from '../data/region';
import { TEST_MAP } from '../test/map';
import { divideTurf, huntingSpots, turfClaimants, type Claimant } from './hunting-spots';
import { dist } from './vec';

const west: Claimant = { id: 'west', home: { x: 0, y: 0 }, reach: 100 };
const east: Claimant = { id: 'east', home: { x: 100, y: 0 }, reach: 30 };

describe('turf shares', () => {
  it('add up to the whole', () => {
    expect(Object.values(TURF.shares).reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 9);
  });

  it('give each faction one home site', () => {
    const sites = [...REGION.towns, ...REGION.locations];
    for (const id of Object.keys(TURF.shares)) expect(sites.filter((site) => SITE_FACTIONS[site.id] === id), id).toHaveLength(1);
  });

  it('split the reach of every faction by share', () => {
    const claimants = turfClaimants();
    expect(claimants.reduce((sum, c) => sum + c.reach, 0)).toBeCloseTo(TURF.reachPerFaction * claimants.length, 9);
    expect(Object.fromEntries(claimants.map((c) => [c.id, Math.round(c.reach)]))).toEqual({ scrapjaw: Math.round(400 * MAP_SPREAD), kiln: Math.round(200 * MAP_SPREAD) });
  });
});

describe('dividing turf', () => {
  it('lets claimants take turns, each taking the free point closest to home', () => {
    const points = [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 90, y: 0 }, { x: 80, y: 0 }];
    const turf = divideTurf(points, [west, { ...east, reach: 100 }]);
    expect(turf.get('west')).toEqual([{ x: 10, y: 0 }, { x: 20, y: 0 }]);
    expect(turf.get('east')).toEqual([{ x: 90, y: 0 }, { x: 80, y: 0 }]);
  });

  it('skips a claimant with nothing left in reach, and leaves points no one reaches free', () => {
    const points = [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }, { x: 90, y: 0 }, { x: 0, y: 200 }];
    const turf = divideTurf(points, [west, east]);
    expect(turf.get('east')).toEqual([{ x: 90, y: 0 }]);
    expect(turf.get('west')).toEqual([{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }]);
  });

  it('gives each camp a near even share of the hunting spots, and leaves the spots no camp reaches free', () => {
    const spots = huntingSpots(TEST_MAP).spots;
    const claimants = turfClaimants();
    const turf = divideTurf(spots, claimants);
    const counts = claimants.map((c) => turf.get(c.id)!.length);
    const claimed = counts.reduce((sum, n) => sum + n, 0);
    expect(Math.min(...counts)).toBeGreaterThan(claimed * 0.4);
    for (const c of claimants) for (const p of turf.get(c.id)!) expect(dist(p, c.home)).toBeLessThanOrEqual(c.reach);
    const free = spots.filter((p) => ![...turf.values()].some((points) => points.includes(p)));
    expect(free.length).toBeGreaterThan(0);
    for (const p of free) for (const c of claimants) expect(dist(p, c.home)).toBeGreaterThan(c.reach);
  });
});
