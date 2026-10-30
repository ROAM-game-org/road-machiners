import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PAINT } from '../data/chassis';
import type { GameEvent, Vehicle } from '../sim/types';
import { bare, lineWithArmor } from '../test/gun-clearance-kit';
import { loadModels } from './render/models';
import type { VehicleView } from './render/vehicle';
import { SHELTER_FADE_MS, VehicleViewSet } from './vehicle-view-set';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const ALL_AT_ONCE = { take: () => true, ready: () => true };
const SITE = 'sunward-hollow';

function setup(): { scene: THREE.Scene; set: VehicleViewSet; car: Vehicle } {
  const scene = new THREE.Scene();
  const { world, v: car } = bare('scout');
  lineWithArmor(world, car, 'steelPlate');
  return { scene, set: new VehicleViewSet(scene, ALL_AT_ONCE), car };
}

function materialsOf(view: VehicleView): THREE.Material[] {
  const found: THREE.Material[] = [];
  view.root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) found.push(o.material as THREE.Material);
  });
  return found;
}

function castersOf(view: VehicleView): number {
  let casters = 0;
  view.root.traverse((o) => {
    if (o.castShadow) casters++;
  });
  return casters;
}

function hullOpacities(view: VehicleView): number[] {
  return materialsOf(view).filter((m) => m.stencilWrite && m.depthWrite).map((m) => m.opacity);
}

const entered = (car: Vehicle): GameEvent[] => [{ t: 'enteredSite', vehicle: car.id, site: SITE }];
const left = (car: Vehicle): GameEvent[] => [{ t: 'leftSite', vehicle: car.id, site: SITE }];

describe('a truck going into a site', () => {
  it('fades out over the fade time once it leaves the shown trucks, then leaves the scene', () => {
    const { scene, set, car } = setup();
    const view = set.viewOf(car.id, car, true, PAINT.standard)!;
    const enteredEvents = entered(car);
    set.settle(new Set([car.id]), 0, []);

    set.settle(new Set(), 1000, enteredEvents);
    set.settle(new Set(), 1000 + SHELTER_FADE_MS / 2, enteredEvents);

    expect(set.views.has(car.id)).toBe(false);
    expect(scene.children).toContain(view.root);
    expect(hullOpacities(view).every((o) => Math.abs(o - 0.5) < 0.01)).toBe(true);
    set.settle(new Set(), 1000 + SHELTER_FADE_MS, enteredEvents);
    expect(scene.children).not.toContain(view.root);
  });

  it('drops a truck that went nowhere at once', () => {
    const { scene, set, car } = setup();
    set.viewOf(car.id, car, true, PAINT.standard);
    set.settle(new Set([car.id]), 0, []);

    set.settle(new Set(), 1000, []);

    expect(scene.children).toEqual([]);
  });
});

describe('a truck coming out of a site', () => {
  it('fades in from nothing and ends on its own solid materials', () => {
    const { set, car } = setup();
    const solidView = new VehicleViewSet(new THREE.Scene(), ALL_AT_ONCE).viewOf(car.id, car, true, PAINT.standard)!;
    const solid = materialsOf(solidView).map((m) => m.transparent);
    const shown = new Set([car.id]);
    const leftEvents = left(car);

    const view = set.viewOf(car.id, car, true, PAINT.standard)!;
    set.settle(shown, 2000, leftEvents);
    expect(hullOpacities(view).every((o) => o === 0)).toBe(true);
    set.settle(shown, 2000 + SHELTER_FADE_MS / 4, leftEvents);
    expect(materialsOf(view).map((m) => m.defines)).toEqual(materialsOf(solidView).map((m) => m.defines));
    expect(hullOpacities(view).every((o) => Math.abs(o - 0.25) < 0.01)).toBe(true);
    expect(hullOpacities(view).length).toBeGreaterThan(0);

    expect(castersOf(solidView)).toBeGreaterThan(0);
    expect(castersOf(view)).toBe(0);
    set.settle(shown, 2000 + SHELTER_FADE_MS * 0.75, leftEvents);
    expect(castersOf(view)).toBe(castersOf(solidView));

    set.settle(shown, 2000 + SHELTER_FADE_MS, leftEvents);
    expect(hullOpacities(view).every((o) => o === 1)).toBe(true);
    expect(castersOf(view)).toBe(castersOf(solidView));
    expect(materialsOf(view).map((m) => m.transparent)).toEqual(solid);
  });

  it('fades in once per turn, not again when the same turn shows it anew', () => {
    const { set, car } = setup();
    const leftEvents = left(car);
    set.viewOf(car.id, car, true, PAINT.standard);
    set.settle(new Set([car.id]), 0, leftEvents);
    set.settle(new Set(), 100, leftEvents);

    const again = set.viewOf(car.id, car, true, PAINT.standard)!;
    set.settle(new Set([car.id]), 200, leftEvents);

    expect(hullOpacities(again).every((o) => o === 1)).toBe(true);
  });

  it('keeps the truck bit on the faded hull so its outline stays on the rim', () => {
    const { set, car } = setup();
    const view = set.viewOf(car.id, car, true, PAINT.standard)!;
    set.settle(new Set([car.id]), 0, []);
    const marked = materialsOf(view).filter((m) => m.stencilWrite).length;
    const enteredEvents = entered(car);
    set.settle(new Set(), 0, enteredEvents);
    set.settle(new Set(), SHELTER_FADE_MS / 2, enteredEvents);

    expect(materialsOf(view).filter((m) => m.stencilWrite && m.transparent)).toHaveLength(marked);
  });

  it('shows a truck that was never inside at full strength', () => {
    const { set, car } = setup();
    const view = set.viewOf(car.id, car, true, PAINT.standard)!;
    set.settle(new Set([car.id]), 0, []);

    expect(hullOpacities(view).every((o) => o === 1)).toBe(true);
  });
});
