import * as THREE from 'three';
import { toon } from '../kit.js';
import { PPU, plateSpace, makeStage, frame, vanishFor } from '../core.js';

export const K = 4;
export const GAIN = 1.2;
export const EYE_Z = 40;

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export class Plate {
  constructor(ox, oy, cw, ch, zE = null, k = K) {
    this.ox = ox; this.oy = oy; this.cw = cw; this.ch = ch; this.zE = zE; this.z = 0; this.k = k;
    this.vp = vanishFor([ox, oy, ox + cw, oy + ch]);
    this.S = plateSpace(cw * k, ch * k);
    this.g = new THREE.Group();
  }
  at(z) { const l = Object.create(this); l.z = z; return l; }
  depthScale() { return this.zE ? (this.zE - this.z) / this.zE : 1; }
  mx(x) { return this.zE ? this.vp.x + (x - this.vp.x) * this.depthScale() : x; }
  my(y) { return this.zE ? this.vp.y + (y - this.vp.y) * this.depthScale() : y; }
  ux(x) { return this.S.ux((this.mx(x) - this.ox) * this.k); }
  uy(y) { return this.S.uy((this.my(y) - this.oy) * this.k); }
  len(v) { return v * this.k / PPU * this.depthScale(); }
  eye() { const l = this.at(0); return { x: l.ux(this.vp.x), y: l.uy(this.vp.y), z: this.zE ?? EYE_Z * this.k / K }; }
  rect([x0, y0, x1, y1]) { return { cx: this.ux((x0 + x1) / 2), cy: this.uy((y0 + y1) / 2), w: this.len(x1 - x0), h: this.len(y1 - y0) }; }
  shape([x0, y0, x1, y1], radii = [0, 0, 0, 0]) {
    return rrShape(this.ux(x0), this.uy(y1), this.ux(x1), this.uy(y0), radii.map((r) => this.len(r)));
  }
  quad(view, box, z = this.z) { const l = this.at(z), r = l.rect(box); return view.quad({ g: this.g, z: 0 }, r.cx, r.cy, r.w, r.h, z); }
  size(box) { return [+((box[2] - box[0]) * this.k).toFixed(2), +((box[3] - box[1]) * this.k).toFixed(2)]; }
  textureOf(canvas, box) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const r = this.rect(box);
    tex.repeat.set(1 / r.w, 1 / r.h);
    tex.offset.set(-(r.cx - r.w / 2) / r.w, -(r.cy - r.h / 2) / r.h);
    return tex;
  }
  canvas(box) {
    const cv = document.createElement('canvas');
    cv.width = Math.round((box[2] - box[0]) * this.k); cv.height = Math.round((box[3] - box[1]) * this.k);
    const c = cv.getContext('2d');
    c.setTransform(this.k, 0, 0, this.k, -box[0] * this.k, -box[1] * this.k);
    return { cv, c };
  }
  poly(pts, r) {
    const q = pts.map(([x, y]) => new THREE.Vector2(this.ux(x), this.uy(y))), n = q.length, rr = this.len(r), s = new THREE.Shape();
    for (let i = 0; i < n; i++) {
      const p0 = q[(i + n - 1) % n], p1 = q[i], p2 = q[(i + 1) % n];
      const a = p1.clone().sub(p0).normalize(), b = p2.clone().sub(p1).normalize();
      const start = p1.clone().sub(a.multiplyScalar(rr)), end = p1.clone().add(b.multiplyScalar(rr));
      if (i === 0) s.moveTo(start.x, start.y); else s.lineTo(start.x, start.y);
      s.quadraticCurveTo(p1.x, p1.y, end.x, end.y);
    }
    s.closePath();
    return s;
  }
  disc(cx, cy, r) { const s = new THREE.Shape(); s.absarc(this.ux(cx), this.uy(cy), this.len(r), 0, Math.PI * 2, false); return s; }
}

export function insetPoly(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n]; area += x1 * y2 - x2 * y1; }
  const sign = area > 0 ? 1 : -1;
  const lines = pts.map(([x1, y1], i) => {
    const [x2, y2] = pts[(i + 1) % n], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    const nx = -dy / len * sign, ny = dx / len * sign;
    return { x: x1 + nx * d, y: y1 + ny * d, dx, dy };
  });
  return pts.map((_, i) => {
    const a = lines[(i + n - 1) % n], b = lines[i];
    const det = a.dx * b.dy - a.dy * b.dx;
    const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / det;
    return [a.x + a.dx * t, a.y + a.dy * t];
  });
}

export function rrShape(x0, y0, x1, y1, [tl, tr, br, bl] = [0, 0, 0, 0]) {
  const s = new THREE.Shape();
  s.moveTo(x0 + bl, y0);
  s.lineTo(x1 - br, y0); if (br) s.absarc(x1 - br, y0 + br, br, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - tr); if (tr) s.absarc(x1 - tr, y1 - tr, tr, 0, Math.PI / 2, false);
  s.lineTo(x0 + tl, y1); if (tl) s.absarc(x0 + tl, y1 - tl, tl, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + bl); if (bl) s.absarc(x0 + bl, y0 + bl, bl, Math.PI, 1.5 * Math.PI, false);
  return s;
}

export function lit(color, o = {}) {
  const m = toon(color, o);
  m.color.multiplyScalar(GAIN);
  return m;
}

export function litMap(tex) {
  const m = toon('#ffffff', { map: tex });
  m.color.setScalar(GAIN);
  return m;
}

const EXTRUDE = { front: 0, depth: 0.1, bevel: 0, seg: 4 };

export function extrude(shape, opts) {
  const { front, depth, bevel, seg, caps, sides } = { ...EXTRUDE, ...opts };
  const bt = opts.bt ?? bevel, bevelled = bevel > 0;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevelled, bevelSize: bevel, bevelThickness: bt, bevelSegments: seg, curveSegments: 72, steps: 1 });
  geo.translate(0, 0, front - depth - (bevelled ? bt : 0));
  const m = new THREE.Mesh(geo, [caps, sides ?? caps]);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function ring(plate, outerBox, innerBox, { rOuter, rInner, front = 0, depth = 0.03, color, bevel = 0.006 }) {
  const shape = plate.shape(outerBox, rOuter);
  shape.holes.push(plate.shape(innerBox, rInner));
  return extrude(shape, { front, depth, bevel, bt: bevel, caps: lit(color), seg: 2 });
}

export function glassMesh(plate, box, { r = 4, z, paint, shape }) {
  const { cv, c } = plate.canvas(box);
  paint(c, box);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const rect = plate.rect(box);
  const geo = new THREE.ShapeGeometry(shape ?? rrShape(rect.cx - rect.w / 2, rect.cy - rect.h / 2, rect.cx + rect.w / 2, rect.cy + rect.h / 2, [r, r, r, r].map((v) => plate.len(v))), 24);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - rect.cx) / rect.w + 0.5, (p.getY(i) - rect.cy) / rect.h + 0.5);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  m.position.z = z;
  return m;
}

export function roundPath(c, x0, y0, x1, y1, [tl, tr, br, bl]) {
  c.beginPath();
  c.moveTo(x0 + tl, y0);
  c.lineTo(x1 - tr, y0); c.arcTo(x1, y0, x1, y0 + tr, tr);
  c.lineTo(x1, y1 - br); c.arcTo(x1, y1, x1 - br, y1, br);
  c.lineTo(x0 + bl, y1); c.arcTo(x0, y1, x0, y1 - bl, bl);
  c.lineTo(x0, y0 + tl); c.arcTo(x0, y0, x0 + tl, y0, tl);
  c.closePath();
}

export function grain(c, [x0, y0, x1, y1], seed, amount = 5) {
  const r = rng(seed), cell = 0.6, w = Math.ceil((x1 - x0) / cell), h = Math.ceil((y1 - y0) / cell);
  const n = document.createElement('canvas'); n.width = w; n.height = h;
  const nc = n.getContext('2d'), img = nc.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = 128 + (r() - 0.5) * amount * 2; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  nc.putImageData(img, 0, 0);
  c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.55; c.imageSmoothingEnabled = true;
  c.drawImage(n, x0, y0, x1 - x0, y1 - y0);
  c.restore();
}

function glow(c, r, [x0, y0, w, h], base, spread, color) {
  const x = x0 + r() * w, y = y0 + r() * h, rad = base + r() * spread, g = c.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, `rgba(${color})`); g.addColorStop(1, `rgba(${color.replace(/,[^,]*$/, ',0')})`);
  c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

function crease(c, r, [x0, y0, w, h]) {
  const x = x0 + r() * w, y = y0 + r() * h, len = 5 + r() * 14, a = (r() - 0.5) * 1.6;
  c.strokeStyle = 'rgba(20,6,0,0.32)'; c.beginPath(); c.moveTo(x, y);
  c.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 3, y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 3, x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke();
  c.strokeStyle = 'rgba(255,190,140,0.08)'; c.beginPath(); c.moveTo(x, y + 0.6); c.lineTo(x + Math.cos(a) * len * 0.9, y + 0.6 + Math.sin(a) * len * 0.9); c.stroke();
}

const WEAR = { stains: 3, creases: 8, rubs: 2 };

export function wear(c, [x0, y0, x1, y1], seed, opts) {
  const { stains, creases, rubs } = { ...WEAR, ...opts };
  const r = rng(seed), area = [x0, y0, x1 - x0, y1 - y0];
  c.save();
  for (let i = 0; i < stains; i++) glow(c, r, area, 10, 22, '25,8,0,0.10');
  for (let i = 0; i < rubs; i++) glow(c, r, area, 8, 16, '255,190,140,0.07');
  c.lineCap = 'round'; c.lineWidth = 0.45;
  for (let i = 0; i < creases; i++) crease(c, r, area);
  c.restore();
}

const STITCH = { color: '#e6cfa6', alpha: 0.6, shadow: '#1c0a03', width: 1, dash: 5, gap: 3 };

export function stitch(c, drawPath, opts) {
  const { color, alpha, shadow, width, dash, gap } = { ...STITCH, ...opts };
  c.save(); c.lineCap = 'butt'; c.setLineDash([dash, gap]);
  c.translate(0, 0.45); c.strokeStyle = shadow; c.globalAlpha = alpha * 0.5; c.lineWidth = width; drawPath(c); c.stroke();
  c.translate(0, -0.45); c.strokeStyle = color; c.globalAlpha = alpha; drawPath(c); c.stroke();
  c.restore();
}

function arcLengths(cssPts) {
  const lens = [0];
  for (let i = 1; i < cssPts.length; i++) lens.push(lens[i - 1] + Math.hypot(cssPts[i][0] - cssPts[i - 1][0], cssPts[i][1] - cssPts[i - 1][1]));
  return lens;
}

function rollRing(out, pts, i, R, segs, u) {
  const n = pts.length;
  const t = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
  const nd = new THREE.Vector2(-t.y, t.x);
  for (let j = 0; j <= segs; j++) {
    const a = j / segs * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a);
    out.pos.push(pts[i].x + R * cx * nd.x, pts[i].y + R * cx * nd.y, R * sz);
    out.nor.push(cx * nd.x, cx * nd.y, sz);
    out.uv.push(u, j / segs);
  }
}

function rollIndex(n, segs) {
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return idx;
}

export function rollGeometry(plate, cssPts, radiusCss, opts) {
  const segs = opts?.segs ?? 10;
  const pts = cssPts.map(([x, y]) => new THREE.Vector2(plate.ux(x), plate.uy(y)));
  const lens = arcLengths(cssPts), total = lens[lens.length - 1], R = plate.len(radiusCss);
  const out = { pos: [], nor: [], uv: [] };
  for (let i = 0; i < pts.length; i++) rollRing(out, pts, i, R, segs, lens[i] / total);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  geo.setIndex(rollIndex(pts.length, segs));
  return { geo, lens, total };
}

export function rrPoints(plate, [x0, y0, x1, y1], [tl, tr, br, bl], seg) {
  const X0 = plate.ux(x0), X1 = plate.ux(x1), Y1 = plate.uy(y0), Y0 = plate.uy(y1);
  const out = [];
  const corner = (cx, cy, r, a0) => { for (let i = 0; i <= seg; i++) { const a = a0 + i / seg * Math.PI / 2; out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } };
  const [rtl, rtr, rbr, rbl] = [tl, tr, br, bl].map((v) => plate.len(v));
  corner(X1 - rbr, Y0 + rbr, rbr, -Math.PI / 2);
  corner(X1 - rtr, Y1 - rtr, rtr, 0);
  corner(X0 + rtl, Y1 - rtl, rtl, Math.PI / 2);
  corner(X0 + rbl, Y0 + rbl, rbl, Math.PI);
  return out;
}

export function loft(plate, a, b, mat, divisions = 6) {
  const pa = rrPoints(plate, a.box, a.r, divisions), pb = rrPoints(plate, b.box, b.r, divisions);
  const n = pa.length, pos = [], idx = [];
  for (const [ring, z] of [[pa, a.z], [pb, b.z]]) for (const p of ring) pos.push(p.x, p.y, z);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, j, n + j, i, n + j, n + i); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function cap(plate, box, r, z, mat) {
  const geo = new THREE.ShapeGeometry(plate.shape(box, r), 12);
  geo.translate(0, 0, z);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function shadowCatcher(box3, z, opacity = 0.3) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(box3.w, box3.h), new THREE.ShadowMaterial({ opacity }));
  m.position.set(box3.cx, box3.cy, z); m.receiveShadow = true;
  return m;
}

export { THREE, PPU, makeStage, frame };
