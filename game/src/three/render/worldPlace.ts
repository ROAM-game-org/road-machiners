export const WORLD_XZ = 'vWorldXZ';

const DECLARATION = 'varying vec2 vWorldXZ;';
const WRITE = `vec4 worldPlaceAt = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
worldPlaceAt = instanceMatrix * worldPlaceAt;
#endif
${WORLD_XZ} = (modelMatrix * worldPlaceAt).xz;`;

function declared(source: string): string {
  if (source.includes(DECLARATION)) return source;
  return `${DECLARATION}\n${source}`;
}

function written(source: string): string {
  if (source.includes(`${WORLD_XZ} = `)) return source;
  return source.replace('#include <project_vertex>', `#include <project_vertex>\n${WRITE}`);
}

export function placeInWorld(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = written(declared(shader.vertexShader));
  shader.fragmentShader = declared(shader.fragmentShader);
}
