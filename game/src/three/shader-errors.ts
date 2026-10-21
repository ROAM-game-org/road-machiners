import * as THREE from 'three';

export class ShaderBuildFailed extends Error {
  constructor(detail: string) {
    super(`ShaderBuildFailed: ${detail}`);
    this.name = 'ShaderBuildFailed';
  }
}

const patchKeyOf = (cacheKey: string) => cacheKey.slice(cacheKey.lastIndexOf('}') + 1);

const materialOf = (renderer: THREE.WebGLRenderer, program: WebGLProgram) =>
  patchKeyOf(renderer.info.programs?.find((p) => p.program === program)?.cacheKey ?? '') || 'unknown';

const stageLog = (gl: WebGLRenderingContext, shader: WebGLShader, stage: string) => `${stage}: ${gl.getShaderInfoLog(shader) || 'no log'}`;

export function failLoudOnShaderError(renderer: THREE.WebGLRenderer): void {
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    const limit = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    const detail = [
      `material ${materialOf(renderer, program)}`,
      `sampler limit ${limit}`,
      `link log: ${gl.getProgramInfoLog(program) || 'no log'}`,
      stageLog(gl, vertex, 'vertex'),
      stageLog(gl, fragment, 'fragment'),
    ].join(' | ');
    throw new ShaderBuildFailed(detail);
  };
}

type Drawn = THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite;

function isDrawn(o: THREE.Object3D): o is Drawn {
  return o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points || o instanceof THREE.Sprite;
}

function materialsOf(o: Drawn): THREE.Material[] {
  return Array.isArray(o.material) ? o.material : [o.material];
}

export class ShaderWarmup {
  private readonly compiled = new WeakSet<THREE.Material>();
  private readonly compiling = new WeakSet<THREE.Material>();
  private held: THREE.Object3D[] = [];

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly onError: (error: unknown) => void,
  ) {
    failLoudOnShaderError(renderer);
  }

  render(): void {
    this.holdUncompiled();
    try {
      this.renderer.render(this.scene, this.camera);
    } finally {
      for (const o of this.held) o.visible = true;
      this.held = [];
    }
  }

  private holdUncompiled(): void {
    this.scene.traverseVisible((o) => {
      if (!isDrawn(o) || materialsOf(o).every((m) => this.isCompiled(m))) return;
      this.compile(o);
      o.visible = false;
      this.held.push(o);
    });
  }

  private isCompiled(material: THREE.Material): boolean {
    if (this.compiled.has(material)) return true;
    const properties = this.renderer.properties.get(material) as { currentProgram?: unknown };
    if (this.compiling.has(material) || !properties.currentProgram) return false;
    this.compiled.add(material);
    return true;
  }

  private compile(o: Drawn): void {
    const fresh = materialsOf(o).filter((m) => !this.compiling.has(m));
    if (fresh.length === 0) return;
    for (const m of fresh) this.compiling.add(m);
    this.renderer.compileAsync(o, this.camera, this.scene).then(() => {
      for (const m of fresh) this.compiling.delete(m);
    }, this.onError);
  }
}
