import * as THREE from 'three';
import { loadModels, paintSurfaceMasks } from './render/models';
import { pristineOf, startPortrait } from './render/truckPortrait';
import { PAINT } from '../data/chassis';
import { startKit } from '../data/start';
import { highwayMap } from '../sim/highway';
import { defaultSetup } from '../sim/settings';
import { rollStretch, type RolledStretch, type RolledTruck } from '../sim/stretch-roll';
import { newWorld } from '../sim/world';
import type { Vehicle, World } from '../sim/types';

declare global {
  interface Window {
    __STRETCH_ATLAS__?: { stretches: number; trucks: number };
    __STRETCH_ATLAS_ERROR__?: string;
  }
}

type AtlasQuery = { seed: number; from: number; to: number; roll: number; growth: number | null };

const PORTRAIT_SCALE = 0.42;

const STYLE = `
body { margin: 0; padding: 16px; background: #1b1c1d; color: #ddd6c8; font: 600 16px system-ui, sans-serif; }
.stretch { display: flex; align-items: flex-start; gap: 14px; margin: 0 0 16px; }
.stretch h2 { flex: 0 0 110px; font-size: 18px; margin: 8px 0 0; }
.groups { display: flex; flex-wrap: wrap; gap: 32px 64px; }
.group { display: flex; gap: 6px; padding: 8px; background: #26272a; border-radius: 8px; border: 3px solid #3a3b3d; }
.group img { border-radius: 6px; border: 3px solid transparent; }
.group img.elite { border-color: #d4a82a; }
.group img { display: block; }
`;

function queryOf(search: string): AtlasQuery {
  const params = new URLSearchParams(search);
  const num = (key: string, fallback: number) => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`Query ${key}=${raw} is not a number`);
    return value;
  };
  const query = { seed: num('seed', 1), from: num('from', 1), to: num('to', 10), roll: num('roll', 1), growth: params.has('growth') ? num('growth', 1) : null };
  if (query.from < 1 || query.to < query.from) throw new Error(`Stretches ${query.from} to ${query.to} are not a range from 1`);
  return query;
}

function atlasWorld(q: AtlasQuery): World {
  const setup = defaultSetup('chaosHighway');
  if (q.growth !== null) setup.settings.enemyGearGrowth = q.growth;
  return newWorld(q.seed, startKit('chaosHighway'), highwayMap(q.seed, 0), setup);
}

async function portraitImage(renderer: THREE.WebGLRenderer, vehicle: Vehicle): Promise<HTMLImageElement> {
  const build = startPortrait(renderer, pristineOf(vehicle), PAINT.standard);
  try {
    let step = build.steps.next();
    while (!step.done) {
      if (step.value) await step.value;
      step = build.steps.next();
    }
    const portrait = step.value;
    const canvas = document.createElement('canvas');
    canvas.width = portrait.body.width;
    canvas.height = portrait.body.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas context');
    ctx.drawImage(portrait.body, 0, 0);
    ctx.drawImage(portrait.parts, 0, 0);
    portrait.release();
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    const width = Math.round(canvas.width * PORTRAIT_SCALE);
    img.style.width = `${width}px`;
    img.style.height = `${Math.round((width * portrait.height) / portrait.width)}px`;
    return img;
  } finally {
    build.dispose();
  }
}

function element(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

async function groupBox(renderer: THREE.WebGLRenderer, group: RolledTruck[]): Promise<HTMLElement> {
  const box = element('div', 'group');
  for (const truck of group) {
    const img = await portraitImage(renderer, truck.vehicle);
    if (truck.elite) img.className = 'elite';
    box.append(img);
  }
  return box;
}

async function stretchRow(renderer: THREE.WebGLRenderer, rolled: RolledStretch): Promise<HTMLElement> {
  const row = element('section', 'stretch');
  row.append(element('h2', '', `Stretch ${rolled.stretch}`));
  const groups = element('div', 'groups');
  for (const group of rolled.groups) groups.append(await groupBox(renderer, group));
  row.append(groups);
  return row;
}

async function buildAtlas(): Promise<{ stretches: number; trucks: number }> {
  const q = queryOf(location.search);
  await loadModels();
  await paintSurfaceMasks();
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  const world = atlasWorld(q);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  let trucks = 0;
  try {
    for (let j = q.from; j <= q.to; j++) {
      const rolled = rollStretch(world, j, q.roll);
      trucks += rolled.groups.reduce((sum, g) => sum + g.length, 0);
      document.body.append(await stretchRow(renderer, rolled));
    }
  } finally {
    renderer.dispose();
  }
  return { stretches: q.to - q.from + 1, trucks };
}

export function runStretchAtlas(): void {
  buildAtlas().then(
    (done) => (window.__STRETCH_ATLAS__ = done),
    (error: unknown) => {
      window.__STRETCH_ATLAS_ERROR__ = error instanceof Error ? (error.stack ?? error.message) : String(error);
      document.body.append(element('pre', '', window.__STRETCH_ATLAS_ERROR__));
    },
  );
}
