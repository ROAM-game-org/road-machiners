import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { STORY_WRECKS } from '../data/salvage';
import { newDraft } from './bake';
import { prop } from './oldworld';
import { keepStartClear, onReservedGround } from './start-ground';

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
