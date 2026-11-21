import { Plate, extrude, lit, oliveLit, oliveMap, hexBolt, loft, cap, glassMesh, insetPoly, makeStage, frame, THREE, K } from './dashlib.js';
import { OLIVE, mottle } from './olive.js';
import { inkAt } from '../kit.js';
import { installBake } from '../core.js';

const FACE = [-3, 581.9, 339.9, 729];
const EYE_Z_DRIVE = 20.6;
const Z_PANEL = -0.2;
const FRAME_DEPTH = 0.25;
const VISOR = '#231c15';
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
  c.fillStyle = OLIVE.housing; c.fillRect(...PANEL_BOX.slice(0, 2), PANEL_BOX[2] - PANEL_BOX[0], PANEL_BOX[3] - PANEL_BOX[1]);
  mottle(c, PANEL_BOX[0], PANEL_BOX[1], PANEL_BOX[2] - PANEL_BOX[0], PANEL_BOX[3] - PANEL_BOX[1], 21);
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
  P.g.add(extrude(panelShape, { front: Z_PANEL, depth: 0.1, bevel: LP.len(0.4), bt: LP.len(0.4), caps: oliveMap(LP.textureOf(panelCv.cv, PANEL_BOX)), sides: oliveLit(OLIVE.shade), seg: 3 }));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(LP.shape([x0 - g, y0 - g, x1 + g, y1 + g], [6, 6, 6, 6])), oliveLit(OLIVE.floor));
  floor.position.z = Z_PANEL - 0.06; floor.receiveShadow = true; P.g.add(floor);
}

const HOLE_TOP = 605.3, HOLE_RIGHT = 333, TR = 34, HOLE_R = 22;
const FRAME_TOP = 601.2, FRAME_RIGHT = 343.4;
const FRAME_BOX = [-40, 596, 350, 775];
const frameCv = L0.canvas(FRAME_BOX);
{
  const c = frameCv.c;
  c.fillStyle = OLIVE.housing; c.fillRect(FRAME_BOX[0], FRAME_BOX[1], FRAME_BOX[2] - FRAME_BOX[0], FRAME_BOX[3] - FRAME_BOX[1]);
  mottle(c, FRAME_BOX[0], FRAME_BOX[1], FRAME_BOX[2] - FRAME_BOX[0], FRAME_BOX[3] - FRAME_BOX[1], 5);
}
const outer = L0.shape([-40, FRAME_TOP, FRAME_RIGHT, 775], [0, TR, 0, 0]);
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
P.g.add(extrude(outer, { front: 0, depth: FRAME_DEPTH, bevel: L0.len(0.6), bt: L0.len(0.5), caps: oliveMap(L0.textureOf(frameCv.cv, FRAME_BOX)), sides: oliveLit(OLIVE.shade) }));

const VISOR_FRONT = 0.12, VISOR_DEPTH = 0.06, VISOR_BEVEL = 0.01;
const VISOR_TOP = [[-40, 593], [317, 593]], VISOR_BOTTOM = [[-40, 606.5], [309, 606.5]];
{
  const V = P.at(VISOR_FRONT);
  const outline = [...VISOR_TOP, ...VISOR_BOTTOM.slice().reverse()];
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(V.ux(x), V.uy(y))));
  const mesh = extrude(shape, { front: VISOR_FRONT, depth: VISOR_DEPTH, bevel: VISOR_BEVEL, bt: VISOR_BEVEL, caps: oliveLit(VISOR), sides: oliveLit(VISOR), seg: 2 });
  inkAt(mesh, 0.006);
  P.g.add(mesh);
}
const BOLT_Z = 0.014, VISOR_BOLT_Z = VISOR_FRONT + VISOR_BEVEL;
for (const [x, y] of [[14, 612], [338.2, 660], [338.2, 715]]) P.g.add(hexBolt(P.at(BOLT_Z), x, y, 2));
for (const x of [12, 300]) P.g.add(hexBolt(P.at(VISOR_BOLT_Z), x, 599.8, 2));

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

const font = new FontFace('Routed Gothic Narrow', 'url(/game/src/ui/fonts/routed-gothic-narrow.woff2)');
document.fonts.add(await font.load());

const BRASS_DEEP = '#5e4220', PRINT = '#241c14';
const brass = lit(BRASS), brassDeep = lit(BRASS_DEEP);

const SW_RING = 0.85, SW_LEVER = 1.75, SW_LEVER_W = 1.25, SW_W = 28, SW_HALF_H = 19, SW_CENTER_Y = 700.5;
const SW_PRINT = [13.5, 19.5];
const SW_BASE = '#9a9a92', SW_HOLE = '#2a2017';
const SW_Z = Z_PANEL + 0.004;
const SW_TILT = 0.75;
const EYE_UNITS = P.eye();
const printMesh = (L, box, label, z) => {
  const DENSITY = 20, cv = document.createElement('canvas');
  cv.width = Math.round((box[2] - box[0]) * DENSITY); cv.height = Math.round((box[3] - box[1]) * DENSITY);
  const c = cv.getContext('2d');
  c.setTransform(DENSITY, 0, 0, DENSITY, -box[0] * DENSITY, -box[1] * DENSITY);
  const mx = (box[0] + box[2]) / 2, my = (box[1] + box[3]) / 2;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '400 6px "Routed Gothic Narrow"';
  c.fillStyle = 'rgba(255,240,205,0.22)'; c.fillText(label, mx, my + 0.6);
  c.fillStyle = PRINT; c.fillText(label, mx, my);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const rect = L.rect(box);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rect.w, rect.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  m.position.set(rect.cx, rect.cy, z);
  return m;
};
const setRocker = (r, on) => {
  const rot = new THREE.Matrix4().makeRotationX(on ? Math.PI / 2 - SW_TILT : Math.PI / 2 + SW_TILT);
  const m = new THREE.Matrix4().makeTranslation(r.at.x, r.at.y, r.at.z).multiply(r.shear).multiply(rot);
  r.pivot.matrix.copy(m);
};
const flutedStem = (radius, length, flutes) => {
  const g = new THREE.CylinderGeometry(radius, radius * 0.92, length, flutes * 4, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) < 1e-5) continue;
    const k = 0.88 + 0.12 * Math.abs(Math.cos(Math.atan2(z, x) * flutes / 2));
    pos.setX(i, x * k); pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
};
const rockers = ROCKERS.map(([x0, , x1]) => {
  const cx = (x0 + x1) / 2, L = P.at(SW_Z), u = (v) => L.len(v * SW_RING), ul = (v) => L.len(v * SW_LEVER), uw = (v) => L.len(v * SW_LEVER_W);
  P.g.add(printMesh(L, [cx - 10, SW_CENTER_Y - SW_PRINT[1], cx + 10, SW_CENTER_Y - SW_PRINT[0]], 'ON', SW_Z + 0.001));
  P.g.add(printMesh(L, [cx - 10, SW_CENTER_Y + SW_PRINT[0], cx + 10, SW_CENTER_Y + SW_PRINT[1]], 'OFF', SW_Z + 0.001));
  const px = L.ux(cx), py = L.uy(SW_CENTER_Y);
  const profile = [[2.4, 0], [2.4, 0.5], [2.9, 1.3], [4.2, 1.4], [4.8, 0.9], [4.9, 0]].map(([x, y]) => new THREE.Vector2(u(x), u(y)));
  const ringMesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), lit(SW_BASE, { side: THREE.DoubleSide }));
  ringMesh.rotation.x = Math.PI / 2; ringMesh.position.set(px, py, SW_Z);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(u(2.4), 32), new THREE.MeshBasicMaterial({ color: SW_HOLE }));
  hole.position.set(px, py, SW_Z + 0.0015);
  const pivot = new THREE.Group();
  pivot.matrixAutoUpdate = false;
  const at = new THREE.Vector3(px, py, SW_Z + 0.002);
  const shear = new THREE.Matrix4().set(1, 0, -(px - EYE_UNITS.x) / EYE_UNITS.z, 0, 0, 1, -(py - EYE_UNITS.y) / EYE_UNITS.z, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const len = ul(8);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(uw(1.2), uw(1.2), ul(2), 16), brassDeep);
  neck.position.y = ul(0.5);
  const stem = new THREE.Mesh(flutedStem(uw(1.7), len, 16), brass);
  stem.position.y = len / 2 + ul(1);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(uw(1.35), uw(1.65), uw(1.1), 28), brass);
  capTop.position.y = len + ul(1) + uw(0.55);
  pivot.add(neck, stem, capTop);
  for (const m of [ringMesh, stem, capTop, neck]) { m.castShadow = true; m.receiveShadow = true; }
  P.g.add(hole, ringMesh, pivot);
  return { pivot, at, shear, box: [cx - SW_W / 2, SW_CENTER_Y - SW_HALF_H, cx + SW_W / 2, SW_CENTER_Y + SW_HALF_H] };
});
rockers.forEach((r) => setRocker(r, false));

const view = frame({ scene, root, facePanel: { g: P.g, w: L0.len(FACE[2] - FACE[0]), z: 0 }, eye: P.eye(), faceWidthPx: (FACE[2] - FACE[0] + 3) * K });

const zoneFor = (box, z = 0) => ({ quad: P.quad(view, box, z), size: P.size(box) });
const DIAL_ZONE = [DIAL.cx - 76, DIAL.cy - 76, DIAL.cx + 76, DIAL.cy + 76];
const FUEL_ZONE = bounds(insetPoly(FUEL.pts, GLASS_INSET));
const HEAT_ZONE = bounds(insetPoly(HEAT.pts, GLASS_INSET));
const LABEL_Z = Z_PANEL + 0.01;
const zones = {
  dial: zoneFor(DIAL_ZONE, Z_PANEL + 0.012),
  fuel: zoneFor(FUEL_ZONE, GLASS_Z),
  heat: zoneFor(HEAT_ZONE, GLASS_Z),
  coolText: zoneFor([281.2, 626.9, 311.7, 652.1], Z_PANEL + KEY_H - COOL_SINK + 0.004),
  coolTextDown: zoneFor([281.2, 626.9, 311.7, 652.1], Z_PANEL + KEY_H - COOL_SINK - KEY_PRESS + 0.004),
  coolHit: zoneFor(COOL.box, Z_PANEL + KEY_H - COOL_SINK),
  manual: zoneFor([169.3, 665.1, 202, 680.4], LABEL_Z),
  lights: zoneFor([219.3, 665.1, 247.8, 680.4], LABEL_Z),
  overdrive: zoneFor([259.1, 665.1, 304.3, 680.4], LABEL_Z),
};
const sprites = { cool: { crop: view.cropAround(P.quad(view, COOL.box, Z_PANEL + 0.03), 8), frames: ['cool-up', 'cool-down'] } };
rockers.forEach((r, i) => {
  zones[`rockerHit${i}`] = zoneFor(r.box, Z_PANEL + 0.05);
  sprites[`rocker${i}`] = { crop: view.cropAround(P.quad(view, expand(r.box, 3), Z_PANEL + 0.04), 8), frames: [`rocker${i}-off`, `rocker${i}-on`] };
});
const meta = { width: view.IW, height: view.IH, face: P.quad(view, FACE, 0), zones, sprites };

installBake((scale) => {
  const files = {};
  coolKey.position.z = -COOL_SINK;
  rockers.forEach((r) => setRocker(r, false));
  view.render(scale);
  files.housing = view.shot();
  files['cool-up'] = view.crop(scale, sprites.cool.crop);
  rockers.forEach((r, i) => { files[`rocker${i}-off`] = view.crop(scale, sprites[`rocker${i}`].crop); });
  coolKey.position.z = -COOL_SINK - KEY_PRESS; view.render(scale);
  files['cool-down'] = view.crop(scale, sprites.cool.crop);
  coolKey.position.z = -COOL_SINK;
  rockers.forEach((r, i) => {
    setRocker(r, true); view.render(scale);
    files[`rocker${i}-on`] = view.crop(scale, sprites[`rocker${i}`].crop);
    setRocker(r, false);
  });
  return { files, meta };
});
