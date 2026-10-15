import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { failLoudOnShaderError, ShaderBuildFailed } from './shader-errors';

describe('failLoudOnShaderError', () => {
  it('throws a named error with the program, the sampler limit and the GL log', () => {
    const program = {} as WebGLProgram;
    const renderer = {
      debug: { onShaderError: null },
      info: { programs: [{ program, cacheKey: 'facets-ground' }] },
    } as unknown as THREE.WebGLRenderer;
    const gl = {
      MAX_TEXTURE_IMAGE_UNITS: 1,
      getParameter: () => 16,
      getProgramInfoLog: () => 'too many samplers',
      getShaderInfoLog: () => '',
    } as unknown as WebGLRenderingContext;
    failLoudOnShaderError(renderer);
    const fail = () => renderer.debug.onShaderError?.(gl, program as never, {} as WebGLShader, {} as WebGLShader);
    expect(fail).toThrow(ShaderBuildFailed);
    expect(fail).toThrow(/facets-ground.*sampler limit 16.*too many samplers/);
  });
});
