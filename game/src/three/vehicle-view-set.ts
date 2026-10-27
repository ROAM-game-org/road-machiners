import type * as THREE from 'three';
import type { TruckPaint } from '../data/chassis';
import type { Vehicle } from '../sim/types';
import { VehicleView, type RebuildBudget } from './render/vehicle';

export class VehicleViewSet {
  readonly views = new Map<string, VehicleView>();
  private readonly building = new Map<string, VehicleView>();

  constructor(private readonly scene: THREE.Scene, private readonly rebuilds: RebuildBudget) {}

  viewOf(id: string, display: Vehicle, seen: boolean, paint: TruckPaint): VehicleView | null {
    const view = this.views.get(id) ?? this.building.get(id) ?? new VehicleView(null, seen, paint, 'world');
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

  keepOnly(ids: ReadonlySet<string>): void {
    for (const [id, view] of this.views) {
      if (ids.has(id)) continue;
      this.scene.remove(view.root);
      view.dispose();
      this.views.delete(id);
    }
    for (const [id, view] of this.building) {
      if (ids.has(id)) continue;
      view.dispose();
      this.building.delete(id);
    }
  }
}
