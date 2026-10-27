import type * as THREE from "three";
import type { TruckPaint } from "../data/chassis";
import { playerVehicle } from "../sim/damage";
import { inLiveRange } from "../sim/fidelity";
import type { Vehicle, World } from "../sim/types";
import { dist } from "../sim/vec";
import { VehicleView, type RebuildBudget } from "./render/vehicle";

export class TruckViews {
  readonly views = new Map<string, VehicleView>();
  private readonly building = new Map<string, VehicleView>();
  private readonly kept = new Set<string>();

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

  prune(): void {
    for (const [id, view] of this.views) {
      if (this.kept.has(id)) continue;
      this.scene.remove(view.root);
      view.dispose();
      this.views.delete(id);
    }
    for (const [id, view] of this.building) {
      if (this.kept.has(id)) continue;
      view.dispose();
      this.building.delete(id);
    }
    this.kept.clear();
  }
}
