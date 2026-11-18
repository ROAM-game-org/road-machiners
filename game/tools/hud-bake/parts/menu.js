import * as THREE from 'three';
import { PPU, plateSpace, makeStage, frame, installBake, vanishFor } from '../core.js';
import { OLIVE, mottle, slab, faceMaterial, keycap, litToon } from './olive.js';

const K = 3.2;
const CSS = K / PPU;
const FACE_CSS = [1001, 59, 1283, 393];
const S = plateSpace((FACE_CSS[2] - FACE_CSS[0]) * K, (FACE_CSS[3] - FACE_CSS[1]) * K);
const VP = vanishFor(FACE_CSS);
const EYE = { x: (VP.x - (FACE_CSS[0] + FACE_CSS[2]) / 2) * CSS, y: ((FACE_CSS[1] + FACE_CSS[3]) / 2 - VP.y) * CSS, z: 24 };
const local = ([x0, y0, x1, y1]) => [((x0 + x1) / 2 - (FACE_CSS[0] + FACE_CSS[2]) / 2) * CSS, ((FACE_CSS[1] + FACE_CSS[3]) / 2 - (y0 + y1) / 2) * CSS, (x1 - x0) * CSS, (y1 - y0) * CSS];
const ROWS = 9, PITCH = 36;
const KEY = (i) => [1009, 65 + PITCH * i, 1042.5, 98.5 + PITCH * i];
const LAMP_CSS = [1110, 294.4, 1117, 301.4];
const BODY_D = 0.06, BEVEL = 1.1 * CSS, GAP = 0.8, KEYCAP_H = 3.5 * CSS;
const KEY_UP = -0.006, KEY_DOWN = -0.022;

const { scene, root } = makeStage();
const W = (FACE_CSS[2] - FACE_CSS[0]) * CSS, H = (FACE_CSS[3] - FACE_CSS[1]) * CSS;
const FRONT = BODY_D / 2;

const faceMat = faceMaterial(S.width, S.height, (c, w, h) => {
  c.fillStyle = OLIVE.housing; c.fillRect(0, 0, w, h);
  mottle(c, 0, 0, w, h, 31);
});
const holes = Array.from({ length: ROWS }, (_, i) => { const [x, y, w, h] = local(KEY(i)); return [x, y, w + 2 * GAP * CSS, h + 2 * GAP * CSS, (4 + GAP) * CSS]; });
const panel = slab({ w: W, h: H, depth: BODY_D, bevel: BEVEL, holes, faceMat });
root.add(panel.mesh, panel.face, ...panel.floors);

const keys = Array.from({ length: ROWS }, (_, i) => {
  const [x, y, w, h] = local(KEY(i));
  const g = new THREE.Group();
  g.add(keycap(w, h, CSS, KEYCAP_H).group);
  g.position.set(x, y, FRONT + KEY_UP);
  root.add(g);
  return g;
});

const lamp = new THREE.Group();
const lampLens = { on: new THREE.MeshBasicMaterial({ color: '#ffc867', toneMapped: false }), off: litToon('#4a2c0a') };
let lampDome, lampHalo;
{
  const r = 2.6 * CSS;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.7 * CSS, 10, 32), litToon(OLIVE.brass));
  ring.castShadow = true;
  lampDome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lampLens.on);
  lampDome.rotation.x = Math.PI / 2; lampDome.scale.set(1, 0.6, 1);
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,170,60,.7)'); g.addColorStop(1, 'rgba(255,140,30,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  lampHalo = new THREE.Mesh(new THREE.PlaneGeometry(r * 5, r * 5), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  lampHalo.position.z = -0.002;
  lamp.add(lampHalo, ring, lampDome);
  const [lx, ly] = local(LAMP_CSS);
  lamp.position.set(lx, ly, FRONT + 0.003);
  root.add(lamp);
}
const setLamp = (on) => { lampDome.material = lampLens[on ? 'on' : 'off']; lampHalo.visible = on; };

const view = frame({ scene, root, facePanel: { g: root, w: W, z: FRONT }, eye: EYE, faceWidthPx: S.width });
const quadCss = (box, z) => { const [x, y, w, h] = local(box); return view.quad({ g: root, z: 0 }, x, y, w, h, z); };
const sizeCss = (box) => [(box[2] - box[0]) * K, (box[3] - box[1]) * K];
const grow = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
const meta = {
  width: view.IW, height: view.IH,
  face: quadCss(FACE_CSS, FRONT),
  zones: { content: { quad: quadCss(FACE_CSS, FRONT + 0.001), size: sizeCss(FACE_CSS) } },
  sprites: { lamp: { crop: view.cropAround(quadCss(grow(LAMP_CSS, 6), FRONT), 4), frames: ['lamp-on', 'lamp-off'] } },
  kScale: K, rows: ROWS, pitch: PITCH,
};
for (let i = 0; i < ROWS; i++) {
  const upZ = FRONT + KEY_UP + KEYCAP_H, downZ = FRONT + KEY_DOWN + KEYCAP_H;
  meta.zones[`hit${i}`] = { quad: quadCss(KEY(i), upZ), size: sizeCss(KEY(i)) };
  meta.zones[`icon${i}`] = { quad: quadCss(KEY(i), upZ + 0.001), size: sizeCss(KEY(i)) };
  meta.zones[`icon${i}Down`] = { quad: quadCss(KEY(i), downZ + 0.001), size: sizeCss(KEY(i)) };
  meta.sprites[`key${i}`] = { crop: view.cropAround(quadCss(grow(KEY(i), 2), FRONT), 8), frames: [`key${i}-up`, `key${i}-down`] };
}

installBake((scale) => {
  const files = {};
  setLamp(true); view.render(scale);
  files.housing = view.shot();
  files['lamp-on'] = view.crop(scale, meta.sprites.lamp.crop);
  setLamp(false); view.render(scale);
  files['lamp-off'] = view.crop(scale, meta.sprites.lamp.crop);
  setLamp(true); view.render(scale);
  keys.forEach((k, i) => {
    files[`key${i}-up`] = view.crop(scale, meta.sprites[`key${i}`].crop);
    k.position.z = FRONT + KEY_DOWN; view.render(scale);
    files[`key${i}-down`] = view.crop(scale, meta.sprites[`key${i}`].crop);
    k.position.z = FRONT + KEY_UP; view.render(scale);
  });
  return { files, meta };
});
