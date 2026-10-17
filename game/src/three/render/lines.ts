// Harpoon lines: a rope from the harpoon on one truck to the part it holds on the other, between the two vehicle
// views' part points each frame, so it follows the trucks as they move. A line shows while it holds and both trucks
// are drawn. A line shot this turn stays hidden while its turn plays: the shot's own rope flies with the bolt (see

import * as THREE from 'three';
import { groundPoint, toMap, type V3 } from '../../phys/frames';
import { PHYSICS } from '../../data/physics';
import { chassisDef } from '../../data/chassis';
import { fishLineAnchor } from '../../sim/fishing';
import { PAL } from '../../render/palette';
import { lineAnchors } from '../../sim/harpoon';
import type { Terrain } from '../../sim/terrain';
import type { World } from '../../sim/types';
import type { VehicleView } from './vehicle';

export const ROPE_LOOK = { radius: 0.03, sides: 5, segments: 16, minSlack: 0.004, reelMs: 500, restMs: 400, missSlack: 0.15, reelSlack: 0.06 };
const UP = new THREE.Vector3(0, 1, 0);

export type GroundAt = (p: V3) => number;

export function groundOf(terrain: Terrain): GroundAt {
  return (p) => groundPoint(terrain, toMap(p)).y;
}

export class Rope {
  readonly root = new THREE.Group();
  private readonly pieces = Array.from({ length: ROPE_LOOK.segments }, () => new THREE.Mesh(ROPE_GEOMETRY, ROPE_MATERIAL));

  constructor() {
    this.root.add(...this.pieces);
  }

  set(a: V3, b: V3, length: number, ground: GroundAt): void {
    const points = hangingPoints(a, b, length, ground);
    this.pieces.forEach((piece, i) => stretch(piece, points[i], points[i + 1]));
  }
}

function hangingPoints(a: V3, b: V3, length: number, ground: GroundAt): V3[] {
  const span = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const spare = Math.max(length - span, span * ROPE_LOOK.minSlack);
  const sag = Math.sqrt((3 * span * spare) / 8);
  return Array.from({ length: ROPE_LOOK.segments + 1 }, (_, i) => {
    const t = i / ROPE_LOOK.segments;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - 4 * sag * t * (1 - t), z: a.z + (b.z - a.z) * t };
    return { ...p, y: Math.max(p.y, ground(p) + ROPE_LOOK.radius) };
  });
}

export type LineShots = { fresh: ReadonlySet<string>; playing: boolean };

type Held = { rope: Rope; from: string; fromPart: string; b: V3 };
type Reel = { rope: Rope; startMs: number; a: () => V3 | null; b: V3 };

export class HarpoonLinesView {
  readonly root = new THREE.Group();
  private readonly ropes = new Map<string, Held>();
  private readonly reels: Reel[] = [];

  update(world: World, views: ReadonlyMap<string, VehicleView>, nowMs: number, shots: LineShots): void {
    const ground = groundOf(world.terrain);
    const shown = ropeEnds(world, views);
    if (shots.playing) for (const id of shots.fresh) shown.delete(id);
    this.letGo(world, shown, views, nowMs);
    for (const [id, ends] of shown) {
      const held = this.ropeOf(id, world);
      held.rope.set(ends.a, ends.b, ends.length, ground);
      held.b = ends.b;
    }
    this.reel(nowMs, ground);
  }

  private letGo(world: World, shown: ReadonlyMap<string, unknown>, views: ReadonlyMap<string, VehicleView>, nowMs: number): void {
    for (const [id, held] of this.ropes) {
      if (shown.has(id)) continue;
      this.ropes.delete(id);
      if (world.lines.some((l) => l.id === id)) this.root.remove(held.rope.root);
      else this.reels.push({ rope: held.rope, startMs: nowMs, a: () => harpoonPoint(views, held.from, held.fromPart), b: held.b });
    }
  }

  private reel(nowMs: number, ground: GroundAt): void {
    for (let i = this.reels.length - 1; i >= 0; i--) {
      const r = this.reels[i];
      const left = 1 - (nowMs - r.startMs) / ROPE_LOOK.reelMs;
      const a = r.a();
      if (left <= 0 || !a) {
        this.root.remove(r.rope.root);
        this.reels.splice(i, 1);
        continue;
      }
      reelRope(r.rope, a, r.b, left, ground);
    }
  }

  private ropeOf(id: string, world: World): Held {
    const known = this.ropes.get(id);
    if (known) return known;
    const line = world.lines.find((l) => l.id === id);
    if (!line) throw new Error(`No harpoon line ${id} to draw`);
    const held = { rope: new Rope(), from: line.from, fromPart: line.fromPart, b: { x: 0, y: 0, z: 0 } };
    this.root.add(held.rope.root);
    this.ropes.set(id, held);
    return held;
  }
}

export function reelRope(rope: Rope, a: V3, b: V3, left: number, ground: GroundAt): void {
  const end = { x: a.x + (b.x - a.x) * left, y: a.y + (b.y - a.y) * left, z: a.z + (b.z - a.z) * left };
  rope.set(a, end, Math.hypot(end.x - a.x, end.y - a.y, end.z - a.z) * (1 + ROPE_LOOK.reelSlack), ground);
}

function harpoonPoint(views: ReadonlyMap<string, VehicleView>, vehicleId: string, partId: string): V3 | null {
  const view = views.get(vehicleId);
  return view && view.hasPart(partId) ? view.partPoint(partId) : null;
}

const ROPE_GEOMETRY = new THREE.CylinderGeometry(ROPE_LOOK.radius, ROPE_LOOK.radius, 1, ROPE_LOOK.sides, 1, true);
const ROPE_MATERIAL = new THREE.MeshLambertMaterial({ color: PAL.rope });

function ropeEnds(world: World, views: ReadonlyMap<string, VehicleView>): Map<string, { a: V3; b: V3; length: number }> {
  const holding = new Set(lineAnchors(world).map((l) => l.id));
  const ends = new Map<string, { a: V3; b: V3; length: number }>();
  for (const line of world.lines) {
    const from = views.get(line.from);
    const to = views.get(line.to);
    if (holding.has(line.id) && from && to) ends.set(line.id, { a: from.partPoint(line.fromPart), b: to.partPoint(line.toPart), length: line.length });
  }
  return ends;
}

function stretch(piece: THREE.Mesh, a: V3, b: V3): void {
  const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
  const length = dir.length();
  piece.visible = length > 0;
  if (length === 0) return;
  piece.position.set(a.x + dir.x / 2, a.y + dir.y / 2, a.z + dir.z / 2);
  piece.quaternion.setFromUnitVectors(UP, dir.divideScalar(length));
  piece.scale.set(1, length, 1);
}

export const FISH_LOOK = { floatRadius: 0.14, rodHeight: 1.1, slack: 1.1, sideShare: 0.5 };
const FLOAT_GEOMETRY = new THREE.SphereGeometry(FISH_LOOK.floatRadius, 6, 4);
const FLOAT_MATERIAL = new THREE.MeshLambertMaterial({ color: PAL.bobber });

type Cast = { rope: Rope; bobber: THREE.Mesh };

export class FishingLinesView {
  readonly root = new THREE.Group();
  private readonly casts = new Map<string, Cast>();

  update(world: World, views: ReadonlyMap<string, VehicleView>): void {
    const ground = groundOf(world.terrain);
    const cast = new Set<string>();
    for (const v of world.vehicles) {
      const view = views.get(v.id);
      const anchor = view ? fishLineAnchor(world, v) : null;
      if (!view || !anchor) continue;
      cast.add(v.id);
      this.drawCast(this.castOf(v.id), view, anchor, chassisDef(v.chassisId).radius, world.terrain, ground);
    }
    this.reelIn(cast);
  }

  private drawCast(c: Cast, view: VehicleView, anchor: { x: number; y: number }, radius: number, terrain: Terrain, ground: GroundAt): void {
    const water = groundPoint(terrain, anchor);
    const bob = { x: water.x, y: water.y + FISH_LOOK.floatRadius, z: water.z };
    const truck = view.center();
    const reach = Math.hypot(bob.x - truck.x, bob.z - truck.z) || 1;
    const side = radius * PHYSICS.metersPerTile * FISH_LOOK.sideShare;
    const tip = { x: truck.x + ((bob.x - truck.x) / reach) * side, y: truck.y + FISH_LOOK.rodHeight, z: truck.z + ((bob.z - truck.z) / reach) * side };
    c.rope.set(tip, bob, Math.hypot(bob.x - tip.x, bob.y - tip.y, bob.z - tip.z) * FISH_LOOK.slack, ground);
    c.bobber.position.set(bob.x, bob.y, bob.z);
  }

  private castOf(id: string): Cast {
    const known = this.casts.get(id);
    if (known) return known;
    const made = { rope: new Rope(), bobber: new THREE.Mesh(FLOAT_GEOMETRY, FLOAT_MATERIAL) };
    this.root.add(made.rope.root, made.bobber);
    this.casts.set(id, made);
    return made;
  }

  private reelIn(cast: ReadonlySet<string>): void {
    for (const [id, c] of this.casts) {
      if (cast.has(id)) continue;
      this.root.remove(c.rope.root, c.bobber);
      this.casts.delete(id);
    }
  }

  count(): number {
    return this.casts.size;
  }
}
