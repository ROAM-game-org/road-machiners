import * as THREE from 'three';
import { Panel, shade, toon, ink } from '../kit.js';
import { mottle } from './olive.js';
import { PPU, plateSpace, makeStage, frame, finishPanels, installBake, eyeFor } from '../core.js';

const K = 3.2;
const FACE_CSS = [360.7, 554.9, 760.7, 704];
const P = (cx, cy) => [(cx - FACE_CSS[0]) * K, (cy - FACE_CSS[1]) * K];
const R = (x0, y0, x1, y1) => [...P(x0, y0), ...P(x1, y1)];
const S = plateSpace(Math.round((FACE_CSS[2] - FACE_CSS[0]) * K), (FACE_CSS[3] - FACE_CSS[1]) * K);

const BOX = {
  body: R(362, 556, 759.3, 658.8),
  lower: R(386, 640, 745.2, 703),
  screen: R(384, 569.5, 686.5, 648.5),
  key: R(708, 566.5, 746.5, 604.5),
  rocker: R(725.5, 611, 747.5, 650),
  allText: R(710.3, 567.5, 744.2, 596.5),
  autoText: R(701, 622.5, 723.3, 644.5),
};
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
  const nx = (cssX) => x0 + (cssX - 362) * K / PPU;
  const ny = (cssY) => y1 - (cssY - 556) * K / PPU;
  const shape = new THREE.Shape();
  shape.moveTo(x0, y0); shape.lineTo(x1, y0); shape.lineTo(x1, y1); shape.lineTo(x0, y1);
  shape.lineTo(x0, ny(609)); shape.lineTo(nx(364.8), ny(610)); shape.lineTo(nx(369.6), ny(612.5)); shape.lineTo(nx(369.6), ny(629.5)); shape.lineTo(nx(365.5), ny(634)); shape.lineTo(x0, ny(634.5));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: BODY_D - 2 * BEVEL_T, bevelEnabled: true, bevelThickness: BEVEL_T, bevelSize: BEVEL, bevelOffset: 0, bevelSegments: 3, curveSegments: 4 });
  geo.translate(0, 0, -BODY_D / 2 + BEVEL_T);
  body.body.geometry = geo;
  bodyShape = shape;
  body.body.remove(...body.body.children);
  ink(body.body);
  const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.02, ny(612) - ny(632), 0.05), toon('#a58e66'));
  hinge.position.set(nx(367.5), (ny(612) + ny(632)) / 2, -0.02); hinge.castShadow = true; hinge.receiveShadow = true;
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
const keyBox = inBody(adj(BOX.key, KEY_TOP_Z));
body.paint('base', (c) => {
  const [X0, Y0, X1, Y1] = cv(BOX.key, BOX.body);
  c.fillStyle = '#2b1f12'; c.beginPath(); c.roundRect(X0 - 1.5, Y0 - 1.5, X1 - X0 + 3, Y1 - Y0 + 3, 8); c.fill();
});

const HUD_FONT = new FontFace('Routed Gothic Narrow', 'url(/game/src/ui/fonts/routed-gothic-narrow.woff2)');
document.fonts.add(await HUD_FONT.load());
const PRINT = '#241c14', ENGRAVE = 'rgba(255,240,205,.22)';
const printMesh = (box, word) => {
  const DENSITY = 20 / K, cv = document.createElement('canvas');
  cv.width = Math.round((box[2] - box[0]) * DENSITY); cv.height = Math.round((box[3] - box[1]) * DENSITY);
  const c = cv.getContext('2d'); c.scale(DENSITY, DENSITY);
  const size = 6.5 * K, mx = (box[2] - box[0]) / 2, my = (box[3] - box[1]) / 2;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `400 ${size}px "Routed Gothic Narrow"`; c.letterSpacing = `${0.3 * K}px`;
  c.fillStyle = ENGRAVE; c.fillText(word, mx, my + 1.2);
  c.fillStyle = PRINT; c.fillText(word, mx, my);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const [x, y, w, h] = inBody(adj(box, FRONT_Z + 0.001));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  body.add(m, x, y, 0.004);
};
{
  const [X0, Y0, X1, Y1] = BOX.rocker, size = 6.5 * K, W = X1 - X0;
  for (const [word, y] of [['ON', Y0 + size * 1.5], ['OFF', Y1 + size * 0.15]]) printMesh([X0 + W / 2 - 4 * size, y - size, X0 + W / 2 + 4 * size, y + size], word);
}

const key = new THREE.Group();
const KEY_LOOK = { on: { skirt: '#6a120a', shoulder: '#b8382a', top: '#9a1a0e' }, off: { skirt: '#684328', shoulder: '#8e5c36', top: '#6b4023' } };
const GAIN = 1.12;
const litToon = (c) => { const m = toon(c); m.color.multiplyScalar(GAIN); return m; };
const keyMats = Object.fromEntries(Object.entries(KEY_LOOK).map(([k, v]) => [k, { skirt: litToon(v.skirt), shoulder: litToon(v.shoulder), top: litToon(v.top) }]));
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
let keyParts;
{
  const [, , kw, kh] = keyBox, z0 = -CAP_D / 2;
  const base = keyLevel(kw, kh, 0, 0, 0, 0, 4), mid = keyLevel(kw, kh, 1.2, 0.6, 1.2, 6.1, 3.4), topS = keyLevel(kw, kh, 2.2, 1.5, 2.2, 6.9, 2.8);
  const skirt = loftLocal(base, z0, mid, z0 + KEYCAP_H - 0.012 * 0.8, keyMats.on.skirt);
  const shoulder = loftLocal(mid, z0 + KEYCAP_H - 0.012 * 0.8, topS, z0 + KEYCAP_H, keyMats.on.shoulder);
  const topGeo = new THREE.ShapeGeometry(topS, 12); topGeo.translate(0, 0, z0 + KEYCAP_H);
  const top = new THREE.Mesh(topGeo, keyMats.on.top); top.castShadow = true; top.receiveShadow = true;
  key.add(skirt, shoulder, top);
  keyParts = { skirt, shoulder, top };
}
const setKeyLook = (on) => { const m = keyMats[on ? 'on' : 'off']; keyParts.skirt.material = m.skirt; keyParts.shoulder.material = m.shoulder; keyParts.top.material = m.top; };
body.add(key, keyBox[0], keyBox[1], 0);
{
  const [wx, wy, ww, wh] = inBody(adj(BOX.key, FRONT_Z + 0.01));
  const rr = (sh, x0, y0, x1, y1, r) => { sh.moveTo(x0 + r, y0); sh.lineTo(x1 - r, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + r); sh.lineTo(x1, y1 - r); sh.quadraticCurveTo(x1, y1, x1 - r, y1); sh.lineTo(x0 + r, y1); sh.quadraticCurveTo(x0, y1, x0, y1 - r); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0); };
  const out = 1.8 * CSS, inn = 0.5 * CSS;
  const shape = new THREE.Shape(); rr(shape, -ww / 2 - out, -wh / 2 - out, ww / 2 + out, wh / 2 + out, 0.03);
  const hole = new THREE.Path(); rr(hole, -ww / 2 - inn, -wh / 2 - inn, ww / 2 + inn, wh / 2 + inn, 0.02); shape.holes.push(hole);
  const lip = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 10 }), toon(LOOK.housing));
  lip.castShadow = true; lip.receiveShadow = true;
  body.add(lip, wx, wy, 0);
}

const rocker = new THREE.Group();
const leverPivot = new THREE.Group();
const brass = toon(LOOK.brass);
const brassDark = toon(LOOK.brassEdge);
{
  const ringProfile = [[0.042, 0], [0.042, 0.012], [0.05, 0.024], [0.074, 0.026], [0.084, 0.018], [0.086, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  const ring = new THREE.Mesh(new THREE.LatheGeometry(ringProfile, 48), toon(LOOK.brass, { side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.042, 32), new THREE.MeshBasicMaterial({ color: '#4a3a24' }));
  hole.position.z = 0.001;
  const STEM_R = 0.026, STEM_L = 0.13, FLUTES = 18;
  const stemGeo = new THREE.CylinderGeometry(STEM_R, STEM_R * 0.92, STEM_L, FLUTES * 4, 1);
  const pos = stemGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const ang = Math.atan2(z, x), groove = 0.88 + 0.12 * Math.abs(Math.cos(ang * FLUTES / 2));
    pos.setX(i, x * groove); pos.setZ(i, z * groove);
  }
  stemGeo.computeVertexNormals();
  const stem = new THREE.Mesh(stemGeo, brass);
  stem.position.y = STEM_L / 2;
  const capGeo = new THREE.CylinderGeometry(STEM_R * 0.78, STEM_R * 0.95, 0.018, 32);
  const cap = new THREE.Mesh(capGeo, brass);
  cap.position.y = STEM_L + 0.009;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 16), brassDark);
  neck.position.y = -0.005;
  leverPivot.add(neck, stem, cap); leverPivot.position.z = 0.012;
  for (const m of [ring, stem, cap, neck]) { m.castShadow = true; m.receiveShadow = true; }
  rocker.add(hole, ring, leverPivot);
}
const rockerBox = inBody(adj(BOX.rocker, FRONT_Z + 0.05));
body.add(rocker, rockerBox[0], rockerBox[1], 0);
rocker.scale.setScalar(1.45);
rocker.position.y -= 5.5 * K / PPU;

const LAMP_BOX = R(733.5, 608.5, 739.5, 614.5);
const lamp = new THREE.Group();
const lampLens = { on: new THREE.MeshBasicMaterial({ color: '#ffc867', toneMapped: false }), off: toon('#4a2c0a') };
let lampDome, lampHalo;
{
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.009, 10, 32), brass);
  ring.position.z = 0.006;
  lampDome = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lampLens.on);
  lampDome.rotation.x = Math.PI / 2; lampDome.scale.set(1, 0.6, 1);
  const halo = document.createElement('canvas'); halo.width = halo.height = 128;
  const hc = halo.getContext('2d'), hg = hc.createRadialGradient(64, 64, 8, 64, 64, 64);
  hg.addColorStop(0, 'rgba(255,170,60,.8)'); hg.addColorStop(1, 'rgba(255,140,30,0)');
  hc.fillStyle = hg; hc.fillRect(0, 0, 128, 128);
  const ht = new THREE.CanvasTexture(halo); ht.colorSpace = THREE.SRGBColorSpace;
  lampHalo = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ map: ht, transparent: true, depthWrite: false, toneMapped: false }));
  lampHalo.position.z = 0.002;
  ring.castShadow = true;
  lamp.add(lampHalo, ring, lampDome);
}
const lampBox = inBody(adj(LAMP_BOX, FRONT_Z + 0.02));
body.add(lamp, lampBox[0], lampBox[1], 0);
lamp.scale.setScalar(1.05);
const setLamp = (on) => { lampDome.material = lampLens[on ? 'on' : 'off']; lampHalo.visible = on; };

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
const meta = {
  width: view.IW, height: view.IH,
  face: view.quad(body, ...faceLocal, 0),
  zones: {
    screen: zoneAt(BOX.screen, 0.004),
    allText: zoneAt(BOX.allText, KEY_UP + CAP_D / 2 + 0.001),
    allTextDown: zoneAt(BOX.allText, KEY_DOWN + CAP_D / 2 + 0.001),
    autoText: zoneAt(BOX.autoText, 0.004),
    allHit: zoneAt(BOX.key, KEY_UP + CAP_D / 2 + 0.001),
    autoHit: zoneAt(BOX.rocker, 0.1),
  },
  sprites: {
    key: { crop: view.cropAround(view.quad(body, ...inBody(adj(BOX.key, FRONT_Z + 0.1)), 0.1), 6), frames: ['key-on-up', 'key-on-down', 'key-off-up', 'key-off-down'] },
    lamp: { crop: view.cropAround(view.quad(body, ...inBody(adj(LAMP_BOX, FRONT_Z + 0.02)), 0.02), 10), frames: ['lamp-off', 'lamp-on'] },
    rocker: { crop: ((c) => [Math.max(0, c[0] - 14), c[1], Math.min(view.IW, c[2] + 14), Math.min(view.IH, c[3] + 34)])(view.cropAround(view.quad(body, ...inBody(adj(BOX.rocker, FRONT_Z + 0.1)), 0.1), 6)), frames: ['rocker-off', 'rocker-on'] },
  },
  kScale: K,
};

installBake((scale) => {
  const files = {};
  const setRocker = (on) => { leverPivot.rotation.x = Math.PI / 2 + (on ? -1.2 : 0.15); };
  const shootKey = (name, on, z) => {
    setKeyLook(on); key.position.z = body.z + z;
    view.render(scale); files[name] = view.crop(scale, meta.sprites.key.crop);
  };
  setRocker(true); setLamp(true);
  setKeyLook(true); key.position.z = body.z + KEY_UP;
  view.render(scale);
  files.housing = view.shot();
  files['lamp-on'] = view.crop(scale, meta.sprites.lamp.crop);
  setLamp(false); view.render(scale);
  files['lamp-off'] = view.crop(scale, meta.sprites.lamp.crop);
  setLamp(true);
  lamp.visible = false; view.render(scale);
  files['rocker-on'] = view.crop(scale, meta.sprites.rocker.crop);
  setRocker(false); view.render(scale);
  files['rocker-off'] = view.crop(scale, meta.sprites.rocker.crop);
  lamp.visible = true;
  setRocker(true);
  shootKey('key-on-up', true, KEY_UP); shootKey('key-on-down', true, KEY_DOWN);
  shootKey('key-off-up', false, KEY_UP); shootKey('key-off-down', false, KEY_DOWN);
  setKeyLook(true); key.position.z = body.z + KEY_UP;
  return { files, meta };
});
