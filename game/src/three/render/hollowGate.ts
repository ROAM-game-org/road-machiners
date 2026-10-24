import * as THREE from 'three';
import { HOLLOW_GATE } from '../../config';
import { PHYSICS } from '../../data/physics';
import { hollowGatePose, hollowGateShut } from '../../sim/hollow-gate';
import { groundAt, type Terrain } from '../../sim/terrain';
import type { World } from '../../sim/types';
import { model } from './models';
import type { RenderScope } from './scope';

const S = PHYSICS.metersPerTile;
const OPEN_SHIFT = 6.8;
const MAX_FRAME = 0.1;
const TRAVEL_TILES = 8;

type Leaf = { obj: THREE.Object3D; sign: 1 | -1 };

export class HollowGateView {
  private readonly leaves: Leaf[];
  private open: number;
  private target: number;
  private seen: World;

  constructor(scope: RenderScope, terrain: Terrain, world: World) {
    const { pos, yaw } = hollowGatePose();
    const root = new THREE.Group();
    root.name = 'hollow-gate';
    root.position.set(pos.x * S, groundAt(terrain, pos.x, pos.y) * S, pos.y * S);
    root.rotation.y = -yaw;
    this.leaves = ([1, -1] as const).map((sign): Leaf => {
      const obj = model('fort_scrap_leaf');
      obj.rotation.y = sign > 0 ? 0 : Math.PI;
      root.add(obj);
      return { obj, sign };
    });
    scope.add(root, pos, TRAVEL_TILES);
    this.seen = world;
    this.target = this.open = wantedOpen(world);
    this.place();
  }

  frame(world: World, dt: number): void {
    if (world !== this.seen) {
      this.seen = world;
      this.target = wantedOpen(world);
    }
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_FRAME) : 0;
    const gap = this.target - this.open;
    this.open += Math.sign(gap) * Math.min(Math.abs(gap), step / HOLLOW_GATE.slideSeconds);
    this.place();
  }

  settled(): boolean {
    return this.open === this.target;
  }

  private place(): void {
    for (const { obj, sign } of this.leaves) obj.position.set(0, 0, -sign * OPEN_SHIFT * this.open);
  }
}

function wantedOpen(world: World): number {
  return hollowGateShut(world) ? 0 : 1;
}
