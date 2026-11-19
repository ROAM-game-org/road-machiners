import * as THREE from 'three';
import { PPU, plateSpace, makeStage, frame, installBake } from '../core.js';
import { OLIVE, KEYCAP, mottle, slab, faceMaterial, keycap, litToon, brassLip, crossMark } from './olive.js';
import { grain, wear, stitch, roundPath } from './dashlib.js';

const K = 3.2;
const CSS = K / PPU;
const CANVAS = [400, 260];
const BOXES = {
  frame: [10, 10, 130, 90],
  screen: [150, 10, 230, 50],
  slate: [250, 10, 370, 90],
  slateLeather: [10, 160, 130, 240],
  input: [150, 160, 230, 190],
  keycap: [10, 110, 43.5, 143.5],
  keycapLit: [60, 110, 93.5, 143.5],
  keycapRed: [110, 110, 143.5, 143.5],
  close: [160, 110, 183.5, 133.5],
  lamp: [290, 115, 297, 122],
  tape: [310, 110, 343, 125],
  note: [250, 160, 370, 240],
  rocker: [354, 100, 382, 142],
};
const KEYCAPS = { keycap: KEYCAP, keycapLit: { skirt: '#7a4a20', shoulder: '#b27a3a', top: '#94602a' }, keycapRed: { skirt: '#6a1a10', shoulder: '#a8321e', top: '#862414' } };
const KEY_UP = -0.006, KEY_DOWN = -0.022, KEYCAP_H = 3.5 * CSS;
const TOGGLE = { scale: 1.4, ring: 0.7, lever: 1.3, base: '#9a9a92', hole: '#2a2017' };
const HOUSING = { band: 9, lip: 1.5, depth: 0.06, sink: 0.012, floor: '#342013', leather: '#643015', leatherSide: '#7d4423' };
const INPUT = { band: 2, depth: 0.02, face: '#342013', floor: '#24160b' };
const NOTE = { paper: '#ffffff', tape: '#d9c9a0', step: 6, wobble: 0.5, tapeLength: 14, tapeWidth: 5.5, tapeInset: 2.8, shadows: [[0.4, 0.6, 0.14], [0.8, 1.2, 0.07]], reach: { side: 14, below: 6 } };

const S = plateSpace(CANVAS[0] * K, CANVAS[1] * K);
const local = ([x0, y0, x1, y1]) => [((x0 + x1) / 2 - CANVAS[0] / 2) * CSS, (CANVAS[1] / 2 - (y0 + y1) / 2) * CSS, (x1 - x0) * CSS, (y1 - y0) * CSS];
const { scene, root } = makeStage();
const groups = {};
const place = (name, g, z = 0) => { const [x, y] = local(BOXES[name]); g.position.set(x, y, z); root.add(g); groups[name] = g; return g; };

function oliveFrame() {
  const [, , w, h] = local(BOXES.frame);
  const faceMat = faceMaterial(w / CSS * K, h / CSS * K, (c, cw, ch) => { c.fillStyle = OLIVE.housing; c.fillRect(0, 0, cw, ch); });
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

function housingFace(w, h, paintBody) {
  return faceMaterial(w / CSS * K, h / CSS * K, (c, cw, ch) => paintBody(c, cw, ch));
}

function oliveBody(c, cw, ch) {
  c.fillStyle = OLIVE.housing; c.fillRect(0, 0, cw, ch);
  mottle(c, 0, 0, cw, ch, 53, { strength: 0.5 });
}

function leatherBody(c, cw, ch) {
  const box = [0, 0, cw, ch], mid = HOUSING.band * K / 2;
  c.fillStyle = HOUSING.leather; c.fillRect(0, 0, cw, ch);
  grain(c, box, 11, 4);
  wear(c, box, 19, { stains: 2, creases: 10, rubs: 2 });
  stitch(c, (cc) => roundPath(cc, mid, mid, cw - mid, ch - mid, [mid, mid, mid, mid]), { alpha: 0.55, width: K * 0.4, dash: K * 2, gap: K * 1.2 });
}

function housing(name, paintBody, sideColor) {
  const [, , w, h] = local(BOXES[name]);
  const band = HOUSING.band * CSS, holeW = w - 2 * band, holeH = h - 2 * band;
  const built = slab({ w, h, depth: HOUSING.depth, bevel: 1.1 * CSS, holes: [[0, 0, holeW, holeH, 1.5 * CSS]], faceMat: housingFace(w, h, paintBody) });
  if (sideColor) built.mesh.material = [litToon(sideColor), litToon(sideColor)];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(holeW, holeH), litToon(HOUSING.floor));
  floor.position.z = HOUSING.depth / 2 - HOUSING.sink; floor.receiveShadow = true;
  const g = new THREE.Group(); g.add(built.mesh, built.face, floor);
  brassLip((m, x, y) => { m.position.set(x, y, HOUSING.depth / 2); g.add(m); }, 0, 0, holeW, holeH, HOUSING.lip * CSS, 0.006);
  return place(name, g);
}

function inputWell() {
  const [, , w, h] = local(BOXES.input);
  const band = INPUT.band * CSS;
  const built = slab({ w, h, depth: INPUT.depth, bevel: 0.6 * CSS, holes: [[0, 0, w - 2 * band, h - 2 * band, 1 * CSS]], faceMat: housingFace(w, h, (c, cw, ch) => { c.fillStyle = INPUT.face; c.fillRect(0, 0, cw, ch); }) });
  built.mesh.material = [litToon(INPUT.face), litToon(INPUT.face)];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * band, h - 2 * band), litToon(INPUT.floor));
  floor.position.z = -INPUT.depth / 2 + 0.002; floor.receiveShadow = true;
  const g = new THREE.Group(); g.add(built.mesh, built.face, floor);
  return place('input', g);
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

function tapeShape(w, h) {
  const shape = new THREE.Shape();
  const jag = 0.6 * CSS;
  shape.moveTo(-w / 2, -h / 2); shape.lineTo(w / 2 - jag, -h / 2); shape.lineTo(w / 2, -h / 4); shape.lineTo(w / 2 - jag, 0); shape.lineTo(w / 2, h / 4); shape.lineTo(w / 2 - jag, h / 2);
  shape.lineTo(-w / 2 + jag, h / 2); shape.lineTo(-w / 2, h / 4); shape.lineTo(-w / 2 + jag, 0); shape.lineTo(-w / 2, -h / 4); shape.closePath();
  return shape;
}

function tapeStrip() {
  const [, , w, h] = local(BOXES.tape);
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(tapeShape(w, h), { depth: 0.002, bevelEnabled: false }), litToon(NOTE.tape));
  mesh.castShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  return place('tape', g);
}

const wobbleAt = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return (s - Math.floor(s)) * NOTE.wobble * CSS; };

function paperEdge([from, to, inward], side) {
  const count = Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / (NOTE.step * CSS));
  return Array.from({ length: count }, (_, i) => {
    const t = i / count, push = i === 0 ? 0 : wobbleAt(side * 100 + i);
    return new THREE.Vector2(from[0] + (to[0] - from[0]) * t + inward[0] * push, from[1] + (to[1] - from[1]) * t + inward[1] * push);
  });
}

function paperShape(w, h) {
  const x = w / 2, y = h / 2;
  const sides = [[[-x, y], [x, y], [0, -1]], [[x, y], [x, -y], [-1, 0]], [[x, -y], [-x, -y], [0, 1]], [[-x, -y], [-x, y], [1, 0]]];
  return new THREE.Shape(sides.flatMap(paperEdge));
}

function paperLayer(shape, color, z, opacity) {
  const material = opacity === undefined ? litToon(color) : new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.position.z = z;
  return mesh;
}

function cornerTape(side, w, h) {
  const length = NOTE.tapeLength * CSS, width = NOTE.tapeWidth * CSS, inset = NOTE.tapeInset * CSS;
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(tapeShape(length, width), { depth: 0.002, bevelEnabled: false }), litToon(NOTE.tape));
  mesh.position.set(side * (w / 2 - inset), h / 2 - inset, 0.004);
  mesh.rotation.z = -side * Math.PI / 4;
  mesh.castShadow = true;
  return mesh;
}

function noteSheet() {
  const [, , w, h] = local(BOXES.note);
  const shape = paperShape(w, h);
  const g = new THREE.Group();
  NOTE.shadows.forEach(([dx, dy, opacity], i) => {
    const shadow = paperLayer(shape, '#000000', -0.002 - i * 0.001, opacity);
    shadow.position.x = dx * CSS; shadow.position.y = -dy * CSS;
    g.add(shadow);
  });
  const paper = paperLayer(shape, NOTE.paper, 0);
  paper.receiveShadow = true;
  g.add(paper, cornerTape(-1, w, h), cornerTape(1, w, h));
  return place('note', g);
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
housing('slate', oliveBody);
housing('slateLeather', leatherBody, HOUSING.leatherSide);
inputWell();
for (const [name, colors] of Object.entries(KEYCAPS)) cap(name, colors);
cap('close', KEYCAP, true);
lampHousing();
tapeStrip();
noteSheet();
toggle();

const view = frame({ scene, root, facePanel: { g: root, w: CANVAS[0] * CSS, z: 0 }, eye: { x: 0, y: 0, z: 24 }, faceWidthPx: S.width });
const quadOf = (box, z = 0) => { const [x, y, w, h] = local(box); return view.quad({ g: root, z: 0 }, x, y, w, h, z); };
const tight = (box, grow = 0) => view.cropAround(quadOf(box), grow);
const SHADOW = 3;
const noteCrop = () => { const [x0, y0, x1, y1] = tight(BOXES.note); return [x0 - NOTE.reach.side, y0 - NOTE.reach.side, x1 + NOTE.reach.side, y1 + NOTE.reach.below]; };
const KEYS = ['keycap', 'keycapLit', 'keycapRed', 'close'];
const sprites = {
  frame: { crop: tight(BOXES.frame, SHADOW), frames: ['frame'] },
  screen: { crop: tight(BOXES.screen), frames: ['screen'] },
  slate: { crop: tight(BOXES.slate, SHADOW), frames: ['slate'] },
  slateLeather: { crop: tight(BOXES.slateLeather, SHADOW), frames: ['slateLeather'] },
  input: { crop: tight(BOXES.input), frames: ['input'] },
  lamp: { crop: tight(BOXES.lamp, 1), frames: ['lamp'] },
  tape: { crop: tight(BOXES.tape, 1), frames: ['tape'] },
  note: { crop: noteCrop(), frames: ['note'] },
  rocker: { crop: tight(BOXES.rocker, 1), frames: ['rocker-off', 'rocker-on'] },
  ...Object.fromEntries(KEYS.map((name) => [name, { crop: tight(BOXES[name]), frames: [`${name}-up`, `${name}-down`] }])),
};
const zones = Object.fromEntries(Object.entries(BOXES).map(([name, box]) => [name, { quad: quadOf(box), size: [(box[2] - box[0]) * K, (box[3] - box[1]) * K] }]));
const meta = { width: view.IW, height: view.IH, face: quadOf([0, 0, CANVAS[0], CANVAS[1]]), zones, sprites, kScale: K };

const LEVER = { off: -0.5, on: 0.5 };
const keyZ = (name, z) => { groups[name].position.z = z; };

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
  for (const name of ['frame', 'screen', 'slate', 'slateLeather', 'input', 'lamp', 'tape', 'note']) shoot(name, name);
  shoot('rocker', 'rocker-off');
  for (const name of KEYS) shoot(name, `${name}-up`);
  pose(true);
  view.render(scale);
  shoot('rocker', 'rocker-on');
  for (const name of KEYS) shoot(name, `${name}-down`);
  pose(false);
  return { files, meta };
});
