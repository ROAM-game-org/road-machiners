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
