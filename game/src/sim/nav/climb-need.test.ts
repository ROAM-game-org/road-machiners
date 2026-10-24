import { describe, expect, it } from 'vitest';
import { REGION } from '../../data/region';
import { emptyWorld, editableTerrain } from '../testkit';
import { MAX_RADIUS, reachable, standPoint } from '../salvage';
import { climbNeed, navLayer, NO_CLIMB } from './layer';
import type { Obstacle, World } from '../types';

const RAMP_FROM = 20;
const RAMP_LENGTH = 10;
const ROAD_COLUMNS = [5, 6, 7];
const prop: Obstacle = { id: 'ruin-1', pos: { x: 40, y: 30 }, r: 1, kind: 'landmark', look: 'ruin', yaw: 0 };

function worldWithRamp(grade: number): World {
  const w = emptyWorld();
  const t = editableTerrain(w);
  const row = t.size + 1;
  t.heights.fill(0);
  t.types.fill('sand');
  for (let j = 0; j < row; j++)
    for (let i = 0; i < row; i++) t.heights[j * row + i] = grade * Math.min(RAMP_LENGTH, Math.max(0, i - RAMP_FROM));
  for (let j = 0; j < t.size; j++) for (const i of ROAD_COLUMNS) t.types[j * t.size + i] = 'road';
  return w;
}

const layerOf = (w: World) => navLayer(w.terrain, [prop], MAX_RADIUS);

describe('climb need', () => {
  it('rejects a place behind a ramp steeper than the climb and accepts one just under it', () => {
    const steep = layerOf(worldWithRamp(0.25));
    const gentle = layerOf(worldWithRamp(0.15));
    expect(reachable(steep, prop, REGION.navigation.reachClimb)).toBe(false);
    expect(standPoint(steep, prop, REGION.navigation.reachClimb)).toBeNull();
    expect(reachable(steep, prop, 0.25)).toBe(true);
    expect(reachable(gentle, prop, REGION.navigation.reachClimb)).toBe(true);
  });

  it('gives the stand point a cell the road joins within the climb', () => {
    const layer = layerOf(worldWithRamp(0.15));
    const at = standPoint(layer, prop, REGION.navigation.reachClimb);
    expect(at).not.toBeNull();
    const cell = Math.floor(at!.y / 0.5) * layer.n + Math.floor(at!.x / 0.5);
    expect(climbNeed(layer)[cell]).toBe(3);
    expect(climbNeed(layer)[cell]).not.toBe(NO_CLIMB);
  });

  it('builds the field once per layer', () => {
    const layer = layerOf(worldWithRamp(0.15));
    expect(climbNeed(layer)).toBe(climbNeed(layer));
  });
});
