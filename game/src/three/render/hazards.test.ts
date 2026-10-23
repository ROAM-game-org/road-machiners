import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAL } from '../../render/palette';
import { dropField } from '../../sim/hazards';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import type { Vehicle, World } from '../../sim/types';
import { cloneWorld } from '../../sim/world';
import type { Card, FxCards } from './particles/cards';
import type * as Zones from './zones';

const bands = vi.hoisted(() => new Set<object>());
vi.mock('./zones', async (load) => {
  const zones = await load<typeof Zones>();
  class RecordedBand extends zones.GroundBand {
    constructor(look: ConstructorParameters<typeof zones.GroundBand>[0]) {
      super(look);
      bands.add(this.mesh);
    }
  }
  return { ...zones, GroundBand: RecordedBand };
});

const { HazardViews, cutShare } = await import('./hazards');

function stubCanvas(): void {
  const ctx = { createRadialGradient: () => ({ addColorStop: () => {} }), fillRect: () => {}, fillStyle: '' };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
}

function recordedCards(): { glow: Card[]; lit: Card[]; batches: FxCards } {
  const glow: Card[] = [];
  const lit: Card[] = [];
  return { glow, lit, batches: { glow: { push: (c: Card) => glow.push(c) }, lit: { push: (c: Card) => lit.push(c) } } as unknown as FxCards };
}

function droveEast(world: World): Vehicle {
  const me = world.vehicles[0];
  me.pos = { x: 30, y: 30 };
  me.heading = 0;
  me.trail = Array.from({ length: 11 }, (_, i) => ({ x: 20 + i, y: 30, heading: 0 }));
  return me;
}

const clock = (before: World, progress: number, moved = false, hookedLines: ReadonlySet<string> = new Set()) => ({ before, progress, moved, hookedLines });

describe('cutShare', () => {
  const cut = { at: new THREE.Vector3(0, 0, 0), look: new THREE.Vector3(0, -1, 0) };
  const half = 6;

  it('thins a puff between the camera and the player truck', () => {
    expect(cutShare(cut, new THREE.Vector3(0.5, 4, 0), half)).toBeLessThan(0.2);
  });

  it('leaves whole a puff clear of the truck on screen, one behind it, and every puff with no truck', () => {
    expect(cutShare(cut, new THREE.Vector3(12, 4, 0), half)).toBe(1);
    expect(cutShare(cut, new THREE.Vector3(0.5, -4, 0), half)).toBe(1);
    expect(cutShare(null, new THREE.Vector3(0.5, 4, 0), half)).toBe(1);
  });
});

describe('HazardViews', () => {
  beforeEach(() => {
    stubCanvas();
    bands.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows smoke and caltrops made this turn from the start of the move', () => {
    const world = emptyWorld();
    const me = droveEast(world);
    const before = cloneWorld(world);
    world.smoke.push({ id: 's1', source: me.id, pos: { x: 20, y: 30 }, r: 4, turnsLeft: 5 });
    dropField(world, me, 'caltrops', { radius: 1.25, turns: 5, behind: 1 });
    const views = new HazardViews();
    const camera = new THREE.PerspectiveCamera();

    views.update(world, world.terrain, new Map(), 1000, clock(before, 0), camera);
    views.update(world, world.terrain, new Map(), 1300, clock(before, 0), camera);
    const cards = recordedCards();
    views.draw(cards.batches);

    expect(cards.lit.length).toBeGreaterThan(0);
    expect(spikesOf(views).some((s) => s.visible)).toBe(true);
  });

  it('flies a flare made this turn when the playback ended in the volley frame', () => {
    const world = emptyWorld();
    const me = world.vehicles[0];
    const before = cloneWorld(world);
    const pos = { x: me.pos.x + 12, y: me.pos.y };
    world.flares.push({ id: 'f1', source: me.id, pos, r: 10, turnsLeft: 6 });
    world.events = [{ t: 'utility', vehicle: me.id, part: 'p1', effect: 'flare', point: { ...pos } }];
    const views = new HazardViews();
    const camera = new THREE.PerspectiveCamera();

    views.update(world, world.terrain, new Map(), 1000, clock(before, 0.5), camera);
    views.update(world, world.terrain, new Map(), 1016, null, camera);

    const shown: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>[] = [];
    views.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.visible && o.parent?.visible !== false) shown.push(o);
    });
    const cards = recordedCards();
    views.draw(cards.batches);
    expect(shown.some((o) => o.material.color.getHex() === PAL.flare.casing)).toBe(true);
    expect(cards.glow).toEqual([]);

    views.update(world, world.terrain, new Map(), 3000, null, camera);
    views.draw(cards.batches);
    expect(cards.glow.length).toBeGreaterThan(0);
  });

  const spikesOf = (views: InstanceType<typeof HazardViews>): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    views.root.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.MeshLambertMaterial).color?.getHex() === PAL.caltrops.spike) out.push(o);
    });
    return out;
  };

  it('drops a fresh caltrop field from above the ground and lets its spikes settle', () => {
    const world = emptyWorld();
    const me = droveEast(world);
    const before = cloneWorld(world);
    world.fields.push({ id: 'g1', kind: 'caltrops', source: me.id, pos: { x: 22, y: 30 }, r: 1.25, turnsLeft: 5, hit: [] });
    const views = new HazardViews();
    const camera = new THREE.PerspectiveCamera();

    views.update(world, world.terrain, new Map(), 1000, clock(before, 1, true), camera);
    const first = spikesOf(views).filter((s) => s.visible).map((s) => s.position.y);
    views.update(world, world.terrain, new Map(), 3000, clock(before, 1, true), camera);
    const rest = spikesOf(views).map((s) => s.position.y);

    expect(spikesOf(views).every((s) => s.visible)).toBe(true);
    expect(Math.min(...first)).toBeGreaterThan(Math.max(...rest));
  });

  it('sinks a gone caltrop field into the ground before dropping it', () => {
    const world = emptyWorld();
    const me = world.vehicles[0];
    world.fields.push({ id: 'g1', kind: 'caltrops', source: me.id, pos: { x: 25, y: 32 }, r: 1.25, turnsLeft: 1, hit: [] });
    const views = new HazardViews();
    const camera = new THREE.PerspectiveCamera();
    views.update(world, world.terrain, new Map(), 1000, null, camera);
    const rest = spikesOf(views).map((s) => s.position.y);

    world.fields = [];
    views.update(world, world.terrain, new Map(), 1100, null, camera);
    views.update(world, world.terrain, new Map(), 1700, null, camera);
    const sinking = spikesOf(views).map((s) => s.position.y);
    expect(sinking.length).toBe(rest.length);
    expect(sinking.some((y, i) => y < rest[i])).toBe(true);

    views.update(world, world.terrain, new Map(), 4000, null, camera);
    expect(spikesOf(views)).toEqual([]);
  });

  it('spreads a fresh oil blob from its center and soaks a gone one into the ground', () => {
    const world = emptyWorld();
    const me = droveEast(world);
    const before = cloneWorld(world);
    world.fields.push({ id: 'g1', kind: 'oil', source: me.id, pos: { x: 22, y: 30 }, r: 0.9, turnsLeft: 5, hit: [] });
    const views = new HazardViews();
    const camera = new THREE.PerspectiveCamera();
    const slickWidth = () => {
      let width = 0;
      views.root.traverseVisible((o) => {
        if (o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).color?.getHex() === PAL.oil.slick) {
          o.geometry.computeBoundingBox();
          width = o.geometry.boundingBox!.max.x - o.geometry.boundingBox!.min.x;
        }
      });
      return width;
    };

    views.update(world, world.terrain, new Map(), 1000, clock(before, 1, true), camera);
    views.update(world, world.terrain, new Map(), 1100, clock(before, 1, true), camera);
    const spreading = slickWidth();
    views.update(world, world.terrain, new Map(), 3000, clock(before, 1, true), camera);
    const whole = slickWidth();
    world.fields = [];
    views.update(world, world.terrain, new Map(), 3100, null, camera);
    views.update(world, world.terrain, new Map(), 3900, null, camera);
    const soaking = slickWidth();
    views.update(world, world.terrain, new Map(), 6000, null, camera);

    expect(spreading).toBeGreaterThan(0);
    expect(spreading).toBeLessThan(whole);
    expect(soaking).toBeLessThan(whole);
    expect(slickWidth()).toBe(0);
  });

  it('burns a gone flare out instead of dropping its glow at once', () => {
    const world = emptyWorld();
    world.flares.push({ id: 'f1', source: world.player.vehicleId, pos: { x: 34, y: 30 }, r: 10, turnsLeft: 3 });
    const views = new HazardViews();
    const glowAt = (nowMs: number) => {
      views.update(world, world.terrain, new Map(), nowMs, null, new THREE.PerspectiveCamera());
      const cards = recordedCards();
      views.draw(cards.batches);
      return cards.glow.reduce((sum, c) => sum + c.alpha, 0);
    };
    const lit = glowAt(5000);
    world.flares = [];
    glowAt(5016);

    const fading = glowAt(5300);
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(lit);
    for (let ms = 5400; ms < 8000; ms += 100) glowAt(ms);
    expect(glowAt(8000)).toBe(0);
  });

  it('draws smoke, oil, caltrops, flares and pulses without a ground band', () => {
    const world = emptyWorld();
    const me = world.vehicles[0];
    const npc = addVehicle(world, 'scrapjaw', 'buggy', ['stockEngine'], { x: 33, y: 30 });
    world.smoke.push({ id: 's1', source: me.id, pos: { x: 30, y: 30 }, r: 4, turnsLeft: 5 });
    world.fields.push({ id: 'g1', kind: 'oil', source: me.id, pos: { x: 27, y: 30 }, r: 0.9, turnsLeft: 5, hit: [] });
    world.fields.push({ id: 'g2', kind: 'caltrops', source: me.id, pos: { x: 25, y: 32 }, r: 1.25, turnsLeft: 5, hit: [] });
    world.flares.push({ id: 'f1', source: me.id, pos: { x: 34, y: 30 }, r: 10, turnsLeft: 3 });
    world.events = [{ t: 'pulse', vehicle: me.id, pos: { ...me.pos }, hit: [npc.id] }];
    const views = new HazardViews();

    views.update(world, world.terrain, new Map(), 1000, null, new THREE.PerspectiveCamera());
    const cards = recordedCards();
    views.draw(cards.batches);
    expect(cards.glow.length).toBeGreaterThan(0);

    const meshes: THREE.Object3D[] = [];
    views.root.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.filter((m) => bands.has(m))).toEqual([]);
  });
});
