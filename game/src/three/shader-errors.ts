import type * as THREE from 'three';

export class ShaderBuildFailed extends Error {
  constructor(detail: string) {
    super(`ShaderBuildFailed: ${detail}`);
    this.name = 'ShaderBuildFailed';
  }
}

const patchKeyOf = (cacheKey: string) => cacheKey.slice(cacheKey.lastIndexOf('}') + 1);

const materialOf = (renderer: THREE.WebGLRenderer, program: WebGLProgram) =>
  patchKeyOf(renderer.info.programs?.find((p) => p.program === program)?.cacheKey ?? '') || 'unknown';

const stageLog = (gl: WebGLRenderingContext, shader: WebGLShader, stage: string) => `${stage}: ${gl.getShaderInfoLog(shader) || 'no log'}`;

export function failLoudOnShaderError(renderer: THREE.WebGLRenderer): void {
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    const limit = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    const detail = [
      `material ${materialOf(renderer, program)}`,
      `sampler limit ${limit}`,
      `link log: ${gl.getProgramInfoLog(program) || 'no log'}`,
      stageLog(gl, vertex, 'vertex'),
      stageLog(gl, fragment, 'fragment'),
    ].join(' | ');
    throw new ShaderBuildFailed(detail);
  };
}
