import * as THREE from 'three';
import { Panel } from '../kit.js';
import { PPU, plateSpace, makeStage, frame, finishPanels, installBake, vanishFor } from '../core.js';

const K = 2;
const FACE_CSS = [0, 698, 1280, 720];
const S = plateSpace(1280 * K, 22 * K);
const FRONT_TOP = (706 - FACE_CSS[1]) * K;
const OVERSCAN = 60 * K;
const TOP_COLOR = '#48240f';
const D = 0.18;
const VP = vanishFor(FACE_CSS);
const EYE = { x: (VP.x - (FACE_CSS[0] + FACE_CSS[2]) / 2) * K / PPU, y: (S.height / 2 + (FACE_CSS[1] - VP.y) * K) / PPU, z: 24 };

const LIT = 1.09;
const lit = (hex) => `#${hex.slice(1).match(/../g).map((v) => Math.min(255, Math.round(parseInt(v, 16) * LIT)).toString(16).padStart(2, '0')).join('')}`;
const FRONT_ROWS = [
  [0, '#1c0e06'], [2.4, '#1c0e06'], [2.6, '#5d2a08'], [3.5, '#86532e'], [5.5, '#875126'], [6.5, '#6d3c18'], [7.5, '#5e2d10'], [8.5, '#723a1f'],
  [11.5, '#6d3b1c'], [14, '#613212'], [15, '#673516'], [17, '#5b2b0d'], [21, '#502b15'], [22.5, '#301407'], [28, '#361608'],
];

const { scene, root } = makeStage();

const box = [-OVERSCAN, FRONT_TOP, S.width + OVERSCAN, S.height];
const rail = new Panel(...S.sizeOf(box), { d: D, r: 0.01, color: '#723a1f', side: TOP_COLOR, seed: 21, wear: 0, bezel: '#1c0e06' });
rail.at(...S.centerOf(box), 0);
root.add(rail.g);
rail.body.remove(...rail.body.children);
const backEdge = new THREE.Mesh(new THREE.BoxGeometry(rail.w, 0.006, 0.02), new THREE.MeshBasicMaterial({ color: '#180b04' }));
backEdge.position.set(0, rail.h / 2 - 0.003, -D / 2 + 0.01);
rail.g.add(backEdge);

rail.paint('base', (c) => {
  const W = c.canvas.width, H = c.canvas.height;
  const g = c.createLinearGradient(0, 0, 0, H);
  for (const [r, col] of FRONT_ROWS) g.addColorStop(Math.min(1, r / H), r < 2.5 ? col : lit(col));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = lit('#976f4d');
  const y = 12, dash = 18, gap = 10;
  for (let x = 4; x < W; x += dash + gap) c.fillRect(x, y, dash, 2);
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
