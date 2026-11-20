import { Plate, THREE, extrude, lit, ring, makeStage, frame } from './dashlib.js';
import { installBake } from '../core.js';

const K = 1;
const FACE = [77.3, 54, 1125.4, 658];
const BOX = [FACE[0], FACE[1], FACE[0] + FACE[2], FACE[1] + FACE[3]];
const KEY = { box: [1111.5, 80.5, 1178, 112], w: 1, border: '#777e81', fill: '#33383b', textBox: [1120.5, 87, 1165.7, 104] };
const WELLS = [[103.3, 136, 362.3, 686], [917.7, 136, 1176.7, 686]];
const GAUGES = [[115.3, 168, 350.3, 172], [115.3, 198, 350.3, 202]];
const CELLS = [];
for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) CELLS.push([633.7 + 42 * c, 174.1 + 42 * r, 675.7 + 42 * c, 216.1 + 42 * r]);
const GRID = [633.7, 174.1, 885.7, 258.1];
const BODY = '#2b2d31', WELL = '#1a1e20', GROOVE = '#33383b', CELL = '#303d44', CELL_EDGE = '#3b454b';
const KEY_UP = 0.032, KEY_DOWN = 0.012, WELL_D = 0.018, CELL_D = 0.01;

const P = new Plate(FACE[0], FACE[1], FACE[2], FACE[3], null, K);
const { scene, root } = makeStage({ span: Math.max(6, FACE[2] * K / 400 + 2, FACE[3] * K / 400 + 2) });
root.add(P.g);
const inset = (b, d) => [b[0] + d, b[1] + d, b[2] - d, b[3] - d];

const bodyShape = P.shape(BOX);
for (const b of [...WELLS, GRID]) bodyShape.holes.push(P.shape(b));
{ const body = extrude(bodyShape, { front: 0, depth: 0.05, caps: lit(BODY), sides: lit(WELL) }); body.castShadow = false; body.receiveShadow = false; P.g.add(body); }
const floor = (b, z, color) => { const r = P.rect(b); const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), lit(color, { side: THREE.DoubleSide })); m.position.set(r.cx, r.cy, z); m.receiveShadow = false; P.g.add(m); };
for (const b of WELLS) floor(b, -WELL_D, WELL);
for (const b of GAUGES) floor(b, -WELL_D + 0.0008, GROOVE);

const cellTop = 0;
for (const b of CELLS) {
  P.g.add(ring(P, b, inset(b, 1), { rOuter: [0, 0, 0, 0], rInner: [0, 0, 0, 0], front: cellTop + 0.002, depth: 0.002, color: CELL_EDGE, bevel: 0.0005 }));
  floor(inset(b, 1), cellTop - CELL_D, CELL);
}

let outer = BOX;
for (const [i, r] of [{ w: 2, color: '#838f94' }, { w: 4, color: '#3b474e' }].entries()) {
  const inner = inset(outer, r.w);
  P.g.add(ring(P, outer, inner, { rOuter: [0, 0, 0, 0], rInner: [0, 0, 0, 0], front: 0.004 + i * 0.002, depth: 0.004, color: r.color, bevel: 0.0005 }));
  outer = inner;
}

const keyGroup = new THREE.Group();
keyGroup.add(extrude(P.shape(KEY.box, [1.5, 1.5, 1.5, 1.5]), { front: KEY_UP, depth: 0.03, bevel: 0.003, bt: 0.003, caps: lit(KEY.border) }));
keyGroup.add(extrude(P.shape(inset(KEY.box, KEY.w), [1, 1, 1, 1]), { front: KEY_UP + 0.004, depth: 0.004, caps: lit(KEY.fill) }));
P.g.add(keyGroup);

const view = frame({ scene, root, facePanel: { g: P.g, w: P.len(FACE[2]), z: 0 }, eye: P.eye(), faceWidthPx: FACE[2] * K });
const zoneFor = (b, z = 0.01) => ({ quad: P.quad(view, b, z), size: P.size(b) });
const zones = {
  closeHit: zoneFor(KEY.box, KEY_UP + 0.008),
  closeText: zoneFor(KEY.textBox, KEY_UP + 0.01),
  closeTextDown: zoneFor(KEY.textBox, KEY_DOWN + 0.01),
  title: zoneFor([103.3, 81, 190.5, 110]),
  surface: zoneFor(BOX, 0.001),
  wells: zoneFor(BOX, -WELL_D + 0.001),
  cells: zoneFor(BOX, cellTop - CELL_D + 0.001),
  grooves: zoneFor(BOX, -WELL_D + 0.0012),
};
const sprites = { close: { crop: view.cropAround(P.quad(view, KEY.box, 0.02), 6), frames: ['close-up', 'close-down'] } };
const meta = { k: K, width: view.IW, height: view.IH, face: P.quad(view, BOX, 0), zones, sprites, origin: [BOX[0], BOX[1]] };

installBake((scale) => {
  const files = {};
  keyGroup.position.z = 0;
  view.render(scale);
  files.housing = view.shot();
  files['close-up'] = view.crop(scale, sprites.close.crop);
  keyGroup.position.z = KEY_DOWN - KEY_UP; view.render(scale);
  files['close-down'] = view.crop(scale, sprites.close.crop);
  keyGroup.position.z = 0;
  return { files, meta };
});
