import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { failLoudOnShaderError, ShaderBuildFailed, ShaderWarmup } from './shader-errors';

describe('failLoudOnShaderError', () => {
  it('throws a named error with the material patches, the sampler limit and the GL log, without the patch source', () => {
    const program = {} as WebGLProgram;
    const renderer = {
      debug: { onShaderError: null },
      info: { programs: [{ program, cacheKey: 'MeshLambertMaterial,0,1,before(shader) {\n    shader.uniforms.roadMask = mask;\n  }|roads|facets' }] },
    } as unknown as THREE.WebGLRenderer;
    const gl = {
      MAX_TEXTURE_IMAGE_UNITS: 1,
      getParameter: () => 16,
      getProgramInfoLog: () => 'too many samplers',
      getShaderInfoLog: () => '',
    } as unknown as WebGLRenderingContext;
    failLoudOnShaderError(renderer);
    const fail = () => renderer.debug.onShaderError?.(gl, program as never, {} as WebGLShader, {} as WebGLShader);
    expect(fail).toThrow(ShaderBuildFailed);
    expect(fail).toThrow(/material \|roads\|facets \| sampler limit 16.*too many samplers/);
    expect(fail).not.toThrow(/before\(shader/);
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
  };
  return { renderer: renderer as unknown as THREE.WebGLRenderer, drawn, finish: () => finish() };
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
    const warmup = new ShaderWarmup(renderer, sceneWith(mesh), new THREE.PerspectiveCamera(), (e) => { throw e; });
    warmup.render();
    warmup.render();
    expect(drawn).toEqual([false, false]);
    expect(mesh.visible).toBe(true);
    finish();
    await Promise.resolve();
    warmup.render();
    expect(drawn).toEqual([false, false, true]);
  });

  it('leaves a mesh the game hid hidden', () => {
    const { renderer } = warmupRenderer();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.visible = false;
    new ShaderWarmup(renderer, sceneWith(mesh), new THREE.PerspectiveCamera(), (e) => { throw e; }).render();
    expect(mesh.visible).toBe(false);
  });

  it('makes shader build errors fail loud', () => {
    const { renderer } = warmupRenderer();
    new ShaderWarmup(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), (e) => { throw e; });
    expect(renderer.debug.onShaderError).not.toBeNull();
  });
});
