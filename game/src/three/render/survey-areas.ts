import * as THREE from 'three';
import { CONTRACTS } from '../../data/market';
import { PHYSICS } from '../../data/physics';
import { PAL } from '../../render/palette';
import { heightAt, type Terrain } from '../../sim/terrain';
import type { World } from '../../sim/types';
import type { Vec } from '../../sim/vec';

const S = PHYSICS.metersPerTile;
const RENDER_ORDER = 790;
const LIFT = 0.1;
const DASHES = 28;
const DASH_FILL = 0.6;
const DASH_STEPS = 3;
const WIDTH_TILES = 0.35;
const OPACITY = 0.7;

export class SurveyAreasView {
  readonly root = new THREE.Group();
  private readonly mesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: PAL.survey, transparent: true, opacity: OPACITY, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  );
  private key = '';

  constructor() {
    this.mesh.renderOrder = RENDER_ORDER;
    this.mesh.visible = false;
    this.root.add(this.mesh);
  }

  update(world: World): void {
    const areas = openAreas(world);
    const key = areas.map((a) => `${a.x},${a.y}`).join('|');
    this.mesh.visible = areas.length > 0;
    if (key === this.key) return;
    this.key = key;
    const positions: number[] = [];
    for (const area of areas) pushRing(positions, world.terrain, area);
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  }
}

function openAreas(world: World): Vec[] {
  return world.player.contracts.flatMap((c) => (c.kind === 'survey' ? c.points.filter((p) => !p.done).map((p) => p.area) : []));
}

function pushRing(out: number[], terrain: Terrain, center: Vec): void {
  const outer = CONTRACTS.survey.areaRadius;
  const inner = outer - WIDTH_TILES;
  const step = (2 * Math.PI) / DASHES;
  for (let d = 0; d < DASHES; d++)
    for (let k = 0; k < DASH_STEPS; k++) {
      const a0 = d * step + (step * DASH_FILL * k) / DASH_STEPS;
      const a1 = d * step + (step * DASH_FILL * (k + 1)) / DASH_STEPS;
      const i0 = point(terrain, center, a0, inner);
      const o0 = point(terrain, center, a0, outer);
      const i1 = point(terrain, center, a1, inner);
      const o1 = point(terrain, center, a1, outer);
      out.push(...i0, ...o0, ...i1, ...o0, ...o1, ...i1);
    }
}

function point(terrain: Terrain, center: Vec, angle: number, radius: number): [number, number, number] {
  const x = center.x + Math.cos(angle) * radius;
  const y = center.y + Math.sin(angle) * radius;
  return [x * S, heightAt(terrain, x, y) * S + LIFT, y * S];
}
