import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../data/physics';
import { deckAt, deckById, DECKS, type Deck } from '../../sim/bridge';
import { CLIFF_SHARPNESS, MESH_STEPS } from '../../sim/surface';
import { deckHeight, isCliff } from '../../sim/terrain';
import { TEST_MAP } from '../../test/map';
import { scatterPlacements } from './scatter';
import { BLOCK_COUNT_SHIFT, blockWriter } from './groundFields';
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

  it('keeps every corner of a cliff square outside all deck outlines within the cliff blend of its baked height', () => {
    const splinePull = 1 - (4 / 6) ** 2;
    const most = (1 - CLIFF_SHARPNESS) * splinePull;
    let cliffCorners = 0;
    for (const deck of DECKS)
      for (const [cx, cy, w, d] of chunksUnder(deck)) {
        const pos = chunkGeometry(t, cx, cy, w, d).getAttribute('position');
        const row = w * MESH_STEPS + 1;
        for (let j = 0; j <= d; j++)
          for (let i = 0; i <= w; i++) {
            const x = cx + i;
            const y = cy + j;
            const onCliff = [0, 1].some((dy) => [0, 1].some((dx) => x - dx >= 0 && y - dy >= 0 && x - dx < t.size && y - dy < t.size && isCliff(t, (y - dy) * t.size + x - dx)));
            if (!onCliff || deckAt(ICARUS_DECKS, x, y)) continue;
            cliffCorners++;
            const near = [-1, 0, 1, 2].flatMap((dy) => [-1, 0, 1, 2].map((dx) => t.heights[(y + dy) * (t.size + 1) + x + dx]));
            const drop = (Math.max(...near) - Math.min(...near)) * S;
            expect(Math.abs(pos.getY(j * MESH_STEPS * row + i * MESH_STEPS) - t.heights[y * (t.size + 1) + x] * S)).toBeLessThanOrEqual(most * drop);
          }
      }
    expect(cliffCorners).toBeGreaterThan(0);
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

  const meshRow = MESH_STEPS + 1;

  it('folds a cliff square along its two closer corners, so a cliff runs along its own line', () => {
    expect(squareTriangles(firstSquare(true))).toEqual([[0, meshRow, meshRow + 1], [0, meshRow + 1, 1]]);
  });

  it('keeps the collider diagonal on a square trucks drive on, even when the other diagonal is closer', () => {
    expect(squareTriangles(firstSquare(false))).toEqual([[0, meshRow, 1], [meshRow, meshRow + 1, 1]]);
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

describe('ground tile blocks', () => {
  const side = 7;
  const field = (paint: (x: number, y: number) => number) => Uint8Array.from({ length: side * side }, (_, k) => paint(k % side, Math.floor(k / side)));
  const blockAt = (materials: Uint8Array, x: number, y: number) => {
    const lead = new Uint8Array(side * side * 4);
    const rest = new Uint8Array(side * side * 4);
    const write = blockWriter(materials, side, lead, rest);
    write(0, 3);
    write(3, side);
    const at = (y * side + x) * 4;
    return { count: lead[at] >> BLOCK_COUNT_SHIFT, ids: [lead[at] & 31, lead[at + 1], rest[at]], masks: [lead[at + 2] | (lead[at + 3] << 8), rest[at + 2] | (rest[at + 3] << 8)] };
  };

  it('keeps one material with every tile of the 4 by 4 block', () => {
    expect(blockAt(field(() => 4), 3, 3)).toEqual({ count: 1, ids: [4, 4, 4], masks: [0xffff, 0] });
  });

  it('splits a straight border by which block tiles hold the first material met', () => {
    expect(blockAt(field((x) => (x < 3 ? 2 : 5)), 1, 3)).toEqual({ count: 2, ids: [2, 5, 2], masks: [0x7777, 0x8888] });
  });

  it('keeps a third material and leaves its tiles to the shader', () => {
    expect(blockAt(field((x, y) => (y < 3 ? 1 : x < 3 ? 2 : 3)), 3, 3)).toEqual({ count: 3, ids: [1, 2, 3], masks: [0x000f, 0x1110] });
  });

  it('flags a block of four materials for the full search', () => {
    expect(blockAt(field((x, y) => (y < 3 ? (x < 3 ? 0 : 1) : x < 3 ? 2 : 3)), 3, 3).count).toBe(4);
  });

  it('repeats the edge tiles past the map edge', () => {
    expect(blockAt(field((x) => (x === 0 ? 6 : 7)), 0, 0)).toEqual({ count: 2, ids: [6, 7, 6], masks: [0x3333, 0xcccc] });
  });
});
