import * as THREE from 'three';
import { loadModels, paintSurfaceMasks } from './render/models';
import { pristineOf, startPortrait } from './render/truckPortrait';
import { PAINT } from '../data/chassis';
import { startKit } from '../data/start';
import { highwayMap } from '../sim/highway';
import { defaultSetup } from '../sim/settings';
import { rollStretch, type RolledGroup, type RolledStretch, type RolledTruck } from '../sim/stretch-roll';
import { newWorld } from '../sim/world';
import { chassisName, partName, templateName } from '../text/names';
import { say } from '../text/language';
import type { Vehicle, World } from '../sim/types';

declare global {
  interface Window {
    __STRETCH_ATLAS__?: { stretches: number; trucks: number };
    __STRETCH_ATLAS_ERROR__?: string;
  }
}

type AtlasQuery = { seed: number; from: number; to: number; roll: number; growth: number | null };

const GEAR_ROWS = [
  ['weapon', 'Guns'],
  ['armor', 'Armor'],
  ['engine', 'Engine'],
  ['utility', 'Utility'],
  ['accessory', 'Extras'],
  ['scanner', 'Scanner'],
  ['store', 'Store'],
  ['cargo', 'Cargo'],
] as const satisfies readonly [keyof RolledTruck['gear'], string][];

const STYLE = `
body { margin: 0; padding: 16px; background: #1b1c1d; color: #ddd6c8; font: 13px/1.35 system-ui, sans-serif; }
h1 { font-size: 18px; margin: 0 0 12px; }
.stretch { margin: 0 0 20px; padding: 10px; border: 1px solid #3a3b3d; border-radius: 6px; }
.stretch h2 { font-size: 15px; margin: 0 0 8px; }
.groups { display: flex; flex-wrap: wrap; gap: 10px; }
.group { padding: 8px; background: #26272a; border-radius: 6px; border: 1px solid #3a3b3d; }
.group.elite { border-color: #c9a227; }
.group h3 { font-size: 13px; margin: 0 0 6px; }
.trucks { display: flex; gap: 8px; }
.truck { width: 190px; }
.truck img { display: block; width: 190px; height: 140px; object-fit: contain; background: #313236; border-radius: 4px; }
.truck .name { font-weight: 600; margin: 4px 0 2px; }
.truck .row { color: #b9b2a5; }
.truck .row b { color: #ddd6c8; font-weight: 600; }
.bare { color: #e07a5f; }
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

async function portraitUrl(renderer: THREE.WebGLRenderer, vehicle: Vehicle): Promise<string> {
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
    return canvas.toDataURL('image/png');
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

function counted(ids: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => (n > 1 ? `${n} ${say(partName(id))}` : say(partName(id)))).join(', ');
}

async function truckCard(renderer: THREE.WebGLRenderer, truck: RolledTruck): Promise<HTMLElement> {
  const card = element('div', 'truck');
  const img = document.createElement('img');
  img.src = await portraitUrl(renderer, truck.vehicle);
  card.append(img, element('div', 'name', `${say(chassisName(truck.chassisId))}, gear ${truck.gearValue} M`));
  for (const [kind, label] of GEAR_ROWS) {
    const ids = truck.gear[kind];
    if (ids.length > 0) card.append(gearRow(label, counted(ids), 'row'));
    else if (kind === 'armor' || kind === 'weapon') card.append(gearRow(label, 'none', 'row bare'));
  }
  return card;
}

function gearRow(label: string, text: string, className: string): HTMLElement {
  const row = element('div', className);
  row.append(element('b', '', `${label}: `), document.createTextNode(text));
  return row;
}

async function groupBox(renderer: THREE.WebGLRenderer, group: RolledGroup): Promise<HTMLElement> {
  const box = element('div', group.elite ? 'group elite' : 'group');
  const side = group.from === 'ahead' ? 'from ahead' : `from the ${group.from}`;
  box.append(element('h3', '', `${say(templateName(group.template))} x${group.trucks.length}${group.elite ? ', elite' : ''}, ${side}, at tile ${group.at}, ${group.money} M each`));
  const trucks = element('div', 'trucks');
  for (const truck of group.trucks) trucks.append(await truckCard(renderer, truck));
  box.append(trucks);
  return box;
}

async function stretchBox(renderer: THREE.WebGLRenderer, rolled: RolledStretch): Promise<HTMLElement> {
  const box = element('section', 'stretch');
  const trucks = rolled.groups.reduce((sum, g) => sum + g.trucks.length, 0);
  box.append(element('h2', '', `Stretch ${rolled.stretch}: ${rolled.length} tiles, ${rolled.groups.length} groups, ${trucks} trucks, budget ${rolled.budget}`));
  const groups = element('div', 'groups');
  for (const group of rolled.groups) groups.append(await groupBox(renderer, group));
  box.append(groups);
  return box;
}

async function buildAtlas(): Promise<{ stretches: number; trucks: number }> {
  const q = queryOf(location.search);
  await loadModels();
  await paintSurfaceMasks();
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  document.body.append(element('h1', '', `Chaos Highway seed ${q.seed}, roll ${q.roll}${q.growth === null ? '' : `, enemy growth ${q.growth}`}`));
  const world = atlasWorld(q);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  let trucks = 0;
  try {
    for (let j = q.from; j <= q.to; j++) {
      const rolled = rollStretch(world, j, q.roll);
      trucks += rolled.groups.reduce((sum, g) => sum + g.trucks.length, 0);
      document.body.append(await stretchBox(renderer, rolled));
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
      document.body.append(element('pre', 'bare', window.__STRETCH_ATLAS_ERROR__));
    },
  );
}
