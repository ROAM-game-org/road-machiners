import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../data/physics';
import { perfSnapshot, resetPerf } from '../../perf';
import type { Vec } from '../../sim/vec';
import { RenderScope, SightLimit } from './scope';
import { CellStreamer, wantedCells } from './streamer';
import { TERRAIN_CHUNK } from './terrain';

const S = PHYSICS.metersPerTile;
const SIZE = 320;
const material = new THREE.MeshBasicMaterial();

function scope(): RenderScope {
  return new RenderScope(new THREE.Group(), SIZE, new SightLimit(SIZE), false, false);
}

function box(name: string, at: Vec): () => THREE.Object3D {
  return () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), material);
    mesh.name = name;
    mesh.position.set(at.x * S, 0, at.y * S);
    return mesh;
  };
}

function cellOf(p: Vec): number {
  return Math.floor(p.y / TERRAIN_CHUNK) * Math.ceil(SIZE / TERRAIN_CHUNK) + Math.floor(p.x / TERRAIN_CHUNK);
}

function clock(stepMs: number): () => number {
  let t = 0;
  return () => (t += stepMs);
}

describe('wanted cells', () => {
  it('wants a cell whose claim reaches the disc from a far anchor, and skips one whose claim does not', () => {
    const s = scope();
    const far = { x: 200, y: 16 };
    s.place(far, 120, box('town', far));
    const near = { x: 200, y: 200 };
    s.place(near, 1, box('crate', near));
    expect(wantedCells([s], { x: 60, y: 16 }, 30)).toEqual([cellOf(far)]);
  });

  it('orders cells nearest first, the same on every run', () => {
    const s = scope();
    const spots = [{ x: 150, y: 150 }, { x: 40, y: 40 }, { x: 100, y: 40 }, { x: 40, y: 100 }];
    spots.forEach((p, i) => s.place(p, 1, box(`b${i}`, p)));
    const order = wantedCells([s], { x: 40, y: 40 }, 400);
    expect(order[0]).toBe(cellOf({ x: 40, y: 40 }));
    expect(order.at(-1)).toBe(cellOf({ x: 150, y: 150 }));
    expect(wantedCells([s], { x: 40, y: 40 }, 400)).toEqual(order);
  });
});

describe('cell streamer', () => {
  it('builds every cell in reach in one frame, past the budget, and counts it as a blocking build', () => {
    resetPerf();
    const s = scope();
    for (let i = 0; i < 20; i++) s.place({ x: 10 + i, y: 10 }, 1, box(`r${i}`, { x: 10 + i, y: 10 }));
    const streamer = new CellStreamer([s], () => {}, clock(5), 1);
    streamer.frame({ x: 10, y: 10 }, 40, 40);
    expect(s.pendingCount).toBe(0);
    expect(perfSnapshot()['stream-block'].calls).toBe(1);
  });

  it('stops lead cells once the budget is spent, so only the placement already running overruns', () => {
    resetPerf();
    const s = scope();
    const spots = Array.from({ length: 6 }, (_, i) => ({ x: 100 + i * TERRAIN_CHUNK, y: 10 }));
    spots.forEach((p, i) => s.place(p, 1, box(`lead${i}`, p)));
    const streamer = new CellStreamer([s], () => {}, clock(4), 10);
    streamer.frame({ x: 10, y: 10 }, 20, 400);
    expect(s.pendingCount).toBe(6 - 2);
    expect(perfSnapshot()['stream-block']).toBeUndefined();
  });

  it('builds a cell ground first, then props, then decals, and prepares every built object', () => {
    const order: string[] = [];
    const [ground, props, decals] = [scope(), scope(), scope()];
    const at = { x: 5, y: 5 };
    decals.place(at, 1, () => (order.push('decal'), box('decal', at)()));
    props.place(at, 1, () => (order.push('prop'), box('prop', at)()));
    ground.place(at, 1, () => (order.push('ground'), box('ground', at)()));
    const prepared: string[] = [];
    new CellStreamer([ground, props, decals], (o) => prepared.push(o.name), clock(1), 100).boot(at, 10, 10);
    expect(order).toEqual(['ground', 'prop', 'decal']);
    expect(prepared).toEqual(['ground', 'prop', 'decal']);
  });

  it('builds the same objects per cell whatever order the cells build in', () => {
    const layout = (s: RenderScope) => {
      for (let i = 0; i < 40; i++) {
        const p = { x: (i * 37) % SIZE, y: (i * 91) % SIZE };
        s.place(p, 1, box(`p${i}`, p));
      }
    };
    const names = (root: THREE.Group) => Object.fromEntries(root.children.map((cell) => [cell.name, cell.children.map((o) => o.name).sort()]));
    const [rootA, rootB] = [new THREE.Group(), new THREE.Group()];
    const [a, b] = [new RenderScope(rootA, SIZE, new SightLimit(SIZE), false, false), new RenderScope(rootB, SIZE, new SightLimit(SIZE), false, false)];
    layout(a);
    layout(b);
    new CellStreamer([a], () => {}, clock(1), 1000).boot({ x: 0, y: 0 }, 1000, 1000);
    new CellStreamer([b], () => {}, clock(1), 1000).boot({ x: SIZE, y: SIZE }, 1000, 1000);
    expect(Object.keys(names(rootA)).length).toBeGreaterThan(10);
    expect(names(rootB)).toEqual(names(rootA));
  });
});
