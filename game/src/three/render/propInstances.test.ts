import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { initPhysics } from '../../phys/drive';
import type { Terrain } from '../../sim/terrain';
import type { Obstacle } from '../../sim/types';
import { loadModels, model } from './models';
import { buildProp, ObstacleViews } from './obstacles';
import { RenderScope, SightLimit } from './scope';
import { PropInstances } from './propInstances';
import { buildCells, buildingOnSync } from '../../test/cells';
import { ICARUS_KEY } from '../../sim/atlas';

type Landmark = Extract<Obstacle, { kind: 'landmark' }>;

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});
await initPhysics();

const SIZE = 64;
const same = (_model: string, source: THREE.Material): THREE.Material => source;

function flat(): Terrain {
  return { size: SIZE, heights: new Array<number>((SIZE + 1) * (SIZE + 1)).fill(0), types: new Array(SIZE * SIZE).fill('hardpan'), atlas: ICARUS_KEY };
}

function tree(id: string, x: number, y: number): Landmark {
  return { id, pos: { x, y }, r: 0.35, kind: 'landmark', look: 'deadTree', yaw: 0.3 };
}

const TREES = [tree('deadTree-0', 5, 5), tree('deadTree-1', 7, 6), tree('deadTree-2', 9, 4), tree('deadTree-3', 40, 5)];

function build(before: (trees: PropInstances) => void = () => {}): { root: THREE.Group; trees: PropInstances } {
  const root = new THREE.Group();
  const scope = new RenderScope(root, SIZE, new SightLimit(SIZE), true, true);
  const trees = new PropInstances(scope, flat(), TREES, same);
  before(trees);
  buildCells(scope);
  return { root, trees };
}

function viewsOn(root: THREE.Group): ObstacleViews {
  const scope = new RenderScope(root, SIZE, new SightLimit(SIZE), true, true);
  return buildingOnSync(new ObstacleViews(scope, flat()), scope);
}

function meshesOf(root: THREE.Group, chunk: string): THREE.InstancedMesh[] {
  const group = root.getObjectByName(chunk);
  if (!group) throw new Error(`Missing ${chunk}`);
  const out: THREE.InstancedMesh[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.InstancedMesh && !o.userData.outline) out.push(o);
  });
  return out;
}

function matricesOf(meshes: THREE.InstancedMesh[]): number[][] {
  return meshes.map((m) => Array.from(m.instanceMatrix.array));
}

function zeroInstances(mesh: THREE.InstancedMesh): number {
  let zero = 0;
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    if (m.elements.every((e) => e === 0)) zero++;
  }
  return zero;
}

describe('PropInstances', () => {
  it('draws one instance per tree in its chunk', () => {
    const { root } = build();

    const west = meshesOf(root, 'scope-chunk-0-0');
    const east = meshesOf(root, 'scope-chunk-1-0');

    expect(west.length).toBeGreaterThan(0);
    expect(west.map((m) => m.count)).toEqual(west.map(() => 3));
    expect(east.map((m) => m.count)).toEqual(east.map(() => 1));
  });

  it('hides a broken tree and restores its pose when it grows back', () => {
    const { root, trees } = build();
    const meshes = meshesOf(root, 'scope-chunk-0-0');
    const standing = matricesOf(meshes);

    trees.hide('deadTree-1');
    const hidden = meshes.map(zeroInstances);
    trees.show('deadTree-1');

    expect(hidden).toEqual(meshes.map(() => 1));
    expect(matricesOf(meshes)).toEqual(standing);
  });

  it('keeps a tree hidden that broke before its cell was built', () => {
    const { root } = build((trees) => trees.hide('deadTree-1'));
    expect(meshesOf(root, 'scope-chunk-0-0').map(zeroInstances)).toEqual(meshesOf(root, 'scope-chunk-0-0').map(() => 1));
  });

  it('leaves the other chunks alone when a tree hides', () => {
    const { root, trees } = build();
    const east = meshesOf(root, 'scope-chunk-1-0');
    const standing = matricesOf(east);

    trees.hide('deadTree-0');

    expect(matricesOf(east)).toEqual(standing);
  });

  it('knows its trees', () => {
    const { trees } = build();

    expect(trees.has('deadTree-3')).toBe(true);
    expect(trees.has('fence-1')).toBe(false);
  });

  it('throws on a tree it does not draw', () => {
    const { trees } = build();

    expect(() => trees.hide('deadTree-9')).toThrow(/deadTree-9/);
    expect(() => trees.show('deadTree-9')).toThrow(/deadTree-9/);
  });

  it('refuses the same tree twice', () => {
    const root = new THREE.Group();
    const scope = new RenderScope(root, SIZE, new SightLimit(SIZE), true, true);

    expect(() => new PropInstances(scope, flat(), [TREES[0], TREES[0]], same)).toThrow(/deadTree-0/);
  });

  it('groups two models in one chunk into separate instanced groups', () => {
    const root = new THREE.Group();
    const scope = new RenderScope(root, SIZE, new SightLimit(SIZE), true, true);
    const fence: Landmark = { ...tree('fence-1', 6, 6), look: 'fence' };

    new PropInstances(scope, flat(), [TREES[0], fence], same);
    buildCells(scope);

    const counts = meshesOf(root, 'scope-chunk-0-0').map((m) => m.count);
    expect(counts.every((c) => c === 1)).toBe(true);
    expect(counts.length).toBeGreaterThan(meshesOf(build().root, 'scope-chunk-0-0').length);
  });

  it('draws 30 fort walls as one instanced mesh per material piece, whatever the count', () => {
    const wall = (i: number): Landmark => ({ ...tree(`fortPatchworkWall-${i}`, 2 + i, 5), look: 'fortPatchworkWall' });
    const draw = (n: number): THREE.InstancedMesh[] => {
      const root = new THREE.Group();
      const scope = new RenderScope(root, SIZE, new SightLimit(SIZE), true, true);
      new PropInstances(scope, flat(), Array.from({ length: n }, (_, i) => wall(i)), same);
      buildCells(scope);
      return meshesOf(root, 'scope-chunk-0-0');
    };

    const few = draw(2);
    const many = draw(30);

    expect(many.length).toBe(few.length);
    let pieces = 0;
    model('fort_patchwork_wall').traverse((o) => {
      if (o instanceof THREE.Mesh) pieces++;
    });
    expect(many).toHaveLength(pieces);
    expect(many.map((m) => m.count)).toEqual(many.map(() => 30));
  });

  it('keeps a withdrawn slot hidden for good', () => {
    const { root, trees } = build();
    const meshes = meshesOf(root, 'scope-chunk-0-0');

    const back = trees.withdraw('deadTree-1');
    trees.show('deadTree-1');

    expect(back.id).toBe('deadTree-1');
    expect(trees.holds('deadTree-1')).toBe(false);
    expect(trees.has('deadTree-1')).toBe(true);
    expect(meshes.map(zeroInstances)).toEqual(meshes.map(() => 1));
  });

  it('throws when it withdraws an unknown, hidden or withdrawn prop', () => {
    const { trees } = build();
    trees.hide('deadTree-0');
    trees.withdraw('deadTree-1');

    expect(() => trees.withdraw('deadTree-9')).toThrow(/deadTree-9/);
    expect(() => trees.withdraw('deadTree-0')).toThrow(/deadTree-0/);
    expect(() => trees.withdraw('deadTree-1')).toThrow(/deadTree-1/);
  });

  it('puts each instance where a per-prop copy of the same model stands', () => {
    const { root } = build();
    const single = new RenderScope(new THREE.Group(), SIZE, new SightLimit(SIZE), true, true);
    const probe = new THREE.Group();
    const lone = buildProp(flat(), TREES[1]);
    lone.updateMatrixWorld(true);
    probe.add(lone);
    const pieces: THREE.Matrix4[] = [];
    lone.traverse((o) => {
      if (o instanceof THREE.Mesh) pieces.push(o.matrixWorld.clone());
    });
    const batched = meshesOf(root, 'scope-chunk-0-0');
    const at = new THREE.Matrix4();

    expect(single).toBeDefined();
    expect(batched).toHaveLength(pieces.length);
    batched.forEach((mesh, i) => {
      mesh.getMatrixAt(1, at);
      at.elements.forEach((e, k) => expect(e).toBeCloseTo(pieces[i].elements[k], 4));
    });
  });
});

describe('ObstacleViews dead trees', () => {
  function views(): { root: THREE.Group; obstacles: ObstacleViews } {
    const root = new THREE.Group();
    const obstacles = viewsOn(root);
    obstacles.sync([...TREES], [], []);
    return { root, obstacles };
  }

  it('hides a tree while it is broken and shows it again when it grows back', () => {
    const { root, obstacles } = views();
    const meshes = meshesOf(root, 'scope-chunk-0-0');
    const standing = matricesOf(meshes);

    obstacles.sync(TREES.filter((o) => o.id !== 'deadTree-2'), [], [{ obstacle: TREES[2], turn: 1 }]);
    const hidden = meshes.map(zeroInstances);
    obstacles.sync([...TREES], [], []);

    expect(meshes.length).toBeGreaterThan(0);
    expect(hidden).toEqual(meshes.map(() => 1));
    expect(matricesOf(meshes)).toEqual(standing);
  });

  it('draws a tree that was broken at the first sync when it grows back', () => {
    const root = new THREE.Group();
    const obstacles = viewsOn(root);
    obstacles.sync(TREES.filter((o) => o.id !== 'deadTree-2'), [], [{ obstacle: TREES[2], turn: 1 }]);
    const meshes = meshesOf(root, 'scope-chunk-0-0');
    const hidden = meshes.map(zeroInstances);

    obstacles.sync([...TREES], [], []);

    expect(hidden).toEqual(meshes.map(() => 1));
    expect(matricesOf(meshes)).toEqual(matricesOf(meshesOf(views().root, 'scope-chunk-0-0')));
  });

  it('draws no view of its own for a tree', () => {
    const { root } = views();

    const meshes = meshesOf(root, 'scope-chunk-0-0');

    expect(meshes.map((m) => m.count)).toEqual(meshes.map(() => 3));
    expect(root.getObjectByName('scope-chunk-0-0')?.children).toHaveLength(1);
  });

  it('gives a tree that appears after the bake its own view', () => {
    const { root, obstacles } = views();
    const batched = meshesOf(root, 'scope-chunk-0-0').map((m) => m.count);

    obstacles.sync([...TREES, tree('deadTree-9', 12, 12)], [], []);

    expect(meshesOf(root, 'scope-chunk-0-0').map((m) => m.count)).toEqual(batched);
    expect(root.getObjectByName('scope-chunk-0-0')?.children.length).toBeGreaterThan(1);
  });
});
