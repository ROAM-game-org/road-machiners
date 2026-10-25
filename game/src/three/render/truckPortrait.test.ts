import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHASSIS, PAINT } from '../../data/chassis';
import { conditionItems } from './portraitPixels';
import { cellRect, unitsOf } from '../../sim/body';
import { partDef } from '../../data/parts';
import { coreParts, itemCells, mountedItems, mountedParts } from '../../sim/grid';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import type { Vehicle } from '../../sim/types';
import { maxHp } from '../../sim/wear';
import { bare, lineWithArmor } from '../../test/gun-clearance-kit';
import { PORTRAIT_KEEP, PORTRAIT_TILT_DEG, TruckPortraits, chassisSize, glassMeshes, neutralizeReds, pristineOf, type BuildPortrait, type Portrait, type PortraitWait } from './truckPortrait';
import { VehicleView } from './vehicle';

const isCabDef = (def: ReturnType<typeof partDef>): boolean => def.kind === 'core' && def.role === 'cab';

const RENDERER = {} as THREE.WebGLRenderer;

type Fake = { build: BuildPortrait; started: string[]; disposed: string[]; steps: () => number };

function counting(stepsPerBuild = 2): Fake {
  const started: string[] = [];
  const disposed: string[] = [];
  let ran = 0;
  const build: BuildPortrait = (_renderer, pristine) => {
    started.push(pristine.id);
    function* steps(): Generator<PortraitWait, Portrait, void> {
      for (let i = 0; i < stepsPerBuild; i++) {
        ran++;
        yield;
      }
      return { width: started.length, has: () => true, release() {} } as unknown as Portrait;
    }
    return { steps: steps(), dispose: () => disposed.push(pristine.id) };
  };
  return { build, started, disposed, steps: () => ran };
}

function truck(): Vehicle {
  return emptyWorld().vehicles[0];
}

function settle(portraits: TruckPortraits, aheadOnly = false): void {
  for (let i = 0; i < 40; i++) portraits.step(1e9, aheadOnly);
}

function clone(v: Vehicle, id: string): Vehicle {
  return { ...structuredClone(v), id };
}

describe('truck portrait queue', () => {
  it('never builds when asked: shown and want run no step', () => {
    const fake = counting();
    const portraits = new TruckPortraits(RENDERER, fake.build);
    const v = truck();
    expect(portraits.shown(v, PAINT.standard)).toBeNull();
    portraits.want([], [v], v.id, PAINT.standard);
    expect(portraits.shown(v, PAINT.standard)).toBeNull();
    expect(fake.steps()).toBe(0);
    expect(fake.started).toEqual([]);
  });

  it('builds the wanted truck only in step, and shows it after the last step', () => {
    const fake = counting(3);
    const portraits = new TruckPortraits(RENDERER, fake.build);
    const v = truck();
    portraits.want([], [v], null, PAINT.standard);
    portraits.step(0, false);
    expect(portraits.shown(v, PAINT.standard)).toBeNull();
    settle(portraits);
    expect(portraits.shown(v, PAINT.standard)).not.toBeNull();
    expect(portraits.settled(v.id)).toBe(true);
    expect(fake.steps()).toBe(3);
  });

  it('runs one step on a spent budget and stops starting steps once it is spent', () => {
    const fake = counting(5);
    let clock = 0;
    const portraits = new TruckPortraits(RENDERER, fake.build, () => (clock += 10));
    portraits.want([], [truck()], null, PAINT.standard);
    portraits.step(0, false);
    expect(fake.steps()).toBe(1);
    portraits.step(25, false);
    expect(fake.steps()).toBeGreaterThan(1);
    expect(fake.steps()).toBeLessThan(5);
  });

  it('builds the player truck, then the focus, then the others in the given order', () => {
    const fake = counting(1);
    const portraits = new TruckPortraits(RENDERER, fake.build);
    const own = clone(truck(), 'own');
    const [near, far, aimed] = ['near', 'far', 'aimed'].map((id) => clone(own, id));
    portraits.want([own], [near, far, aimed], 'aimed', PAINT.standard);
    for (let i = 0; i < 8; i++) portraits.step(0, false);
    expect(fake.started).toEqual(['own', 'aimed', 'near', 'far']);
  });

  it('keeps a half-built truck when the focus moves to another truck', () => {
    const fake = counting(3);
    const portraits = new TruckPortraits(RENDERER, fake.build);
    const a = clone(truck(), 'a');
    const b = clone(truck(), 'b');
    portraits.want([], [a, b], 'a', PAINT.standard);
    portraits.step(0, false);
    portraits.want([], [a, b], 'b', PAINT.standard);
    settle(portraits);
    expect(fake.started.sort()).toEqual(['a', 'b']);
    expect(fake.disposed.sort()).toEqual(['a', 'b']);
    expect(portraits.shown(a, PAINT.standard)).not.toBeNull();
  });

  it('only steps the player trucks and the focus while a turn plays', () => {
    const fake = counting(1);
    const portraits = new TruckPortraits(RENDERER, fake.build);
    const own = clone(truck(), 'own');
    const other = clone(own, 'other');
    portraits.want([own], [other], null, PAINT.standard);
    settle(portraits, true);
    expect(fake.started).toEqual(['own']);
    settle(portraits);
    expect(fake.started).toEqual(['own', 'other']);
  });

  it('drops a build whose look changed, shows the old drawing meanwhile and finds it again when the look returns', () => {
    const fake = counting(2);
    const portraits = new TruckPortraits(RENDERER, fake.build);
    const v = truck();
    portraits.want([], [v], null, PAINT.standard);
    settle(portraits);
    const old = portraits.shown(v, PAINT.standard);
    const engine = mountedItems(v, 'engine')[0];
    engine.x += 1;
    portraits.want([], [v], null, PAINT.standard);
    expect(portraits.shown(v, PAINT.standard)).toBe(old);
    expect(portraits.settled(v.id)).toBe(false);
    portraits.step(0, false);
    engine.x -= 1;
    portraits.want([], [v], null, PAINT.standard);
    expect(fake.disposed).toHaveLength(2);
    settle(portraits);
    expect(portraits.shown(v, PAINT.standard)).toBe(old);
    expect(fake.started).toHaveLength(2);
  });

  it('builds once when only HP or wear change and when cargo changes', () => {
    const fake = counting(1);
    const portraits = new TruckPortraits(RENDERER, fake.build);
    const v = truck();
    portraits.want([], [v], null, PAINT.standard);
    settle(portraits);
    const engine = mountedParts(v, 'engine')[0];
    engine.hp = engine.hp / 3;
    engine.wear = 3;
    v.items.push({ id: 'crate', kind: 'good', good: 'scrap', x: 0, y: 0, rot: 0 });
    portraits.want([], [v], null, PAINT.standard);
    settle(portraits);
    expect(fake.started).toHaveLength(1);
  });

  it('builds the pristine truck, not the damaged one', () => {
    let seen: Vehicle | null = null;
    const build: BuildPortrait = (_renderer, pristine) => {
      seen = pristine;
      return { steps: (function* () { return { has: () => true, release() {} } as unknown as Portrait; })(), dispose() {} };
    };
    const v = truck();
    const engine = mountedParts(v, 'engine')[0];
    engine.hp = 1;
    engine.wear = 3;
    const portraits = new TruckPortraits(RENDERER, build);
    portraits.want([], [v], null, PAINT.standard);
    settle(portraits);
    const copy = mountedParts(seen as unknown as Vehicle, 'engine')[0];
    expect(copy.wear).toBe(0);
    expect(copy.hp).toBe(maxHp(copy));
    expect(engine.hp).toBe(1);
    expect(engine.wear).toBe(3);
  });

  it('keeps every truck in sight and only the newest out of sight', () => {
    const fake = counting(1);
    const portraits = new TruckPortraits(RENDERER, fake.build);
    const crowd = Array.from({ length: PORTRAIT_KEEP + 3 }, (_, i) => clone(truck(), `t${i}`));
    portraits.want([], crowd, null, PAINT.standard);
    settle(portraits);
    expect(crowd.every((v) => portraits.settled(v.id))).toBe(true);
    portraits.want([], [], null, PAINT.standard);
    const kept = crowd.filter((v) => portraits.shown(v, PAINT.standard));
    expect(kept).toHaveLength(PORTRAIT_KEEP);
    portraits.want([], [crowd[0]], null, PAINT.standard);
    expect(portraits.shown(crowd[0], PAINT.standard)).not.toBeNull();
  });

  it('keeps a truck that left sight for one turn without a rebuild', () => {
    const fake = counting(1);
    const portraits = new TruckPortraits(RENDERER, fake.build);
    const v = truck();
    portraits.want([], [v], null, PAINT.standard);
    settle(portraits);
    portraits.want([], [], null, PAINT.standard);
    portraits.want([], [v], null, PAINT.standard);
    settle(portraits);
    expect(fake.started).toHaveLength(1);
    expect(portraits.settled(v.id)).toBe(true);
  });

  it('tells its listeners which truck finished', () => {
    const fake = counting(1);
    const portraits = new TruckPortraits(RENDERER, fake.build);
    const told: string[] = [];
    portraits.onReady((id) => told.push(id));
    const v = truck();
    portraits.want([], [v], null, PAINT.standard);
    settle(portraits);
    expect(told).toEqual([v.id]);
  });

  it('throws a failed build once and does not retry that look', () => {
    const build: BuildPortrait = () => ({ steps: (function* () { throw new Error('no pixels'); yield; return {} as Portrait; })(), dispose() {} });
    const portraits = new TruckPortraits(RENDERER, build);
    portraits.want([], [truck()], null, PAINT.standard);
    expect(() => portraits.step(0, false)).toThrow('no pixels');
    expect(() => portraits.step(0, false)).not.toThrow();
  });

  it('waits on a readback before it resumes that build', async () => {
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => (finish = resolve));
    const build: BuildPortrait = () => ({ steps: (function* (): Generator<PortraitWait, Portrait, void> { yield pending; return { has: () => true, release() {} } as unknown as Portrait; })(), dispose() {} });
    const portraits = new TruckPortraits(RENDERER, build);
    const v = truck();
    portraits.want([], [v], null, PAINT.standard);
    portraits.step(0, false);
    portraits.step(0, false);
    expect(portraits.settled(v.id)).toBe(false);
    finish();
    await pending;
    portraits.step(0, false);
    expect(portraits.settled(v.id)).toBe(true);
  });
});

describe('chassis size', () => {
  it.each(Object.keys(CHASSIS))('%s: has a positive size at the portrait scale', (id) => {
    const size = chassisSize(id);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
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

  it.each(Object.keys(CHASSIS))('%s: a part with no mesh of its own is seen from the portrait camera through the body or the cab', (id) => {
    const { v } = bare(id);
    const view = new VehicleView(pristineOf(v), false, PAINT.standard, 'portrait');
    view.root.updateMatrixWorld(true);
    const solid: THREE.Mesh[] = [];
    view.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.visible && !o.userData.outline) solid.push(o);
    });
    const own = new Set(solid.map((m) => m.userData.partId).filter(Boolean));
    const cabIds = new Set(conditionItems(v).filter((it) => isCabDef(partDef(it.part.defId))).map((it) => it.part.id));
    const tilt = THREE.MathUtils.degToRad(PORTRAIT_TILT_DEG);
    const toward = new THREE.Vector3(-Math.sin(tilt), -Math.cos(tilt), 0);
    const caster = new THREE.Raycaster();
    for (const item of conditionItems(v)) {
      if (own.has(item.part.id)) continue;
      const rect = cellRect(id, itemCells(item));
      const offset = unitsOf(id)[rect.unit].offset;
      const seen = [0.25, 0.5, 0.75].some((fx) => [0.25, 0.5, 0.75].some((fz) => {
        const at = new THREE.Vector3(rect.x0 + offset + (rect.x1 - rect.x0) * fx, 0, rect.z0 + (rect.z1 - rect.z0) * fz);
        caster.set(at.clone().addScaledVector(toward, -20), toward);
        const hit = caster.intersectObjects(solid, false)[0];
        const owner = hit?.object.userData.partId;
        return Boolean(hit) && (!owner || cabIds.has(owner));
      }));
      expect(seen, `${item.part.defId} on ${id}`).toBe(true);
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
