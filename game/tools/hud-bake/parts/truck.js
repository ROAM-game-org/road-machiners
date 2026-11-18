import * as THREE from 'three';
import { PPU, plateSpace, makeStage, frame, installBake } from '../core.js';

const K = 3.2;
const CARD_CSS = [14, 303.3, 158.5, 558.1];
const STAGE_CSS = [26, 315.3, 146.5, 546.1];
const VP = { x: 640, y: -360 };
const D = 0.04;
const S = plateSpace((CARD_CSS[2] - CARD_CSS[0]) * K, (CARD_CSS[3] - CARD_CSS[1]) * K);
const toPlate = ([x0, y0, x1, y1]) => [(x0 - CARD_CSS[0]) * K, (y0 - CARD_CSS[1]) * K, (x1 - CARD_CSS[0]) * K, (y1 - CARD_CSS[1]) * K];
const EYE = { x: (VP.x - (CARD_CSS[0] + CARD_CSS[2]) / 2) * K / PPU, y: ((CARD_CSS[1] + CARD_CSS[3]) / 2 - VP.y) * K / PPU, z: 24 };

const { scene, root } = makeStage();

const w = S.width / PPU, h = S.height / PPU;
const card = new THREE.Group();
card.w = w; card.h = h; card.z = D / 2; card.g = card;
const slab = new THREE.Mesh(
  new THREE.BoxGeometry(w, h, D),
  new THREE.MeshToonMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false }),
);
card.add(slab);
root.add(card);

const view = frame({ scene, root, facePanel: card, eye: EYE, faceWidthPx: S.width });
const zone = (b) => {
  const [x0, y0, x1, y1] = toPlate(b);
  const [cx, cy] = S.centerOf([x0, y0, x1, y1]);
  return { quad: view.quad(card, cx, cy, (x1 - x0) / PPU, (y1 - y0) / PPU, 0), size: [x1 - x0, y1 - y0].map((v) => Math.round(v * 100) / 100) };
};
const meta = {
  width: view.IW, height: view.IH,
  face: view.quad(card, 0, 0, w, h, 0),
  zones: { picture: zone(STAGE_CSS) },
  sprites: {},
  kScale: K, stageCss: STAGE_CSS,
};

installBake((scale) => {
  view.render(scale);
  return { files: { housing: view.shot() }, meta };
});
