export const WEBGL2_FLOOR = { fragmentUnits: 16, fragmentRows: 224, vertexRows: 256 };

function holdLinksToFloor(floor) {
  window.__gpuFloor = [];
  window.__gpuRows = [];
  const context = WebGL2RenderingContext.prototype;
  const link = context.linkProgram;
  const samplerTypes = (gl) => new Set([
    gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_ARRAY_SHADOW, gl.SAMPLER_CUBE_SHADOW,
    gl.INT_SAMPLER_2D, gl.INT_SAMPLER_3D, gl.INT_SAMPLER_CUBE, gl.INT_SAMPLER_2D_ARRAY,
    gl.UNSIGNED_INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_3D, gl.UNSIGNED_INT_SAMPLER_CUBE, gl.UNSIGNED_INT_SAMPLER_2D_ARRAY,
  ]);
  const samplerUnits = (gl, program) => {
    const samplers = samplerTypes(gl);
    let units = 0;
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const uniform = gl.getActiveUniform(program, i);
      if (samplers.has(uniform.type)) units += uniform.size;
    }
    return units;
  };
  const matrixRows = (gl) => new Map([
    [gl.FLOAT_MAT2, 2], [gl.FLOAT_MAT3, 3], [gl.FLOAT_MAT4, 4],
    [gl.FLOAT_MAT2x3, 2], [gl.FLOAT_MAT2x4, 2],
    [gl.FLOAT_MAT3x2, 3], [gl.FLOAT_MAT3x4, 3],
    [gl.FLOAT_MAT4x2, 4], [gl.FLOAT_MAT4x3, 4],
  ]);
  const uniformRows = (gl, program, source) => {
    const matrices = matrixRows(gl);
    let rows = 0;
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const uniform = gl.getActiveUniform(program, i);
      if (samplerTypes(gl).has(uniform.type)) continue;
      const base = uniform.name.split(/[[.]/)[0];
      if (!new RegExp(`\\b${base}\\b`).test(source)) continue;
      rows += (matrices.get(uniform.type) ?? 1) * uniform.size;
    }
    return rows;
  };
  const shaderOf = (gl, program, type) => gl.getAttachedShaders(program).find((s) => gl.getShaderParameter(s, gl.SHADER_TYPE) === type);
  const getParameter = context.getParameter;
  context.getParameter = function floorLimit(name) {
    if (name === this.MAX_TEXTURE_IMAGE_UNITS) return floor.fragmentUnits;
    if (name === this.MAX_FRAGMENT_UNIFORM_VECTORS) return floor.fragmentRows;
    if (name === this.MAX_VERTEX_UNIFORM_VECTORS) return floor.vertexRows;
    return getParameter.call(this, name);
  };
  context.linkProgram = function linkWithinFloor(program) {
    link.call(this, program);
    if (!this.getProgramParameter(program, this.LINK_STATUS)) return;
    const fragment = shaderOf(this, program, this.FRAGMENT_SHADER);
    const vertex = shaderOf(this, program, this.VERTEX_SHADER);
    const fragmentSource = this.getShaderSource(fragment) ?? '';
    const vertexSource = this.getShaderSource(vertex) ?? '';
    const ground = /\broadMask\b/.test(fragmentSource);
    const units = samplerUnits(this, program);
    const fragmentRows = uniformRows(this, program, fragmentSource);
    const vertexRows = uniformRows(this, program, vertexSource);
    if (ground) window.__gpuRows.push({ name: /#define SHADER_NAME (\S+)/.exec(fragmentSource)?.[1] ?? '', fragment: fragmentRows, vertex: vertexRows });
    const over = [];
    if (units > floor.fragmentUnits) over.push({ kind: 'units', stage: 'fragment', units, ground });
    if (fragmentRows > floor.fragmentRows) over.push({ kind: 'rows', stage: 'fragment', rows: fragmentRows, ground });
    if (vertexRows > floor.vertexRows) over.push({ kind: 'rows', stage: 'vertex', rows: vertexRows, ground });
    if (over.length === 0) return;
    window.__gpuFloor.push(...over);
    this.detachShader(program, fragment);
    link.call(this, program);
    this.attachShader(program, fragment);
  };
}

export function emulateWebGL2Floor(page) {
  return page.addInitScript(holdLinksToFloor, WEBGL2_FLOOR);
}
