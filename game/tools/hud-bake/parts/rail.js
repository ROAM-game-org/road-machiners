import * as THREE from 'three';
import { Panel } from '../kit.js';
import { OLIVE, mottle } from './olive.js';
import { PPU, plateSpace, makeStage, frame, finishPanels, installBake, vanishFor } from '../core.js';

const K = 2;
const FACE_CSS = [0, 698, 1280, 720];
const S = plateSpace(1280 * K, 22 * K);
const FRONT_TOP = (706 - FACE_CSS[1]) * K;
const OVERSCAN = 60 * K;
const TOP_COLOR = OLIVE.shade;
const LIP_INK = '#241407';
const D = 0.18;
const VP = vanishFor(FACE_CSS);
const EYE = { x: (VP.x - (FACE_CSS[0] + FACE_CSS[2]) / 2) * K / PPU, y: (S.height / 2 + (FACE_CSS[1] - VP.y) * K) / PPU, z: 24 };

const { scene, root } = makeStage();

const box = [-OVERSCAN, FRONT_TOP, S.width + OVERSCAN, S.height];
const rail = new Panel(...S.sizeOf(box), { d: D, r: 0.01, color: OLIVE.housing, side: TOP_COLOR, seed: 21, wear: 0, bezel: LIP_INK });
rail.at(...S.centerOf(box), 0);
root.add(rail.g);
rail.body.remove(...rail.body.children);
const backEdge = new THREE.Mesh(new THREE.BoxGeometry(rail.w, 0.006, 0.02), new THREE.MeshBasicMaterial({ color: LIP_INK }));
backEdge.position.set(0, rail.h / 2 - 0.003, -D / 2 + 0.01);
rail.g.add(backEdge);

rail.paint('base', (c) => {
  const W = c.canvas.width, H = c.canvas.height;
  c.fillStyle = OLIVE.housing; c.fillRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,200,150,0.05)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  mottle(c, 0, 0, W, H, 21);
  c.fillStyle = LIP_INK; c.fillRect(0, 0, W, 4);
});

finishPanels([rail]);
rail.face.scale.set(rail.w / (rail.w - 0.044), rail.h / (rail.h - 0.044), 1);
const view = frame({ scene, root, facePanel: rail, eye: EYE, faceWidthPx: Math.round(rail.w * PPU) });

const faceLocal = S.inside(box)([0, 0, S.width, S.height]);
const meta = { width: view.IW, height: view.IH, face: view.quad(rail, ...faceLocal, 0), zones: {}, sprites: {}, kScale: K };

installBake((scale) => {
  view.render(scale);
  return { files: { housing: view.shot() }, meta };
});
