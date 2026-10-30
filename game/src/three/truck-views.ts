import type * as THREE from "three";
import type { TruckPaint } from "../data/chassis";
import { playerVehicle } from "../sim/damage";
import { inLiveRange } from "../sim/fidelity";
import type { GameEvent, Vehicle, World } from "../sim/types";
import { dist } from "../sim/vec";
import { TruckFade } from "./render/truckFade";
import { VehicleView, type RebuildBudget } from "./render/vehicle";

export const SHELTER_FADE_MS = 900;

type Fade = { view: VehicleView; from: number; look: TruckFade };

export class TruckViews {
  readonly views = new Map<string, VehicleView>();
  private readonly building = new Map<string, VehicleView>();
  private readonly kept = new Set<string>();
  private readonly fadingOut = new Map<string, Fade>();
  private readonly fadingIn = new Map<string, Fade>();
  private readonly added: string[] = [];
  private events: readonly GameEvent[] = [];
  private entering = new Set<string>();
  private leaving = new Set<string>();

  constructor(private readonly scene: THREE.Scene, private readonly rebuilds: RebuildBudget) {}

  viewOf(id: string, display: Vehicle, seen: boolean, paint: TruckPaint): VehicleView | null {
    this.kept.add(id);
    const view = this.views.get(id) ?? this.building.get(id) ?? new VehicleView(null, seen, paint, "world");
    view.update(display, seen, paint, this.rebuilds);
    if (!view.built) {
      this.building.set(id, view);
      return null;
    }
    this.building.delete(id);
    if (!this.views.has(id)) {
      this.views.set(id, view);
      this.scene.add(view.root);
      this.added.push(id);
    }
    return view;
  }

  park(world: World, hidden: Vehicle[]): void {
    const me = playerVehicle(world).pos;
    const near = hidden.filter((v) => inLiveRange(world, v.pos)).sort((a, b) => dist(a.pos, me) - dist(b.pos, me));
    for (const v of near) this.parkOne(v, world.player.paint);
  }

  private parkOne(v: Vehicle, paint: TruckPaint): void {
    this.kept.add(v.id);
    const shown = this.views.get(v.id);
    if (shown) {
      this.scene.remove(shown.root);
      this.views.delete(v.id);
    }
    const view = shown ?? this.building.get(v.id) ?? new VehicleView(null, false, paint, "world");
    view.update(v, false, paint, this.rebuilds);
    this.building.set(v.id, view);
  }

  prune(now: number, events: readonly GameEvent[]): void {
    this.expectShelter(events);
    for (const id of this.added.splice(0)) this.startFadeIn(id, now);
    for (const [id, view] of this.views) if (!this.kept.has(id)) this.retire(id, view, now);
    for (const [id, view] of this.building) {
      if (this.kept.has(id)) continue;
      view.dispose();
      this.building.delete(id);
    }
    this.kept.clear();
    this.tick(now);
  }

  private expectShelter(events: readonly GameEvent[]): void {
    if (events === this.events) return;
    this.events = events;
    this.entering = new Set(events.flatMap((e) => (e.t === "enteredSite" ? [e.vehicle] : [])));
    this.leaving = new Set(events.flatMap((e) => (e.t === "leftSite" ? [e.vehicle] : [])));
  }

  private retire(id: string, view: VehicleView, now: number): void {
    this.views.delete(id);
    const look = this.fadingIn.get(id)?.look ?? new TruckFade();
    this.fadingIn.delete(id);
    if (this.entering.has(id)) this.fadingOut.set(id, { view, from: now, look });
    else this.drop(view, look);
  }

  private tick(now: number): void {
    for (const [id, fade] of this.fadingIn) {
      const share = fadeShare(fade, now);
      fade.look.apply(fade.view.root, share);
      if (share >= 1) this.fadingIn.delete(id);
    }
    for (const [id, fade] of this.fadingOut) {
      const share = 1 - fadeShare(fade, now);
      if (share > 0) fade.look.apply(fade.view.root, share);
      else {
        this.drop(fade.view, fade.look);
        this.fadingOut.delete(id);
      }
    }
  }

  private startFadeIn(id: string, now: number): void {
    const view = this.views.get(id);
    if (!view || !this.leaving.delete(id)) return;
    const look = new TruckFade();
    look.apply(view.root, 0);
    this.fadingIn.set(id, { view, from: now, look });
  }

  private drop(view: VehicleView, look: TruckFade): void {
    look.apply(view.root, 1);
    this.scene.remove(view.root);
    view.dispose();
  }
}

function fadeShare(fade: Fade, now: number): number {
  return Math.min(1, Math.max(0, (now - fade.from) / SHELTER_FADE_MS));
}
