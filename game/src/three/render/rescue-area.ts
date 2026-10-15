import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { CONTRACTS } from '../../data/market';
import { PHYSICS } from '../../data/physics';
import { PAL } from '../../render/palette';
import type { Contract } from '../../sim/market';
import { heightAt, type Terrain } from '../../sim/terrain';
import type { World } from '../../sim/types';
import type { Vec } from '../../sim/vec';

const S = PHYSICS.metersPerTile;
const LINE_WIDTH_PX = 3;
const LIFT = 0.15;
const OPACITY = 0.7;
const SEGMENTS = 96;
const DASH = { dash: 1.4 * S, gap: 0.9 * S };

type HeldRescue = Extract<Contract, { kind: 'rescue' }>;

function heldRescues(world: World): HeldRescue[] {
  return world.player.contracts.filter((c): c is HeldRescue => c.kind === 'rescue' && !c.fulfilled);
}

export class RescueAreaView {
  readonly root = new THREE.Group();
  private key = '';

  constructor(private readonly terrain: Terrain) {}

  show(world: World, screen: { width: number; height: number }): void {
    const held = heldRescues(world);
    const key = held.map((c) => c.id).join(',');
    if (key !== this.key) this.rebuild(key, held);
    for (const ring of this.root.children as Line2[]) ring.material.resolution.set(screen.width, screen.height);
  }

  private rebuild(key: string, held: HeldRescue[]): void {
    this.key = key;
    this.clear();
    for (const c of held) this.root.add(this.ring(c.area));
  }

  private ring(center: Vec): Line2 {
    const positions: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const angle = (i / SEGMENTS) * Math.PI * 2;
      const x = center.x + Math.cos(angle) * CONTRACTS.rescue.areaRadius;
      const y = center.y + Math.sin(angle) * CONTRACTS.rescue.areaRadius;
      positions.push(x * S, heightAt(this.terrain, x, y) * S + LIFT, y * S);
    }
    const material = new LineMaterial({ color: PAL.plan, linewidth: LINE_WIDTH_PX, transparent: true, opacity: OPACITY, depthWrite: false, dashed: true, dashSize: DASH.dash, gapSize: DASH.gap });
    const line = new Line2(new LineGeometry().setPositions(positions), material);
    line.computeLineDistances();
    line.renderOrder = 819;
    return line;
  }

  private clear(): void {
    for (const child of [...this.root.children]) {
      const line = child as Line2;
      this.root.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    }
  }
}
