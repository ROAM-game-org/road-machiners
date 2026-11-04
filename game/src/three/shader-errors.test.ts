import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { fakeGpu } from '../test/fake-gpu';
import { failLoudOnShaderError, SHADER_LOSS_GRACE_MS, ShaderBuildFailed, ShaderVerdicts, ShaderWarmup } from './shader-errors';

describe('failLoudOnShaderError', () => {
  const program = {} as WebGLProgram;
  const renderer = () => ({
    debug: { onShaderError: null },
    info: { programs: [{ program, cacheKey: 'MeshLambertMaterial,0,1,before(shader) {\n    shader.uniforms.roadMask = mask;\n  }|roads|facets' }] },
  }) as unknown as THREE.WebGLRenderer;
  const gl = {
    MAX_TEXTURE_IMAGE_UNITS: 1,
    getParameter: () => 16,
    getProgramInfoLog: () => 'too many samplers',
    getShaderInfoLog: () => '',
  } as unknown as WebGLRenderingContext;
  const link = (r: THREE.WebGLRenderer) => r.debug.onShaderError?.(gl, program as never, {} as WebGLShader, {} as WebGLShader);

  it('throws a named error with the material patches, the sampler limit and the GL log once the grace has passed, without the patch source', () => {
    const r = renderer();
    const gpu = fakeGpu();
    const verdicts = new ShaderVerdicts();
    failLoudOnShaderError(r, gpu, verdicts);
    link(r);
    expect(() => verdicts.settle(gpu, performance.now())).not.toThrow();
    const settle = () => verdicts.settle(gpu, performance.now() + SHADER_LOSS_GRACE_MS + 1);
    expect(settle).toThrow(ShaderBuildFailed);
    link(r);
    expect(settle).toThrow(/material \|roads\|facets \| sampler limit 16.*too many samplers.*context lost: no/);
    link(r);
    expect(settle).not.toThrow(/before\(shader/);
  });

  it('never throws for a failed link that a context loss follows inside the grace, as Firefox orders them', () => {
    const r = renderer();
    const gpu = fakeGpu();
    const verdicts = new ShaderVerdicts();
    failLoudOnShaderError(r, gpu, verdicts);
    link(r);
    gpu.blackout();
    gpu.recover();
    expect(() => verdicts.settle(gpu, performance.now() + 10 * SHADER_LOSS_GRACE_MS)).not.toThrow();
  });

  it('only warns for a failed link while the context is lost', () => {
    const r = renderer();
    const gpu = fakeGpu();
    const verdicts = new ShaderVerdicts();
    failLoudOnShaderError(r, gpu, verdicts);
    gpu.blackout();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => link(r)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    gpu.recover();
    expect(() => verdicts.settle(gpu, performance.now() + 10 * SHADER_LOSS_GRACE_MS)).not.toThrow();
  });
});

function warmupRenderer() {
  const programs = new WeakMap<THREE.Material, { currentProgram?: object }>();
  const drawn: boolean[] = [];
  let finish: () => void = () => {};
  const renderer = {
    debug: { onShaderError: null },
    properties: { get: (m: THREE.Material) => programs.get(m) ?? programs.set(m, {}).get(m)! },
    compileAsync: (o: THREE.Mesh) => {
      programs.get(o.material as THREE.Material)!.currentProgram = {};
      return new Promise<void>((resolve) => (finish = resolve));
    },
    render: (scene: THREE.Scene) => drawn.push(scene.children[0].visible),
    getSize: (target: THREE.Vector2) => target.copy(size),
  };
  const size = new THREE.Vector2(800, 600);
  return { renderer: renderer as unknown as THREE.WebGLRenderer, drawn, size, finish: () => finish() };
}

function sceneWith(mesh: THREE.Mesh): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(mesh);
  return scene;
}

describe('ShaderWarmup', () => {
  it('holds a mesh with an uncompiled material out of the frame until its shader is ready, then draws it', async () => {
    const { renderer, drawn, finish } = warmupRenderer();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const warmup = new ShaderWarmup(renderer, sceneWith(mesh), new THREE.PerspectiveCamera(), (e) => { throw e; }, fakeGpu());
    warmup.render(false);
    warmup.render(false);
    expect(drawn).toEqual([false, false]);
    expect(mesh.visible).toBe(true);
    finish();
    await Promise.resolve();
    warmup.render(false);
    expect(drawn).toEqual([false, false, true]);
  });

  it('compiles a material once even when three leaves it without a program', async () => {
    let compiles = 0;
    const renderer = {
      debug: { onShaderError: null },
      properties: { get: () => ({}) },
      compileAsync: () => {
        compiles++;
        return Promise.resolve();
      },
      render: () => {},
      getSize: (target: THREE.Vector2) => target.set(800, 600),
    } as unknown as THREE.WebGLRenderer;
    const warmup = new ShaderWarmup(renderer, sceneWith(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())), new THREE.PerspectiveCamera(), (e) => { throw e; }, fakeGpu());
    warmup.render(false);
    await Promise.resolve();
    warmup.render(false);
    warmup.render(false);
    expect(compiles).toBe(1);
  });

  it('holds an instanced mesh whose material only has the plain shader, since instancing needs its own program', async () => {
    const { renderer, drawn, finish } = warmupRenderer();
    const material = new THREE.MeshBasicMaterial();
    const plain = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const scene = sceneWith(plain);
    const warmup = new ShaderWarmup(renderer, scene, new THREE.PerspectiveCamera(), (e) => { throw e; }, fakeGpu());
    warmup.render(false);
    finish();
    await Promise.resolve();
    const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 2);
    scene.children.unshift(instanced);
    warmup.render(false);
    expect(drawn.at(-1)).toBe(false);
    expect(instanced.visible).toBe(true);
    finish();
    await Promise.resolve();
    warmup.render(false);
    expect(drawn.at(-1)).toBe(true);
  });

  it('holds a mesh again once a patch changed its material after it compiled, since the patch needs a new program', async () => {
    const { renderer, drawn, finish } = warmupRenderer();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const warmup = new ShaderWarmup(renderer, sceneWith(mesh), new THREE.PerspectiveCamera(), (e) => { throw e; }, fakeGpu());
    warmup.render(false);
    finish();
    await Promise.resolve();
    warmup.render(false);
    expect(drawn.at(-1)).toBe(true);
    mesh.material.needsUpdate = true;
    warmup.render(false);
    expect(drawn.at(-1)).toBe(true);
    mesh.material.customProgramCacheKey = () => 'patched';
    warmup.render(false);
    expect(drawn.at(-1)).toBe(false);
  });

  it('trusts a program three built before the warmup only when it was built with the material as it is now', () => {
    const { renderer, drawn } = warmupRenderer();
    const material = new THREE.MeshBasicMaterial();
    (renderer.properties.get(material) as { currentProgram?: object }).currentProgram = { cacheKey: `basic,${material.customProgramCacheKey()}` };
    new ShaderWarmup(renderer, sceneWith(new THREE.Mesh(new THREE.BoxGeometry(), material)), new THREE.PerspectiveCamera(), (e) => { throw e; }, fakeGpu()).render(false);
    expect(drawn.at(-1)).toBe(true);
    const patched = new THREE.MeshBasicMaterial();
    (renderer.properties.get(patched) as { currentProgram?: object }).currentProgram = { cacheKey: `basic,${patched.customProgramCacheKey()}` };
    patched.customProgramCacheKey = () => 'sight-grey';
    new ShaderWarmup(renderer, sceneWith(new THREE.Mesh(new THREE.BoxGeometry(), patched)), new THREE.PerspectiveCamera(), (e) => { throw e; }, fakeGpu()).render(false);
    expect(drawn.at(-1)).toBe(false);
  });

  it('redraws a frozen world only when the camera or the view size changed', () => {
    const { renderer, drawn, size } = warmupRenderer();
    const camera = new THREE.PerspectiveCamera();
    const warmup = new ShaderWarmup(renderer, sceneWith(new THREE.Mesh()), camera, (e) => { throw e; }, fakeGpu());
    warmup.render(false);
    warmup.render(true);
    expect(drawn).toHaveLength(1);
    camera.position.x += 1;
    warmup.render(true);
    warmup.render(true);
    expect(drawn).toHaveLength(2);
    camera.zoom = 2;
    camera.updateProjectionMatrix();
    warmup.render(true);
    expect(drawn).toHaveLength(3);
    size.set(640, 480);
    warmup.render(true);
    expect(drawn).toHaveLength(4);
    warmup.render(false);
    expect(drawn).toHaveLength(5);
  });

  it('leaves a mesh the game hid hidden', () => {
    const { renderer } = warmupRenderer();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.visible = false;
    new ShaderWarmup(renderer, sceneWith(mesh), new THREE.PerspectiveCamera(), (e) => { throw e; }, fakeGpu()).render(false);
    expect(mesh.visible).toBe(false);
  });

  it('forgets what it compiled after a restore, and a compile that resolves late marks nothing', async () => {
    const { renderer, finish } = warmupRenderer();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const gpu = fakeGpu();
    const warmup = new ShaderWarmup(renderer, sceneWith(mesh), new THREE.PerspectiveCamera(), (e) => { throw e; }, gpu);
    warmup.render(false);
    gpu.blackout();
    gpu.recover();
    finish();
    await Promise.resolve();
    expect(warmup.ready(mesh)).toBe(false);
  });

  it('draws nothing while the context is lost', () => {
    const { renderer, drawn } = warmupRenderer();
    const gpu = fakeGpu();
    const warmup = new ShaderWarmup(renderer, sceneWith(new THREE.Mesh()), new THREE.PerspectiveCamera(), (e) => { throw e; }, gpu);
    gpu.blackout();
    warmup.render(false);
    expect(drawn).toEqual([]);
  });

  it('makes shader build errors fail loud', () => {
    const { renderer } = warmupRenderer();
    new ShaderWarmup(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), (e) => { throw e; }, fakeGpu());
    expect(renderer.debug.onShaderError).not.toBeNull();
  });

  describe('a prepared group', () => {
    function groupRenderer(shown: THREE.Object3D[]) {
      const seen: boolean[][] = [];
      const renderer = {
        debug: { onShaderError: null },
        properties: { get: () => ({}) },
        compileAsync: () => Promise.resolve(),
        render: () => seen.push(shown.map((o) => o.visible)),
        getSize: (target: THREE.Vector2) => target.set(800, 600),
      } as unknown as THREE.WebGLRenderer;
      return { renderer, seen };
    }

    function countedMeshes(group: THREE.Group, count: number): { reads: () => number } {
      let reads = 0;
      const material = new THREE.MeshBasicMaterial();
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
        Object.defineProperty(mesh, 'material', { get: () => { reads++; return material; } });
        group.add(mesh);
      }
      return { reads: () => reads };
    }

    it('is not walked again while its shaders are compiled and its children stay the same', async () => {
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      const counted = countedMeshes(group, 40);
      scene.add(group);
      const { renderer } = groupRenderer([group]);
      const warmup = new ShaderWarmup(renderer, scene, new THREE.PerspectiveCamera(), (e) => { throw e; }, fakeGpu());
      warmup.prepare(group);
      await Promise.resolve();
      warmup.render(false);
      const before = counted.reads();
      warmup.render(false);
      warmup.render(false);
      expect(counted.reads()).toBe(before);
    });

    it('holds a mesh added after it was sealed until that mesh compiles', async () => {
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      countedMeshes(group, 3);
      scene.add(group);
      const late = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      const { renderer, seen } = groupRenderer([late]);
      const warmup = new ShaderWarmup(renderer, scene, new THREE.PerspectiveCamera(), (e) => { throw e; }, fakeGpu());
      warmup.prepare(group);
      await Promise.resolve();
      warmup.render(false);
      group.add(late);
      warmup.render(false);
      expect(seen.at(-1)).toEqual([false]);
      await Promise.resolve();
      warmup.render(false);
      expect(seen.at(-1)).toEqual([true]);
    });

    it('is walked again once a child is removed and added back with a changed material', async () => {
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      const kept = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      group.add(kept);
      scene.add(group);
      const { renderer, seen } = groupRenderer([kept]);
      const warmup = new ShaderWarmup(renderer, scene, new THREE.PerspectiveCamera(), (e) => { throw e; }, fakeGpu());
      warmup.prepare(group);
      await Promise.resolve();
      warmup.render(false);
      expect(seen.at(-1)).toEqual([true]);
      group.remove(kept);
      kept.material = new THREE.MeshBasicMaterial();
      group.add(kept);
      warmup.render(false);
      expect(seen.at(-1)).toEqual([false]);
    });
  });
});
