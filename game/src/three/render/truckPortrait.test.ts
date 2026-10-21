import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHASSIS, PAINT } from '../../data/chassis';
import { conditionItems } from './portraitPixels';
import { cellRect } from '../../sim/body';
import { coreParts, itemCells, mountedItems, mountedParts } from '../../sim/grid';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import type { Vehicle } from '../../sim/types';
import { maxHp } from '../../sim/wear';
import { bare, lineWithArmor } from '../../test/gun-clearance-kit';
import { TruckPortraits, glassMeshes, neutralizeReds, pristineOf, type BuildPortrait, type Portrait } from './truckPortrait';
import { VehicleView } from './vehicle';

const RENDERER = {} as THREE.WebGLRenderer;

function counting(): { build: BuildPortrait; built: Vehicle[] } {
  const built: Vehicle[] = [];
  const build: BuildPortrait = (_renderer, pristine) => {
    built.push(pristine);
    return { width: built.length } as Portrait;
  };
  return { build, built };
}

function truck(): Vehicle {
  return emptyWorld().vehicles[0];
}

describe('truck portrait cache', () => {
  it('builds once when only part HP and wear change', () => {
    const { build, built } = counting();
    const portraits = new TruckPortraits(RENDERER, build);
    const v = truck();
    const first = portraits.portraitOf(v, PAINT.standard);
    const engine = mountedParts(v, 'engine')[0];
    engine.hp = engine.hp / 3;
    engine.wear = 3;
    expect(portraits.portraitOf(v, PAINT.standard)).toBe(first);
    expect(built).toHaveLength(1);
  });

  it('builds the pristine truck, not the damaged one', () => {
    const { build, built } = counting();
    const v = truck();
    const engine = mountedParts(v, 'engine')[0];
    engine.hp = 1;
    engine.wear = 3;
    new TruckPortraits(RENDERER, build).portraitOf(v, PAINT.standard);
    const copy = mountedParts(built[0], 'engine')[0];
    expect(copy.wear).toBe(0);
    expect(copy.hp).toBe(maxHp(copy));
    expect(engine.hp).toBe(1);
    expect(engine.wear).toBe(3);
  });

  it('builds again when a part moves, and drops the old build of that truck', () => {
    const { build, built } = counting();
    const portraits = new TruckPortraits(RENDERER, build);
    const v = truck();
    portraits.portraitOf(v, PAINT.standard);
    const engine = mountedItems(v, 'engine')[0];
    engine.x += 1;
    portraits.portraitOf(v, PAINT.standard);
    expect(built).toHaveLength(2);
    engine.x -= 1;
    portraits.portraitOf(v, PAINT.standard);
    expect(built).toHaveLength(3);
  });

  it('keeps one build per truck id and forgets trucks that left sight', () => {
    const { build, built } = counting();
    const portraits = new TruckPortraits(RENDERER, build);
    const a = truck();
    const b = { ...structuredClone(a), id: 'other' };
    portraits.portraitOf(a, PAINT.standard);
    portraits.portraitOf(b, PAINT.standard);
    expect(built).toHaveLength(2);
    portraits.forget(new Set([a.id]));
    portraits.portraitOf(a, PAINT.standard);
    expect(built).toHaveLength(2);
    portraits.portraitOf(b, PAINT.standard);
    expect(built).toHaveLength(3);
  });
});

describe('truck portrait scene on every chassis', () => {
  it.each(Object.keys(CHASSIS))('%s: has glass to tint and a drawn mesh or a footprint for every readout part', (id) => {
    const { world, v } = bare(id);
    lineWithArmor(world, v, 'steelPlate');
    const view = new VehicleView(pristineOf(v), false, PAINT.standard, 'portrait');
    const drawn = new Set<string>();
    const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
    view.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.visible || o.userData.outline) return;
      if (o.userData.partId) drawn.add(o.userData.partId);
      meshes.push(o);
    });
    expect(glassMeshes(meshes).length).toBeGreaterThan(0);
    for (const item of conditionItems(v)) {
      if (drawn.has(item.part.id)) continue;
      const rect = cellRect(id, itemCells(item));
      expect(rect.x1 - rect.x0 + (rect.z1 - rect.z0), `${item.part.defId} footprint`).toBeGreaterThan(0);
    }
    view.dispose();
  });

  it.each(Object.keys(CHASSIS))('%s: the wheels carry their wheel part id', (id) => {
    const { v } = bare(id);
    const view = new VehicleView(pristineOf(v), false, PAINT.standard, 'portrait');
    const drawn = new Set<string>();
    view.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.visible && o.userData.partId) drawn.add(o.userData.partId);
    });
    for (const wheel of coreParts(v, 'wheel')) expect(drawn.has(wheel.id), `wheel ${wheel.id}`).toBe(true);
    view.dispose();
  });
});

describe('truck portrait view', () => {
  function materialsOf(view: VehicleView): Set<THREE.Material> {
    const found = new Set<THREE.Material>();
    view.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.outline) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) found.add(m);
    });
    return found;
  }

  it('shares no material with the same truck in the world, so recoloring it cannot touch the world truck', () => {
    const v = addVehicle(emptyWorld(), 'player', 'buggy', ['mg', 'stockEngine', 'scrapPanels'], { x: 33, y: 30 });
    const world = materialsOf(new VehicleView(v, true, PAINT.standard, 'world'));
    const portrait = materialsOf(new VehicleView(pristineOf(v), false, PAINT.standard, 'portrait'));
    expect(world.size).toBeGreaterThan(0);
    expect([...portrait].filter((m) => world.has(m))).toEqual([]);
  });

  it('keeps the armor cut on red armor it turns neutral', () => {
    const v = addVehicle(emptyWorld(), 'player', 'buggy', ['mg', 'stockEngine', 'scrapPanels'], { x: 33, y: 30 });
    const view = new VehicleView(pristineOf(v), false, PAINT.standard, 'portrait');
    const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
    view.root.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.outline) meshes.push(o);
    });
    const armor = () => meshes.filter((m) => m.userData.armor);
    const red = (m: THREE.Mesh<THREE.BufferGeometry, THREE.Material>) => {
      const hsl = (m.material as THREE.MeshLambertMaterial).color.getHSL({ h: 0, s: 0, l: 0 });
      return Math.min(hsl.h, 1 - hsl.h) <= 0.025 && hsl.s >= 0.5;
    };
    expect(armor().some(red)).toBe(true);
    neutralizeReds(meshes, []);
    expect(armor().some(red)).toBe(false);
    expect(armor().length).toBeGreaterThan(0);
    for (const mesh of armor()) expect(mesh.material.defines?.CUT_WHEELS, mesh.name).toBeGreaterThan(0);
    view.dispose();
  });
});
