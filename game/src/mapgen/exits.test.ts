import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { EXITS, TERRAIN } from '../data/terrain';
import { ROAD_INDEX } from '../sim/road-index';
import { siteGap } from '../sim/sites';
import { newDraft, tileSteepness, typeCode, type MapDraft } from './bake';
import { exitLayer, ravineEscape, trappedFloors } from './exits';

const RIM = 5;
const DEPTH = 3;
const TRENCH = { x0: 700, x1: 704, y0: 1500, y1: 1800 };

function trenchDraft(): MapDraft {
  const d = newDraft(REGION.size);
  d.heights.fill(RIM);
  d.types.fill(typeCode('sand'));
  const n = d.size + 1;
  for (let y = TRENCH.y0; y <= TRENCH.y1; y++) for (let x = TRENCH.x0; x <= TRENCH.x1; x++) d.heights[y * n + x] = RIM - DEPTH;
  return d;
}

function trenchTiles(): number[] {
  const out: number[] = [];
  for (let y = TRENCH.y0; y < TRENCH.y1; y++) for (let x = TRENCH.x0; x < TRENCH.x1; x++) out.push(y * REGION.size + x);
  return out;
}

describe('ravine exits', () => {
  const corners = [{ x: TRENCH.x0, y: TRENCH.y0 }, { x: TRENCH.x1, y: TRENCH.y1 }];
  for (const c of corners) {
    expect(ROAD_INDEX.nearestWithin(c.x, c.y, 60)).toBeGreaterThanOrEqual(60);
    expect(Math.min(...[...REGION.towns, ...REGION.locations].map((s) => siteGap(s, c)))).toBeGreaterThan(60);
  }
  const before = trenchDraft();
  const after = exitLayer(trenchDraft());

  it('finds a steep trench longer than the exit spacing as a trap', () => {
    const e = ravineEscape(before);
    expect(trenchTiles().some((k) => e.floor[k] && e.dist[k] > EXITS.spacing)).toBe(true);
    expect(trappedFloors(before).length).toBeGreaterThan(0);
  });

  it('cuts ramps so every trench floor tile lies within the exit spacing of a way out', () => {
    const e = ravineEscape(after);
    const far = trenchTiles().filter((k) => e.drivable[k] && e.dist[k] > EXITS.spacing);
    expect(far).toEqual([]);
    expect(trappedFloors(after)).toEqual([]);
  });

  it('leads out of every part of the trench on ground graded below the steepest a truck climbs', () => {
    const gentle = (k: number) => tileSteepness(after.heights, after.size, k) <= EXITS.grade * TERRAIN.drive.maxSlope;
    const reached = new Set(trenchTiles().filter(gentle));
    const queue = [...reached];
    let out = false;
    for (let q = 0; q < queue.length && !out; q++) {
      const k = queue[q];
      if (after.heights[Math.floor(k / after.size) * (after.size + 1) + (k % after.size)] >= RIM) out = true;
      for (const m of [k - 1, k + 1, k - after.size, k + after.size]) {
        if (reached.has(m) || !gentle(m) || Math.abs((m % after.size) - TRENCH.x0) > 40) continue;
        reached.add(m);
        queue.push(m);
      }
    }
    expect(out).toBe(true);
  });

  it('never fills the trench floor', () => {
    const n = after.size + 1;
    for (let y = TRENCH.y0; y <= TRENCH.y1; y++) for (let x = TRENCH.x0; x <= TRENCH.x1; x++) expect(after.heights[y * n + x]).toBeLessThanOrEqual(RIM - DEPTH);
  });
});
