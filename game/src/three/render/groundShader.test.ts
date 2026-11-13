import { describe, expect, it } from 'vitest';
import { GROUND_MATERIAL_IDS } from '../../render/groundPaint';
import { ASPHALT_MATERIAL } from './groundShader';

describe('ground shader paving', () => {
  it('keeps dirt and edge lines off the old asphalt material, by its own id', () => {
    expect(GROUND_MATERIAL_IDS[ASPHALT_MATERIAL]).toBe('asphalt');
  });
});
