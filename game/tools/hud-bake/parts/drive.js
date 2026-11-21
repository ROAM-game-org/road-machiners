import { Plate, extrude, lit, litMap, loft, cap, glassMesh, insetPoly, grain, wear, rollGeometry, makeStage, frame, THREE, K } from './dashlib.js';
import { installBake } from '../core.js';
import { buildToggle } from './toggle.js';

const FACE = [-3, 581.9, 339.9, 729];
const EYE_Z_DRIVE = 20.6;
const Z_PANEL = -0.2;
const FRAME_DEPTH = 0.25;
const PANEL = '#5a2a13';
const FRAME_FACE = '#52280f';
const BRASS = '#a87a3c';
const DIAL_BRASS = '#c48b40';
const GLASS = '#1d1609';

const DIAL = { cx: 82, cy: 687.1, rGlass: 71.5, rBrass: 73.0 };
const GAUGE_SHIFT = -2.5;
const shifted = (pts) => pts.map(([x, y]) => [x + GAUGE_SHIFT, y]);
const FUEL = { pts: shifted([[156.4, 618.3], [213.9, 618.3], [213.9, 659.3], [156.4, 659.3]]), r: 9 };
const HEAT = { pts: shifted([[217.9, 618.3], [275.1, 618.3], [275.1, 659.3], [217.9, 659.3]]), r: 9 };
const COOL = { box: [276.4, 622.5, 318.2, 659.2], skirt: 5.5 };
const ROCKERS = [[178.1, 684.8, 194.1, 713.7], [226.1, 684.8, 242.3, 713.7], [274.3, 684.8, 290.6, 713.7]];

const P = new Plate(FACE[0], FACE[1], FACE[2] - FACE[0] + 3, FACE[3] - FACE[1], EYE_Z_DRIVE);
const { scene, root } = makeStage();
root.add(P.g);
const L0 = P.at(0), LP = P.at(Z_PANEL);
const expand = ([x0, y0, x1, y1], d) => [x0 - d, y0 - d, x1 + d, y1 + d];

const PANEL_BOX = [-40, 600, 340, 775];
const panelCv = LP.canvas(PANEL_BOX);
{
  const c = panelCv.c;
  c.fillStyle = PANEL; c.fillRect(...PANEL_BOX.slice(0, 2), PANEL_BOX[2] - PANEL_BOX[0], PANEL_BOX[3] - PANEL_BOX[1]);
  grain(c, PANEL_BOX, 21, 4);
  wear(c, PANEL_BOX, 33, { stains: 8, creases: 26, rubs: 4 });
  c.save();
  c.beginPath();
  c.moveTo(-40, 775); c.lineTo(333, 775); c.lineTo(333, 605.3 + 22); c.arc(333 - 22, 605.3 + 22, 22, 0, Math.PI / 2 * 3, true);
  c.lineTo(96, 605.3); c.bezierCurveTo(50, 605.3, 0, 614, -40, 630); c.closePath();
  c.clip();
  c.filter = 'blur(3.5px)'; c.strokeStyle = 'rgba(8,3,0,0.6)'; c.lineWidth = 16; c.stroke();
  c.restore();
}
const COOL_SINK = 0.025, COOL_GAP = 1.1;
{
  const panelShape = LP.shape(PANEL_BOX, [0, 24, 0, 0]);
  const [x0, y0, x1, y1] = [276.4, 622.5, 318.2, 659.2], g = COOL_GAP;
  panelShape.holes.push(LP.shape([x0 - g, y0 - g, x1 + g, y1 + g], [5 + g, 5 + g, 5 + g, 5 + g]));
  P.g.add(extrude(panelShape, { front: Z_PANEL, depth: 0.1, bevel: LP.len(0.4), bt: LP.len(0.4), caps: litMap(LP.textureOf(panelCv.cv, PANEL_BOX)), sides: lit('#24100a'), seg: 3 }));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(LP.shape([x0 - g, y0 - g, x1 + g, y1 + g], [6, 6, 6, 6])), lit('#2a1309'));
  floor.position.z = Z_PANEL - 0.06; floor.receiveShadow = true; P.g.add(floor);
}

const HOLE_TOP = 605.3, HOLE_RIGHT = 333, TR = 34, HOLE_R = 22;
const ROLL_Y = 601.2, ROLL_X = 343.4, ROLL_R = 2.5, ROLL_COLOR = '#793f22';
const FRAME_BOX = [-40, 596, 350, 775];
const frameCv = L0.canvas(FRAME_BOX);
{
  const c = frameCv.c;
  c.fillStyle = FRAME_FACE; c.fillRect(FRAME_BOX[0], FRAME_BOX[1], FRAME_BOX[2] - FRAME_BOX[0], FRAME_BOX[3] - FRAME_BOX[1]);
  grain(c, FRAME_BOX, 5, 4);
  wear(c, FRAME_BOX, 34, { stains: 3, creases: 12, rubs: 2 });
}
const outer = L0.shape([-40, ROLL_Y, ROLL_X, 775], [0, TR, 0, 0]);
{
  const u = (x, y) => [L0.ux(x), L0.uy(y)];
  const hole = new THREE.Path();
  hole.moveTo(...u(-40, 775));
  hole.lineTo(...u(HOLE_RIGHT, 775));
  hole.lineTo(...u(HOLE_RIGHT, HOLE_TOP + HOLE_R));
  hole.absarc(L0.ux(HOLE_RIGHT - HOLE_R), L0.uy(HOLE_TOP + HOLE_R), L0.len(HOLE_R), 0, Math.PI / 2, false);
  hole.lineTo(...u(96, HOLE_TOP));
  hole.bezierCurveTo(...u(50, HOLE_TOP), ...u(0, 614), ...u(-40, 630));
  hole.closePath();
  outer.holes.push(hole);
}
P.g.add(extrude(outer, { front: 0, depth: FRAME_DEPTH, bevel: L0.len(0.6), bt: L0.len(0.5), caps: litMap(L0.textureOf(frameCv.cv, FRAME_BOX)), sides: lit('#632f16') }));
{
  const path = [[-40, ROLL_Y]];
  const rc = TR - ROLL_R;
  for (let x = -40 + 20; x < ROLL_X - rc; x += 20) path.push([x, ROLL_Y]);
  path.push([ROLL_X - rc, ROLL_Y]);
  for (let i = 1; i < 16; i++) { const a = -Math.PI / 2 + i / 16 * Math.PI / 2; path.push([ROLL_X - rc + Math.cos(a) * rc, ROLL_Y + rc + Math.sin(a) * rc]); }
  for (let y = ROLL_Y + rc; y < 775; y += 20) path.push([ROLL_X, y]);
  path.push([ROLL_X, 775]);
  const { geo, lens, total } = rollGeometry(L0, path, ROLL_R);
  const H = 64, cv = document.createElement('canvas');
  cv.width = Math.round(total * K); cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = ROLL_COLOR; c.fillRect(0, 0, cv.width, H);
  const rowAt = (deg) => (1 - deg / 360) * H, row = rowAt(80), at = (len) => len * K;
  for (const [deg, w, a] of [[52, 3.2 * K / 2, 0.22], [52, 1.4 * K / 2, 0.3]]) { c.globalAlpha = a; c.strokeStyle = '#d98a52'; c.lineWidth = w; c.beginPath(); c.moveTo(0, rowAt(deg)); c.lineTo(cv.width, rowAt(deg)); c.stroke(); }
  const topEnd = lens[path.findIndex((p) => p[0] >= ROLL_X - rc)], arcEnd = lens[path.findIndex((p, i) => i > 0 && p[1] > ROLL_Y + rc - 0.01 && p[0] === ROLL_X)];
  const run = (from, to, dash, gap, alpha) => {
    c.save(); c.setLineDash([dash * K, gap * K]); c.lineCap = 'butt';
    for (const [dy, a, col] of [[1.2, alpha * 0.5, '#1c0a03'], [0, alpha, '#ecd5ac']]) { c.globalAlpha = a; c.strokeStyle = col; c.lineWidth = K * 0.85; c.beginPath(); c.moveTo(at(from), row + dy); c.lineTo(at(to), row + dy); c.stroke(); }
    c.restore();
  };
  run(0, topEnd, 6, 3.2, 0.6); run(topEnd, arcEnd, 4, 2.2, 0.7); run(arcEnd, total, 2.6, 1.5, 0.8);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapT = THREE.RepeatWrapping;
  const mat = litMap(tex);
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false; mesh.receiveShadow = false;
  P.g.add(mesh);
}

const dialGlassPaint = (c, b) => {
  const cx = DIAL.cx, cy = DIAL.cy, R = DIAL.rGlass;
  c.fillStyle = GLASS; c.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
  const g = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = g; c.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
};
{
  const rimShape = LP.disc(DIAL.cx, DIAL.cy, DIAL.rBrass);
  rimShape.holes.push(LP.disc(DIAL.cx, DIAL.cy, DIAL.rGlass));
  P.g.add(extrude(rimShape, { front: Z_PANEL + 0.01, depth: 0.006, bevel: 0.002, bt: 0.002, caps: lit(DIAL_BRASS), seg: 2 }));
  const dialBox = [DIAL.cx - DIAL.rGlass, DIAL.cy - DIAL.rGlass, DIAL.cx + DIAL.rGlass, DIAL.cy + DIAL.rGlass];
  P.g.add(glassMesh(LP, dialBox, { z: Z_PANEL + 0.006, shape: LP.disc(DIAL.cx, DIAL.cy, DIAL.rGlass), paint: dialGlassPaint }));
}

const gaugePaint = (c, b) => {
  const g = c.createLinearGradient(0, b[1], 0, b[3]);
  g.addColorStop(0, '#2a2418'); g.addColorStop(0.55, '#1b1608'); g.addColorStop(1, '#17120a');
  c.fillStyle = g; c.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
};
const GLASS_Z = Z_PANEL + 0.006, GLASS_INSET = 0.95;
const bounds = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
for (const w of [FUEL, HEAT]) {
  const inner = insetPoly(w.pts, GLASS_INSET);
  const ringShape = LP.poly(w.pts, w.r);
  ringShape.holes.push(LP.poly(inner, w.r - 1));
  P.g.add(extrude(ringShape, { front: Z_PANEL + 0.01, depth: 0.006, bevel: 0.002, bt: 0.002, caps: lit(BRASS), seg: 2 }));
  P.g.add(glassMesh(LP, bounds(w.pts), { z: GLASS_Z, shape: LP.poly(inner, w.r - 1), paint: gaugePaint }));
}

const KEY_H = 0.07, KEY_PRESS = 0.03;
const coolKey = new THREE.Group();
{
  const [x0, y0, x1, y1] = COOL.box;
  const levels = [
    { box: [x0, y0, x1, y1], r: [5, 5, 5, 5], z: Z_PANEL },
    { box: [x0 + 1.2, y0 + 0.8, x1 - 1.2, y1 - COOL.skirt], r: [4, 4, 4, 4], z: Z_PANEL + KEY_H - 0.012 },
    { box: [x0 + 2.2, y0 + 1.8, x1 - 2.2, y1 - COOL.skirt - 1], r: [3.2, 3.2, 3.2, 3.2], z: Z_PANEL + KEY_H },
  ];
  coolKey.add(loft(LP, levels[0], levels[1], lit('#684328')));
  coolKey.add(loft(LP, levels[1], levels[2], lit('#8e5c36')));
  coolKey.add(cap(LP, levels[2].box, levels[2].r, Z_PANEL + KEY_H, lit('#704628')));
  P.g.add(coolKey);
}

const SW_W = 28, SW_HALF_H = 19;
const SW_CENTER_Y = 703;
const LABEL_ROW = [661, 673], ON_ROW = [674, 685], OFF_ROW = [719.5, 729];
const PRINT_HALF_W = 13, ON_HALF_W = 8, LAMP_R = 5, LAMP_GAP = 2;
const SW_BASE = '#9a9a92';
const SW_SCALE = 1.5, SW_LEVER_SCALE = 2.3 / 1.75;
const SW_Z = Z_PANEL + 0.004;
const EYE_UNITS = P.eye();
const lampDome = (cx, cy) => {
  const L = P.at(SW_Z), px = L.ux(cx), py = L.uy(cy), r = L.len(LAMP_R);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(r, L.len(1.1), 10, 32), lit(SW_BASE));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.94, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lit('#4a2c0a'));
  dome.rotation.x = Math.PI / 2; dome.scale.set(1, 0.6, 1);
  const g = new THREE.Group();
  g.add(bezel, dome);
  g.position.set(px, py, SW_Z);
  for (const m of [bezel, dome]) { m.castShadow = true; m.receiveShadow = true; }
  P.g.add(g);
};
const rockers = ROCKERS.map(([x0, , x1]) => {
  const cx = (x0 + x1) / 2, L = P.at(SW_Z);
  lampDome(cx - ON_HALF_W - LAMP_GAP - LAMP_R, (ON_ROW[0] + ON_ROW[1]) / 2);
  const at = new THREE.Vector3(L.ux(cx), L.uy(SW_CENTER_Y), SW_Z);
  const toggle = buildToggle({ len: L.len.bind(L), at, eye: EYE_UNITS, scale: SW_SCALE, leverScale: SW_LEVER_SCALE });
  P.g.add(...toggle.parts);
  return { set: toggle.set, cx, box: [cx - SW_W / 2, SW_CENTER_Y - SW_HALF_H, cx + SW_W / 2, SW_CENTER_Y + SW_HALF_H] };
});
rockers.forEach((r) => r.set(false));

const view = frame({ scene, root, facePanel: { g: P.g, w: L0.len(FACE[2] - FACE[0]), z: 0 }, eye: P.eye(), faceWidthPx: (FACE[2] - FACE[0] + 3) * K });

const zoneFor = (box, z = 0) => ({ quad: P.quad(view, box, z), size: P.size(box) });
const DIAL_ZONE = [DIAL.cx - 76, DIAL.cy - 76, DIAL.cx + 76, DIAL.cy + 76];
const FUEL_ZONE = bounds(insetPoly(FUEL.pts, GLASS_INSET));
const HEAT_ZONE = bounds(insetPoly(HEAT.pts, GLASS_INSET));
const LABEL_HALF_W = 22;
const LABEL_Z = Z_PANEL + 0.01;
const zones = {
  dial: zoneFor(DIAL_ZONE, Z_PANEL + 0.012),
  fuel: zoneFor(FUEL_ZONE, GLASS_Z),
  heat: zoneFor(HEAT_ZONE, GLASS_Z),
  coolText: zoneFor([281.2, 626.9, 311.7, 652.1], Z_PANEL + KEY_H - COOL_SINK + 0.004),
  coolTextDown: zoneFor([281.2, 626.9, 311.7, 652.1], Z_PANEL + KEY_H - COOL_SINK - KEY_PRESS + 0.004),
  coolHit: zoneFor(COOL.box, Z_PANEL + KEY_H - COOL_SINK),
};
rockers.forEach((r, i) => {
  const rowBox = (row, half) => [r.cx - half, row[0], r.cx + half, row[1]];
  zones[['manual', 'lights', 'overdrive'][i]] = zoneFor(rowBox(LABEL_ROW, LABEL_HALF_W), LABEL_Z);
  zones[`on${i}`] = zoneFor(rowBox(ON_ROW, ON_HALF_W), LABEL_Z);
  zones[`off${i}`] = zoneFor(rowBox(OFF_ROW, PRINT_HALF_W), LABEL_Z);
  const lampX = r.cx - ON_HALF_W - LAMP_GAP - LAMP_R, lampY = (ON_ROW[0] + ON_ROW[1]) / 2;
  zones[`lamp${i}`] = zoneFor([lampX - LAMP_R, lampY - LAMP_R, lampX + LAMP_R, lampY + LAMP_R], SW_Z + 0.004);
});
const sprites = { cool: { crop: view.cropAround(P.quad(view, COOL.box, Z_PANEL + 0.03), 8), frames: ['cool-up', 'cool-down'] } };
rockers.forEach((r, i) => {
  zones[`rockerHit${i}`] = zoneFor(r.box, Z_PANEL + 0.05);
  sprites[`rocker${i}`] = { crop: view.cropAround(P.quad(view, expand(r.box, 3), Z_PANEL + 0.04), 8), frames: [`rocker${i}-off`, `rocker${i}-on`] };
});
const meta = { width: view.IW, height: view.IH, face: P.quad(view, FACE, 0), zones, sprites };

installBake((scale) => {
  const files = {};
  coolKey.position.z = -COOL_SINK;
  rockers.forEach((r) => r.set(false));
  view.render(scale);
  files.housing = view.shot();
  files['cool-up'] = view.crop(scale, sprites.cool.crop);
  rockers.forEach((r, i) => { files[`rocker${i}-off`] = view.crop(scale, sprites[`rocker${i}`].crop); });
  coolKey.position.z = -COOL_SINK - KEY_PRESS; view.render(scale);
  files['cool-down'] = view.crop(scale, sprites.cool.crop);
  coolKey.position.z = -COOL_SINK;
  rockers.forEach((r, i) => {
    r.set(true); view.render(scale);
    files[`rocker${i}-on`] = view.crop(scale, sprites[`rocker${i}`].crop);
    r.set(false);
  });
  return { files, meta };
});
