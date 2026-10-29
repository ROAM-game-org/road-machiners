import * as THREE from 'three';

type Faded = { clone: THREE.Material; base: number };

const SHADOW_SHARE = 0.5;

export class TruckFade {
  private readonly clones = new Map<THREE.Material, Faded>();
  private readonly originals = new Map<THREE.Material, THREE.Material>();

  apply(root: THREE.Object3D, share: number): void {
    if (share >= 1) this.restore(root);
    else root.traverse((o) => this.fadeObject(o, share));
  }

  dispose(): void {
    for (const { clone } of this.clones.values()) clone.dispose();
    this.clones.clear();
    this.originals.clear();
  }

  private fadeObject(o: THREE.Object3D, share: number): void {
    if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.Sprite)) return;
    if (Array.isArray(o.material)) throw new Error('A truck mesh has more than one material');
    o.userData.castBeforeFade ??= o.castShadow;
    o.castShadow = o.userData.castBeforeFade && share >= SHADOW_SHARE;
    const faded = this.fadedOf(o.material);
    faded.clone.opacity = faded.base * share;
    o.material = faded.clone;
  }

  private fadedOf(material: THREE.Material): Faded {
    const original = this.originals.get(material) ?? material;
    const known = this.clones.get(original);
    if (known) return known;
    const clone = original.clone();
    clone.onBeforeCompile = original.onBeforeCompile;
    clone.customProgramCacheKey = original.customProgramCacheKey;
    if (original.defines) clone.defines = { ...original.defines };
    clone.userData = { ...original.userData, shared: false, fadeOf: original };
    clone.transparent = true;
    const faded = { clone, base: original.opacity };
    this.clones.set(original, faded);
    this.originals.set(clone, original);
    return faded;
  }

  private restore(root: THREE.Object3D): void {
    if (this.clones.size === 0) return;
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.Sprite)) return;
      o.material = this.originalOf(o.material as THREE.Material);
      if (o.userData.litMat) o.userData.litMat = this.originalOf(o.userData.litMat);
      if (o.userData.castBeforeFade !== undefined) o.castShadow = o.userData.castBeforeFade;
      delete o.userData.castBeforeFade;
    });
    this.dispose();
  }

  private originalOf(material: THREE.Material): THREE.Material {
    return this.originals.get(material) ?? material;
  }
}
