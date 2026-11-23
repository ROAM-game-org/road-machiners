import { Plate, extrude, oliveLit, oliveMap, hexBolt, ring, glassMesh, roundPath, makeStage, frame } from './dashlib.js';
import { OLIVE, mottle } from './olive.js';
import { installBake } from '../core.js';

const FACE = [-3, -3, 301.9, 57.5];
const SLAB = [-14, -14, 290, 49.6];
const CORNER = 15;
const HEM = 3.6;
const INK = '#241407';
const BRASS = '#997134';
const WINDOWS = { money: [28, 8, 109, 38], supplies: [139.5, 8, 184.3, 38], health: [233, 8, 278, 38] };
const RIM = 1.0;
const INK_W = 1.1;
const GLASS_Z = 0.006;
const LCD_INSET = 3.5;
const LCD_BOX = Object.fromEntries(Object.entries(WINDOWS).map(([k, [x0, y0, x1, y1]]) => [k, [x0 + LCD_INSET, y0 + LCD_INSET, x1 - LCD_INSET, y1 - LCD_INSET]]));
const ICON_BOX = { coin: [4, 13, 24, 33], bag: [115.4, 13, 135.4, 33], cross: [209.2, 13, 229.2, 33] };
const UNIT_BOX = [188.2, 13, 201.3, 32];

const P = new Plate(FACE[0], FACE[1], FACE[2] - FACE[0], FACE[3] - FACE[1]);
const { scene, root } = makeStage();
root.add(P.g);

const expand = ([x0, y0, x1, y1], d) => [x0 - d, y0 - d, x1 + d, y1 + d];

const face = P.canvas(SLAB);
{
  const c = face.c;
  c.fillStyle = OLIVE.housing; c.fillRect(SLAB[0], SLAB[1], SLAB[2] - SLAB[0], SLAB[3] - SLAB[1]);
  const g = c.createLinearGradient(0, SLAB[1], 0, SLAB[3]);
  g.addColorStop(0, 'rgba(255,200,150,0.05)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
  c.fillStyle = g; c.fillRect(SLAB[0], SLAB[1], SLAB[2] - SLAB[0], SLAB[3] - SLAB[1]);
  mottle(c, SLAB[0], SLAB[1], SLAB[2] - SLAB[0], SLAB[3] - SLAB[1], 7);
  for (const w of Object.values(WINDOWS)) { const e = expand(w, 0); roundPath(c, e[0], e[1], e[2], e[3], [6, 6, 6, 6]); c.fillStyle = INK; c.fill(); }
}
const tex = P.textureOf(face.cv, SLAB);
const slab = extrude(P.shape(SLAB, [0, 0, CORNER, 0]), { front: 0, depth: 0.12, bevel: P.len(HEM), bt: P.len(HEM) * 0.8, caps: oliveMap(tex), sides: oliveLit(OLIVE.edge) });
P.g.add(slab);
for (const x of [7, 280]) P.g.add(hexBolt(P.at(P.len(HEM * 0.8)), x, 43, 1.8));

for (const w of Object.values(WINDOWS)) {
  const outer = expand(w, -INK_W), inner = expand(w, -INK_W - RIM);
  P.g.add(ring(P, outer, inner, { rOuter: [5, 5, 5, 5], rInner: [3.6, 3.6, 3.6, 3.6], front: 0.024, depth: 0.02, color: BRASS }));
  P.g.add(glassMesh(P, inner, {
    r: 3.6, z: GLASS_Z,
    paint: (c, b) => {
      c.fillStyle = '#3d2514'; c.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
      const t = c.createLinearGradient(0, b[1], 0, b[1] + 6); t.addColorStop(0, 'rgba(0,0,0,0.38)'); t.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = t; c.fillRect(b[0], b[1], b[2] - b[0], 6);
      const l = c.createLinearGradient(b[0], 0, b[0] + 4, 0); l.addColorStop(0, 'rgba(0,0,0,0.35)'); l.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = l; c.fillRect(b[0], b[1], 4, b[3] - b[1]);
    },
  }));
}

const view = frame({ scene, root, facePanel: { g: P.g, w: P.len(FACE[2] - FACE[0]), z: 0 }, eye: P.eye(), faceWidthPx: (FACE[2] - FACE[0]) * 4 });

const zoneFor = (box, z) => ({ quad: P.quad(view, box, z), size: P.size(box) });
const meta = {
  width: view.IW, height: view.IH,
  face: P.quad(view, FACE, 0),
  zones: {
    money: zoneFor(LCD_BOX.money, GLASS_Z + 0.004),
    supplies: zoneFor(LCD_BOX.supplies, GLASS_Z + 0.004),
    health: zoneFor(LCD_BOX.health, GLASS_Z + 0.004),
    coin: zoneFor(ICON_BOX.coin, 0.01),
    bag: zoneFor(ICON_BOX.bag, 0.01),
    cross: zoneFor(ICON_BOX.cross, 0.01),
    unit: zoneFor(UNIT_BOX, 0.01),
  },
  sprites: {},
};

installBake((scale) => {
  view.render(scale);
  return { files: { housing: view.shot() }, meta };
});
