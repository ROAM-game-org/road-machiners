import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import type { World } from '../../sim/types';
import { TUNING } from './inkTuning';
import { COOL_INK, coolInkShape, GLOW_IN_LIT, ROUND_SHAPE, type Card, type FxCards } from './particles/cards';
import { PulseView } from './pulse';
import type { VehicleView } from './vehicle';

const PULSE_MS = 600;

function recorded(): { lit: Card[]; glow: Card[]; cards: FxCards } {
  const lit: Card[] = [];
  const glow: Card[] = [];
  const batch = (into: Card[]) => ({ push: (card: Card) => void into.push(card) });
  return { lit, glow, cards: { lit: batch(lit), glow: batch(glow) } as unknown as FxCards };
}

function pulsingWorld(): { world: World; views: Map<string, VehicleView> } {
  const world = emptyWorld();
  const me = world.vehicles[0];
  const npc = addVehicle(world, 'scrapjaw', 'buggy', ['stockEngine'], { x: me.pos.x + 4, y: me.pos.y });
  world.events = [{ t: 'pulse', vehicle: me.id, pos: { ...me.pos }, hit: [npc.id] }];
  const stub = (x: number) => ({ center: () => ({ x, y: 0.5, z: 0 }) }) as unknown as VehicleView;
  return { world, views: new Map([[me.id, stub(0)], [npc.id, stub(20)]]) };
}

function camera(zoom: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  cam.zoom = zoom;
  cam.position.set(10, 10, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

function ribbons(view: PulseView): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  view.root.traverse((o) => {
    if (o instanceof THREE.Mesh) found.push(o);
  });
  return found;
}

function positions(view: PulseView): number[] {
  const out: number[] = [];
  view.root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) out.push(...(o.geometry.getAttribute('position').array as Float32Array));
  });
  return out;
}

afterEach(() => {
  TUNING.fxInk.value = 1;
});

describe('Emitter pulse view', () => {
  it('holds every arc still while the clock stands and re-rolls it a crackle step later, in both looks', () => {
    for (const ink of [1, 0]) {
      (TUNING.fxInk.value = ink);
      const { world, views } = pulsingWorld();
      const view = new PulseView();
      view.update(world, world.terrain, views, 1000, null, camera(1));
      const first = positions(view);
      view.update(world, world.terrain, views, 1000, null, camera(1));
      expect(positions(view)).toEqual(first);
      view.update(world, world.terrain, views, 1100, null, camera(1));
      expect(positions(view)).not.toEqual(first);
    }
  });

  it('puts every card in the lit batch as a cool ink card with ink on', () => {
    (TUNING.fxInk.value = 1);
    const { world, views } = pulsingWorld();
    const view = new PulseView();
    view.update(world, world.terrain, views, 1000, null, camera(1));
    const out = recorded();
    view.draw(out.cards);
    expect(out.glow).toEqual([]);
    expect(out.lit.length).toBeGreaterThan(0);
    expect(out.lit.every((c) => c.shape === ROUND_SHAPE + COOL_INK)).toBe(true);
  });

  it('keeps the soft glow cards with ink effects turned down', () => {
    (TUNING.fxInk.value = 0);
    const { world, views } = pulsingWorld();
    const view = new PulseView();
    view.update(world, world.terrain, views, 1000, null, camera(1));
    const out = recorded();
    view.draw(out.cards);
    expect(out.lit).toEqual([]);
    expect(out.glow.length).toBeGreaterThan(0);
    expect(out.glow.every((c) => c.shape === ROUND_SHAPE)).toBe(true);
  });

  it('shows flat ribbons and no additive line with ink on', () => {
    (TUNING.fxInk.value = 1);
    const { world, views } = pulsingWorld();
    const view = new PulseView();
    view.update(world, world.terrain, views, 1000, null, camera(1));
    const shown: THREE.Object3D[] = [];
    view.root.traverse((o) => {
      if (o.visible && (o instanceof THREE.Mesh || o instanceof THREE.Line)) shown.push(o);
    });
    expect(shown.some((o) => o instanceof THREE.Line)).toBe(false);
    expect(shown.length).toBeGreaterThan(0);
    for (const o of shown as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]) expect(o.material.blending).not.toBe(THREE.AdditiveBlending);
  });

  it('sizes the ribbon in meters whatever the camera zoom', () => {
    const widths = [1, 3].map((zoom) => {
      const { world, views } = pulsingWorld();
      const view = new PulseView();
      view.update(world, world.terrain, views, 1000, null, camera(zoom));
      view.update(world, world.terrain, views, 1000 + PULSE_MS / 4, null, camera(zoom));
      const at = ribbons(view)[0].geometry.getAttribute('position');
      const row = 4 * at.itemSize * 10;
      const left = new THREE.Vector3(at.array[row], at.array[row + 1], at.array[row + 2]);
      const right = new THREE.Vector3(at.array[row + 27], at.array[row + 28], at.array[row + 29]);
      return left.distanceTo(right);
    });
    expect(widths[0]).toBeGreaterThan(0);
    expect(widths[1]).toBeCloseTo(widths[0], 5);
  });

  it('narrows the ribbon to nothing as the pulse ends', () => {
    const { world, views } = pulsingWorld();
    const view = new PulseView();
    const width = (ms: number) => {
      view.update(world, world.terrain, views, ms, null, camera(1));
      const at = ribbons(view)[0].geometry.getAttribute('position');
      return new THREE.Vector3().fromArray(at.array as Float32Array, 0).distanceTo(new THREE.Vector3().fromArray(at.array as Float32Array, 27));
    };
    expect(width(1000 + PULSE_MS * 0.9)).toBeLessThan(width(1000 + 1));
  });
});

describe('coolInkShape', () => {
  it('adds the flag to a plain shape', () => {
    expect(coolInkShape(ROUND_SHAPE)).toBe(ROUND_SHAPE + COOL_INK);
  });

  it('throws on a shape that already carries a flag', () => {
    expect(() => coolInkShape(ROUND_SHAPE + GLOW_IN_LIT)).toThrow();
    expect(() => coolInkShape(ROUND_SHAPE + COOL_INK)).toThrow();
  });
});
