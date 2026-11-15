import { describe, expect, it } from 'vitest';
import { RenderScaleSetting } from './camera-setting';
import { lowerReason } from './software-notice';

describe('software notice', () => {
  it('offers the lower resolution while the scale is above the lowest', () => {
    expect(lowerReason(new RenderScaleSetting(null))).toBeNull();
  });

  it('gives a reason once the scale is already the lowest', () => {
    const scale = new RenderScaleSetting(null);
    scale.set(0.5);
    expect(lowerReason(scale)).not.toBeNull();
  });
});
