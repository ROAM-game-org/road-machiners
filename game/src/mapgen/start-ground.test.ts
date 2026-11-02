import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { STORY_WRECKS } from '../data/salvage';
import { newDraft } from './bake';
import { prop } from './oldworld';
import { keepStartClear, onReservedGround } from './start-ground';
import { reservedGround } from '../sim/start-pose';
import { isCliff, tileAt } from '../sim/terrain';
import { TEST_MAP } from '../test/map';

describe('story wreck ground', () => {
  const wreck = STORY_WRECKS[0];

  it('is reserved, so no layer builds on a story wreck', () => {
    expect(onReservedGround(wreck.pos, 0.1)).toBe(true);
    expect(onReservedGround({ x: wreck.pos.x + wreck.r + REGION.obstacles.gap + 1, y: wreck.pos.y }, 0.1)).toBe(false);
  });

  it('drops a prop that overlaps a story wreck and keeps one beside it', () => {
    const d = newDraft(REGION.size);
    const over = prop('rock', { x: wreck.pos.x + 0.4, y: wreck.pos.y }, 1.3, 0);
    const beside = prop('rock', { x: wreck.pos.x + wreck.r + REGION.obstacles.gap + 3, y: wreck.pos.y }, 1.3, 0);
    d.props.push(over, beside);
    expect(keepStartClear(d).props).toEqual([beside]);
  });
});

describe('start kit ground on the baked map', () => {
  const spots = reservedGround();

  it('has reserved spots to check', () => {
    expect(spots.length).toBeGreaterThan(0);
  });

  it('keeps every reserved spot free of cliffs', () => {
    const { terrain } = TEST_MAP;
    for (const { pos, r } of spots) {
      for (let y = Math.floor(pos.y - r); y <= Math.floor(pos.y + r); y++) {
        for (let x = Math.floor(pos.x - r); x <= Math.floor(pos.x + r); x++) {
          if (Math.hypot(x + 0.5 - pos.x, y + 0.5 - pos.y) > r + 0.7) continue;
          expect(isCliff(terrain, tileAt(terrain, { x, y })), `cliff at ${x},${y} near ${pos.x},${pos.y}`).toBe(false);
        }
      }
    }
  });

  it('keeps every reserved spot free of props', () => {
    for (const { pos, r } of spots) {
      const hit = TEST_MAP.props.find((p) => Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) < p.r + r);
      expect(hit, `prop ${hit?.kind} at ${pos.x},${pos.y}`).toBeUndefined();
    }
  });
});
