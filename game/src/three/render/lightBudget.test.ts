import { describe, expect, it } from 'vitest';
import { spotShadowsFit, WEBGL2_VARYING_FLOOR } from './lightBudget';

describe('spotShadowsFit', () => {
  it('needs the WebGL 2 floor of varyings', () => {
    expect(WEBGL2_VARYING_FLOOR).toBe(15);
    expect(spotShadowsFit(14)).toBe(false);
    expect(spotShadowsFit(8)).toBe(false);
    expect(spotShadowsFit(15)).toBe(true);
    expect(spotShadowsFit(30)).toBe(true);
  });
});
