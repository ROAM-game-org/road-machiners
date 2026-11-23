import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { PHYSICS } from '../../data/physics';
import { UNPRICED_UTILITIES } from '../../data/utilities';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import type { World } from '../../sim/types';
import { TUNING } from './inkTuning';
import { ROUND_SHAPE, type Card, type FxCards } from './particles/cards';
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

  it('draws no card in any batch with ink on, for a zap and for a shut-down truck', () => {
    (TUNING.fxInk.value = 1);
    const { world, views } = pulsingWorld();
    const npc = world.vehicles[1];
    npc.shutDown = { until: world.turn + 2 } as typeof npc.shutDown;
    const view = new PulseView();
    view.update(world, world.terrain, views, 1000, null, camera(1));
    const out = recorded();
    view.draw(out.cards);
    expect(out.glow).toEqual([]);
    expect(out.lit).toEqual([]);
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

describe('Emitter pulse wave', () => {
  const reach = UNPRICED_UTILITIES.emitter.effect.type === 'emitter' ? UNPRICED_UTILITIES.emitter.effect.radius * PHYSICS.metersPerTile : 0;
  const at = (ms: number) => {
    const { world, views } = pulsingWorld();
    const view = new PulseView();
    view.update(world, world.terrain, views, 1000, null, camera(1));
    view.update(world, world.terrain, views, 1000 + ms, null, camera(1));
    return view;
  };

  it('has no wave before a pulse', () => {
    const world = emptyWorld();
    const view = new PulseView();
    view.update(world, world.terrain, new Map(), 1000, null, camera(1));
    expect(view.waves()).toEqual([]);
  });

  it('starts at the user, grows to the reach and falls to nothing over the pulse', () => {
    const steps = [0, 150, 300, 599].map((ms) => at(ms).waves());
    for (const waves of steps) expect(waves).toHaveLength(1);
    expect(steps[0][0].at).toMatchObject({ x: 0, z: 0 });
    expect(steps[0][0].radiusM).toBe(0);
    expect(steps[0][0].strength).toBe(1);
    const radii = steps.map((w) => w[0].radiusM);
    const strengths = steps.map((w) => w[0].strength);
    expect(radii).toEqual([...radii].sort((a, b) => a - b));
    expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
    expect(radii[3]).toBeGreaterThan(reach * 0.95);
    expect(radii[3]).toBeLessThanOrEqual(reach);
    expect(strengths[3]).toBeLessThan(0.01);
    expect(at(300).waves()[0].radiusM).toBeCloseTo(reach * 0.7, 5);
  });

  it('is gone at the end of the pulse', () => {
    expect(at(PULSE_MS).waves()).toEqual([]);
  });

  it('draws no wave with ink effects turned down', () => {
    TUNING.fxInk.value = 0;
    expect(at(100).waves()).toEqual([]);
  });

  it('gives the same waves for two updates at the same time', () => {
    const view = at(200);
    const first = JSON.parse(JSON.stringify(view.waves()));
    const { world, views } = pulsingWorld();
    view.update(world, world.terrain, views, 1200, null, camera(1));
    expect(JSON.parse(JSON.stringify(view.waves()))).toEqual(first);
  });
});

describe('shut-down crackle', () => {
  function shutWorld() {
    const world = emptyWorld();
    const npc = addVehicle(world, 'scrapjaw', 'buggy', ['stockEngine'], { x: world.vehicles[0].pos.x + 4, y: world.vehicles[0].pos.y });
    npc.shutDown = { until: world.turn + 2 } as typeof npc.shutDown;
    const stub = { center: () => ({ x: 5, y: 0.5, z: 5 }) } as unknown as VehicleView;
    return { world, npc, views: new Map([[npc.id, stub]]) as Map<string, VehicleView> };
  }
  const shown = (view: PulseView) => ribbons(view).filter((m) => m.visible);

  it('crawls three short ribbons over a shut-down truck with ink on and holds them while the clock stands', () => {
    const { world, views } = shutWorld();
    const view = new PulseView();
    view.update(world, world.terrain, views, 1000, null, camera(1));
    expect(shown(view)).toHaveLength(3);
    const first = positions(view);
    view.update(world, world.terrain, views, 1000, null, camera(1));
    expect(positions(view)).toEqual(first);
    view.update(world, world.terrain, views, 1100, null, camera(1));
    expect(positions(view)).not.toEqual(first);
  });

  it('removes the ribbons once the shutdown ends', () => {
    const { world, npc, views } = shutWorld();
    const view = new PulseView();
    view.update(world, world.terrain, views, 1000, null, camera(1));
    npc.shutDown = undefined;
    view.update(world, world.terrain, views, 1100, null, camera(1));
    expect(ribbons(view)).toHaveLength(0);
  });

  it('shows no ribbon with ink effects turned down', () => {
    (TUNING.fxInk.value = 0);
    const { world, views } = shutWorld();
    const view = new PulseView();
    view.update(world, world.terrain, views, 1000, null, camera(1));
    expect(shown(view)).toHaveLength(0);
  });
});
