import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PPU = 200;
const INK = '#1b181a';

const scratch = new THREE.Color();
export function shade(hex, l, s = 0) { scratch.set(hex).offsetHSL(0, s, l); return `#${scratch.getHexString()}`; }

const grad = (() => {
  const t = new THREE.DataTexture(new Uint8Array([34, 34, 34, 200, 255]), 5, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
export const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...o });
const outlineMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, uniforms: { t: { value: 0.017 } },
  vertexShader: 'uniform float t; void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position+normalize(normal)*t,1.); }',
  fragmentShader: 'void main(){ gl_FragColor=vec4(.105,.094,.102,1.); }',
});
export function ink(m) { m.add(new THREE.Mesh(m.geometry, outlineMat)); return m; }
const asMat = (c) => (c?.isMaterial ? c : toon(c));
const finishMesh = (m, o) => { m.castShadow = !o.noShadow; m.receiveShadow = true; if (!o.noInk) ink(m); return m; };

export function box(w, h, d, color, r = 0.04, o = {}) {
  const radius = Math.max(0.004, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002));
  return finishMesh(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), asMat(color)), o);
}
export function cyl(r, d, color, o = {}) {
  const g = new THREE.CylinderGeometry(o.r2 ?? r, r, d, o.seg ?? 32); g.rotateX(Math.PI / 2);
  return finishMesh(new THREE.Mesh(g, asMat(color)), { ...o, noShadow: false });
}

function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2, k = Math.min(r, w / 2, h / 2);
  s.moveTo(x + k, y); s.lineTo(x + w - k, y); s.quadraticCurveTo(x + w, y, x + w, y + k);
  s.lineTo(x + w, y + h - k); s.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  s.lineTo(x + k, y + h); s.quadraticCurveTo(x, y + h, x, y + h - k); s.lineTo(x, y + k); s.quadraticCurveTo(x, y, x + k, y);
  return s;
}
function facePlane(w, h, r, mat) {
  const g = new THREE.ShapeGeometry(roundRect(w, h, r), 6), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(w)); c.height = Math.max(8, Math.round(h)); return c; }
function textureOf(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

const PANEL_DEFAULTS = { d: 0.3, r: 0.08, color: '#86a88c', bezel: '#2b2c30' };

export class Panel {
  constructor(w, h, o = {}) {
    this.w = w; this.h = h;
    this.o = { ...PANEL_DEFAULTS, ...o };
    this.g = new THREE.Group(); this.dyn = []; this.layers = [];
    this.body = box(w, h, this.o.d, this.o.side ?? shade(this.o.color, -0.1), this.o.r); this.g.add(this.body);
    this.cv = canvasOf(w * PPU, h * PPU); this.c = this.cv.getContext('2d');
    this.z = this.o.d / 2;
  }
  X(x) { return (x + this.w / 2) * PPU; }
  Y(y) { return (this.h / 2 - y) * PPU; }
  paint(_layer, fn) { this.layers.push(fn); return this; }
  add(obj, x, y, z = 0) { obj.position.set(x, y, this.z + z); this.g.add(obj); return obj; }
  at(x, y, z = 0) { this.g.position.set(x, y, z); return this; }

  recess(x, y, w, h, o = {}) {
    return this.paint('base', (c) => {
      c.beginPath(); c.roundRect(this.X(x - w / 2), this.Y(y + h / 2), w * PPU, h * PPU, (o.r ?? 0.04) * PPU);
      c.fillStyle = o.color ?? shade(this.o.color, -0.07); c.fill();
      if (!o.noInk) { c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(); }
    });
  }

  finish() {
    const c = this.c;
    c.fillStyle = this.o.color; c.fillRect(0, 0, this.cv.width, this.cv.height);
    for (const f of this.layers) f(c);
    this.tex = textureOf(this.cv);
    const inset = 0.022;
    const face = facePlane(this.w - inset * 2, this.h - inset * 2, Math.max(0.01, this.o.r - inset), toon('#ffffff', { map: this.tex }));
    face.position.z = this.z + 0.002; this.g.add(face); this.face = face;
    return this;
  }

  screen(x, y, w, h, o) {
    const g = new THREE.Group(), cv = canvasOf(w * PPU * 1.25, h * PPU * 1.25), c = cv.getContext('2d'), tex = textureOf(cv);
    const m = facePlane(w, h, o.round, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.z = 0.003; g.add(m);
    this.add(g, x, y, 0);
    this.dyn.push({ fn: () => {
      c.fillStyle = o.bg; c.fillRect(0, 0, cv.width, cv.height);
      c.save(); o.draw(c, cv.width, cv.height); c.restore();
      tex.needsUpdate = true;
    } });
    return g;
  }
}
