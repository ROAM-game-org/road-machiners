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

function variantOf(o: Drawn): string {
  const mesh = o as Partial<THREE.InstancedMesh & THREE.SkinnedMesh & THREE.BatchedMesh>;
  const morphs = Object.keys(o.geometry.morphAttributes).join('+');
  return [mesh.isInstancedMesh, Boolean(mesh.instanceColor), mesh.isSkinnedMesh, mesh.isBatchedMesh, o.receiveShadow, morphs, 'tangent' in o.geometry.attributes].join('|');
}

class Variants {
  private readonly byMaterial = new WeakMap<THREE.Material, Set<string>>();

  has(material: THREE.Material, variant: string): boolean {
    return this.byMaterial.get(material)?.has(variant) ?? false;
  }

  known(material: THREE.Material): boolean {
    return this.byMaterial.has(material);
  }

  add(material: THREE.Material, variant: string): void {
    const set = this.byMaterial.get(material) ?? new Set<string>();
    set.add(variant);
    this.byMaterial.set(material, set);
  }

  delete(material: THREE.Material, variant: string): void {
    this.byMaterial.get(material)?.delete(variant);
  }
}

export class ShaderWarmup {
  private readonly compiled = new Variants();
  private readonly compiling = new Variants();
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
      if (!isDrawn(o)) return;
      const variant = variantOf(o);
      if (materialsOf(o).every((m) => this.isCompiled(m, variant))) return;
      this.compile(o, variant);
      o.visible = false;
      this.held.push(o);
    });
  }

  private isCompiled(material: THREE.Material, variant: string): boolean {
    if (this.compiled.has(material, variant)) return true;
    const properties = this.renderer.properties.get(material) as { currentProgram?: unknown };
    if (this.compiling.has(material, variant) || this.compiled.known(material) || !properties.currentProgram) return false;
    this.compiled.add(material, variant);
    return true;
  }

  private compile(o: Drawn, variant: string): void {
    const fresh = materialsOf(o).filter((m) => !this.compiling.has(m, variant));
    if (fresh.length === 0) return;
    for (const m of fresh) this.compiling.add(m, variant);
    this.renderer.compileAsync(o, this.camera, this.scene).then(() => {
      for (const m of fresh) {
        this.compiling.delete(m, variant);
        this.compiled.add(m, variant);
      }
    }, this.onError);
  }
}
