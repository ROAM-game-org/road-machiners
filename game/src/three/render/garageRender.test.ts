import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHASSIS, PAINT } from '../../data/chassis';
import { PARTS, partDef } from '../../data/parts';
import { makePart } from '../../sim/factory';
import { baseGrid, itemCells, layerOf, mountCellsOf } from '../../sim/grid';
import type { PartInstance, Vehicle } from '../../sim/types';
import { bare } from '../../test/gun-clearance-kit';
import { BODY_PAD_M, GARAGE_MAX_SIDE, GARAGE_PX_PER_METER, GarageRenders, bodyKey, cabWindow, coreItems, mountSpotsOf, narrowedTo, pivotOf, planJobs, shotSize, spriteKey, type BuildGarageJob, type GarageJob, type GarageNeed } from './garageRender';
import type { PortraitWait } from './truckPortrait';
import { VehicleView } from './vehicle';

const RENDERER = {} as THREE.WebGLRenderer;
const SPRITE = { url: 'blob:x', left: 0, top: 0, width: 1, height: 1 };

function scout(): { truck: Vehicle; part: (defId: string) => PartInstance } {
  const { world, v } = bare('scout');
  return { truck: v, part: (defId) => makePart(world, defId, 0) };
}

function firstOf(kind: string, size: number): string {
  const def = Object.values(PARTS).find((d) => d.kind === kind && d.w * d.h === size && mountSpotsOf('scout', { id: 'probe', defId: d.id } as PartInstance).length > 1);
  if (!def) throw new Error(`No ${kind} of ${size} cells mounts twice on the scout`);
  return def.id;
}

function needFor(truck: Vehicle, parts: PartInstance[]): GarageNeed {
  return { truck, paint: PAINT.standard, parts: parts.map((part) => ({ part, spots: mountSpotsOf(truck.chassisId, part, coreItems(truck)) })) };
}

function faking(stepsPerJob = 2): { build: BuildGarageJob; started: GarageJob[]; disposed: number } {
  const fake = { started: [] as GarageJob[], disposed: 0, build: undefined as unknown as BuildGarageJob };
  fake.build = (_renderer, job, store) => {
    fake.started.push(job);
    function* steps(): Generator<PortraitWait, void, void> {
      for (let i = 0; i < stepsPerJob; i++) yield;
      if (job.kind === 'body') store.putBody(job.key, job.chassisId, { image: SPRITE, cores: new Map() });
      else for (const p of job.placements) store.putSprite(p.key, `${job.chassisId}|${p.item.part.id}`, SPRITE);
    }
    return { steps: steps(), dispose: () => fake.disposed++ };
  };
  return fake;
}

describe('garage mount spots', () => {
  it('list every cell and turn a gun can mount on, and only its mount cells', () => {
    const { truck, part } = scout();
    const gun = part(firstOf('weapon', 2));

    const spots = mountSpotsOf('scout', gun, coreItems(truck));

    const g = baseGrid('scout');
    expect(new Set(spots.map((s) => s.rot)).size).toBeGreaterThan(1);
    for (const spot of spots) for (const c of itemCells({ id: 'g', kind: 'part', part: gun, ...spot })) expect(mountCellsOf(gun.defId)).toContain(g.cells[c.y][c.x]);
  });

  it('give a built-in part no spots, since it never moves', () => {
    const { truck } = scout();

    const wheel = coreItems(truck).find((it) => { const def = partDef(it.part.defId); return def.kind === 'core' && def.role === 'wheel'; })!;

    expect(mountSpotsOf('scout', wheel.part, coreItems(truck))).toEqual([]);
  });
});

describe('garage render plan', () => {
  it('plans the bare truck and every spot of every part, never the same part twice in one build', () => {
    const { truck, part } = scout();
    const need = needFor(truck, [part(firstOf('weapon', 2)), part(firstOf('cargo', 1))]);

    const jobs = planJobs(need, () => false);

    const batches = jobs.filter((j) => j.kind === 'batch');
    expect(jobs[0]).toMatchObject({ kind: 'body', key: bodyKey(truck, PAINT.standard) });
    expect(batches.flatMap((b) => b.placements).length).toBe(need.parts.reduce((n, p) => n + p.spots.length, 0));
    for (const batch of batches) {
      const ids = batch.placements.map((p) => p.item.part.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('never puts two parts on one cell of the same layer in one build', () => {
    const { truck, part } = scout();
    const need = needFor(truck, [part(firstOf('weapon', 2)), part(firstOf('cargo', 1)), part(firstOf('cargo', 1))]);
    const g = baseGrid('scout');

    const batches = planJobs(need, () => false).flatMap((j) => (j.kind === 'batch' ? [j] : []));

    for (const batch of batches) {
      const taken = batch.placements.flatMap((p) => itemCells(p.item).map((c) => `${layerOf(g, p.item)}:${c.x},${c.y}`));
      expect(new Set(taken).size).toBe(taken.length);
    }
  });

  it('skips what is already drawn', () => {
    const { truck, part } = scout();
    const gun = part(firstOf('weapon', 2));
    const need = needFor(truck, [gun]);
    const drawn = new Set([bodyKey(truck, PAINT.standard), ...need.parts[0].spots.map((s) => spriteKey(truck, PAINT.standard, gun, s))]);

    expect(planJobs(need, (key) => drawn.has(key))).toEqual([]);
  });

  it('draws a part again once its wear look changes', () => {
    const { truck, part } = scout();
    const gun = part(firstOf('weapon', 2));
    const spot = mountSpotsOf('scout', gun, coreItems(truck))[0];

    const fresh = spriteKey(truck, PAINT.standard, gun, spot);
    const worn = spriteKey(truck, PAINT.standard, { ...gun, hp: 0 }, spot);

    expect(worn).not.toBe(fresh);
  });
});

describe('garage render queue', () => {
  it('builds nothing when asked, only in step', () => {
    const fake = faking();
    const renders = new GarageRenders(RENDERER, fake.build);
    const { truck, part } = scout();

    renders.want([needFor(truck, [part(firstOf('weapon', 2))])]);

    expect(fake.started).toEqual([]);
    expect(renders.body(truck, PAINT.standard)).toBeNull();
  });

  it('stops starting steps once the frame budget is spent', () => {
    const fake = faking(5);
    let clock = 0;
    const renders = new GarageRenders(RENDERER, fake.build, () => clock++);
    const { truck } = scout();
    renders.want([needFor(truck, [])]);

    renders.step(2);

    expect(renders.body(truck, PAINT.standard)).toBeNull();
    expect(renders.pending()).toBe(1);
  });

  it('finishes now what a screen needs, then picks up the background work it left', () => {
    const fake = faking();
    const renders = new GarageRenders(RENDERER, fake.build);
    const { truck, part } = scout();
    const gun = part(firstOf('weapon', 2));
    const background = needFor(truck, [gun, part(firstOf('cargo', 1))]);
    renders.want([background]);
    renders.step(0);

    renders.ensureNow([needFor(truck, [gun])]);

    expect(renders.body(truck, PAINT.standard)).not.toBeNull();
    expect(renders.pending()).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) renders.step(1e9);
    expect(renders.pending()).toBe(0);
  });

  it('refuses to wait on the GPU when the screen needs the render at once', () => {
    const build: BuildGarageJob = () => ({ steps: (function* () { yield Promise.resolve(); })(), dispose: () => {} });
    const renders = new GarageRenders(RENDERER, build);
    const { truck } = scout();

    expect(() => renders.ensureNow([needFor(truck, [])])).toThrow(/at once/);
  });

  it('has every sprite and the body once ensureNow returns, and tells its listeners once', () => {
    const fake = faking();
    const renders = new GarageRenders(RENDERER, fake.build);
    const { truck, part } = scout();
    const gun = part(firstOf('weapon', 2));
    const need = needFor(truck, [gun]);
    let told = 0;
    renders.onReady(() => told++);

    renders.ensureNow([need]);

    expect(renders.body(truck, PAINT.standard)).not.toBeNull();
    for (const spot of need.parts[0].spots) expect(renders.sprite(truck, PAINT.standard, gun, spot)).not.toBeNull();
    expect(told).toBe(1);
    expect(fake.disposed).toBe(fake.started.length);
    expect(renders.pending()).toBe(0);
  });

  it('waits on a pending readback before the next step of that job', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const build: BuildGarageJob = (_r, job, store) => ({
      steps: (function* () {
        yield gate;
        if (job.kind === 'body') store.putBody(job.key, job.chassisId, { image: SPRITE, cores: new Map() });
      })(),
      dispose: () => {},
    });
    const renders = new GarageRenders(RENDERER, build);
    const { truck } = scout();
    renders.want([needFor(truck, [])]);

    renders.step(1e9);
    renders.step(1e9);
    const before = renders.body(truck, PAINT.standard);
    release();
    await gate;
    await Promise.resolve();
    renders.step(1e9);

    expect(before).toBeNull();
    expect(renders.body(truck, PAINT.standard)).not.toBeNull();
  });

  it('keeps showing the last look of a part while its new wear look is drawn', async () => {
    const fake = faking();
    const renders = new GarageRenders(RENDERER, fake.build);
    const { truck, part } = scout();
    const gun = part(firstOf('weapon', 2));
    const spot = mountSpotsOf('scout', gun, coreItems(truck))[0];
    renders.putSprite(spriteKey(truck, PAINT.standard, gun, spot), `scout|${gun.id}@${spot.x},${spot.y},${spot.rot}`, SPRITE);

    const worn = renders.sprite(truck, PAINT.standard, { ...gun, hp: 0 }, spot);

    expect(worn).toBe(SPRITE);
  });
});

describe('garage render scene', () => {
  it('tags every mesh a placed gun draws with its own part id, so its picture holds the whole gun', () => {
    const { truck, part } = scout();
    const gun = part(firstOf('weapon', 2));
    const spot = mountSpotsOf('scout', gun, coreItems(truck))[0];
    const placed: Vehicle = { ...truck, items: [...coreItems(truck), { id: 'g', kind: 'part', part: gun, ...spot }] };
    const without: Vehicle = { ...truck, items: coreItems(truck) };

    const meshes = (v: Vehicle) => {
      const view = new VehicleView(v, false, PAINT.standard, 'portrait');
      const out: THREE.Mesh[] = [];
      view.root.traverse((o) => o instanceof THREE.Mesh && !o.userData.outline && out.push(o));
      return out;
    };

    const extra = meshes(placed).length - meshes(without).length;
    const tagged = meshes(placed).filter((m) => m.userData.partId === gun.id).length;
    expect(tagged).toBeGreaterThan(0);
    expect(tagged).toBe(extra);
  });
});

describe('garage render size', () => {
  it('caps the long side at the WebGL 2 floor and keeps the aspect', () => {
    const size = shotSize({ left: 0, right: 3, top: 25, bottom: 0 });
    expect(size.height).toBe(GARAGE_MAX_SIDE);
    expect(Math.abs(size.width - (3 / 25) * GARAGE_MAX_SIDE)).toBeLessThanOrEqual(1);
  });

  it('keeps full scale for a small frame', () => {
    expect(shotSize({ left: 0, right: 2, top: 4, bottom: 0 })).toEqual({ width: 2 * GARAGE_PX_PER_METER, height: 4 * GARAGE_PX_PER_METER });
  });

  it.each(Object.keys(CHASSIS))('draws the bare %s body inside the cap', (chassisId) => {
    const { v } = bare(chassisId);
    const view = new VehicleView({ ...v, items: coreItems(v) }, false, PAINT.standard, 'portrait');
    const box = new THREE.Box3();
    view.root.traverse((o) => o instanceof THREE.Mesh && o.visible && !o.userData.outline && box.expandByObject(o));
    const size = shotSize({ left: box.min.z - BODY_PAD_M, right: box.max.z + BODY_PAD_M, top: box.max.x + BODY_PAD_M, bottom: box.min.x - BODY_PAD_M });
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(GARAGE_MAX_SIDE);
  });
});

describe('the marks a garage sprite carries', () => {
  it('measures a pivot from the grid origin, across to the right and down the truck', () => {
    const pivot = pivotOf({ x: 3, z: -0.4 }, { x: 5, z: -1 });
    expect(pivot.x).toBeCloseTo(0.6, 9);
    expect(pivot.y).toBe(2);
  });

  it('cuts a frame to a window along the truck and keeps its width', () => {
    expect(narrowedTo({ left: -1, right: 1, top: 4, bottom: -4 }, { min: -1, max: 2 })).toEqual({ left: -1, right: 1, top: 2, bottom: -1 });
    expect(narrowedTo({ left: -1, right: 1, top: 1, bottom: 0 }, { min: -1, max: 2 })).toEqual({ left: -1, right: 1, top: 1, bottom: 0 });
  });

  it('gives the cab a window as long as its own cells when no glass is drawn', () => {
    const { v } = bare('scout');
    const cab = coreItems(v).find((it) => {
      const def = partDef(it.part.defId);
      return def.kind === 'core' && def.role === 'cab';
    })!;
    const window = cabWindow(v, cab, []);
    expect(window.max).toBeGreaterThan(window.min);
    expect(window.max - window.min).toBeLessThan(2);
  });
});
