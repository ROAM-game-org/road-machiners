import { describe, expect, it } from 'vitest';
import { BOATS } from '../data/terrain';
import { REGION } from '../data/region';
import { TYPE_IDS, type BakedProp } from '../sim/terrain';
import { polylineDist, type Vec } from '../sim/vec';
import { newDraft, type MapDraft } from './bake';
import { boatLayer, checkBoatBands } from './boats';
import { prop } from './oldworld';
import { lineGap, turnGap } from './roadside';

const SIZE = REGION.size;
const RIVER = { path: [{ x: 560, y: 720 }, { x: 740, y: 720 }] as Vec[], width: 5, bank: 20, depth: 1.3 };
const RULES = { ...BOATS, river: { ...BOATS.river, step: 18, chance: 1, band: [1, 99] as const }, wash: { ...BOATS.wash, groups: 0, band: [0, 0] as const }, boatBand: [1, 99] as const };
const SAND = TYPE_IDS.indexOf('sand');
const EARLIER = prop('rock', { x: 600, y: 600 }, 1, 0);

function draft(): MapDraft {
  const d = newDraft(SIZE);
  d.types.fill(SAND);
  d.props.push(EARLIER);
  return d;
}

function boatsOf(d: MapDraft): BakedProp[] {
  return d.props.filter((p) => BOATS.kinds.some((k) => k.kind === p.kind));
}

describe('boat layer', () => {
  const baked = boatLayer(3, draft(), RULES, RIVER);
  const boats = boatsOf(baked);

  it('only appends to the props that were there', () => {
    expect(baked.props[0]).toBe(EARLIER);
    expect(boats.length).toBeGreaterThan(0);
    expect(baked.props.slice(1)).toEqual(boats);
  });

  it('keeps river boats on the floor and out of the pass lane (IV2)', () => {
    for (const b of boats) {
      const away = polylineDist(b.pos, RIVER.path);
      expect(away).toBeLessThanOrEqual(RIVER.width);
      expect(away - b.r).toBeGreaterThanOrEqual(RULES.passLane / 2);
    }
  });

  it('keeps every boat clear of every other prop (IV1)', () => {
    const all = baked.props;
    for (const b of boats) for (const o of all) if (o !== b) expect(Math.hypot(o.pos.x - b.pos.x, o.pos.y - b.pos.y)).toBeGreaterThanOrEqual(o.r + b.r + REGION.obstacles.gap);
  });

  it('never lines three boats of one kind up at one turn (IV4)', () => {
    for (const kind of BOATS.kinds) {
      const alike = boats.filter((b) => b.kind === kind.kind);
      for (const a of alike) for (const b of alike) for (const c of alike) {
        if (a === b || b === c || a === c) continue;
        const sameTurn = turnGap(a.yaw, b.yaw) <= 0.05 && turnGap(b.yaw, c.yaw) <= 0.05 && turnGap(a.yaw, c.yaw) <= 0.05;
        expect(sameTurn && lineGap(a.pos, b.pos, c.pos) <= 0.15).toBe(false);
      }
    }
  });

  it('gives the same boats for the same seed', () => {
    expect(boatsOf(boatLayer(3, draft(), RULES, RIVER))).toEqual(boats);
  });


  it('skips boats on built ground', () => {
    const d = draft();
    d.built.fill(1);
    expect(() => boatLayer(3, d, RULES, RIVER)).toThrow(/outside/);
  });

  it('throws naming the band when a count leaves it', () => {
    expect(() => checkBoatBands({ river: 0, wash: 1, boats: 9 })).toThrow('Boat river groups count 0 is outside 4 to 7');
    expect(() => checkBoatBands({ river: 5, wash: 1, boats: 30 })).toThrow('Boat boats count 30 is outside 8 to 20');
  });
});
