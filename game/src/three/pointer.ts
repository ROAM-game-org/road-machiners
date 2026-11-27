import { framePoints, groundPoint, type V3, type VehicleFrame } from '../phys/frames';
import { atlasOf } from '../sim/atlas';
import { isPlayerTruck, playerVehicle } from '../sim/damage';
import type { Vehicle, World } from '../sim/types';
import type { Vec } from '../sim/vec';
import { playerSees } from '../sim/vision';
import { isAtRest } from '../sim/world';
import type { PadTarget, PadTargetKind } from '../ui/pad/pad-model';
import type * as THREE from 'three';
import type { VehicleView } from './render/vehicle';

export type PointerAction = { kind: 'stop' } | { kind: 'own' } | { kind: 'vehicle'; id: string } | { kind: 'ground' };

export type PointerHits = {
  own: number | null;
  nearestNpc: { id: string; distance: number } | null;
  radiusPick: string | null;
  playerId: string;
  atRest: boolean;
};

function ownTruckAction(h: PointerHits, own: number): PointerAction {
  if (h.nearestNpc !== null && h.nearestNpc.distance < own) return { kind: 'vehicle', id: h.nearestNpc.id };
  return h.atRest ? { kind: 'own' } : { kind: 'stop' };
}

export function resolvePointer(h: PointerHits): PointerAction {
  if (h.own !== null) return ownTruckAction(h, h.own);
  if (h.radiusPick !== null && h.radiusPick !== h.playerId) return { kind: 'vehicle', id: h.radiusPick };
  return { kind: 'ground' };
}

type PickerDeps = {
  world: () => World;
  hit: (x: number, y: number, object: THREE.Object3D | null) => number | null;
  views: Map<string, VehicleView>;
  visible: (v: Vehicle) => boolean;
  radiusPick: (x: number, y: number) => string | null;
};

export class PointerPicker {
  stopCue = false;
  private at: { x: number; y: number } | null = null;

  constructor(private readonly deps: PickerDeps) {}

  moveTo(p: { clientX: number; clientY: number } | null): void {
    this.at = p && { x: p.clientX, y: p.clientY };
  }

  action(x: number, y: number): PointerAction {
    return this.resolve(x, y, true);
  }

  private resolve(x: number, y: number, withRadius: boolean): PointerAction {
    const me = playerVehicle(this.deps.world());
    const own = this.deps.hit(x, y, this.deps.views.get(me.id)?.root ?? null);
    return resolvePointer({
      own,
      nearestNpc: own === null ? null : this.nearestNpc(x, y, me.id),
      radiusPick: withRadius ? this.deps.radiusPick(x, y) : null,
      playerId: me.id,
      atRest: isAtRest(me),
    });
  }

  overOwn(x: number, y: number): boolean {
    const kind = this.resolve(x, y, false).kind;
    return kind === 'stop' || kind === 'own';
  }

  updateCue(canClick: boolean): boolean {
    const cue = this.at !== null && canClick && !isAtRest(playerVehicle(this.deps.world())) && this.resolve(this.at.x, this.at.y, false).kind === 'stop';
    const flipped = cue !== this.stopCue;
    this.stopCue = cue;
    return flipped;
  }

  private nearestNpc(x: number, y: number, playerId: string): { id: string; distance: number } | null {
    let nearest: { id: string; distance: number } | null = null;
    for (const v of this.deps.world().vehicles) {
      const view = this.deps.views.get(v.id);
      const distance = view ? this.npcDistance(x, y, v, view, playerId) : null;
      if (distance !== null && (nearest === null || distance < nearest.distance)) nearest = { id: v.id, distance };
    }
    return nearest;
  }

  private npcDistance(x: number, y: number, v: Vehicle, view: VehicleView, playerId: string): number | null {
    if (v.id === playerId || !this.deps.visible(v)) return null;
    return this.deps.hit(x, y, view.root);
  }
}

export type ScreenOf = (p: V3) => { x: number; y: number };

export type PickScene = {
  world: World;
  frames: Record<string, VehicleFrame>;
  screenOf: ScreenOf;
  visible: (v: Vehicle) => boolean;
};

const TRUCK_PX = 30;
const PLACE_PX = 24;

function screenDistance(scene: PickScene, f: VehicleFrame, x: number, y: number): number {
  return Math.min(...framePoints(f).map((p) => {
    const s = scene.screenOf(p);
    return Math.hypot(s.x - x, s.y - y);
  }));
}

export function pickVehicleAt(scene: PickScene, x: number, y: number, reachPx: number): Vehicle | null {
  let best: Vehicle | null = null;
  let bestD = reachPx;
  for (const v of scene.world.vehicles) {
    const f = scene.frames[v.id];
    if (!f || !scene.visible(v)) continue;
    const d = screenDistance(scene, f, x, y);
    if (d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

function truckTargets(scene: PickScene): PadTarget[] {
  return scene.world.vehicles.flatMap((v) => {
    const f = scene.frames[v.id];
    if (!f || !scene.visible(v)) return [];
    const at = scene.screenOf(f.pos);
    const kind: PadTargetKind = isPlayerTruck(scene.world, v) ? "own" : "truck";
    return [{ key: `${kind}-${v.id}`, kind, x: at.x, y: at.y, r: TRUCK_PX }];
  });
}

function groundTarget(scene: PickScene, key: string, kind: PadTargetKind, pos: Vec): PadTarget[] {
  if (!playerSees(scene.world, pos)) return [];
  const at = scene.screenOf(groundPoint(scene.world.terrain, pos));
  return [{ key, kind, x: at.x, y: at.y, r: PLACE_PX }];
}

function onScreen(t: PadTarget, view: { width: number; height: number }): boolean {
  return t.x >= 0 && t.y >= 0 && t.x <= view.width && t.y <= view.height;
}

export function worldPadTargets(scene: PickScene, view: { width: number; height: number }): PadTarget[] {
  const atlas = atlasOf(scene.world.terrain);
  const places = [...atlas.towns, ...atlas.locations.filter((l) => l.kind !== "territory")];
  return [
    ...truckTargets(scene),
    ...places.flatMap((p) => groundTarget(scene, `place-${p.id}`, "place", p.pos)),
    ...scene.world.salvage.flatMap((s) => groundTarget(scene, `loot-${s.id}`, "loot", s.pos)),
  ].filter((t) => onScreen(t, view));
}
