import * as THREE from 'three';
import { PPU, plateSpace, makeStage, frame, installBake, vanishFor } from '../core.js';
import { OLIVE, mottle, slab, faceMaterial, brassLip, keycap, crossMark } from './olive.js';

const K = 3.2;
const CSS = K / PPU;
const FACE_CSS = [360, 112, 920, 188.8];
const S = plateSpace((FACE_CSS[2] - FACE_CSS[0]) * K, (FACE_CSS[3] - FACE_CSS[1]) * K);
const VP = vanishFor(FACE_CSS);
const EYE = { x: (VP.x - (FACE_CSS[0] + FACE_CSS[2]) / 2) * CSS, y: ((FACE_CSS[1] + FACE_CSS[3]) / 2 - VP.y) * CSS, z: 24 };
const local = ([x0, y0, x1, y1]) => [((x0 + x1) / 2 - (FACE_CSS[0] + FACE_CSS[2]) / 2) * CSS, ((FACE_CSS[1] + FACE_CSS[3]) / 2 - (y0 + y1) / 2) * CSS, (x1 - x0) * CSS, (y1 - y0) * CSS];
const KEY_CSS = [891, 117, 914.5, 140.5];
const SCREEN_CSS = [365, 146, 914.5, 183.5];
const BODY_D = 0.06, BEVEL = 1.1 * CSS, GAP = 0.8, KEYCAP_H = 3.5 * CSS;
const KEY_UP = -0.006, KEY_DOWN = -0.022;

const { scene, root } = makeStage();
const W = (FACE_CSS[2] - FACE_CSS[0]) * CSS, H = (FACE_CSS[3] - FACE_CSS[1]) * CSS;
const [kx, ky, kw, kh] = local(KEY_CSS);
const [sx, sy, sw, sh] = local(SCREEN_CSS);

const faceMat = faceMaterial(S.width, S.height, (c, w, h) => {
  c.fillStyle = OLIVE.housing; c.fillRect(0, 0, w, h);
  mottle(c, 0, 0, w, h, 21);
  const s0 = (SCREEN_CSS[0] - FACE_CSS[0]) * K, s1 = (SCREEN_CSS[1] - FACE_CSS[1]) * K, s2 = (SCREEN_CSS[2] - FACE_CSS[0]) * K, s3 = (SCREEN_CSS[3] - FACE_CSS[1]) * K;
  c.fillStyle = '#342013'; c.fillRect(s0, s1, s2 - s0, s3 - s1);
  const g = c.createLinearGradient(0, s1, 0, s1 + 20); g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(s0, s1, s2 - s0, 20);
  const l = c.createLinearGradient(s0, 0, s0 + 16, 0); l.addColorStop(0, 'rgba(0,0,0,.35)'); l.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = l; c.fillRect(s0, s1, 16, s3 - s1);
});
const panel = slab({ w: W, h: H, depth: BODY_D, bevel: BEVEL, holes: [[kx, ky, kw + 2 * GAP * CSS, kh + 2 * GAP * CSS, (4 + GAP) * CSS]], faceMat });
root.add(panel.mesh, panel.face, ...panel.floors);
const FRONT = BODY_D / 2;
brassLip((m, x, y) => { m.position.set(x, y, FRONT + 0.0075); root.add(m); }, sx, sy, sw, sh, 1.5 * CSS, 0.0075);

const key = new THREE.Group();
const cap = keycap(kw, kh, CSS, KEYCAP_H);
key.add(cap.group);
const mark = new THREE.Group();
crossMark(mark, Math.min(cap.topBox.x1 - cap.topBox.x0, cap.topBox.y1 - cap.topBox.y0) * 0.75, CSS, KEYCAP_H + 0.003);
mark.position.y = (cap.topBox.y0 + cap.topBox.y1) / 2;
key.add(mark);
key.position.set(kx, ky, FRONT + KEY_UP);
root.add(key);

const view = frame({ scene, root, facePanel: { g: root, w: W, z: FRONT }, eye: EYE, faceWidthPx: S.width });
const quadCss = (box, z) => { const [x, y, w, h] = local(box); return view.quad({ g: root, z: 0 }, x, y, w, h, z); };
const sizeCss = (box) => [(box[2] - box[0]) * K, (box[3] - box[1]) * K];
const TOP = FRONT + KEY_UP + KEYCAP_H;
const meta = {
  width: view.IW, height: view.IH,
  face: quadCss(FACE_CSS, FRONT),
  zones: { content: { quad: quadCss(FACE_CSS, FRONT + 0.001), size: sizeCss(FACE_CSS) }, hit: { quad: quadCss(KEY_CSS, TOP), size: sizeCss(KEY_CSS) } },
  sprites: { close: { crop: view.cropAround(quadCss([KEY_CSS[0] - 3, KEY_CSS[1] - 3, KEY_CSS[2] + 3, KEY_CSS[3] + 3], FRONT), 14), frames: ['close-up', 'close-down'] } },
  kScale: K,
};

installBake((scale) => {
  const files = {};
  key.position.z = FRONT + KEY_UP; view.render(scale);
  files.housing = view.shot();
  files['close-up'] = view.crop(scale, meta.sprites.close.crop);
  key.position.z = FRONT + KEY_DOWN; view.render(scale);
  files['close-down'] = view.crop(scale, meta.sprites.close.crop);
  key.position.z = FRONT + KEY_UP;
  return { files, meta };
});
