import { describe, expect, it } from 'vitest';
import { Group, Mesh, OrthographicCamera, Scene, type Object3D, type WebGLRenderer } from 'three';
import { attribute, DrawCounter, GpuPacer, reachableObjects, systemMap, topLevelOf, uploadBytes, type SystemRoots } from './probe';

const named = (object: Object3D, name: string): Object3D => Object.assign(object, { name });

function sceneOf() {
  const scene = new Scene();
  const props = named(new Group(), 'props');
  const tree = new Mesh();
  const branch = new Group();
  branch.add(tree);
  props.add(branch);
  const truck = named(new Group(), 'truck');
  const wheel = new Mesh();
  truck.add(wheel);
  const stray = named(new Mesh(), 'stray');
  scene.add(props, truck, stray);
  const roots: SystemRoots = { terrain: [], props: [props], vehicles: [truck], lights: [], effects: [], overlays: [], other: [] };
  return { scene, props, tree, truck, wheel, stray, roots };
}

describe('topLevelOf', () => {
  it('walks up to the child of the scene', () => {
    const { scene, props, tree, stray } = sceneOf();
    expect(topLevelOf(tree, scene)).toBe(props);
    expect(topLevelOf(stray, scene)).toBe(stray);
  });

  it('gives null for the scene itself and for an object outside it', () => {
    const { scene } = sceneOf();
    expect(topLevelOf(scene, scene)).toBeNull();
    expect(topLevelOf(new Mesh(), scene)).toBeNull();
  });
});

describe('attribute', () => {
  it('maps a deep object to the system that owns its top-level group', () => {
    const { scene, tree, wheel, roots } = sceneOf();
    const map = systemMap(roots);
    expect(attribute(tree, scene, map)).toEqual({ system: 'props', other: null });
    expect(attribute(wheel, scene, map)).toEqual({ system: 'vehicles', other: null });
  });

  it('puts an unowned object in other and names it by type and name', () => {
    const { scene, stray, roots } = sceneOf();
    expect(attribute(stray, scene, systemMap(roots))).toEqual({ system: 'other', other: 'Mesh:stray' });
    expect(attribute(new Mesh(), scene, systemMap(roots))).toEqual({ system: 'other', other: 'Mesh:unnamed' });
  });
});

describe('reachableObjects', () => {
  it('finds objects inside plain fields, arrays, maps and sets without entering the objects', () => {
    const a = new Mesh();
    const b = new Mesh();
    const c = new Mesh();
    const inner = new Mesh();
    a.add(inner);
    const holder = { list: [a], deep: { map: new Map([['x', b]]), set: new Set([c]) } };
    const found = reachableObjects(holder, 4);
    expect([...found].sort()).toEqual([a, b, c].sort());
    expect(found.has(inner)).toBe(false);
  });

  it('survives cycles and stops at the depth', () => {
    const a = new Mesh();
    const loop: Record<string, unknown> = { a };
    loop.self = loop;
    expect(reachableObjects(loop, 4)).toEqual(new Set([a]));
    expect(reachableObjects({ one: { two: { three: a } } }, 2).size).toBe(0);
  });
});

describe('DrawCounter', () => {
  function fakeRenderer(callsPerDraw: (object: Object3D) => number) {
    const info = { render: { calls: 0, triangles: 0 } };
    const renderer = {
      info,
      renderBufferDirect: (_camera: unknown, _scene: unknown, _geometry: unknown, _material: unknown, object: Object3D) => {
        const draws = callsPerDraw(object);
        info.render.calls += draws;
        info.render.triangles += draws * 10;
      },
    };
    return renderer as unknown as WebGLRenderer;
  }

  function drawAll(renderer: WebGLRenderer, camera: unknown, objects: Object3D[]): void {
    for (const object of objects) renderer.renderBufferDirect(camera as OrthographicCamera, null as never, null as never, null as never, object, null as never);
  }

  it('counts draws and triangles by system and by pass', () => {
    const { scene, tree, wheel, stray, roots } = sceneOf();
    const main = new OrthographicCamera();
    const shadowCamera = new OrthographicCamera();
    const renderer = fakeRenderer(() => 1);
    const counter = new DrawCounter(renderer, scene, main);
    counter.start(systemMap(roots));
    drawAll(renderer, main, [tree, tree, wheel]);
    drawAll(renderer, shadowCamera, [tree, stray]);
    counter.afterRender();
    counter.stop();
    const report = counter.report();
    expect(report.bySystem.props).toEqual({ main: { draws: 2, triangles: 20 }, shadow: { draws: 1, triangles: 10 } });
    expect(report.bySystem.vehicles.main).toEqual({ draws: 1, triangles: 10 });
    expect(report.bySystem.other.shadow.draws).toBe(1);
    expect(report.other).toEqual({ 'Mesh:stray': 1 });
    expect(report).toMatchObject({ total: 5, rendererCalls: 5, byPass: { main: { draws: 3 }, shadow: { draws: 2 } } });
  });

  it('does not count a call that drew nothing', () => {
    const { scene, tree, roots } = sceneOf();
    const main = new OrthographicCamera();
    const renderer = fakeRenderer((object) => (object === tree ? 0 : 1));
    const counter = new DrawCounter(renderer, scene, main);
    counter.start(systemMap(roots));
    drawAll(renderer, main, [tree]);
    counter.afterRender();
    counter.stop();
    expect(counter.report().total).toBe(0);
  });

  it('fails the run when the renderer drew something the counter did not see', () => {
    const { scene, tree, roots } = sceneOf();
    const main = new OrthographicCamera();
    const renderer = fakeRenderer(() => 1);
    const counter = new DrawCounter(renderer, scene, main);
    counter.start(systemMap(roots));
    drawAll(renderer, main, [tree]);
    renderer.info.render.calls += 1;
    counter.afterRender();
    counter.stop();
    expect(() => counter.report()).toThrow('IV7');
  });

  it('restores the renderer method on stop and counts nothing after the first render', () => {
    const { scene, tree, roots } = sceneOf();
    const main = new OrthographicCamera();
    const renderer = fakeRenderer(() => 1);
    const before = renderer.renderBufferDirect;
    const counter = new DrawCounter(renderer, scene, main);
    counter.start(systemMap(roots));
    drawAll(renderer, main, [tree]);
    counter.afterRender();
    drawAll(renderer, main, [tree]);
    counter.stop();
    expect(renderer.renderBufferDirect).toBe(before);
    expect(counter.report()).toMatchObject({ total: 1, rendererCalls: 1 });
  });
});

describe('uploadBytes', () => {
  it('sizes typed data, images and bufferData sizes', () => {
    expect(uploadBytes('bufferSubData', [1, 0, new Float32Array(10)])).toBe(40);
    expect(uploadBytes('texImage2D', [1, 0, 2, 3, 4, { width: 8, height: 4 }])).toBe(128);
    expect(uploadBytes('bufferData', [1, 256, 2])).toBe(256);
    expect(uploadBytes('bufferData', [1, new ArrayBuffer(12), 2])).toBe(12);
  });

  it('counts an allocation without data as zero bytes', () => {
    expect(uploadBytes('texImage2D', [1, 0, 2, 64, 64, 0, 3, 4, null])).toBe(0);
  });
});

describe('GpuPacer', () => {
  function pacer() {
    const signaled = new Set<object>();
    const fences: object[] = [];
    const gl = {
      SYNC_GPU_COMMANDS_COMPLETE: 1,
      SYNC_STATUS: 2,
      SIGNALED: 3,
      lost: false,
      fenceSync: () => {
        const fence = {};
        fences.push(fence);
        return fence as WebGLSync;
      },
      getSyncParameter: (sync: WebGLSync) => (signaled.has(sync as object) ? 3 : 0),
      deleteSync: () => {},
      flush: () => {},
      isContextLost: () => gl.lost,
    };
    return { gl, fences, signaled, pacer: new GpuPacer(gl as unknown as ConstructorParameters<typeof GpuPacer>[0]) };
  }

  it('lets the next frame start while one frame is still on the GPU', () => {
    const { pacer: p } = pacer();
    p.rendered(0);
    expect(p.free(1)).toBe(true);
  });

  it('holds the next frame while two frames are on the GPU, until the older finishes', () => {
    const { pacer: p, fences, signaled } = pacer();
    p.rendered(0);
    p.rendered(1);
    expect(p.free(2)).toBe(false);
    signaled.add(fences[0]);
    expect(p.free(3)).toBe(true);
  });

  it('never holds a frame after the context is lost', () => {
    const { pacer: p, gl } = pacer();
    p.rendered(0);
    p.rendered(1);
    gl.lost = true;
    expect(p.free(2)).toBe(true);
  });

  it('fails loudly when the GPU never finishes a frame', () => {
    const { pacer: p } = pacer();
    p.rendered(0);
    p.rendered(1);
    expect(() => p.free(100000)).toThrow('The GPU did not finish a frame');
  });
});
