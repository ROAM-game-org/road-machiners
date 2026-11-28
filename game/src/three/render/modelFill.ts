import * as THREE from 'three';
import type { Daylight } from './daylight';
import { paintModel } from './inkPaint';
import { TUNING } from './inkTuning';

const UNIFORMS = 'uniform vec4 modelFill;';

const FRAGMENT = `#include <aomap_fragment>
reflectedLight.indirectDiffuse += modelFill.rgb * max(normal.z, 0.0) * BRDF_Lambert(diffuseColor.rgb);`;

export class ModelFill {
  private readonly uniforms = { modelFill: { value: new THREE.Vector4(0, 0, 0, 0) } };
  private readonly shaded = new WeakMap<THREE.Material, boolean>();

  shadeTree(obj: THREE.Object3D): void {
    this.shadeAll(obj, false);
  }

  shadeTruck(obj: THREE.Object3D): void {
    this.shadeAll(obj, true);
  }

  private shadeAll(obj: THREE.Object3D, truck: boolean): void {
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const materials: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of materials) if (m instanceof THREE.MeshLambertMaterial) this.shade(m, truck);
    });
  }

  private shade(material: THREE.MeshLambertMaterial, truck: boolean): void {
    const patched = this.shaded.get(material);
    if (patched !== undefined) {
      if (patched !== truck) throw new Error(`Material ${material.name || material.uuid} is shaded as both a truck and a prop`);
      return;
    }
    this.shaded.set(material, truck);
    const define = truck ? '#define INK_LIGHT_FLOOR modelFill.w\n' : '';
    const before = material.onBeforeCompile.bind(material);
    const key = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer);
      paintModel(shader);
      if (shader.fragmentShader.includes(UNIFORMS)) return;
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${UNIFORMS}\n${define}`).replace('#include <aomap_fragment>', FRAGMENT);
      if (!shader.fragmentShader.includes('modelFill.rgb *')) throw new Error(`Model fill found no ambient occlusion step in ${material.name || material.uuid}`);
    };
    material.customProgramCacheKey = () => `${key()}|fill${truck ? '|truck' : ''}`;
    material.needsUpdate = true;
  }

  sync(light: Daylight): void {
    const fill = light.sky.clone().multiplyScalar(light.fillIntensity);
    this.uniforms.modelFill.value.set(fill.r, fill.g, fill.b, TUNING.truckNight.value);
  }
}

export const MODEL_FILL = new ModelFill();
