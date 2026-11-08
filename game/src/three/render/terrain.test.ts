import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../data/physics';
import { deckAt, deckById, DECKS, type Deck } from '../../sim/bridge';
import { deckHeight, isCliff } from '../../sim/terrain';
import { TEST_MAP } from '../../test/map';
import { scatterPlacements } from './scatter';
import { calmTiles } from './groundFields';
import { chunkGeometry, deckFloorCap, groundSide, TERRAIN_CHUNK } from './terrain';
import { HIGHWAY } from '../../data/modes';
import { REGION } from '../../data/region';
import { ICARUS_DECKS } from '../../sim/bridge';

const S = PHYSICS.metersPerTile;
const t = TEST_MAP.terrain;

function chunksUnder(deck: Deck): [number, number, number, number][] {
  const points = deck.rails.flat();
  const lo = (v: number) => Math.floor(v / TERRAIN_CHUNK) * TERRAIN_CHUNK;
  const out: [number, number, number, number][] = [];
  for (let y = lo(Math.min(...points.map((p) => p.y))); y <= Math.max(...points.map((p) => p.y)); y += TERRAIN_CHUNK)
    for (let x = lo(Math.min(...points.map((p) => p.x))); x <= Math.max(...points.map((p) => p.x)); x += TERRAIN_CHUNK)
      out.push([x, y, Math.min(TERRAIN_CHUNK, t.size - x), Math.min(TERRAIN_CHUNK, t.size - y)]);
  return out;
}

function worstRise(deck: Deck, inset: number): number {
  let worst = -Infinity;
  for (const [cx, cy, w, d] of chunksUnder(deck)) {
    const geo = chunkGeometry(t, cx, cy, w, d);
    const pos = geo.getAttribute('position');
    const index = geo.getIndex()!;
    for (let f = 0; f < index.count; f += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => index.getX(f + k));
      for (let i = 0; i <= 20; i++)
        for (let j = 0; j <= 20 - i; j++) {
          const u = i / 20;
          const v = j / 20;
          const wgt = [1 - u - v, u, v];
          const p = [a, b, c].reduce((s, k, n) => ({ x: s.x + pos.getX(k) * wgt[n], y: s.y + pos.getY(k) * wgt[n], z: s.z + pos.getZ(k) * wgt[n] }), { x: 0, y: 0, z: 0 });
          const mx = p.x / S;
          const my = p.z / S;
          const along = (mx - deck.from.x) * deck.axis.x + (my - deck.from.y) * deck.axis.y;
          const across = (my - deck.from.y) * deck.axis.x - (mx - deck.from.x) * deck.axis.y;
          if (along < inset || along > deck.length - inset || Math.abs(across) > deck.width / 2 - inset) continue;
          worst = Math.max(worst, p.y - deckHeight(t, deck, along) * S);
        }
    }
  }
  return worst;
}

describe('terrain under decks', () => {
  it.each(['canyon-bridge', 'broken-wing'])('draws the ground at least 0.1 m under %s everywhere inside its outline', (id) => {
    expect(worstRise(deckById(id), 0.32)).toBeLessThanOrEqual(-0.1);
  });

  it('draws every corner outside all deck outlines at its baked height', () => {
    for (const deck of DECKS)
      for (const [cx, cy, w, d] of chunksUnder(deck)) {
        const pos = chunkGeometry(t, cx, cy, w, d).getAttribute('position');
        for (let j = 0; j <= d; j++)
          for (let i = 0; i <= w; i++) {
            const x = cx + i;
            const y = cy + j;
            if (deckAt(ICARUS_DECKS, x, y)) continue;
            expect(pos.getY(j * (w + 1) + i)).toBe(Math.fround(t.heights[y * (t.size + 1) + x] * S));
          }
      }
  });

  it('gives no floor cap off every deck and one under the deck height on it', () => {
    const B = deckById('canyon-bridge');
    expect(deckFloorCap(t, B.from.x - B.axis.x * 2, B.from.y - B.axis.y * 2)).toBeNull();
    expect(deckFloorCap(t, 1, 1)).toBeNull();
    const mid = { x: B.from.x + (B.axis.x * B.length) / 2, y: B.from.y + (B.axis.y * B.length) / 2 };
    expect(deckFloorCap(t, mid.x, mid.y)).toBeLessThan(deckHeight(t, B, B.length / 2));
  });

  it('places no scatter inside a deck outline above the drawn floor', () => {
    let inside = 0;
    for (const chunk of scatterPlacements(t, [])) {
      for (const model of ['pebbles', 'scrub', 'desert_stones', 'desert_scrub', 'cactus'] as const) {
        for (const { matrix } of chunk[model]) {
          const [x, y, z] = [matrix.elements[12], matrix.elements[13], matrix.elements[14]];
          const cap = deckFloorCap(t, x / S, z / S);
          if (cap === null) continue;
          inside++;
          expect(y).toBeLessThanOrEqual(cap * S);
        }
      }
    }
    expect(inside).toBeGreaterThan(0);
  });
});

describe('ground triangle split', () => {
  const row = t.size + 1;
  const corner = (x: number, y: number) => t.heights[y * row + x];
  const closerRising = (x: number, y: number) => Math.abs(corner(x, y) - corner(x + 1, y + 1)) < Math.abs(corner(x + 1, y) - corner(x, y + 1));

  function firstSquare(cliff: boolean): { x: number; y: number } {
    for (let y = 0; y < t.size; y++)
      for (let x = 0; x < t.size; x++)
        if (isCliff(t, y * t.size + x) === cliff && closerRising(x, y) && deckFloorCap(t, x, y) === null && deckFloorCap(t, x + 1, y + 1) === null) return { x, y };
    throw new Error(`No ${cliff ? 'cliff' : 'drivable'} square whose rising diagonal is closer`);
  }

  function squareTriangles(at: { x: number; y: number }): number[][] {
    const index = chunkGeometry(t, at.x, at.y, 1, 1).getIndex()!;
    return [[index.getX(0), index.getX(1), index.getX(2)], [index.getX(3), index.getX(4), index.getX(5)]];
  }

  it('folds a cliff square along its two closer corners, so a cliff runs along its own line', () => {
    expect(squareTriangles(firstSquare(true))).toEqual([[0, 2, 3], [0, 3, 1]]);
  });

  it('keeps the collider diagonal on a square trucks drive on, even when the other diagonal is closer', () => {
    expect(squareTriangles(firstSquare(false))).toEqual([[0, 2, 1], [2, 3, 1]]);
  });
});

describe('ground texture side', () => {
  it('keeps the highway ground at its texel density', () => {
    expect(groundSide(HIGHWAY.size)).toBe(2709);
    expect(groundSide(HIGHWAY.size) / (HIGHWAY.size + 20)).toBeCloseTo(groundSide(600) / 620, 2);
  });

  it('caps the Icarus ground at the texture floor', () => {
    expect(groundSide(REGION.size)).toBe(2048);
  });
});

describe('calm ground tiles', () => {
  const side = 7;
  const field = (paint: (x: number, y: number) => number) => Uint8Array.from({ length: side * side }, (_, k) => paint(k % side, Math.floor(k / side)));

  it('counts tiles to the nearest other material by the widest axis', () => {
    const calm = calmTiles(field((x, y) => (x === 0 && y === 0 ? 1 : 0)), side);
    expect(calm[0]).toBe(1);
    expect(calm[1 * side + 1]).toBe(1);
    expect(calm[2 * side + 1]).toBe(2);
    expect(calm[3 * side + 3]).toBe(3);
    expect(calm[6 * side + 6]).toBe(6);
  });

  it('treats the map edge as more of the same material', () => {
    const calm = calmTiles(field(() => 4), side);
    expect(Math.min(...calm)).toBe(255);
  });

  it('marks both sides of a straight border', () => {
    const calm = calmTiles(field((x) => (x < 3 ? 2 : 5)), side);
    expect([0, 1, 2, 3, 4, 5, 6].map((x) => calm[3 * side + x])).toEqual([3, 2, 1, 1, 2, 3, 4]);
  });
});
