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

const ATTRIBUTES = ['position', 'normal', 'uv', 'uv1', 'color', 'tangent'];

type Keyed = { geometry: THREE.BufferGeometry; position: unknown; color: boolean; shadow: boolean; variant: string };

const keyed = new WeakMap<Drawn, Keyed>();

function variantOf(o: Drawn): string {
  const mesh = o as Partial<THREE.InstancedMesh & THREE.SkinnedMesh & THREE.BatchedMesh>;
  const color = Boolean(mesh.instanceColor);
  const known = keyed.get(o);
  if (known && known.geometry === o.geometry && known.position === o.geometry.attributes.position && known.color === color && known.shadow === o.receiveShadow) return known.variant;
  const attributes = ATTRIBUTES.map((name) => name in o.geometry.attributes);
  const variant = [mesh.isInstancedMesh, color, mesh.isSkinnedMesh, mesh.isBatchedMesh, o.receiveShadow, Object.keys(o.geometry.morphAttributes).join('+'), ...attributes].join('|');
  keyed.set(o, { geometry: o.geometry, position: o.geometry.attributes.position, color, shadow: o.receiveShadow, variant });
  return variant;
}

class Variants {
  private readonly byMaterial = new WeakMap<THREE.Material, Map<string, THREE.Material['customProgramCacheKey']>>();

  has(material: THREE.Material, variant: string): boolean {
    return this.byMaterial.get(material)?.get(variant) === material.customProgramCacheKey;
  }

  known(material: THREE.Material): boolean {
    return this.byMaterial.has(material);
  }

  add(material: THREE.Material, variant: string): void {
    const patches = this.byMaterial.get(material) ?? new Map<string, THREE.Material['customProgramCacheKey']>();
    patches.set(variant, material.customProgramCacheKey);
    this.byMaterial.set(material, patches);
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
    if (this.compiling.has(material, variant) || this.compiled.known(material) || !this.builtAsIs(material)) return false;
    this.compiled.add(material, variant);
    return true;
  }

  private builtAsIs(material: THREE.Material): boolean {
    const program = (this.renderer.properties.get(material) as { currentProgram?: { cacheKey?: string } }).currentProgram;
    return program?.cacheKey?.endsWith(material.customProgramCacheKey()) ?? false;
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
