import * as THREE from 'three';
import { PAINT, type TruckPaint } from '../data/chassis';
import { PHYSICS } from '../data/physics';
import { START_KITS } from '../data/start';
import { TIME } from '../data/time';
import { wheelMounts } from '../phys/body';
import type { VehicleFrame } from '../phys/frames';
import { PAL } from '../render/palette';
import { unitBody, unitsOf } from '../sim/body';
import { bareVehicle } from '../sim/factory';
import { mountedParts } from '../sim/grid';
import { defaultSetup } from '../sim/settings';
import type { Vehicle, World } from '../sim/types';
import { maxHp } from '../sim/wear';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { daylightAt, enableSunShadows, lightScene, sunLight } from './render/daylight';
import { loadModels, model as gameModel, NAMES, paintSurfaceMasks, type ModelName } from './render/models';
import { VehicleView } from './render/vehicle';

export type Panel = { label: string; build: () => THREE.Object3D };

export type Row = { label: string; panels: Panel[] };

export type Shot = { name: string; rows: Row[] };

const SHOT_SEED = 1337;

let shotWorld: World | null = null;

export function world(): World {
  shotWorld ??= newWorld(SHOT_SEED, { ...START_KITS.standard, opening: null }, TEST_MAP, defaultSetup('roaming'));
  return shotWorld;
}

export function model(name: string): THREE.Object3D {
  if (!(NAMES as readonly string[]).includes(name)) throw new Error(`No model named ${name}. Names live in NAMES in src/three/render/models.ts.`);
  return gameModel(name as ModelName);
}

export function vehicleOn(chassisId: string): Vehicle {
  const w = world();
  const player = w.vehicles.find((v) => v.id === w.player.vehicleId);
  const found = player?.chassisId === chassisId ? player : w.vehicles.find((v) => v.chassisId === chassisId);
  return found ? structuredClone(found) : bareVehicle(structuredClone(w), { faction: 'player', chassisId, pos: { x: 0, y: 0 }, heading: 0, brain: null });
}

export function withHp(v: Vehicle, share: number): Vehicle {
  if (!(share >= 0 && share <= 1)) throw new Error(`HP share must be from 0 to 1, got ${share}`);
  const copy = structuredClone(v);
  for (const p of mountedParts(copy)) p.hp = Math.round(maxHp(p) * share);
  return copy;
}

export function truck(v: Vehicle, paint: TruckPaint = PAINT.standard): THREE.Object3D {
  const view = new VehicleView(v, false, paint, 'world');
  view.pose(restAtOrigin(v), 0);
  view.dropContactShadow();
  return view.root;
}

function restAtOrigin(v: Vehicle): VehicleFrame {
  const wheels = (unit: number) => wheelMounts(unitBody(v.chassisId, unit), unit).map(() => ({ steer: 0, spin: 0, suspension: PHYSICS.truck.suspensionRest, ground: true }));
  const units = unitsOf(v.chassisId);
  const frame: VehicleFrame = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, acc: { x: 0, y: 0, z: 0 }, wheels: wheels(0) };
  if (units[1]) frame.rear = { pos: { x: units[1].offset, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, wheels: wheels(1) };
  return frame;
}

const PANEL_PX = 480;
const GAME_WINDOW_PX = 1000;
const GAME_VIEW_METERS = 72;
const MARGIN = 0.06;
const LABEL_PX = 40;
const ROW_LABEL_PX = 200;
const FONT = '22px sans-serif';
const TEXT = '#e0d8ca';
const PAGE = '#1b1c1d';
const NOON = 12;
const NOSE = new THREE.Vector3(1, 0, 0);

const FILL = 1.6;

type View = { label: string; dir: THREE.Vector3; up: THREE.Vector3; ground: boolean; fill: boolean };

const UP = new THREE.Vector3(0, 1, 0);
const QUARTER: View = { label: '3/4', dir: new THREE.Vector3(1, 0.816, 1).normalize(), up: UP, ground: true, fill: false };
const VIEWS = {
  quarter: QUARTER,
  game: { ...QUARTER, label: 'game' },
  front: { label: 'front', dir: new THREE.Vector3(1, 0, 0), up: UP, ground: true, fill: true },
  back: { label: 'back', dir: new THREE.Vector3(-1, 0, 0), up: UP, ground: true, fill: true },
  top: { label: 'top down', dir: new THREE.Vector3(0, 1, 0), up: NOSE, ground: true, fill: true },
  left: { label: 'left side', dir: new THREE.Vector3(0, 0, -1), up: UP, ground: true, fill: true },
  right: { label: 'right side', dir: new THREE.Vector3(0, 0, 1), up: UP, ground: true, fill: true },
  bottom: { label: 'bottom', dir: new THREE.Vector3(0, -1, 0), up: NOSE, ground: false, fill: true },
} satisfies Record<string, View>;

type ViewName = keyof typeof VIEWS;

const ALL: readonly ViewName[] = ['quarter', 'front', 'back', 'top', 'left', 'right', 'bottom'];

type Cell = { label: string; root: THREE.Object3D; view: View };

type GridRow = { label: string; cells: Cell[] };

type Frame = { half: number; px: number };

type Result = { name: string; png: string };

declare global {
  interface Window {
    __SHOT__?: Result;
    __SHOT_ERROR__?: string;
  }
}

export function runShot(): void {
  drawShot().catch((e: unknown) => {
    window.__SHOT_ERROR__ = e instanceof Error ? (e.stack ?? e.message) : String(e);
  });
}

async function drawShot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  await loadModels();
  await paintSurfaceMasks();
  const shot = await shotOf(params);
  const camera = params.get('camera') ?? 'quarter';
  const hour = numberParam(params, 'hour', NOON, (h) => h >= 0 && h < 24);
  const zoom = numberParam(params, 'zoom', 1, (z) => z > 0);
  if (shot.rows.length === 0 || shot.rows.some((r) => r.panels.length === 0)) throw new Error(`Shot ${shot.name} has a row with no panels`);
  const rows = camera === 'all' ? allViews(shot) : oneView(shot, viewOf(camera));
  const frame = frameOf(rows, camera === 'game' ? zoom : null);
  window.__SHOT__ = { name: `${shot.name}-${camera}`, png: sheet(rows, frame, hour).toDataURL('image/png') };
}

function numberParam(params: URLSearchParams, name: string, fallback: number, ok: (n: number) => boolean): number {
  const raw = params.get(name);
  const n = raw === null ? fallback : Number(raw);
  if (!ok(n)) throw new Error(`--${name} ${raw} is out of range`);
  return n;
}

async function shotOf(params: URLSearchParams): Promise<Shot> {
  const scene = params.get('scene');
  if (scene) {
    const mod = (await import(scene)) as { default?: Shot };
    if (!mod.default) throw new Error(`Scene file ${scene} has no default export`);
    return mod.default;
  }
  const models = params.get('model');
  if (models) return { name: `models-${models.replaceAll(',', '-')}`, rows: [{ label: '', panels: models.split(',').map((name) => ({ label: name, build: () => model(name) })) }] };
  const chassis = params.get('truck');
  if (chassis) return truckShot(chassis, params.get('hp') ?? '100');
  throw new Error('Give a scene file, --model or --truck');
}

function truckShot(chassis: string, hp: string): Shot {
  const v = vehicleOn(chassis);
  const shares = hp.split(',').map(Number);
  const panels = shares.map((pct) => ({ label: `HP ${pct}%`, build: () => truck(withHp(v, pct / 100)) }));
  return { name: `truck-${chassis}-hp-${shares.join('-')}`, rows: [{ label: chassis, panels }] };
}

function viewOf(name: string): View {
  if (!(name in VIEWS)) throw new Error(`Camera ${name} is not one of all, ${Object.keys(VIEWS).join(', ')}`);
  return VIEWS[name as ViewName];
}

function oneView(shot: Shot, view: View): GridRow[] {
  return shot.rows.map((row) => ({ label: row.label, cells: row.panels.map((panel) => ({ label: panel.label, root: built(panel), view })) }));
}

function allViews(shot: Shot): GridRow[] {
  return shot.rows.flatMap((row) => row.panels.map((panel) => {
    const root = built(panel);
    return { label: [row.label, panel.label].filter(Boolean).join(' '), cells: ALL.map((name) => ({ label: VIEWS[name].label, root, view: VIEWS[name] })) };
  }));
}

function built(panel: Panel): THREE.Object3D {
  const root = panel.build();
  root.updateMatrixWorld(true);
  if (new THREE.Box3().setFromObject(root).isEmpty()) throw new Error(`Panel ${panel.label} built an empty object`);
  return root;
}

function lens(view: View, center: THREE.Vector3, half: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 1000);
  cam.position.copy(center).addScaledVector(view.dir, 100);
  cam.up.copy(view.up);
  cam.lookAt(center);
  cam.updateMatrixWorld(true);
  return cam;
}

function viewBox(root: THREE.Object3D, view: View): THREE.Box3 {
  const cam = lens(view, new THREE.Vector3(), 1);
  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) box.expandByPoint(cam.worldToLocal(p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)));
  });
  return box;
}

function frameOf(rows: GridRow[], gameZoom: number | null): Frame {
  const span = Math.max(...rows.flatMap((r) => r.cells).map(({ root, view }) => {
    const size = viewBox(root, view).getSize(new THREE.Vector3());
    return Math.max(size.x, size.y);
  }));
  const half = span / 2 / (1 - 2 * MARGIN);
  const px = gameZoom === null ? PANEL_PX : Math.ceil(((2 * half) / GAME_VIEW_METERS) * GAME_WINDOW_PX * gameZoom);
  return { half, px };
}

function turnAtHour(hour: number): number {
  return Math.ceil(1 + ((24 + hour - TIME.startHour) % 24) * (TIME.turnsPerDay / 24));
}

function render(renderer: THREE.WebGLRenderer, cell: Cell, frame: Frame, hour: number): void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.sand[0]);
  const sun = sunLight();
  const sky = new THREE.HemisphereLight();
  scene.add(cell.root, sun, sun.target, sky);
  if (cell.view.ground) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: PAL.sand[0] }));
    ground.receiveShadow = true;
    ground.position.y = new THREE.Box3().setFromObject(cell.root).min.y;
    scene.add(ground);
  }
  const center = viewBox(cell.root, cell.view).getCenter(new THREE.Vector3()).applyMatrix4(lens(cell.view, new THREE.Vector3(), 1).matrixWorld);
  lightScene(sun, sky, center, daylightAt(turnAtHour(hour)));
  const camera = lens(cell.view, center, frame.half);
  if (cell.view.fill) scene.add(fillLight(camera));
  renderer.render(scene, camera);
  scene.remove(cell.root);
}

function fillLight(camera: THREE.OrthographicCamera): THREE.DirectionalLight {
  const fill = new THREE.DirectionalLight(0xffffff, FILL);
  fill.position.copy(camera.position);
  fill.target.position.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()));
  fill.target.updateMatrixWorld();
  return fill;
}

function sheet(rows: GridRow[], frame: Frame, hour: number): HTMLCanvasElement {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  enableSunShadows(renderer);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setSize(frame.px, frame.px, false);
  const left = rows.some((row) => row.label) ? ROW_LABEL_PX : 0;
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const out = document.createElement('canvas');
  out.width = left + cols * frame.px;
  out.height = rows.length * (frame.px + LABEL_PX);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context');
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.font = FONT;
  ctx.fillStyle = TEXT;
  ctx.textBaseline = 'middle';
  rows.forEach((row, r) => {
    const top = r * (frame.px + LABEL_PX);
    ctx.textAlign = 'left';
    ctx.fillText(row.label, 12, top + frame.px / 2);
    row.cells.forEach((cell, c) => {
      render(renderer, cell, frame, hour);
      ctx.drawImage(renderer.domElement, left + c * frame.px, top);
      ctx.textAlign = 'center';
      ctx.fillText(cell.label, left + c * frame.px + frame.px / 2, top + frame.px + LABEL_PX / 2);
    });
  });
  renderer.dispose();
  return out;
}
