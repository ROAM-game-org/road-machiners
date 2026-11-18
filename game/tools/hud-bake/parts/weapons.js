import * as THREE from 'three';
import { Panel, shade, toon, ink } from '../kit.js';
import { mottle } from './olive.js';
import { PPU, plateSpace, makeStage, frame, finishPanels, installBake, eyeFor } from '../core.js';

const K = 3.2;
const FACE_CSS = [360.7, 554.9, 760.7, 704];
const P = (cx, cy) => [(cx - FACE_CSS[0]) * K, (cy - FACE_CSS[1]) * K];
const R = (x0, y0, x1, y1) => [...P(x0, y0), ...P(x1, y1)];
const S = plateSpace(Math.round((FACE_CSS[2] - FACE_CSS[0]) * K), (FACE_CSS[3] - FACE_CSS[1]) * K);

const BODY_LEFT = 370.1, BODY_TOP = 562.5;
const BOX = {
  body: R(BODY_LEFT, BODY_TOP, 759.3, 658.8),
  lower: R(386, 640, 745.2, 703),
  screen: R(384, 569.5, 686.5, 648.5),
  key: R(690.5, 567, 755.5, 588),
  reload: R(690.5, 591.5, 721.5, 619),
  hold: R(724.5, 591.5, 755.5, 619),
  auto: R(690.5, 623, 755.5, 649),
};
const TOP_INSET = { left: 2.2, top: 1.5, right: 2.2, bottom: 6.9 };
const ICON = 18;
const topFace = ([x0, y0, x1, y1]) => [x0 + TOP_INSET.left * K, y0 + TOP_INSET.top * K, x1 - TOP_INSET.right * K, y1 - TOP_INSET.bottom * K];
const iconIn = (box) => { const [x0, y0, x1, y1] = topFace(box), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; return [cx - ICON * K / 2, cy - ICON * K / 2, cx + ICON * K / 2, cy + ICON * K / 2]; };
BOX.allText = topFace(BOX.key);
BOX.reloadIcon = iconIn(BOX.reload);
BOX.holdIcon = iconIn(BOX.hold);
BOX.autoText = topFace(BOX.auto);
const SLOT_Y = [663, 697];
const SLOTS = [[424, 488], [497, 561], [570, 634], [643, 707]].map(([x0, x1]) => R(x0, SLOT_Y[0], x1, SLOT_Y[1]));
const CLIPS = [
  [[402.8, 658.6], [427.8, 658.0], [428.0, 665.5], [403.4, 664.0]],
  [[714.6, 657.8], [734.0, 657.8], [734.3, 664.5], [715.3, 663.6]],
];
const BRACKETS = [
  [[400.9, 687.0], [418.4, 689.3], [413.4, 701.5], [394.0, 702.1]],
  [[716.5, 689.6], [739.6, 690.9], [735.9, 701.8], [712.5, 702.1]],
];

const LOOK = { housing: '#8d7b5b', top: '#918466', lower: '#5e533b', lowerBounce: '#40382a', copper: '#8f5d44', tan: '#bd9156', clip: '#8e6d42', tanEdge: '#2b1f12', screen: '#322014', brass: '#a38052', brassEdge: '#483824' };
const KEY_UP = 0.014, KEY_DOWN = -0.004;
const EYE = eyeFor({ x: 1.269, y: 15.83, z: 24 }, [0, 0]);
const BODY_D = 0.236, LOWER_D = 0.2, OVERHANG = 0.35;



const { scene, root } = makeStage();

const FRONT_Z = BODY_D / 2;
const LOWER_FRONT_Z = FRONT_Z - OVERHANG;
const adjPt = ([px, py], zAbs) => {
  const s = (EYE.z - zAbs) / (EYE.z - FRONT_Z);
  const wx = EYE.x + (S.ux(px) - EYE.x) * s, wy = EYE.y + (S.uy(py) - EYE.y) * s;
  return [wx * PPU + S.width / 2, S.height / 2 - wy * PPU];
};
const adj = (b, zAbs) => [...adjPt([b[0], b[1]], zAbs), ...adjPt([b[2], b[3]], zAbs)];
const sizeOf = (b) => S.sizeOf(b);
const LOWER_BOX = adj(BOX.lower, LOWER_FRONT_Z);
const body = new Panel(...sizeOf(BOX.body), { d: BODY_D, r: 0.03, color: LOOK.housing, side: LOOK.top, seed: 11, wear: 0, bezel: '#3b3026' });
body.at(...S.centerOf(BOX.body), 0);
const BEVEL = 0.035, BEVEL_T = 0.03;
let bodyShape;
{
  const w = body.w, h = body.h, x0 = -w / 2 + BEVEL, x1 = w / 2 - BEVEL, y0 = -h / 2 + BEVEL, y1 = h / 2 - BEVEL;
  const nx = (cssX) => x0 + (cssX - BODY_LEFT) * K / PPU;
  const ny = (cssY) => y1 - (cssY - BODY_TOP) * K / PPU;
  const shape = new THREE.Shape();
  shape.moveTo(x0, y0); shape.lineTo(x1, y0); shape.lineTo(x1, y1); shape.lineTo(x0, y1);
  shape.lineTo(x0, ny(609)); shape.lineTo(nx(BODY_LEFT + 2.8), ny(610)); shape.lineTo(nx(BODY_LEFT + 7.6), ny(612.5)); shape.lineTo(nx(BODY_LEFT + 7.6), ny(629.5)); shape.lineTo(nx(BODY_LEFT + 3.5), ny(634)); shape.lineTo(x0, ny(634.5));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: BODY_D - 2 * BEVEL_T, bevelEnabled: true, bevelThickness: BEVEL_T, bevelSize: BEVEL, bevelOffset: 0, bevelSegments: 3, curveSegments: 4 });
  geo.translate(0, 0, -BODY_D / 2 + BEVEL_T);
  body.body.geometry = geo;
  bodyShape = shape;
  body.body.remove(...body.body.children);
  ink(body.body);
  const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.02, ny(612) - ny(632), 0.05), toon('#a58e66'));
  hinge.position.set(nx(BODY_LEFT + 5.5), (ny(612) + ny(632)) / 2, -0.02); hinge.castShadow = true; hinge.receiveShadow = true;
  body.g.add(hinge);
}
const lower = new Panel(...sizeOf(LOWER_BOX), { d: LOWER_D, r: 0.015, color: LOOK.lower, side: shade(LOOK.lower, -0.04), seed: 12, wear: 0, bezel: '#3b3026' });
lower.at(...S.centerOf(LOWER_BOX), LOWER_FRONT_Z - LOWER_D / 2);
root.add(lower.g, body.g);
body.paint('base', (c) => mottle(c, 0, 0, c.canvas.width, c.canvas.height, 5));
lower.paint('base', (c) => mottle(c, 0, 0, c.canvas.width, c.canvas.height, 6));
const inBody = S.inside(BOX.body);
const cv = (b, panelBox) => [b[0] - panelBox[0], b[1] - panelBox[1], b[2] - panelBox[0], b[3] - panelBox[1]];

{
  const [x, y, w, h] = inBody(BOX.screen);
  body.paint('base', (c) => {
    const [X0, Y0, X1, Y1] = cv(BOX.screen, BOX.body);
    c.fillStyle = LOOK.brassEdge; c.beginPath(); c.roundRect(X0 - 6.4, Y0 - 6.4, X1 - X0 + 12.8, Y1 - Y0 + 12.8, 5); c.fill();
    c.fillStyle = LOOK.brass; c.beginPath(); c.roundRect(X0 - 4.8, Y0 - 4.8, X1 - X0 + 9.6, Y1 - Y0 + 9.6, 4); c.fill();
  });
  body.screen(x, y, w, h, { bg: LOOK.screen, round: 0.01, draw: (c, W, H) => {
    const g = c.createLinearGradient(0, 0, 0, H * 0.06); g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H * 0.05);
    const s = c.createLinearGradient(0, 0, W * 0.012, 0); s.addColorStop(0, 'rgba(0,0,0,.4)'); s.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = s; c.fillRect(0, 0, W * 0.015, H);
  } });
}

const CAP_D = 0.025;
const KEY_TOP_Z = FRONT_Z + KEY_UP + CAP_D / 2 + 0.001;
const KEY_LOOK = { skirt: '#684328', shoulder: '#8e5c36', top: '#6b4023' };
const GAIN = 1.12;
const litToon = (c) => { const m = toon(c); m.color.multiplyScalar(GAIN); return m; };
const keyMats = { skirt: litToon(KEY_LOOK.skirt), shoulder: litToon(KEY_LOOK.shoulder), top: litToon(KEY_LOOK.top) };
const KEY_LIT = { skirt: '#8a5a1c', shoulder: '#f0b860', top: '#e8a43c' };
const litMats = { skirt: litToon(KEY_LIT.skirt), shoulder: new THREE.MeshBasicMaterial({ color: KEY_LIT.shoulder, toneMapped: false }), top: new THREE.MeshBasicMaterial({ color: KEY_LIT.top, toneMapped: false }) };
const CSS = K / PPU;
const KEYCAP_H = 3.5 * CSS;
const rrLocal = (x0, y0, x1, y1, r) => {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
};
const keyLevel = (w, h, l, t, rgt, b, r) => rrLocal(-w / 2 + l * CSS, -h / 2 + b * CSS, w / 2 - rgt * CSS, h / 2 - t * CSS, r * CSS);
const loftLocal = (sa, za, sb, zb, mat) => {
  const pa = sa.getPoints(6), pb = sb.getPoints(6), n = Math.min(pa.length, pb.length), pos = [], idx = [];
  for (const [ring, z] of [[pa, za], [pb, zb]]) for (let i = 0; i < n; i++) pos.push(ring[i].x, ring[i].y, z);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, j, n + j, i, n + j, n + i); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
};
const roundRect = (sh, x0, y0, x1, y1, r) => { sh.moveTo(x0 + r, y0); sh.lineTo(x1 - r, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + r); sh.lineTo(x1, y1 - r); sh.quadraticCurveTo(x1, y1, x1 - r, y1); sh.lineTo(x0 + r, y1); sh.quadraticCurveTo(x0, y1, x0, y1 - r); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0); };

const makeKey = (box) => {
  body.paint('base', (c) => {
    const [X0, Y0, X1, Y1] = cv(box, BOX.body);
    c.fillStyle = '#2b1f12'; c.beginPath(); c.roundRect(X0 - 1.5, Y0 - 1.5, X1 - X0 + 3, Y1 - Y0 + 3, 8); c.fill();
  });
  const [kx, ky, kw, kh] = inBody(adj(box, KEY_TOP_Z)), z0 = -CAP_D / 2, group = new THREE.Group();
  const base = keyLevel(kw, kh, 0, 0, 0, 0, 4), mid = keyLevel(kw, kh, 1.2, 0.6, 1.2, 6.1, 3.4), topS = keyLevel(kw, kh, TOP_INSET.left, TOP_INSET.top, TOP_INSET.right, TOP_INSET.bottom, 2.8);
  const skirt = loftLocal(base, z0, mid, z0 + KEYCAP_H - 0.012 * 0.8, keyMats.skirt);
  const shoulder = loftLocal(mid, z0 + KEYCAP_H - 0.012 * 0.8, topS, z0 + KEYCAP_H, keyMats.shoulder);
  const topGeo = new THREE.ShapeGeometry(topS, 12); topGeo.translate(0, 0, z0 + KEYCAP_H);
  const top = new THREE.Mesh(topGeo, keyMats.top); top.castShadow = true; top.receiveShadow = true;
  group.add(skirt, shoulder, top);
  body.add(group, kx, ky, 0);
  const [wx, wy, ww, wh] = inBody(adj(box, FRONT_Z + 0.01));
  const out = 1.8 * CSS, inn = 0.5 * CSS;
  const shape = new THREE.Shape(); roundRect(shape, -ww / 2 - out, -wh / 2 - out, ww / 2 + out, wh / 2 + out, 0.03);
  const hole = new THREE.Path(); roundRect(hole, -ww / 2 - inn, -wh / 2 - inn, ww / 2 + inn, wh / 2 + inn, 0.02); shape.holes.push(hole);
  const lip = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 10 }), toon(LOOK.housing));
  lip.castShadow = true; lip.receiveShadow = true;
  body.add(lip, wx, wy, 0);
  const press = (z) => { group.position.z = body.z + z; };
  const light = (on) => { const m = on ? litMats : keyMats; skirt.material = m.skirt; shoulder.material = m.shoulder; top.material = m.top; };
  return { press, light };
};
const allKey = makeKey(BOX.key);
const reloadKey = makeKey(BOX.reload);
const holdKey = makeKey(BOX.hold);
const autoKey = makeKey(BOX.auto);



const plateMesh = (poly, color, depth, z, scale = 1) => {
  const zAbs = LOWER_FRONT_Z + z;
  const pts = poly.map(([cx, cy]) => adjPt(P(cx, cy), zAbs));
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const [pcx, pcy] = S.centerOf(LOWER_BOX);
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(S.ux(mx + (x - mx) * scale) - pcx, S.uy(my + (y - my) * scale) - pcy)));
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }), toon(color));
  m.castShadow = true; m.receiveShadow = true; m.position.z = lower.z + z;
  lower.g.add(m);
  return m;
};
const tanPlate = (poly, tan, lit) => {
  const edge = plateMesh(poly, LOOK.tanEdge, 0.012, 0.004, 1.05);
  const plate = plateMesh(poly, tan, 0.016, 0.008);
  if (lit) { edge.receiveShadow = false; plate.receiveShadow = false; }
};
{
  const strip = plateMesh([[745.2, 659.2], [751, 659.2], [751, 673], [745.2, 680.8]], '#463b2a', 0.012, 0.002);
  strip.receiveShadow = false;
}
for (const poly of CLIPS) tanPlate(poly, LOOK.clip, true);
for (const poly of BRACKETS) tanPlate(poly, LOOK.tan, false);

const SLOT_FRONT = 0.016;
const lowerLocal = (cx, cy, z) => { const [px, py] = adjPt(P(cx, cy), LOWER_FRONT_Z + z); const [pcx, pcy] = S.centerOf(LOWER_BOX); return [S.ux(px) - pcx, S.uy(py) - pcy]; };
const SLOT_LOOK = { plate: '#94825f', edge: '#2b2116', screw: '#a8936c', slot: '#2b2116', wire: '#2e2a24' };
const slotScrew = toon(SLOT_LOOK.screw), slotDark = toon(SLOT_LOOK.slot), wireMat = toon(SLOT_LOOK.wire);
const CORNER = 2.2;
const slotGroups = SLOTS.map(() => []);
for (const [i, b] of SLOTS.entries()) {
  const before = new Set([...lower.g.children, ...root.children]);
  const [x0, y0, x1, y1] = [b[0] / K + FACE_CSS[0], b[1] / K + FACE_CSS[1], b[2] / K + FACE_CSS[0], b[3] / K + FACE_CSS[1]];
  const poly = [[x0 + CORNER, y0], [x1 - CORNER, y0], [x1, y0 + CORNER], [x1, y1 - CORNER], [x1 - CORNER, y1], [x0 + CORNER, y1], [x0, y1 - CORNER], [x0, y0 + CORNER]];
  plateMesh(poly, SLOT_LOOK.edge, 0.008, 0.002, 1.03);
  plateMesh(poly, SLOT_LOOK.plate, SLOT_FRONT - 0.004, 0.004);
  for (const [sx, sy] of [[x0 + 2.6, y0 + 2.6], [x1 - 2.6, y0 + 2.6], [x0 + 2.6, y1 - 2.6], [x1 - 2.6, y1 - 2.6]]) {
    const [lx, ly] = lowerLocal(sx, sy, SLOT_FRONT);
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(1.2 * CSS, 1.3 * CSS, 0.006, 16), slotScrew);
    screw.rotation.x = Math.PI / 2; screw.position.set(lx, ly, lower.z + SLOT_FRONT + 0.003); screw.castShadow = true;
    const cut = new THREE.Mesh(new THREE.BoxGeometry(1.9 * CSS, 0.35 * CSS, 0.002), slotDark);
    cut.rotation.z = 0.6 + i * 0.7; cut.position.set(lx, ly, lower.z + SLOT_FRONT + 0.0065);
    lower.g.add(screw, cut);
  }
  const wz = LOWER_FRONT_Z + 0.01;
  const wirePath = [[x1 - 1, (y0 + y1) / 2, wz], [x1 + 2.4, (y0 + y1) / 2 + 1, wz], [x1 + 3.6, y1 - 6, wz], [x1 + 3.8, 701.5, wz], [x1 + 3.8, 703.6, wz - 0.04], [x1 + 3.8, 704, wz - 0.14]];
  const pts = wirePath.map(([cx, cy, z]) => { const [px, py] = adjPt(P(cx, cy), z); return new THREE.Vector3(S.ux(px), S.uy(py), z); });
  const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 1.7 * CSS, 12), wireMat);
  wire.castShadow = true; wire.receiveShadow = true;
  root.add(ink(wire));
  for (const m of [...lower.g.children, ...root.children]) if (!before.has(m)) { slotGroups[i].push(m); }
}
const showSlots = (shown) => { for (const [i, meshes] of slotGroups.entries()) for (const m of meshes) m.visible = shown.includes(i); };

const PIPE_Z = LOWER_FRONT_Z - 0.07;
const PIPE_PATH = [[374.5, 650], [374.5, 668], [375.6, 675.5], [379.5, 681.5], [386, 685.5], [393, 687.5]];
{
  const pts = PIPE_PATH.map(([cx, cy]) => { const [px, py] = adjPt(P(cx, cy), PIPE_Z); return new THREE.Vector3(S.ux(px), S.uy(py), PIPE_Z); });
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 4.4 * K / PPU, 14), toon(LOOK.copper));
  pipe.castShadow = true; pipe.receiveShadow = true;
  root.add(pipe);
}

finishPanels([body, lower]);
lower.face.material.emissive.set(LOOK.lowerBounce);
lower.face.scale.set(lower.w / (lower.w - 0.044), lower.h / (lower.h - 0.044), 1);
{
  const fw = body.w - 2 * BEVEL, fh = body.h - 2 * BEVEL;

  const fgeo = new THREE.ShapeGeometry(bodyShape, 4);
  const fp = fgeo.attributes.position, fuv = fgeo.attributes.uv, fw0 = body.w - 2 * BEVEL, fh0 = body.h - 2 * BEVEL;
  for (let i = 0; i < fp.count; i++) fuv.setXY(i, fp.getX(i) / fw0 + 0.5, fp.getY(i) / fh0 + 0.5);
  body.face.geometry = fgeo;
  body.tex.repeat.set(fw / body.w, fh / body.h);
  body.tex.offset.set((1 - fw / body.w) / 2, (1 - fh / body.h) / 2);
}
{
  const [sx, sy, sw, sh] = inBody(adj(BOX.screen, FRONT_Z + 0.03)), t = 0.024, lip = toon(LOOK.brass);
  const bars = [[sx, sy + sh / 2 + t / 2, sw + 2 * t, t], [sx, sy - sh / 2 - t / 2, sw + 2 * t, t], [sx - sw / 2 - t / 2, sy, t, sh], [sx + sw / 2 + t / 2, sy, t, sh]];
  for (const [x, y, w, h] of bars) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), lip);
    bar.castShadow = true; bar.receiveShadow = true; body.add(bar, x, y, 0.015);
  }
}
const view = frame({ scene, root, facePanel: body, eye: EYE, faceWidthPx: Math.round(body.w * PPU) });

const faceBox = [0, 0, S.width, (FACE_CSS[3] - FACE_CSS[1]) * K];
const faceLocal = inBody(faceBox);
const zoneAt = (b, z) => ({ quad: view.quad(body, ...inBody(adj(b, FRONT_Z + z)), z), size: [b[2] - b[0], b[3] - b[1]].map((v) => Math.round(v * 100) / 100) });
const keyCrop = (b) => view.cropAround(view.quad(body, ...inBody(adj(b, FRONT_Z + 0.1)), 0.1), 6);
const slotZone = (b) => {
  const [x0, y0, x1, y1] = [b[0] / K + FACE_CSS[0], b[1] / K + FACE_CSS[1], b[2] / K + FACE_CSS[0], b[3] / K + FACE_CSS[1]];
  const [ax, ay] = lowerLocal(x0, y0, SLOT_FRONT), [bx, by] = lowerLocal(x1, y1, SLOT_FRONT);
  return { quad: view.quad(lower, (ax + bx) / 2, (ay + by) / 2, bx - ax, ay - by, SLOT_FRONT), size: [b[2] - b[0], b[3] - b[1]].map((v) => Math.round(v * 100) / 100) };
};
const SLOT_SPAN = SLOTS.map((b) => { const [x0, y0, x1] = [b[0] / K + FACE_CSS[0], b[1] / K + FACE_CSS[1], b[2] / K + FACE_CSS[0]]; return R(x0 - 1, y0 - 1, x1 + 8.5, 706); });
const slotCrop = (b) => {
  const [x0, y0, x1, y1] = [b[0] / K + FACE_CSS[0], b[1] / K + FACE_CSS[1], b[2] / K + FACE_CSS[0], b[3] / K + FACE_CSS[1]];
  const [ax, ay] = lowerLocal(x0, y0, SLOT_FRONT), [bx, by] = lowerLocal(x1, y1, SLOT_FRONT);
  return view.cropAround(view.quad(lower, (ax + bx) / 2, (ay + by) / 2, bx - ax, ay - by, SLOT_FRONT), 12);
};
const meta = {
  width: view.IW, height: view.IH,
  face: view.quad(body, ...faceLocal, 0),
  zones: {
    screen: zoneAt(BOX.screen, 0.004),
    allText: zoneAt(BOX.allText, KEY_UP + CAP_D / 2 + 0.001),
    allTextDown: zoneAt(BOX.allText, KEY_DOWN + CAP_D / 2 + 0.001),
    autoText: zoneAt(BOX.autoText, KEY_UP + CAP_D / 2 + 0.001),
    autoTextDown: zoneAt(BOX.autoText, KEY_DOWN + CAP_D / 2 + 0.001),
    allHit: zoneAt(BOX.key, KEY_UP + CAP_D / 2 + 0.001),
    autoHit: zoneAt(BOX.auto, KEY_UP + CAP_D / 2 + 0.001),
    reloadIcon: zoneAt(BOX.reloadIcon, KEY_UP + CAP_D / 2 + 0.001),
    reloadIconDown: zoneAt(BOX.reloadIcon, KEY_DOWN + CAP_D / 2 + 0.001),
    holdIcon: zoneAt(BOX.holdIcon, KEY_UP + CAP_D / 2 + 0.001),
    holdIconDown: zoneAt(BOX.holdIcon, KEY_DOWN + CAP_D / 2 + 0.001),
    reloadHit: zoneAt(BOX.reload, KEY_UP + CAP_D / 2 + 0.001),
    holdHit: zoneAt(BOX.hold, KEY_UP + CAP_D / 2 + 0.001),
    ...Object.fromEntries(SLOTS.map((b, i) => [`slot${i}`, slotZone(b)])),
  },
  sprites: {
    key: { crop: keyCrop(BOX.key), frames: ['key-up', 'key-down'] },
    reload: { crop: keyCrop(BOX.reload), frames: ['reload-up', 'reload-down'] },
    hold: { crop: keyCrop(BOX.hold), frames: ['hold-up', 'hold-down'] },
    ...Object.fromEntries(SLOT_SPAN.map((b, i) => [`slot${i}`, { crop: slotCrop(b), frames: [`slot${i}`] }])),
    auto: { crop: keyCrop(BOX.auto), frames: ['auto-up', 'auto-down', 'auto-lit-up', 'auto-lit-down'] },
  },
  kScale: K,
};

installBake((scale) => {
  const files = {};
  const shootKey = (k, sprite, name, z) => {
    k.press(z);
    view.render(scale); files[name] = view.crop(scale, meta.sprites[sprite].crop);
    k.press(KEY_UP);
  };
  for (const k of [allKey, reloadKey, holdKey, autoKey]) k.press(KEY_UP);
  for (const i of SLOTS.keys()) {
    showSlots([i]); view.render(scale);
    files[`slot${i}`] = view.crop(scale, meta.sprites[`slot${i}`].crop);
  }
  showSlots([]);
  view.render(scale);
  files.housing = view.shot();
  shootKey(allKey, 'key', 'key-up', KEY_UP); shootKey(allKey, 'key', 'key-down', KEY_DOWN);
  shootKey(reloadKey, 'reload', 'reload-up', KEY_UP); shootKey(reloadKey, 'reload', 'reload-down', KEY_DOWN);
  shootKey(holdKey, 'hold', 'hold-up', KEY_UP); shootKey(holdKey, 'hold', 'hold-down', KEY_DOWN);
  shootKey(autoKey, 'auto', 'auto-up', KEY_UP); shootKey(autoKey, 'auto', 'auto-down', KEY_DOWN);
  autoKey.light(true);
  shootKey(autoKey, 'auto', 'auto-lit-up', KEY_UP); shootKey(autoKey, 'auto', 'auto-lit-down', KEY_DOWN);
  autoKey.light(false);
  return { files, meta };
});
