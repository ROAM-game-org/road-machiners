import * as THREE from 'three';

export const PPU = 200;

export function plateSpace(width, height) {
  const ux = (x) => (x - width / 2) / PPU;
  const uy = (y) => (height / 2 - y) / PPU;
  const centerOf = ([x0, y0, x1, y1]) => [ux((x0 + x1) / 2), uy((y0 + y1) / 2)];
  const sizeOf = ([x0, y0, x1, y1]) => [(x1 - x0) / PPU, (y1 - y0) / PPU];
  const inside = (panelBox) => {
    const [pcx, pcy] = centerOf(panelBox);
    return (b) => { const [cx, cy] = centerOf(b); const [w, h] = sizeOf(b); return [cx - pcx, cy - pcy, w, h]; };
  };
  return { width, height, ux, uy, centerOf, sizeOf, inside };
}

export function makeStage({ ambient = 0.62, sunPower = 2.55, sunAt = [-6, 12, 9], span = 6 } = {}) {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight('#fff4e6', ambient));
  const sun = new THREE.DirectionalLight('#fff7ea', sunPower);
  sun.position.set(...sunAt); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.012;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 60 });
  scene.add(sun);
  const root = new THREE.Group();
  scene.add(root);
  return { scene, sun, root };
}

function pixelBounds(root, toPx, pad) {
  const bounds = new THREE.Box3().setFromObject(root);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const cx of [bounds.min.x, bounds.max.x]) for (const cy of [bounds.min.y, bounds.max.y]) for (const cz of [bounds.min.z, bounds.max.z]) {
    const [a, b] = toPx(new THREE.Vector3(cx, cy, cz));
    x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b);
  }
  return [Math.floor(x0 - pad), Math.floor(y0 - pad), Math.ceil(x1 + pad + 40), Math.ceil(y1 + pad + 20)];
}

const FRAME = { eye: { x: 0, y: 6.5, z: 24 }, fov: 19, faceWidthPx: 1279, pad: 16 };

export function frame(opts) {
  const { scene, root, facePanel, eye, fov, faceWidthPx, pad } = { ...FRAME, ...opts };
  const camera = new THREE.PerspectiveCamera(fov, 1, 1, 120);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(eye.x, eye.y, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const measure = camera.clone();
  const ndc = (p) => v.copy(p).project(measure).clone();
  const faceL = ndc(facePanel.g.localToWorld(new THREE.Vector3(-facePanel.w / 2, 0, facePanel.z)));
  const faceR = ndc(facePanel.g.localToWorld(new THREE.Vector3(facePanel.w / 2, 0, facePanel.z)));
  const F = Math.round(2 * faceWidthPx / Math.hypot(faceR.x - faceL.x, faceR.y - faceL.y));
  const toPx = (p) => { const n = ndc(p); return [(n.x + 1) / 2 * F, (1 - n.y) / 2 * F]; };
  const [x0, y0, x1, y1] = pixelBounds(root, toPx, pad);
  const IW = x1 - x0, IH = y1 - y0;
  const img = (p) => { const [a, b] = toPx(p); return [+(a - x0).toFixed(2), +(b - y0).toFixed(2)]; };
  camera.setViewOffset(F, F, x0, y0, IW, IH);

  const quad = (panel, x, y, w, h, z = 0) => {
    const at = (dx, dy) => img(panel.g.localToWorld(new THREE.Vector3(x + dx, y + dy, panel.z + z)));
    return [at(-w / 2, h / 2), at(w / 2, h / 2), at(w / 2, -h / 2), at(-w / 2, -h / 2)];
  };
  const cropAround = (pts, grow) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [Math.max(0, Math.floor(Math.min(...xs) - grow)), Math.max(0, Math.floor(Math.min(...ys) - grow)), Math.min(IW, Math.ceil(Math.max(...xs) + grow)), Math.min(IH, Math.ceil(Math.max(...ys) + grow))];
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.append(renderer.domElement);
  const render = (scale) => { renderer.setPixelRatio(scale); renderer.setSize(IW, IH, false); renderer.render(scene, camera); };
  const shot = () => renderer.domElement.toDataURL('image/png');
  const crop = (scale, [a, b, c, d]) => {
    const cv = document.createElement('canvas'); cv.width = (c - a) * scale; cv.height = (d - b) * scale;
    cv.getContext('2d').drawImage(renderer.domElement, a * scale, b * scale, cv.width, cv.height, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  };
  return { camera, IW, IH, img, quad, cropAround, render, shot, crop };
}

export function finishPanels(panels) {
  for (const p of panels) { p.finish(); for (const d of p.dyn) if (d.fn) d.fn({}, 0); }
}

export function installBake(bakeAtScale) {
  window.bake = bakeAtScale;
  window.bakeReady = true;
}

export function recessRim(panel, x, y, w, h, { lip, light, outer = 5, radius = 9 }) {
  panel.paint('base', (c) => {
    const X = panel.X(x - w / 2), Y = panel.Y(y + h / 2), W = w * PPU, H = h * PPU;
    c.fillStyle = lip; c.beginPath(); c.roundRect(X - outer, Y - outer, W + outer * 2, H + outer * 2, radius); c.fill();
    if (light) { c.fillStyle = light; c.fillRect(X - outer, Y + H + outer - 2, W + outer * 2, 2); c.fillRect(X + W + outer - 2, Y - outer, 2, H + outer * 2); }
  });
}
