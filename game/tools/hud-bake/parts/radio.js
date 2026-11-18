import * as THREE from 'three';
import { Panel, box, cyl, shade, toon } from '../kit.js';
import { keycap } from './olive.js';
import { PPU, plateSpace, makeStage, frame, finishPanels, installBake, eyeFor } from '../core.js';

const S = plateSpace(1279, 695);
const BOX = {
  talk: [20, 18, 1028, 205],
  log: [21, 222, 956, 521],
  wheel: [970, 221, 1030, 525],
  lcd: [122, 587, 571, 665],
  knob: [722, 589, 798, 665],
  knobMarks: [620, 563, 900, 691],
  play: [962, 581, 1104, 673],
};
const LOOK = { housing: '#b39d79', strip: '#55565a', brass: '#b59a62', brassDark: '#6e5a36', screenLip: '#20150b' };
const KNOB_ANGLES = [-120, -40, 40, 120];
const WHEEL_RIBS = 44, WHEEL_FRAMES = 6, WHEEL_R = 1.0;
const KEY_UP = 0.004, KEY_DOWN = -0.014;
const SCREEN_BG = '#312114';
const LCD_BG = '#24170b';

function innerShade(c, W, H) {
  const g = c.createLinearGradient(0, 0, 0, H * 0.1); g.addColorStop(0, 'rgba(0,0,0,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H * 0.1);
  const s = c.createLinearGradient(0, 0, W * 0.03, 0); s.addColorStop(0, 'rgba(0,0,0,.1)'); s.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = s; c.fillRect(0, 0, W * 0.03, H);
}

function chromeMatcap(center, mid, edge) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d'), g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, center); g.addColorStop(0.55, mid); g.addColorStop(1, edge);
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function brassFrame(panel, x, y, w, h) {
  panel.paint('base', (c) => {
    const X = panel.X(x - w / 2), Y = panel.Y(y + h / 2), W = w * PPU, H = h * PPU;
    c.fillStyle = LOOK.brassDark; c.beginPath(); c.roundRect(X - 9, Y - 9, W + 18, H + 18, 8); c.fill();
    c.fillStyle = LOOK.brass; c.beginPath(); c.roundRect(X - 8, Y - 8, W + 16, H + 15, 7); c.fill();
    c.fillStyle = shade(LOOK.brass, 0.18); c.fillRect(X - 6, Y - 8, W + 12, 2);
    c.fillStyle = LOOK.screenLip; c.beginPath(); c.roundRect(X - 3, Y - 3, W + 6, H + 6, 5); c.fill();
  });
}

const { scene, root } = makeStage();

const bodyBox = [2, 2, 1278, 574];
const stripBox = [2, 560, 1278, 692];
const body = new Panel(...S.sizeOf(bodyBox), { d: 0.62, r: 0.07, color: LOOK.housing, side: shade(LOOK.housing, -0.11), seed: 3, wear: 0, bezel: '#3b3026' });
body.at(...S.centerOf(bodyBox), 0);
root.add(body.g);
const inBody = S.inside(bodyBox);

const zones = {};
for (const name of ['talk', 'log']) {
  const [x, y, w, h] = inBody(BOX[name]);
  zones[name] = { panel: body, x, y, w, h, z: 0.003 };
  brassFrame(body, x, y, w, h);
  body.screen(x, y, w, h, { bg: SCREEN_BG, round: 0.02, draw: innerShade });
}

const grille = [1055, 31, 1250, 517];
{
  const n = 11, slot = 19, step = (grille[3] - grille[1] - slot) / (n - 1);
  for (let i = 0; i < n; i++) {
    const [x, y, w, h] = inBody([grille[0], grille[1] + i * step, grille[2], grille[1] + i * step + slot]);
    body.recess(x, y, w, h, { color: '#0c0907', r: 0.045 });
  }
}

let wheel;
{
  const [x, y, w, h] = inBody(BOX.wheel);
  brassFrame(body, x, y, w, h);
  body.recess(x, y, w + 0.02, h + 0.02, { color: '#0e0b08', r: 0.02 });
  const rise = 0.3, len = w * 0.82;
  const rib = new THREE.MeshMatcapMaterial({ matcap: chromeMatcap('#f3e6c8', '#8d8270', '#1e1c19') }), groove = new THREE.MeshMatcapMaterial({ matcap: chromeMatcap('#5a554d', '#2a2723', '#0d0c0b') });
  const core = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, len, 160, 1);
  core.rotateZ(Math.PI / 2);
  wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(core, groove));
  const ribGeo = new THREE.BoxGeometry(len, 2 * Math.PI * WHEEL_R / WHEEL_RIBS * 0.5, 0.012);
  for (let i = 0; i < WHEEL_RIBS; i++) {
    const a = i / WHEEL_RIBS * 2 * Math.PI, m = new THREE.Mesh(ribGeo, rib);
    m.position.set(0, Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R);
    m.rotation.x = a - Math.PI / 2;
    wheel.add(m);
  }
  wheel.traverse((m) => { m.castShadow = true; m.receiveShadow = true; });
  body.add(wheel, x, y, rise - WHEEL_R);
}

const strip = new Panel(...S.sizeOf(stripBox), { d: 0.74, r: 0.05, color: LOOK.strip, side: shade(LOOK.strip, 0.06), seed: 5, wear: 0, bezel: '#2a2b2f' });
strip.at(...S.centerOf(stripBox), 0.02);
root.add(strip.g);
const inStrip = S.inside(stripBox);
{
  const [x, y, w, h] = inStrip(BOX.lcd);
  zones.lcd = { panel: strip, x, y, w, h, z: 0.003 };
  brassFrame(strip, x, y, w, h);
  strip.screen(x, y, w, h, { bg: LCD_BG, round: 0.02, draw: innerShade });
}
const [kx, ky] = inStrip(BOX.knob);
strip.recess(kx, ky, 0.4, 0.4, { color: shade(LOOK.strip, -0.05), r: 0.2, noInk: true });
strip.add(cyl(0.17, 0.03, '#26262a', { noInk: true }), kx, ky, 0.015);
const knob = new THREE.Group();
const knobBody = cyl(0.13, 0.07, '#4a4a4c', { r2: 0.118, noInk: true }); knobBody.position.z = 0.065; knob.add(knobBody);
const pointer = box(0.03, 0.08, 0.02, '#f1ead6', 0.006, { noInk: true }); pointer.position.set(0, 0.07, 0.102); knob.add(pointer);
strip.add(knob, kx, ky, 0);
const [px, py, pw, ph] = inStrip(BOX.play);
const RCSS = 3.1 / PPU;
{
  const gap = 0.9 * RCSS, wall = 0.9 * RCSS, rr = 4.5 * RCSS;
  const rrS = (x0, y0, x1, y1, r, C = THREE.Shape) => { const sh = new C(); sh.moveTo(x0 + r, y0); sh.lineTo(x1 - r, y0); sh.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0); sh.lineTo(x1, y1 - r); sh.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2); sh.lineTo(x0 + r, y1); sh.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI); sh.lineTo(x0, y0 + r); sh.absarc(x0 + r, y0 + r, r, Math.PI, 1.5 * Math.PI); return sh; };
  const ow = pw / 2 + gap + wall, oh = ph / 2 + gap + wall, iw = pw / 2 + gap, ih = ph / 2 + gap;
  const ringShape = rrS(-ow, -oh, ow, oh, rr + wall); ringShape.holes.push(rrS(-iw, -ih, iw, ih, rr, THREE.Path));
  const ringMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 12 }), toon(shade(LOOK.strip, 0.02)));
  ringMesh.castShadow = true; ringMesh.receiveShadow = true;
  strip.add(ringMesh, px, py, 0);
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(rrS(-iw, -ih, iw, ih, rr)), toon('#1d1e21'));
  floor.receiveShadow = true;
  strip.add(floor, px, py, 0.001);
}
const key = new THREE.Group();
const PLAY_H = 4 * RCSS;
key.add(keycap(pw, ph, RCSS, PLAY_H, { skirt: '#232427', shoulder: '#55575c', top: '#3a3b40' }).group);
const tri = new THREE.Shape(); tri.moveTo(-0.055, -0.075); tri.lineTo(0.085, 0); tri.lineTo(-0.055, 0.075); tri.closePath();
const mark = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: '#ffb547', toneMapped: false }));
mark.position.set(0, 2.7 * RCSS, PLAY_H + 0.002); key.add(mark);
strip.add(key, px, py, 0);

{
  const steel = '#7b7c80', T = 0.018, W = 0.2;
  const bodyFront = body.g.position.z + body.z, stripFront = strip.g.position.z + strip.z;
  const seamY = S.uy(560), cx = S.ux(60);
  const profile = [[seamY + 0.18, bodyFront], [seamY + 0.03, bodyFront], [seamY - 0.03, stripFront], [seamY - 0.22, stripFront]];
  const shape = new THREE.Shape();
  profile.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
  [...profile].reverse().forEach(([u, v]) => shape.lineTo(u, v + T));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const u = pos.getX(i), v = pos.getY(i), w = pos.getZ(i); pos.setXYZ(i, cx + w - W / 2, u, v); }
  geo.computeVertexNormals();
  const bracket = new THREE.Mesh(geo, toon(steel)); bracket.castShadow = true; bracket.receiveShadow = true;
  root.add(bracket);
  for (const [y, z] of [[seamY + 0.11, bodyFront + T], [seamY - 0.13, stripFront + T]]) {
    const bolt = cyl(0.03, 0.016, '#b9b3a3', { seg: 6, noInk: true });
    bolt.position.set(cx, y, z + 0.008); bolt.rotation.z = 0.3; root.add(bolt);
  }
}

finishPanels([body, strip]);
const view = frame({ scene, root, facePanel: body, eye: eyeFor({ x: 8, y: 6.5, z: 24 }, [0, 0]), faceWidthPx: S.width });

const zoneMeta = (z, b) => ({ quad: view.quad(z.panel, z.x, z.y, z.w, z.h, z.z), size: [b[2] - b[0], b[3] - b[1]] });
const boxQuad = (panel, inP, b, z) => { const [x, y, w, h] = inP(b); return view.quad(panel, x, y, w, h, z); };
const meta = {
  width: view.IW, height: view.IH,
  face: view.quad(body, 0, 0, body.w, body.h, 0),
  zones: {
    talk: zoneMeta(zones.talk, BOX.talk),
    log: zoneMeta(zones.log, BOX.log),
    lcd: zoneMeta(zones.lcd, BOX.lcd),
    knobMarks: { quad: boxQuad(strip, inStrip, BOX.knobMarks, 0), size: [280, 128] },
    knob: { quad: boxQuad(strip, inStrip, BOX.knob, 0.2), size: [76, 76] },
    play: { quad: boxQuad(strip, inStrip, BOX.play, 0.07), size: [142, 92] },
    wheel: { quad: boxQuad(body, inBody, BOX.wheel, 0.3), size: [60, 304] },
  },
  sprites: {
    knob: { crop: view.cropAround(boxQuad(strip, inStrip, BOX.knob, 0.1), 46), frames: KNOB_ANGLES.map((_, i) => `knob-${i}`) },
    play: { crop: view.cropAround(boxQuad(strip, inStrip, BOX.play, 0.06), 30), frames: ['play-up', 'play-down'] },
    wheel: { crop: view.cropAround(boxQuad(body, inBody, BOX.wheel, 0.3), 24), frames: Array.from({ length: WHEEL_FRAMES }, (_, i) => `wheel-${i}`) },
  },
  wheelRibPx: 2 * Math.PI * WHEEL_R / WHEEL_RIBS * PPU,
};

installBake((scale) => {
  const files = {};
  const setKnob = (i) => { knob.rotation.z = -KNOB_ANGLES[i] * Math.PI / 180; };
  setKnob(1); key.position.z = strip.z + KEY_UP; wheel.rotation.x = 0;
  view.render(scale);
  files.housing = view.shot();
  files['play-up'] = view.crop(scale, meta.sprites.play.crop);
  for (let i = 0; i < WHEEL_FRAMES; i++) { wheel.rotation.x = i / WHEEL_FRAMES * 2 * Math.PI / WHEEL_RIBS; view.render(scale); files[`wheel-${i}`] = view.crop(scale, meta.sprites.wheel.crop); }
  wheel.rotation.x = 0;
  KNOB_ANGLES.forEach((_, i) => { setKnob(i); view.render(scale); files[`knob-${i}`] = view.crop(scale, meta.sprites.knob.crop); });
  setKnob(1); key.position.z = strip.z + KEY_DOWN; view.render(scale);
  files['play-down'] = view.crop(scale, meta.sprites.play.crop);
  key.position.z = strip.z + KEY_UP;
  return { files, meta };
});
