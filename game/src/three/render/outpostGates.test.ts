import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OUTPOST_GATE } from '../../config';
import { haulerOf, playerVehicle } from '../../sim/damage';
import { driveOn } from '../../sim/fury-road';
import { gatesShut, yardSpots } from '../../sim/outpost-gates';
import { furyRoadWorld, parkInYard } from '../../sim/testkit';
import type { World } from '../../sim/types';
import { endTurn } from '../../sim/world';
import { highwayMap, outpostId } from '../../sim/highway';
import { loadModels } from './models';
import { OutpostGateViews } from './outpostGates';
import { RenderScope, SightLimit } from './scope';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const SIZE = 410;

function arrive(w: World): World {
  parkInYard(w, w.furyRoad!.window + 1);
  return endTurn(w, () => {});
}

function build(w: World): { views: OutpostGateViews; root: THREE.Group } {
  const root = new THREE.Group();
  const scope = new RenderScope(root, SIZE, new SightLimit(SIZE), true, true);
  const map = highwayMap(w.seed, w.furyRoad!.window);
  return { views: new OutpostGateViews(scope, map.terrain, w), root };
}

function leaves(root: THREE.Group): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.parent?.name.startsWith('outpost-gate-')) out.push(o);
  });
  return out;
}

function leavesOf(root: THREE.Group, gateId: string): THREE.Object3D[] {
  return leaves(root).filter((l) => l.parent!.name === `outpost-gate-${gateId}`);
}

function span(frames: number, views: OutpostGateViews, dt: number): void {
  for (let i = 0; i < frames; i++) views.tick(dt);
}

describe('the outpost gate views', () => {
  it('draws two leaves for each of the two movable gates of window 0', () => {
    const { views, root } = build(furyRoadWorld());
    expect(leaves(root)).toHaveLength(4);
    expect(leavesOf(root, `${outpostId(0)}-north`)).toHaveLength(2);
    expect(leavesOf(root, `${outpostId(1)}-south`)).toHaveLength(2);
    expect(views.settled()).toBe(true);
  });

  it('slides the leaves shut over the slide time and holds there', () => {
    const w = furyRoadWorld();
    const { views, root } = build(w);
    const south = leavesOf(root, `${outpostId(1)}-south`);
    views.sync(arrive(w));
    expect(views.settled()).toBe(false);
    span(Math.round((OUTPOST_GATE.slideSeconds / 0.05) / 2), views, 0.05);
    expect(views.settled()).toBe(false);
    const half = south.map((l) => Math.abs(l.position.z));
    expect(half.every((z) => z > 0)).toBe(true);
    span(Math.round(OUTPOST_GATE.slideSeconds / 0.05) + 2, views, 0.05);
    expect(views.settled()).toBe(true);
    expect(south.map((l) => Math.abs(l.position.z))).toEqual([0, 0]);
    span(10, views, 0.05);
    expect(south.map((l) => Math.abs(l.position.z))).toEqual([0, 0]);
  });

  it('never jumps past the target on a huge or invalid frame time', () => {
    const w = furyRoadWorld();
    const { views, root } = build(w);
    views.sync(arrive(w));
    views.tick(1e9);
    const after = leaves(root).map((l) => Math.abs(l.position.z));
    expect(after.every((z) => Number.isFinite(z) && z >= 0)).toBe(true);
    views.tick(Number.NaN);
    views.tick(-5);
    expect(leaves(root).map((l) => Math.abs(l.position.z))).toEqual(after);
    expect(views.settled()).toBe(false);
  });

  it('starts the north gate of the last fort closed with a truck in its yard, and slides it open', () => {
    const w = driveOn(arrive(furyRoadWorld()));
    const { views, root } = build(w);
    const north = leaves(root).filter((l) => l.parent!.name.endsWith('north'));
    expect(north).toHaveLength(2);
    expect(north.map((l) => Math.abs(l.position.z))).toEqual([0, 0]);
    expect(views.settled()).toBe(false);
    span(Math.round(OUTPOST_GATE.slideSeconds / 0.05) + 2, views, 0.05);
    expect(views.settled()).toBe(true);
    expect(north.every((l) => Math.abs(l.position.z) > 10)).toBe(true);
  });

  it('starts the north gate of the last fort open when no truck stands in its yard', () => {
    const w = driveOn(arrive(furyRoadWorld()));
    playerVehicle(w).pos = { ...yardSpots(w, 2).truck };
    haulerOf(w).pos = { ...yardSpots(w, 2).hauler };
    const { root } = build(w);
    const north = leaves(root).filter((l) => l.parent!.name.endsWith('north') && l.parent!.name.includes('outpost-1'));
    expect(north.every((l) => Math.abs(l.position.z) > 10)).toBe(true);
  });

  it('starts a shut save with the south gate closed and nothing to slide', () => {
    const w = arrive(furyRoadWorld());
    expect(gatesShut(w)).toBe(true);
    const { views } = build(w);
    expect(views.settled()).toBe(true);
  });

  it('throws on a gate the sim does not return', () => {
    const w = furyRoadWorld();
    const { views } = build(w);
    const later = driveOn(arrive(w));
    expect(() => views.sync(later)).toThrow(/no view/);
  });
});
