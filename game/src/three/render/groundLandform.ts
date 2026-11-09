import * as THREE from "three";
import { blurredHeights } from "../../sim/surface";

export const LANDFORM_BLUR_TILES = 1.5;

export function landformSlopes(form: Float32Array, side: number): Float32Array {
  const slopes = new Float32Array(side * side * 2);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const k = y * side + x;
      slopes[k * 2] = centralDifference(form, x, side, (i) => y * side + i);
      slopes[k * 2 + 1] = centralDifference(form, y, side, (j) => j * side + x);
    }
  return slopes;
}

function centralDifference(form: Float32Array, at: number, side: number, index: (n: number) => number): number {
  const before = Math.max(0, at - 1);
  const after = Math.min(side - 1, at + 1);
  return (form[index(after)] - form[index(before)]) / (after - before);
}

export type LandformUniforms = {
  groundLandform: { value: THREE.Texture };
  groundLandformSide: { value: number };
  groundLandformTileMeters: { value: number };
};

export class GroundLandform {
  readonly form: Float32Array;
  readonly uniforms: LandformUniforms;

  constructor(heights: ArrayLike<number>, side: number, metersPerTile: number) {
    this.form = blurredHeights(heights, side, LANDFORM_BLUR_TILES);
    const slopes = landformSlopes(this.form, side);
    const half = new Uint16Array(slopes.length);
    for (let k = 0; k < slopes.length; k++) half[k] = THREE.DataUtils.toHalfFloat(slopes[k]);
    const texture = new THREE.DataTexture(half, side, side, THREE.RGFormat, THREE.HalfFloatType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    this.uniforms = {
      groundLandform: { value: texture },
      groundLandformSide: { value: side },
      groundLandformTileMeters: { value: metersPerTile },
    };
  }
}

export const LANDFORM_GLSL = `
uniform sampler2D groundLandform;
uniform float groundLandformSide;
uniform float groundLandformTileMeters;
vec2 groundLandformAt(vec2 corner) {
  return texture(groundLandform, (corner + 0.5) / groundLandformSide).rg;
}
vec2 groundLandformSlope(vec2 at) {
  vec2 corner = at / groundLandformTileMeters;
  vec2 base = floor(corner);
  vec2 f = corner - base;
  vec2 g = 1.0 - f;
  vec2 w0 = g * g * g / 6.0;
  vec2 w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f * f - 3.0 * f * f * f) / 6.0;
  vec2 w3 = f * f * f / 6.0;
  vec2 low = w0 + w1;
  vec2 high = w2 + w3;
  vec2 lowAt = base - 1.0 + w1 / low;
  vec2 highAt = base + 1.0 + w3 / high;
  return low.y * (low.x * groundLandformAt(lowAt) + high.x * groundLandformAt(vec2(highAt.x, lowAt.y)))
    + high.y * (low.x * groundLandformAt(vec2(lowAt.x, highAt.y)) + high.x * groundLandformAt(highAt));
}
`;
