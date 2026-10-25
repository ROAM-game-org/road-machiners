import * as THREE from 'three';
import { OUTPOST_GATE } from '../../config';
import { PHYSICS } from '../../data/physics';
import { playerTrucks } from '../../sim/damage';
import { gatesShut, inYard, outpostGates, type GateState } from '../../sim/outpost-gates';
import type { World } from '../../sim/types';
import { groundAt, type Terrain } from '../../sim/terrain';
import { model } from './models';
import type { RenderScope } from './scope';

const S = PHYSICS.metersPerTile;
const LEAF_INSET = 1.6;
const LEAF_WIDTH = 10.3;
const OPEN_SHIFT = LEAF_WIDTH + 0.1;
const MAX_FRAME = 0.1;
const TRAVEL_TILES = 6;

type Leaf = { obj: THREE.Object3D; sign: 1 | -1; open: number; target: number };
type GateView = { id: string; leaves: Leaf[] };

export class OutpostGateViews {
  private readonly gates: GateView[];
  private seen: World | null = null;
  private shut = false;

  constructor(scope: RenderScope, terrain: Terrain, world: World) {
    const run = world.chaosHighway;
    if (!run) throw new Error('Outpost gate views need a Chaos Highway run');
    const movable = outpostGates(world).filter((g) => g.movable);
    this.gates = movable.map((g) => this.build(scope, terrain, g, startsClosed(world, run.window, g)));
    this.sync(world);
  }

  frame(world: World, playing: boolean, dt: number): boolean {
    if (!playing && this.seen !== world) {
      this.sync(world);
      this.seen = world;
      this.shut = gatesShut(world);
    }
    this.tick(dt);
    return !playing && this.shut && this.settled();
  }

  sync(world: World): void {
    for (const gate of outpostGates(world)) {
      if (!gate.movable) continue;
      const view = this.gates.find((g) => g.id === gate.id);
      if (!view) throw new Error(`Gate ${gate.id} has no view`);
      for (const leaf of view.leaves) leaf.target = gate.closed ? 0 : 1;
    }
  }

  tick(dt: number): void {
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_FRAME) : 0;
    const speed = step / OUTPOST_GATE.slideSeconds;
    for (const gate of this.gates) {
      for (const leaf of gate.leaves) {
        const gap = leaf.target - leaf.open;
        leaf.open += Math.sign(gap) * Math.min(Math.abs(gap), speed);
        place(leaf);
      }
    }
  }

  settled(): boolean {
    return this.gates.every((g) => g.leaves.every((leaf) => leaf.open === leaf.target));
  }

  private build(scope: RenderScope, terrain: Terrain, gate: GateState, closed: boolean): GateView {
    const spot = gate.spot;
    const base = groundAt(terrain, spot.center.x, spot.center.y);
    const root = new THREE.Group();
    root.name = `outpost-gate-${gate.id}`;
    root.position.set(spot.center.x * S, base * S, spot.center.y * S);
    root.rotation.y = -Math.atan2(spot.out.y, spot.out.x);
    const leaves = ([1, -1] as const).map((sign): Leaf => {
      const obj = model('fort_outpost_leaf');
      obj.rotation.y = sign > 0 ? 0 : Math.PI;
      root.add(obj);
      const leaf = { obj, sign, open: closed ? 0 : 1, target: closed ? 0 : 1 };
      place(leaf);
      return leaf;
    });
    scope.add(root, spot.center, TRAVEL_TILES);
    return { id: gate.id, leaves };
  }
}

function place(leaf: Leaf): void {
  leaf.obj.position.set(-LEAF_INSET, 0, -leaf.sign * OPEN_SHIFT * leaf.open);
}

function startsClosed(world: World, window: number, gate: GateState): boolean {
  if (gate.closed) return true;
  const lastNorth = gate.side === 'north' && gate.milestone === window;
  return lastNorth && playerTrucks(world).some((truck) => inYard(world, truck.pos, window));
}
