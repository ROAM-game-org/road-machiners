import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, inkAt } from '../kit.js';

export const OLIVE = { housing: '#8d7b5b', edge: '#918466', brass: '#a38052', hole: '#24180d', floor: '#1c130b', print: '#e4d1a5' };
export const KEYCAP = { skirt: '#684328', shoulder: '#8e5c36', top: '#6b4023' };
const GAIN = 1.12;
export const litToon = (c, o) => { const m = toon(c, o); m.color.multiplyScalar(GAIN); return m; };

const seeded = (seed) => {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

const HATCH = { angle: -0.95, len: [5, 10], gap: 2.6, lines: [2, 3], width: 0.8, ink: 'rgba(43,32,20,0.16)', cell: 38 };

function hatchLine(c, x, y, len) {
  const dx = Math.cos(HATCH.angle) * len, dy = Math.sin(HATCH.angle) * len;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx, y + dy); c.stroke();
}

function hatch(c, rnd, cx, cy) {
  const n = HATCH.lines[0] + Math.floor(rnd() * (HATCH.lines[1] - HATCH.lines[0] + 1));
  const nx = -Math.sin(HATCH.angle), ny = Math.cos(HATCH.angle), ux = Math.cos(HATCH.angle), uy = Math.sin(HATCH.angle);
  for (let i = 0; i < n; i++) {
    const len = HATCH.len[0] + rnd() * (HATCH.len[1] - HATCH.len[0]), shift = (rnd() - 0.5) * HATCH.gap;
    hatchLine(c, cx + nx * i * HATCH.gap + ux * shift, cy + ny * i * HATCH.gap + uy * shift, len);
  }
}

const MOTTLE = { strength: 1, clip: true };

function marks(c, rnd, [x, y, w, h], { strength }) {
  c.lineCap = 'round'; c.lineWidth = HATCH.width; c.strokeStyle = HATCH.ink;
  const cols = Math.max(1, Math.round(w / HATCH.cell * Math.sqrt(strength))), rows = Math.max(1, Math.round(h / HATCH.cell * Math.sqrt(strength)));
  const cw = w / cols, ch = h / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) hatch(c, rnd, x + (i + 0.15 + rnd() * 0.7) * cw, y + (j + 0.15 + rnd() * 0.7) * ch);
}

export const mottle = (c, x, y, w, h, seed, options) => {
  const o = { ...MOTTLE, ...options };
  c.save();
  if (o.clip) { c.beginPath(); c.rect(x, y, w, h); c.clip(); }
  marks(c, seeded(seed), [x, y, w, h], o);
  c.restore();
};

export function mottleTile(w, h, res, seed, strength) {
  const cv = document.createElement('canvas'); cv.width = Math.round(w * res); cv.height = Math.round(h * res);
  const c = cv.getContext('2d');
  c.scale(res, res);
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
    c.save(); c.translate(dx, dy); mottle(c, 0, 0, w, h, seed, { strength, clip: false }); c.restore();
  }
  return cv;
}

export const rrShape = (x0, y0, x1, y1, r, Ctor = THREE.Shape) => {
  const s = new Ctor();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
};

const loft = (sa, za, sb, zb, mat) => {
  const pa = sa.getPoints(6), pb = sb.getPoints(6), n = Math.min(pa.length, pb.length), pos = [], idx = [];
  for (const [ring, z] of [[pa, za], [pb, zb]]) for (let i = 0; i < n; i++) pos.push(ring[i].x, ring[i].y, z);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, j, n + j, i, n + j, n + i); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
};

export function keycap(w, h, css, height, colors = KEYCAP) {
  const lvl = (l, t, r, b, rad) => rrShape(-w / 2 + l * css, -h / 2 + b * css, w / 2 - r * css, h / 2 - t * css, rad * css);
  const base = lvl(0, 0, 0, 0, 4), mid = lvl(1.2, 0.6, 1.2, 6.1, 3.4), top = lvl(2.2, 1.5, 2.2, 6.9, 2.8);
  const g = new THREE.Group();
  const shoulderZ = height - 0.6 * css;
  g.add(loft(base, 0, mid, shoulderZ, litToon(colors.skirt)));
  g.add(loft(mid, shoulderZ, top, height, litToon(colors.shoulder)));
  const capGeo = new THREE.ShapeGeometry(top, 12); capGeo.translate(0, 0, height);
  const capMesh = new THREE.Mesh(capGeo, litToon(colors.top)); capMesh.castShadow = true; capMesh.receiveShadow = true;
  g.add(capMesh);
  const topBox = { x0: -w / 2 + 2.2 * css, x1: w / 2 - 2.2 * css, y0: -h / 2 + 6.9 * css, y1: h / 2 - 1.5 * css };
  return { group: g, topBox };
}

const SLAB_INK = 0.007;

export function slab({ w, h, depth, bevel, holes = [], faceMat }) {
  const outline = rrShape(-w / 2 + bevel, -h / 2 + bevel, w / 2 - bevel, h / 2 - bevel, bevel * 0.8);
  const shape = rrShape(-w / 2 + bevel, -h / 2 + bevel, w / 2 - bevel, h / 2 - bevel, bevel * 0.8);
  for (const [cx, cy, hw, hh, r] of holes) shape.holes.push(rrShape(cx - hw / 2 - bevel, cy - hh / 2 - bevel, cx + hw / 2 + bevel, cy + hh / 2 + bevel, r + bevel, THREE.Path));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2 + bevel);
  const sides = litToon(OLIVE.edge);
  const mesh = new THREE.Mesh(geo, [sides, sides]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  inkAt(mesh, SLAB_INK);
  const faceShape = rrShape(-w / 2 + bevel, -h / 2 + bevel, w / 2 - bevel, h / 2 - bevel, bevel * 0.8);
  for (const [cx, cy, hw, hh, r] of holes) faceShape.holes.push(rrShape(cx - hw / 2, cy - hh / 2, cx + hw / 2, cy + hh / 2, r, THREE.Path));
  const fgeo = new THREE.ShapeGeometry(faceShape, 8);
  const fp = fgeo.attributes.position, uv = fgeo.attributes.uv;
  for (let i = 0; i < fp.count; i++) uv.setXY(i, fp.getX(i) / w + 0.5, fp.getY(i) / h + 0.5);
  const face = new THREE.Mesh(fgeo, faceMat);
  face.position.z = depth / 2 + 0.0005; face.receiveShadow = true;
  const floors = holes.map(([cx, cy, hw, hh, r]) => {
    const f = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(cx - hw / 2, cy - hh / 2, cx + hw / 2, cy + hh / 2, r)), litToon(OLIVE.floor));
    f.position.z = -depth / 2 + 0.004; f.receiveShadow = true; return f;
  });
  void outline;
  return { mesh, face, floors };
}

export function faceMaterial(wPx, hPx, paint) {
  const cv = document.createElement('canvas'); cv.width = Math.round(wPx); cv.height = Math.round(hPx);
  const c = cv.getContext('2d');
  paint(c, cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return litToon('#ffffff', { map: tex });
}

export function brassLip(add, sx, sy, sw, sh, t, z) {
  const lip = toon(OLIVE.brass);
  const bars = [[sx, sy + sh / 2 + t / 2, sw + 2 * t, t], [sx, sy - sh / 2 - t / 2, sw + 2 * t, t], [sx - sw / 2 - t / 2, sy, t, sh], [sx + sw / 2 + t / 2, sy, t, sh]];
  for (const [x, y, w, h] of bars) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, z * 2), lip);
    bar.castShadow = true; bar.receiveShadow = true; add(bar, x, y);
  }
}

export function crossMark(group, size, css, z) {
  const mat = toon(OLIVE.print);
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new THREE.Mesh(new RoundedBoxGeometry(size, 1.3 * css, 0.006, 2, 0.002), mat);
    bar.rotation.z = a; bar.position.z = z; group.add(bar);
  }
}
