import * as THREE from 'three';
import { PPU, plateSpace, makeStage, frame, installBake } from '../core.js';
import { OLIVE, KEYCAP, mottle, slab, faceMaterial, keycap, litToon, brassLip, crossMark } from './olive.js';
import { Plate, extrude, lit, ring } from './dashlib.js';

const K = 3.2;
const CSS = K / PPU;
const CANVAS = [400, 170];
const BOXES = {
  frame: [10, 10, 130, 90],
  screen: [150, 10, 230, 50],
  slate: [250, 10, 370, 90],
  keycap: [10, 110, 43.5, 143.5],
  keycapLit: [60, 110, 93.5, 143.5],
  keycapRed: [110, 110, 143.5, 143.5],
  close: [160, 110, 183.5, 133.5],
  slateKey: [200, 110, 266.5, 141.5],
  lamp: [290, 115, 297, 122],
  tape: [310, 110, 343, 125],
  rocker: [354, 100, 382, 142],
};
const KEYCAPS = { keycap: KEYCAP, keycapLit: { skirt: '#7a4a20', shoulder: '#b27a3a', top: '#94602a' }, keycapRed: { skirt: '#6a1a10', shoulder: '#a8321e', top: '#862414' } };
const KEY_UP = -0.006, KEY_DOWN = -0.022, KEYCAP_H = 3.5 * CSS;
const TOGGLE = { scale: 1.4, ring: 0.7, lever: 1.3, base: '#9a9a92', hole: '#2a2017' };
const SLATE = { body: '#2b2d31', rings: [{ w: 2, color: '#838f94' }, { w: 4, color: '#3b474e' }], keyBorder: '#777e81', keyFill: '#33383b' };

const S = plateSpace(CANVAS[0] * K, CANVAS[1] * K);
const local = ([x0, y0, x1, y1]) => [((x0 + x1) / 2 - CANVAS[0] / 2) * CSS, (CANVAS[1] / 2 - (y0 + y1) / 2) * CSS, (x1 - x0) * CSS, (y1 - y0) * CSS];
const { scene, root } = makeStage();
const groups = {};
const place = (name, g, z = 0) => { const [x, y] = local(BOXES[name]); g.position.set(x, y, z); root.add(g); groups[name] = g; return g; };

function oliveFrame() {
  const [, , w, h] = local(BOXES.frame);
  const faceMat = faceMaterial(w / CSS * K, h / CSS * K, (c, cw, ch) => { c.fillStyle = OLIVE.housing; c.fillRect(0, 0, cw, ch); mottle(c, 0, 0, cw, ch, 41); });
  const panel = slab({ w, h, depth: 0.06, bevel: 1.1 * CSS, faceMat });
  const g = new THREE.Group(); g.add(panel.mesh, panel.face);
  return place('frame', g);
}

function screenWell() {
  const [, , w, h] = local(BOXES.screen);
  const g = new THREE.Group();
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, h), litToon('#342013'));
  fill.receiveShadow = true; g.add(fill);
  brassLip((m, x, y) => { m.position.set(x, y, 0.0075); g.add(m); }, 0, 0, w - 3 * CSS, h - 3 * CSS, 1.5 * CSS, 0.0075);
  return place('screen', g);
}

function slateFrame() {
  const P = new Plate(0, 0, CANVAS[0], CANVAS[1], null, K);
  const box = BOXES.slate;
  P.g.add(extrude(P.shape(box), { front: 0, depth: 0.05, caps: lit(SLATE.body) }));
  let outer = box;
  SLATE.rings.forEach((r, i) => {
    const inner = [outer[0] + r.w, outer[1] + r.w, outer[2] - r.w, outer[3] - r.w];
    P.g.add(ring(P, outer, inner, { rOuter: [0, 0, 0, 0], rInner: [0, 0, 0, 0], front: 0.004 + i * 0.002, depth: 0.004, color: r.color, bevel: 0.0005 }));
    outer = inner;
  });
  root.add(P.g);
  groups.slate = P.g;
  const key = new THREE.Group();
  const kb = BOXES.slateKey;
  key.add(extrude(P.shape(kb, [1.5, 1.5, 1.5, 1.5]), { front: 0.032, depth: 0.03, bevel: 0.003, bt: 0.003, caps: lit(SLATE.keyBorder) }));
  key.add(extrude(P.shape([kb[0] + 1, kb[1] + 1, kb[2] - 1, kb[3] - 1], [1, 1, 1, 1]), { front: 0.036, depth: 0.004, caps: lit(SLATE.keyFill) }));
  P.g.add(key);
  groups.slateKey = key;
}

function cap(name, colors, mark = false) {
  const [, , w, h] = local(BOXES[name]);
  const g = new THREE.Group();
  const built = keycap(w, h, CSS, KEYCAP_H, colors);
  g.add(built.group);
  if (mark) {
    const m = new THREE.Group();
    crossMark(m, Math.min(built.topBox.x1 - built.topBox.x0, built.topBox.y1 - built.topBox.y0) * 0.75, CSS, KEYCAP_H + 0.003);
    m.position.y = (built.topBox.y0 + built.topBox.y1) / 2;
    g.add(m);
  }
  return place(name, g, KEY_UP);
}

function lampHousing() {
  const r = 2.6 * CSS, g = new THREE.Group();
  const brass = new THREE.Mesh(new THREE.TorusGeometry(r, 0.7 * CSS, 10, 32), litToon(OLIVE.brass));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), litToon('#4a2c0a'));
  dome.rotation.x = Math.PI / 2; dome.scale.set(1, 0.6, 1);
  g.add(brass, dome);
  return place('lamp', g);
}

function tapeStrip() {
  const [, , w, h] = local(BOXES.tape);
  const shape = new THREE.Shape();
  const jag = 0.6 * CSS;
  shape.moveTo(-w / 2, -h / 2); shape.lineTo(w / 2 - jag, -h / 2); shape.lineTo(w / 2, -h / 4); shape.lineTo(w / 2 - jag, 0); shape.lineTo(w / 2, h / 4); shape.lineTo(w / 2 - jag, h / 2);
  shape.lineTo(-w / 2 + jag, h / 2); shape.lineTo(-w / 2, h / 4); shape.lineTo(-w / 2 + jag, 0); shape.lineTo(-w / 2, -h / 4); shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.002, bevelEnabled: false }), litToon('#d9c9a0'));
  mesh.castShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  return place('tape', g);
}

function toggle() {
  const g = new THREE.Group(), brass = litToon(OLIVE.brass);
  const base = new THREE.Mesh(new THREE.TorusGeometry(3.6 * CSS, 1 * CSS, 10, 32), litToon(TOGGLE.base));
  const hole = new THREE.Mesh(new THREE.CircleGeometry(2.6 * CSS, 24), new THREE.MeshBasicMaterial({ color: TOGGLE.hole }));
  hole.position.z = 0.001;
  const lever = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(1 * CSS, 1.3 * CSS, 9 * CSS, 16), brass);
  stem.position.y = 4.5 * CSS;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1.5 * CSS, 16, 10), brass);
  tip.position.y = 9 * CSS;
  lever.add(stem, tip);
  for (const m of [base, stem, tip]) m.castShadow = true;
  base.scale.setScalar(TOGGLE.ring);
  hole.scale.setScalar(TOGGLE.ring);
  lever.scale.set(1, TOGGLE.lever, 1);
  g.add(base, hole, lever);
  g.scale.setScalar(TOGGLE.scale);
  groups.lever = lever;
  return place('rocker', g);
}

oliveFrame();
screenWell();
slateFrame();
for (const [name, colors] of Object.entries(KEYCAPS)) cap(name, colors);
cap('close', KEYCAP, true);
lampHousing();
tapeStrip();
toggle();

const view = frame({ scene, root, facePanel: { g: root, w: CANVAS[0] * CSS, z: 0 }, eye: { x: 0, y: 0, z: 24 }, faceWidthPx: S.width });
const quadOf = (box, z = 0) => { const [x, y, w, h] = local(box); return view.quad({ g: root, z: 0 }, x, y, w, h, z); };
const tight = (box, grow = 0) => view.cropAround(quadOf(box), grow);
const SHADOW = 3;
const KEYS = ['keycap', 'keycapLit', 'keycapRed', 'close', 'slateKey'];
const sprites = {
  frame: { crop: tight(BOXES.frame, SHADOW), frames: ['frame'] },
  screen: { crop: tight(BOXES.screen), frames: ['screen'] },
  slate: { crop: tight(BOXES.slate, SHADOW), frames: ['slate'] },
  lamp: { crop: tight(BOXES.lamp, 1), frames: ['lamp'] },
  tape: { crop: tight(BOXES.tape, 1), frames: ['tape'] },
  rocker: { crop: tight(BOXES.rocker, 1), frames: ['rocker-off', 'rocker-on'] },
  ...Object.fromEntries(KEYS.map((name) => [name, { crop: tight(BOXES[name]), frames: [`${name}-up`, `${name}-down`] }])),
};
const zones = Object.fromEntries(Object.entries(BOXES).map(([name, box]) => [name, { quad: quadOf(box), size: [(box[2] - box[0]) * K, (box[3] - box[1]) * K] }]));
const meta = { width: view.IW, height: view.IH, face: quadOf([0, 0, CANVAS[0], CANVAS[1]]), zones, sprites, kScale: K };

const LEVER = { off: -0.5, on: 0.5 };
const keyZ = (name, z) => { groups[name].position.z = name === 'slateKey' ? z - KEY_UP : z; };

function pose(down) {
  for (const name of KEYS) keyZ(name, down ? KEY_DOWN : KEY_UP);
  groups.lever.rotation.x = down ? LEVER.on : LEVER.off;
}

installBake((scale) => {
  const files = {};
  const shoot = (name, file) => { files[file] = view.crop(scale, sprites[name].crop); };
  pose(false);
  view.render(scale);
  files.housing = view.shot();
  for (const name of ['frame', 'screen', 'slate', 'lamp', 'tape']) shoot(name, name);
  shoot('rocker', 'rocker-off');
  for (const name of KEYS) shoot(name, `${name}-up`);
  pose(true);
  view.render(scale);
  shoot('rocker', 'rocker-on');
  for (const name of KEYS) shoot(name, `${name}-down`);
  pose(false);
  return { files, meta };
});
