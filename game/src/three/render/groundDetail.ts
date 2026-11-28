import { MARK_KINDS, type MarkKind } from "../../render/groundPaint";
import * as THREE from "three";

const detailAcross = new THREE.Vector3();
const detailDown = new THREE.Vector3();
const detailBack = new THREE.Vector3();

export function holdGroundDetail(uniforms: Record<string, THREE.IUniform>, camera: THREE.Camera, drawWidth: number, drawHeight: number): void {
  const detail = uniforms.drawnDetailPx;
  if (!detail) throw new Error("Ground uniforms have no drawnDetailPx to hold the detail level");
  if (!(camera instanceof THREE.OrthographicCamera)) throw new Error("Ground detail reads meters per pixel, which only holds for an orthographic camera");
  detail.value = groundDetailPx(camera, drawWidth, drawHeight);
}

export function groundDetailPx(camera: THREE.OrthographicCamera, drawWidth: number, drawHeight: number): number {
  camera.updateMatrixWorld();
  const p = camera.projectionMatrix.elements;
  detailBack.setFromMatrixColumn(camera.matrixWorld, 2);
  if (Math.abs(detailBack.y) < 1e-3) throw new Error("Ground detail needs a camera that looks down at the ground");
  const across = onGround(detailAcross.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(2 / (p[0] * drawWidth)));
  const down = onGround(detailDown.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(2 / (p[5] * drawHeight)));
  const pixel = Math.max(across.length(), down.length());
  return 2 ** Math.floor(Math.log2(pixel));
}

function onGround(step: THREE.Vector3): THREE.Vector3 {
  return step.addScaledVector(detailBack, -step.y / detailBack.y);
}

export const DRAWN_EDGE_SAMPLES = 4;
export const DRAWN_PEPPER_SPREAD = 3;
export const DRAWN_TUFT_CELL = 0.5;
export const DRAWN_TUFT_EDGE_SHARE = 1;
export const DRAWN_PEBBLE_CELL = 0.8;
export const DRAWN_PEBBLE_EDGE_SHARE = 0.8;
export const DRAWN_STONE_CELL = 1.8;
export const DRAWN_STONE_EDGE_SHARE = 0.3;

export function markIndex(mark: MarkKind): number {
  return MARK_KINDS.indexOf(mark);
}

export const MARK_SAMPLES_GLSL = `int drawnMarkFrom(DrawnBorder edge, vec4 rough, vec2 at, out float edgeMeters) {
  float toward = edge.toward + min(rough.y * 2.0, 1.0) * drawnPepperNoise(at, drawnDetailPx) * ${DRAWN_PEPPER_SPREAD.toFixed(1)} + rough.w * drawnGritNoise(at, drawnDetailPx) / facetSide;
  edgeMeters = abs(toward) * facetSide;
  return int(drawnMaterialMark[toward > 0.0 ? edge.lo : edge.hi] + 0.5);
}
vec2 drawnTuftRootAt(vec2 p) {
  vec2 c = floor(drawnViewFrame(p) / ${DRAWN_TUFT_CELL.toFixed(2)});
  return drawnFromViewFrame((c + vec2(0.3 + 0.4 * markHash(c + 43.0), 0.9)) * ${DRAWN_TUFT_CELL.toFixed(2)});
}
bool drawnTuftPicked(vec2 p) {
  return markHash(floor(drawnViewFrame(p) / ${DRAWN_TUFT_CELL.toFixed(2)}) + 41.0) <= ${DRAWN_TUFT_EDGE_SHARE.toFixed(2)};
}
vec2 drawnPebbleCenterAt(vec2 p, float cell, float seed) {
  vec2 c = floor(drawnViewFrame(p) / cell);
  return drawnFromViewFrame((c + 0.3 + 0.4 * vec2(markHash(c + seed + 3.1), markHash(c + seed + 5.3))) * cell);
}
bool drawnPebblePicked(vec2 p, float cell, float seed, float gathered) {
  return markHash(floor(drawnViewFrame(p) / cell) + seed) <= gathered;
}
bool drawnBorderHasMark(DrawnBorder edge, int mark) {
  return int(drawnMaterialMark[edge.lo] + 0.5) == mark || int(drawnMaterialMark[edge.hi] + 0.5) == mark;
}
bool drawnSampleWanted(int spot, DrawnBorder edge, vec2 p) {
  if (spot == 1) return drawnBorderHasMark(edge, ${markIndex("tufts")}) && drawnTuftPicked(p);
  if (!drawnBorderHasMark(edge, ${markIndex("pebbles")})) return false;
  if (spot == 2) return drawnPebblePicked(p, ${DRAWN_PEBBLE_CELL.toFixed(2)}, 91.0, ${DRAWN_PEBBLE_EDGE_SHARE.toFixed(2)});
  return drawnPebblePicked(p, ${DRAWN_STONE_CELL.toFixed(2)}, 99.0, ${DRAWN_STONE_EDGE_SHARE.toFixed(2)});
}
vec2 drawnSampleAt(int spot, vec2 p) {
  if (spot < 2) return spot == 0 ? p : drawnTuftRootAt(p);
  return spot == 2 ? drawnPebbleCenterAt(p, ${DRAWN_PEBBLE_CELL.toFixed(2)}, 91.0) : drawnPebbleCenterAt(p, ${DRAWN_STONE_CELL.toFixed(2)}, 99.0);
}
void drawnEdgeSamplesAt(vec2 p, out vec4 drawnRough, out DrawnBorder drawnEdge, out ivec3 drawnSampleMarks, out vec3 drawnSampleMeters) {
  drawnRough = vec4(0.0);
  drawnEdge = DrawnBorder(0, 0, 8.0, 0.0, 0.0, 0.0, vec3(0.0));
  drawnSampleMarks = ivec3(-1);
  drawnSampleMeters = vec3(0.0);
  for (int spot = 0; spot < drawnEdgeSamples; spot++) {
    if (spot > 0 && !drawnSampleWanted(spot, drawnEdge, p)) continue;
    vec2 at = drawnSampleAt(spot, p);
    vec4 rough = drawnEdgeTraits(at / facetSide);
    vec2 warp = rough.x > 0.0 ? drawnWarpAt(rough.x, rough.z, at) : vec2(0.0);
    DrawnBorder edge = drawnBorderAt((at + warp) / facetSide);
    if (spot == 0) { drawnRough = rough; drawnEdge = edge; continue; }
    float meters;
    drawnSampleMarks[spot - 1] = drawnMarkFrom(edge, rough, at, meters);
    drawnSampleMeters[spot - 1] = meters;
  }
}
`;
