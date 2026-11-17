export const WEBGL2_VARYING_FLOOR = 15;

export function spotShadowsFit(maxVaryings: number): boolean {
  return maxVaryings >= WEBGL2_VARYING_FLOOR;
}
