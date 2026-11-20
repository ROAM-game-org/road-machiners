import { Plate, THREE, extrude, lit, litMap, loft, cap, grain, wear, stitch, makeStage, frame } from './dashlib.js';
import { installBake } from '../core.js';

const FACE = [1072, -3, 1283, 57.5];
const SLAB = [1088, -14, 1310, 49.6];
const CORNER = 15;
const HEM = 2.2;
const LEATHER = '#612e15';
const KEY_X0 = 1100.2;
const PITCH = 36;
const KEY_W = 31;
const KEY_Y = [6.3, 39.5];
const KEY_H = 0.07;
const PRESS = 0.04, SINK = 0.025;
const SKIRT = '#684328';
const SHOULDER = '#8e5c36';
const TOP = '#6b4023';

const P = new Plate(FACE[0], FACE[1], FACE[2] - FACE[0], FACE[3] - FACE[1]);
const { scene, root } = makeStage();
root.add(P.g);

const leather = P.canvas(SLAB);
{
  const c = leather.c;
  c.fillStyle = LEATHER; c.fillRect(SLAB[0], SLAB[1], SLAB[2] - SLAB[0], SLAB[3] - SLAB[1]);
  const g = c.createLinearGradient(0, SLAB[1], 0, SLAB[3]);
  g.addColorStop(0, 'rgba(255,200,150,0.05)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
  c.fillStyle = g; c.fillRect(SLAB[0], SLAB[1], SLAB[2] - SLAB[0], SLAB[3] - SLAB[1]);
  grain(c, SLAB, 11, 4);
  wear(c, SLAB, 32, { stains: 3, creases: 7, rubs: 2 });
  const sx = 1094.4, sy = 46.2, r = 11;
  const vertical = { alpha: 0.62, width: 1.0, dash: 3.5, gap: 2.0 }, flat = { alpha: 0.42, width: 1.0, dash: 8.5, gap: 4.0 };
  stitch(c, (cc) => { cc.beginPath(); cc.moveTo(sx, -14); cc.lineTo(sx, sy - r); }, vertical);
  stitch(c, (cc) => { cc.beginPath(); cc.moveTo(sx, sy - r); cc.arcTo(sx, sy, sx + r, sy, r); }, { ...flat, alpha: 0.5, dash: 5, gap: 3 });
  stitch(c, (cc) => { cc.beginPath(); cc.moveTo(sx + r, sy); cc.lineTo(1310, sy); }, flat);
}
const tex = P.textureOf(leather.cv, SLAB);
const GAP = 0.25;
const slabShape = P.shape(SLAB, [0, 0, 0, CORNER]);
{
  const g = GAP + HEM, bed = [KEY_X0 - g, KEY_Y[0] - g, KEY_X0 + 4 * PITCH + KEY_W + g, KEY_Y[1] + g];
  slabShape.holes.push(P.shape(bed, [4 + g, 4 + g, 4 + g, 4 + g]));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(P.shape(bed, [6, 6, 6, 6])), lit('#2a1309'));
  floor.position.z = -0.05; floor.receiveShadow = true; P.g.add(floor);
}
{
  const g = GAP + HEM, bed = [KEY_X0 - g, KEY_Y[0] - g, KEY_X0 + 4 * PITCH + KEY_W + g, KEY_Y[1] + g];
  const fill = P.shape(bed, [4 + g, 4 + g, 4 + g, 4 + g]);
  const lipW = 0.55, margin = 1.35 + lipW;
  for (let i = 0; i < 5; i++) {
    const x0 = KEY_X0 + i * PITCH;
    fill.holes.push(P.shape([x0 - margin, KEY_Y[0] - margin, x0 + KEY_W + margin, KEY_Y[1] + margin], [4 + margin, 4 + margin, 4 + margin, 4 + margin]));
  }
  P.g.add(extrude(fill, { front: 0, depth: 0.03, bevel: P.len(lipW), bt: P.len(lipW), caps: litMap(tex), sides: lit('#24100a'), seg: 3 }));
}
P.g.add(extrude(slabShape, { front: 0, depth: 0.12, bevel: P.len(HEM), bt: P.len(HEM) * 0.8, caps: litMap(tex), sides: lit('#2c1509') }));

const keys = [];
for (let i = 0; i < 5; i++) {
  const x0 = KEY_X0 + i * PITCH, x1 = x0 + KEY_W;
  const g = new (P.g.constructor)();
  const levels = [
    { box: [x0, KEY_Y[0], x1, KEY_Y[1]], r: [4, 4, 4, 4], z: 0 },
    { box: [x0 + 1.2, 6.9, x1 - 1.2, 33.4], r: [3.4, 3.4, 3.4, 3.4], z: KEY_H - 0.012 },
    { box: [x0 + 2.2, 7.8, x1 - 2.2, 32.6], r: [2.8, 2.8, 2.8, 2.8], z: KEY_H },
  ];
  g.add(loft(P, levels[0], levels[1], lit(SKIRT)));
  g.add(loft(P, levels[1], levels[2], lit(SHOULDER)));
  g.add(cap(P, levels[2].box, levels[2].r, KEY_H, lit(TOP)));
  g.position.z = 0;
  P.g.add(g);
  keys.push({ g, box: [x0, KEY_Y[0], x1, KEY_Y[1]], icon: [x0 + 5.5, 9.9, x0 + 25.5, 29.9] });
}

const view = frame({ scene, root, facePanel: { g: P.g, w: P.len(FACE[2] - FACE[0]), z: 0 }, eye: P.eye(), faceWidthPx: (FACE[2] - FACE[0]) * 4 });

const zones = {}, sprites = {};
keys.forEach((k, i) => {
  zones[`icon${i}`] = { quad: P.quad(view, k.icon, KEY_H - SINK + 0.004), size: P.size(k.icon) };
  zones[`icon${i}Down`] = { quad: P.quad(view, k.icon, KEY_H - SINK - PRESS + 0.004), size: P.size(k.icon) };
  zones[`hit${i}`] = { quad: P.quad(view, k.box, KEY_H - SINK), size: P.size(k.box) };
  sprites[`key${i}`] = { crop: view.cropAround(P.quad(view, k.box, 0.03), 10), frames: [`key${i}-up`, `key${i}-down`] };
});
const meta = { width: view.IW, height: view.IH, face: P.quad(view, FACE, 0), zones, sprites };

installBake((scale) => {
  const files = {};
  keys.forEach((k) => { k.g.position.z = -SINK; });
  view.render(scale);
  files.housing = view.shot();
  keys.forEach((k, i) => { files[`key${i}-up`] = view.crop(scale, meta.sprites[`key${i}`].crop); });
  keys.forEach((k, i) => {
    k.g.position.z = -SINK - PRESS; view.render(scale);
    files[`key${i}-down`] = view.crop(scale, meta.sprites[`key${i}`].crop);
    k.g.position.z = -SINK;
  });
  return { files, meta };
});
