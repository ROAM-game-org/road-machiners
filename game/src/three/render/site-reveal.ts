import type * as THREE from 'three';
import { revealedSites } from '../../sim/locations';
import type { World } from '../../sim/types';
import type { SiteLights } from './siteLights';

export class SiteReveal {
  private readonly pieces = new Map<string, THREE.Object3D[]>();
  private shown: Set<string> | null = null;

  constructor(roots: Map<string, THREE.Object3D>, private readonly lights: SiteLights) {
    for (const [id, root] of roots) this.pieces.set(id, [root]);
  }

  addFortPiece(siteId: string, obj: THREE.Object3D): void {
    const held = this.pieces.get(siteId);
    if (!held) throw new Error(`Site ${siteId} has no view to reveal`);
    held.push(obj);
    obj.visible = this.shown?.has(siteId) ?? false;
  }

  sync(world: World): void {
    const now = revealedSites(world);
    const before = this.shown;
    if (before && before.size === now.size && [...now].every((id) => before.has(id))) return;
    for (const [id, objs] of this.pieces) {
      const visible = now.has(id);
      if (before && before.has(id) === visible) continue;
      for (const obj of objs) obj.visible = visible;
    }
    this.shown = now;
    this.lights.reveal(now);
  }
}
