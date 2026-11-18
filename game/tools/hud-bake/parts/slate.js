import { Plate, extrude, lit, ring, makeStage, frame } from './dashlib.js';
import { installBake } from '../core.js';

const KEY_UP = 0.032, KEY_DOWN = 0.012;

export function bakeSlate({ face, rings, body, key, k = 4, zones: extraZones, sprites: extraSprites = {} }) {
  const [fx, fy, fw, fh] = face, box = [fx, fy, fx + fw, fy + fh];
  const P = new Plate(fx, fy, fw, fh, null, k);
  const { scene, root } = makeStage({ span: Math.max(6, fw * k / 400 + 2, fh * k / 400 + 2) });
  root.add(P.g);
  const inset = (b, d) => [b[0] + d, b[1] + d, b[2] - d, b[3] - d];

  P.g.add(extrude(P.shape(box), { front: 0, depth: 0.05, caps: lit(body) }));
  let outer = box;
  rings.forEach((r, i) => {
    const inner = inset(outer, r.w);
    P.g.add(ring(P, outer, inner, { rOuter: [0, 0, 0, 0], rInner: [0, 0, 0, 0], front: 0.004 + i * 0.002, depth: 0.004, color: r.color, bevel: 0.0005 }));
    outer = inner;
  });

  const keyBox = key.box, keyGroup = new (P.g.constructor)();
  keyGroup.add(extrude(P.shape(keyBox, [1.5, 1.5, 1.5, 1.5]), { front: KEY_UP, depth: 0.03, bevel: 0.003, bt: 0.003, caps: lit(key.border) }));
  keyGroup.add(extrude(P.shape(inset(keyBox, key.w), [1, 1, 1, 1]), { front: KEY_UP + 0.004, depth: 0.004, caps: lit(key.fill) }));
  P.g.add(keyGroup);

  const view = frame({ scene, root, facePanel: { g: P.g, w: P.len(fw), z: 0 }, eye: P.eye(), faceWidthPx: fw * k });
  const zoneFor = (b, z = 0.01) => ({ quad: P.quad(view, b, z), size: P.size(b) });
  const zones = { closeHit: zoneFor(keyBox, KEY_UP + 0.008), closeText: zoneFor(key.textBox, KEY_UP + 0.01), closeTextDown: zoneFor(key.textBox, KEY_DOWN + 0.01), ...Object.fromEntries(Object.entries(extraZones).map(([k, v]) => [k, zoneFor(v)])) };
  const sprites = { close: { crop: view.cropAround(P.quad(view, keyBox, 0.02), 6), frames: ['close-up', 'close-down'] }, ...extraSprites };
  const meta = { k, width: view.IW, height: view.IH, face: P.quad(view, box, 0), zones, sprites };

  installBake((scale) => {
    const files = {};
    keyGroup.position.z = 0;
    view.render(scale);
    files.housing = view.shot();
    files['close-up'] = view.crop(scale, sprites.close.crop);
    keyGroup.position.z = KEY_DOWN - KEY_UP; view.render(scale);
    files['close-down'] = view.crop(scale, sprites.close.crop);
    keyGroup.position.z = 0;
    return { files, meta };
  });
}
