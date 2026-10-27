import * as THREE from 'three';
import type { Daylight } from './daylight';

const UNIFORMS = 'uniform vec3 modelFill;';

const FRAGMENT = `#include <aomap_fragment>
reflectedLight.indirectDiffuse += modelFill * max(normal.z, 0.0) * BRDF_Lambert(diffuseColor.rgb);`;

export class ModelFill {
  private readonly uniforms = { modelFill: { value: new THREE.Color(0, 0, 0) } };
  private readonly shaded = new WeakSet<THREE.Material>();

  shadeTree(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const materials: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of materials) if (m instanceof THREE.MeshLambertMaterial) this.shade(m);
    });
  }

  private shade(material: THREE.MeshLambertMaterial): void {
    if (this.shaded.has(material)) return;
    this.shaded.add(material);
    const before = material.onBeforeCompile.bind(material);
    const key = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer);
      if (shader.fragmentShader.includes(UNIFORMS)) return;
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${UNIFORMS}`).replace('#include <aomap_fragment>', FRAGMENT);
      if (!shader.fragmentShader.includes('modelFill *')) throw new Error(`Model fill found no ambient occlusion step in ${material.name || material.uuid}`);
    };
    material.customProgramCacheKey = () => `${key()}|fill`;
    material.needsUpdate = true;
  }

  sync(light: Daylight): void {
    this.uniforms.modelFill.value.copy(light.sky).multiplyScalar(light.fillIntensity);
  }
}

export const MODEL_FILL = new ModelFill();
