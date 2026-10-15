export const WEBGL2_FLOOR = { fragmentUnits: 16 };

function holdLinksToFloor(floor) {
  window.__gpuFloor = [];
  const context = WebGL2RenderingContext.prototype;
  const link = context.linkProgram;
  const samplerUnits = (gl, program) => {
    const samplers = new Set([
      gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_ARRAY_SHADOW, gl.SAMPLER_CUBE_SHADOW,
      gl.INT_SAMPLER_2D, gl.INT_SAMPLER_3D, gl.INT_SAMPLER_CUBE, gl.INT_SAMPLER_2D_ARRAY,
      gl.UNSIGNED_INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_3D, gl.UNSIGNED_INT_SAMPLER_CUBE, gl.UNSIGNED_INT_SAMPLER_2D_ARRAY,
    ]);
    let units = 0;
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const uniform = gl.getActiveUniform(program, i);
      if (samplers.has(uniform.type)) units += uniform.size;
    }
    return units;
  };
  const getParameter = context.getParameter;
  context.getParameter = function floorLimit(name) {
    return name === this.MAX_TEXTURE_IMAGE_UNITS ? floor.fragmentUnits : getParameter.call(this, name);
  };
  context.linkProgram = function linkWithinFloor(program) {
    link.call(this, program);
    if (!this.getProgramParameter(program, this.LINK_STATUS)) return;
    const units = samplerUnits(this, program);
    if (units <= floor.fragmentUnits) return;
    const fragment = this.getAttachedShaders(program).find((s) => this.getShaderParameter(s, this.SHADER_TYPE) === this.FRAGMENT_SHADER);
    window.__gpuFloor.push({ units, ground: /\broadMask\b/.test(this.getShaderSource(fragment) ?? '') });
    this.detachShader(program, fragment);
    link.call(this, program);
    this.attachShader(program, fragment);
  };
}

export function emulateWebGL2Floor(page) {
  return page.addInitScript(holdLinksToFloor, WEBGL2_FLOOR);
}
