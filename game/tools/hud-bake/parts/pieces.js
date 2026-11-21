import * as THREE from 'three';
import { PPU, plateSpace, makeStage, frame, installBake } from '../core.js';
import { OLIVE, KEYCAP, mottle, mottleTile, slab, faceMaterial, keycap, litToon, brassLip, crossMark } from './olive.js';
import { grain, wear, stitch, roundPath } from './dashlib.js';
import { box, cyl } from '../kit.js';
import { buildToggle } from './toggle.js';

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
  rocker: [360, 105, 376, 137],
  knob: [200, 108, 232, 140],
  knobPointer: [240, 108, 272, 140],
};
const KEYCAPS = { keycap: KEYCAP, keycapLit: { skirt: '#7a4a20', shoulder: '#b27a3a', top: '#94602a' }, keycapRed: { skirt: '#6a1a10', shoulder: '#a8321e', top: '#862414' } };
const KEY_UP = -0.006, KEY_DOWN = -0.022, KEYCAP_H = 3.5 * CSS;
const KIT_TOGGLE_SCALE = 1;
const TOGGLE_EYE = { x: 0, y: 0, z: 24 };
const HOUSING = { band: 9, lip: 1.5, depth: 0.06, sink: 0.012, floor: '#342013', leather: '#643015', leatherSide: '#7d4423' };
const KNOB = { r: 0.13, top: 0.118, depth: 0.07, body: '#4a4a4c', pointer: '#f1ead6', socket: 0.16, socketDepth: 0.012, socketColor: '#232323' };
const INPUT = { band: 2, depth: 0.02, face: '#342013', floor: '#24160b' };

const S = plateSpace(CANVAS[0] * K, CANVAS[1] * K);
const local = ([x0, y0, x1, y1]) => [((x0 + x1) / 2 - CANVAS[0] / 2) * CSS, (CANVAS[1] / 2 - (y0 + y1) / 2) * CSS, (x1 - x0) * CSS, (y1 - y0) * CSS];
const { scene, root } = makeStage();
const groups = {};
const place = (name, g, z = 0) => { const [x, y] = local(BOXES[name]); g.position.set(x, y, z); root.add(g); groups[name] = g; return g; };

const RES = 4;

function drawnPlane(name, paint) {
  const [, , w, h] = local(BOXES[name]);
  const wu = w / CSS, hu = h / CSS, px = K * RES;
  const cv = document.createElement('canvas'); cv.width = Math.round(wu * px); cv.height = Math.round(hu * px);
  const c = cv.getContext('2d');
  c.scale(px, px);
  paint(c, wu, hu, px);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
  return place(name, g);
}

const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };

const FRAME = { ink: '#2b2014', light: '#b3a17a', shade: '#5f4f36', radius: 2, inkW: 0.35, bevelW: 1.1, slice: 2.2, seed: 41, marks: 1 };

function bevelRing(c, wu, hu, { inset, width, radius, light, shade }) {
  c.save();
  rr(c, inset, inset, wu - 2 * inset, hu - 2 * inset, radius); c.clip();
  c.fillStyle = shade; c.fillRect(0, 0, wu, hu);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(wu, 0); c.lineTo(wu - inset - width, inset + width); c.lineTo(inset + width, hu - inset - width); c.lineTo(0, hu); c.closePath();
  c.fillStyle = light; c.fill();
  c.restore();
}

function oliveFrame() {
  return drawnPlane('frame', (c, wu, hu, px) => {
    rr(c, 0, 0, wu, hu, FRAME.radius); c.fillStyle = FRAME.ink; c.fill();
    bevelRing(c, wu, hu, { inset: FRAME.inkW, width: FRAME.bevelW - FRAME.inkW, radius: FRAME.radius - FRAME.inkW, light: FRAME.light, shade: FRAME.shade });
    const faceR = FRAME.radius - FRAME.bevelW;
    rr(c, FRAME.bevelW, FRAME.bevelW, wu - 2 * FRAME.bevelW, hu - 2 * FRAME.bevelW, faceR);
    c.fillStyle = OLIVE.housing; c.fill();
    c.save(); c.clip();
    const tile = mottleTile((wu - 2 * FRAME.slice) * K, (hu - 2 * FRAME.slice) * K, RES, FRAME.seed, FRAME.marks);
    const pattern = c.createPattern(tile, 'repeat');
    pattern.setTransform(new DOMMatrix().translateSelf(FRAME.slice * px, FRAME.slice * px));
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = pattern; c.fillRect(0, 0, wu * px, hu * px);
    c.restore();
  });
}

const SCREEN = { brass: '#a38052', brassLight: '#c7a36c', brassShade: '#7a5c34', glass: '#322014', radius: 4, brassW: 3.2 };

function screenWell() {
  return drawnPlane('screen', (c, wu, hu) => {
    bevelRing(c, wu, hu, { inset: 0, width: 0.8, radius: SCREEN.radius, light: SCREEN.brassLight, shade: SCREEN.brassShade });
    rr(c, 0.8, 0.8, wu - 1.6, hu - 1.6, SCREEN.radius - 0.8); c.fillStyle = SCREEN.brass; c.fill();
    rr(c, SCREEN.brassW, SCREEN.brassW, wu - 2 * SCREEN.brassW, hu - 2 * SCREEN.brassW, 1.5); c.fillStyle = SCREEN.glass; c.fill();
  });
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

const TAPE = { paper: '#ddcda3', edge: 'rgba(70,48,24,0.55)', fibre: ['rgba(255,248,225,0.35)', 'rgba(120,96,60,0.22)'], jag: 0.6, fibres: 260, seed: 7 };

function tapePath(c, wu, hu) {
  const j = TAPE.jag;
  c.beginPath();
  c.moveTo(j, 0); c.lineTo(wu - j, 0); c.lineTo(wu, hu / 4); c.lineTo(wu - j, hu / 2); c.lineTo(wu, hu * 3 / 4); c.lineTo(wu - j, hu);
  c.lineTo(j, hu); c.lineTo(0, hu * 3 / 4); c.lineTo(j, hu / 2); c.lineTo(0, hu / 4); c.closePath();
}

function tapeStrip() {
  return drawnPlane('tape', (c, wu, hu) => {
    tapePath(c, wu, hu); c.fillStyle = TAPE.paper; c.fill();
    c.save(); c.clip();
    let a = TAPE.seed;
    const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    for (let i = 0; i < TAPE.fibres; i++) {
      const x = rnd() * wu, y = rnd() * hu, len = 0.3 + rnd() * 1.2, ang = (rnd() - 0.5) * 0.6;
      c.strokeStyle = TAPE.fibre[i % 2]; c.lineWidth = 0.08;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); c.stroke();
    }
    c.restore();
    tapePath(c, wu, hu); c.strokeStyle = TAPE.edge; c.lineWidth = 0.25; c.stroke();
  });
}

let kitToggle;
function toggle() {
  const g = new THREE.Group();
  const [x, y] = local(BOXES.rocker);
  const at = new THREE.Vector3(0, 0, 0);
  const eye = { x: TOGGLE_EYE.x - x, y: TOGGLE_EYE.y - y, z: TOGGLE_EYE.z };
  kitToggle = buildToggle({ len: (v) => v * CSS, at, eye, scale: KIT_TOGGLE_SCALE });
  g.add(...kitToggle.parts);
  return place('rocker', g);
}

function knobCap() {
  const g = new THREE.Group();
  const socket = cyl(KNOB.socket, KNOB.socketDepth, KNOB.socketColor, { noInk: true }); socket.position.z = KNOB.socketDepth / 2; g.add(socket);
  const body = cyl(KNOB.r, KNOB.depth, KNOB.body, { r2: KNOB.top, noInk: true }); body.position.z = KNOB.depth / 2; g.add(body);
  return place('knob', g);
}

function knobPointer() {
  const g = new THREE.Group();
  const mark = box(0.03, 0.08, 0.02, KNOB.pointer, 0.006, { noInk: true }); mark.position.set(0, 0.07, KNOB.depth + 0.01); g.add(mark);
  return place('knobPointer', g);
}

oliveFrame();
screenWell();
knobCap();
knobPointer();
housing('slate', oliveBody);
housing('slateLeather', leatherBody, HOUSING.leatherSide);
inputWell();
for (const [name, colors] of Object.entries(KEYCAPS)) cap(name, colors);
cap('close', KEYCAP, true);
lampHousing();
tapeStrip();
toggle();

const view = frame({ scene, root, facePanel: { g: root, w: CANVAS[0] * CSS, z: 0 }, eye: TOGGLE_EYE, faceWidthPx: S.width });
const quadOf = (box, z = 0) => { const [x, y, w, h] = local(box); return view.quad({ g: root, z: 0 }, x, y, w, h, z); };
const tight = (box, grow = 0) => view.cropAround(quadOf(box), grow);
const SHADOW = 3;
const ROCKER_CROP_PX = [52, 104];
const LAMP_CROP_PX = [26, 26];
const centered = (box, [w, h]) => {
  const pts = quadOf(box), cx = pts.reduce((a, p) => a + p[0], 0) / 4, cy = pts.reduce((a, p) => a + p[1], 0) / 4;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  return [x0, y0, x0 + w, y0 + h];
};
const KEYS = ['keycap', 'keycapLit', 'keycapRed', 'close'];
const sprites = {
  frame: { crop: tight(BOXES.frame), frames: ['frame'] },
  screen: { crop: tight(BOXES.screen), frames: ['screen'] },
  slate: { crop: tight(BOXES.slate, SHADOW), frames: ['slate'] },
  slateLeather: { crop: tight(BOXES.slateLeather, SHADOW), frames: ['slateLeather'] },
  input: { crop: tight(BOXES.input), frames: ['input'] },
  lamp: { crop: centered(BOXES.lamp, LAMP_CROP_PX), frames: ['lamp'] },
  tape: { crop: tight(BOXES.tape), frames: ['tape'] },
  rocker: { crop: centered(BOXES.rocker, ROCKER_CROP_PX), frames: ['rocker-off', 'rocker-on'] },
  knob: { crop: tight(BOXES.knob), frames: ['knob'] },
  knobPointer: { crop: tight(BOXES.knobPointer), frames: ['knobPointer'] },
  ...Object.fromEntries(KEYS.map((name) => [name, { crop: tight(BOXES[name]), frames: [`${name}-up`, `${name}-down`] }])),
};
const zones = Object.fromEntries(Object.entries(BOXES).map(([name, box]) => [name, { quad: quadOf(box), size: [(box[2] - box[0]) * K, (box[3] - box[1]) * K] }]));
const meta = { width: view.IW, height: view.IH, face: quadOf([0, 0, CANVAS[0], CANVAS[1]]), zones, sprites, kScale: K };

const MIN_MARGIN = 0.5;
function fitsCrop(file, scale) {
  const cv = view.cropCanvas(scale, sprites.rocker.crop), { width, height } = cv;
  const px = cv.getContext('2d').getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (px[(y * width + x) * 4 + 3] < 8) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const room = MIN_MARGIN * scale;
  if (x0 < room || y0 < room || width - 1 - x1 < room || height - 1 - y1 < room) throw new Error(`${file} at ${scale}x touches its crop: alpha box ${x0},${y0} to ${x1},${y1} in ${width}x${height}. Lower KIT_TOGGLE_SCALE.`);
}
const keyZ = (name, z) => { groups[name].position.z = z; };

function pose(down) {
  for (const name of KEYS) keyZ(name, down ? KEY_DOWN : KEY_UP);
  kitToggle.set(down);
}

installBake((scale) => {
  const files = {};
  const shoot = (name, file) => { files[file] = view.crop(scale, sprites[name].crop); };
  pose(false);
  view.render(scale);
  files.housing = view.shot();
  for (const name of ['frame', 'screen', 'slate', 'slateLeather', 'input', 'lamp', 'tape', 'knob', 'knobPointer']) shoot(name, name);
  shoot('rocker', 'rocker-off'); fitsCrop('rocker-off', scale);
  for (const name of KEYS) shoot(name, `${name}-up`);
  pose(true);
  view.render(scale);
  shoot('rocker', 'rocker-on'); fitsCrop('rocker-on', scale);
  for (const name of KEYS) shoot(name, `${name}-down`);
  pose(false);
  return { files, meta };
});
