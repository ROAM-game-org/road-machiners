import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { installDarkLightSkip, installShadowFilter } from './shadowFilter';

const original = THREE.ShaderChunk.shadowmap_pars_fragment;
afterEach(() => {
  THREE.ShaderChunk.shadowmap_pars_fragment = original;
});

describe('installShadowFilter', () => {
  it('swaps the noisy PCF taps for a fixed grid and is idempotent', () => {
    installShadowFilter();
    const once = THREE.ShaderChunk.shadowmap_pars_fragment;
    expect(once).toContain('shadow = sum / 9.0;');
    const pcf = once.slice(once.indexOf('SHADOWMAP_TYPE_PCF'), once.indexOf('SHADOWMAP_TYPE_VSM'));
    expect(pcf).not.toContain('interleavedGradientNoise( gl_FragCoord.xy )');
    installShadowFilter();
    expect(THREE.ShaderChunk.shadowmap_pars_fragment).toBe(once);
  });

  it('throws when three no longer holds the block it replaces', () => {
    THREE.ShaderChunk.shadowmap_pars_fragment = original.replace('* 0.2;', '* 0.25;');
    expect(() => installShadowFilter()).toThrow(/2D PCF block/);
  });
});

describe('dark light skip', () => {
  it('wraps each point and spot light in a branch on its color, closed after its direct light', () => {
    installDarkLightSkip();
    const chunk = THREE.ShaderChunk.lights_fragment_begin;
    for (const kind of ['point', 'spot']) {
      const start = chunk.indexOf(`if ( ${kind}Lights[ i ].color != vec3( 0.0 ) ) {`);
      expect(start).toBeGreaterThan(-1);
      const direct = chunk.indexOf('RE_Direct(', start);
      const close = chunk.indexOf(';', direct);
      expect(chunk.slice(close + 1).trimStart().startsWith('}')).toBe(true);
    }
  });

  it('keeps the loop that three unrolls, and patches once', () => {
    installDarkLightSkip();
    const once = THREE.ShaderChunk.lights_fragment_begin;
    installDarkLightSkip();
    expect(THREE.ShaderChunk.lights_fragment_begin).toBe(once);
    expect(once.match(/#pragma unroll_loop_end/g)?.length).toBeGreaterThan(1);
  });
});
