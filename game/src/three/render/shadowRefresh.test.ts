import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ShadowRefresh } from './shadowRefresh';

function caster(x: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial());
  mesh.position.set(x, 0, 0);
  mesh.castShadow = true;
  return mesh;
}

function spot(): THREE.SpotLight {
  const light = new THREE.SpotLight(0xffffff, 1, 40, 0.6);
  light.castShadow = true;
  light.position.set(0, 20, 0);
  light.target.position.set(0, 0, 0);
  return light;
}

function stage(...objects: THREE.Object3D[]): { scene: THREE.Scene; refresh: ShadowRefresh; frame: () => void } {
  const scene = new THREE.Scene();
  scene.add(...objects);
  const refresh = new ShadowRefresh();
  const frame = (): void => {
    scene.updateMatrixWorld(true);
    refresh.update(scene);
    scene.traverse((o) => {
      if (!(o instanceof THREE.SpotLight) || !o.castShadow) return;
      if (o.shadow.needsUpdate) o.shadow.updateMatrices(o);
      o.shadow.needsUpdate = false;
    });
  };
  return { scene, refresh, frame };
}

function redraws(light: THREE.SpotLight, frame: () => void, change: () => void = () => {}): boolean {
  change();
  light.updateMatrixWorld();
  const scene = light.parent;
  if (!scene) throw new Error('The light has no scene');
  scene.updateMatrixWorld(true);
  const before = light.shadow.needsUpdate;
  if (before) throw new Error('A redraw was left waiting');
  let wanted = false;
  const original = light.shadow.updateMatrices.bind(light.shadow);
  light.shadow.updateMatrices = (l: THREE.Light) => {
    wanted = true;
    original(l);
  };
  frame();
  light.shadow.updateMatrices = original;
  return wanted;
}

function settled(extra: THREE.Object3D[] = []): { light: THREE.SpotLight; near: THREE.Mesh; frame: () => void; refresh: ShadowRefresh } {
  const light = spot();
  const near = caster(0);
  const { frame, refresh } = stage(light, light.target, near, ...extra);
  frame();
  frame();
  return { light, near, frame, refresh };
}

describe('ShadowRefresh', () => {
  it('draws a new light once and then leaves it while nothing changes', () => {
    const light = spot();
    const { frame } = stage(light, light.target, caster(0));
    frame();
    frame();
    expect(redraws(light, frame)).toBe(false);
    expect(light.shadow.autoUpdate).toBe(false);
  });

  it('redraws when a caster in view moves, and again when it stops', () => {
    const { light, near, frame } = settled();
    expect(redraws(light, frame, () => near.position.setX(0.5))).toBe(true);
    expect(redraws(light, frame)).toBe(false);
  });

  it('leaves a light alone when a caster outside its view moves', () => {
    const far = caster(5000);
    const { light, frame } = settled([far]);
    expect(redraws(light, frame, () => far.position.setX(5100))).toBe(false);
  });

  it('redraws when a caster leaves the view, and when it comes in', () => {
    const { light, near, frame } = settled();
    expect(redraws(light, frame, () => near.position.setX(5000))).toBe(true);
    frame();
    expect(redraws(light, frame, () => near.position.setX(0))).toBe(true);
  });

  it('redraws when a caster is hidden, stops casting, or is removed', () => {
    const { light, near, frame } = settled();
    expect(redraws(light, frame, () => (near.visible = false))).toBe(true);
    expect(redraws(light, frame, () => (near.visible = true))).toBe(true);
    expect(redraws(light, frame, () => (near.castShadow = false))).toBe(true);
    expect(redraws(light, frame, () => (near.castShadow = true))).toBe(true);
    expect(redraws(light, frame, () => near.removeFromParent())).toBe(true);
  });

  it('redraws when a hidden parent hides a caster', () => {
    const light = spot();
    const parent = new THREE.Group();
    parent.add(caster(0));
    const { frame } = stage(light, light.target, parent);
    frame();
    frame();
    expect(redraws(light, frame, () => (parent.visible = false))).toBe(true);
  });

  it('redraws when a mesh swaps its geometry, material or depth material', () => {
    const { light, near, frame } = settled();
    expect(redraws(light, frame, () => (near.geometry = new THREE.BoxGeometry(2, 2, 2)))).toBe(true);
    expect(redraws(light, frame, () => (near.material = new THREE.MeshLambertMaterial()))).toBe(true);
    expect(redraws(light, frame, () => (near.customDepthMaterial = new THREE.MeshDepthMaterial()))).toBe(true);
  });

  it('redraws when a geometry changes its vertices or draw range', () => {
    const { light, near, frame } = settled();
    expect(redraws(light, frame, () => (near.geometry.getAttribute('position').needsUpdate = true))).toBe(true);
    expect(redraws(light, frame, () => near.geometry.setDrawRange(0, 6))).toBe(true);
  });

  it('redraws when instances change', () => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), 2);
    mesh.setMatrixAt(0, new THREE.Matrix4());
    mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0, 0));
    mesh.castShadow = true;
    const { light, frame } = settled([mesh]);
    expect(redraws(light, frame, () => (mesh.instanceMatrix.needsUpdate = true))).toBe(true);
    expect(redraws(light, frame, () => (mesh.count = 1))).toBe(true);
    expect(redraws(light, frame)).toBe(false);
  });

  it('redraws when the light moves, turns or changes its reach', () => {
    const { light, frame } = settled();
    expect(redraws(light, frame, () => light.position.setX(1))).toBe(true);
    frame();
    expect(redraws(light, frame, () => light.target.position.setX(2))).toBe(true);
    frame();
    expect(redraws(light, frame, () => (light.angle = 0.5))).toBe(true);
    frame();
    expect(redraws(light, frame, () => (light.distance = 30))).toBe(true);
  });

  it('skips a dark light and catches up on what changed when it lights again', () => {
    const { light, near, frame } = settled();
    expect(redraws(light, frame, () => {
      light.intensity = 0;
      near.position.setX(0.5);
    })).toBe(false);
    expect(redraws(light, frame, () => (light.intensity = 1))).toBe(true);
  });

  it('does not redraw when a dark light lights again and nothing changed', () => {
    const { light, frame } = settled();
    expect(redraws(light, frame, () => (light.intensity = 0))).toBe(false);
    expect(redraws(light, frame, () => (light.intensity = 1))).toBe(false);
  });

  it('draws a light that starts dark once, so its shadow map exists', () => {
    const light = spot();
    light.intensity = 0;
    const { frame } = stage(light, light.target, caster(0));
    expect(redraws(light, frame)).toBe(true);
    expect(redraws(light, frame)).toBe(false);
  });

  it('draws every light again after forget, for a restored GPU context', () => {
    const { light, frame, refresh } = settled();
    refresh.forget();
    expect(redraws(light, frame)).toBe(true);
    expect(redraws(light, frame)).toBe(false);
  });

  it('covers a directional sun when its box changes', () => {
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.castShadow = true;
    sun.position.set(0, 50, 0);
    const scene = new THREE.Scene();
    scene.add(sun, sun.target, caster(0));
    const refresh = new ShadowRefresh();
    const frame = (): boolean => {
      scene.updateMatrixWorld(true);
      refresh.update(scene);
      const wanted = sun.shadow.needsUpdate;
      if (wanted) sun.shadow.updateMatrices(sun);
      sun.shadow.needsUpdate = false;
      return wanted;
    };
    frame();
    frame();
    expect(frame()).toBe(false);
    sun.shadow.camera.right = 500;
    expect(frame()).toBe(true);
  });
});
