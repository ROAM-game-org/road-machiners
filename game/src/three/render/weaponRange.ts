
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { PHYSICS } from '../../data/physics';
import { headingOf, toMap, type VehicleFrame } from '../../phys/frames';
import { PAL } from '../../render/palette';
import type { FireSpan } from '../../sim/armor';
import { fireBlock } from '../../sim/combat';
import { vehicleStats, type MountedWeapon } from '../../sim/stats';
import { markHeightAt, type Terrain } from '../../sim/terrain';
import { unitPoses } from '../../sim/rig';
import type { Vehicle, World } from '../../sim/types';
import { DEG, type Vec } from '../../sim/vec';
import { createBareItemIcon } from '../../ui/cards';
import { el } from '../../ui/dom';
import type { CameraRig } from './camera';
import { READY_ARC_BIT, SPENT_ARC_BIT } from './models';
import { num } from '../../text/msg';
import { layerPointOf } from '../../ui/ui-size';

const S = PHYSICS.metersPerTile;
const ICON_PX = 26;
const LIFT = 0.15;
const DEG_PER_STEP = 5;
const LINE_WIDTH_PX = 2;
const FILL_ALPHA = 0.075;
const LINE_ALPHA = 0.075;
const ICON_ALPHA = 0.5;

export class WeaponRangeView {
  readonly root = new THREE.Group();
  private fill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private edges: Line2[] = [];
  private drawSize = { width: 1, height: 1 };

  constructor(private readonly color: number, stencilBit: number) {
    this.fill = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: FILL_ALPHA, depthTest: false, side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: stencilBit, stencilFuncMask: stencilBit, stencilWriteMask: stencilBit,
      stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    }));
    this.fill.renderOrder = 810;
    this.root.add(this.fill);
    this.root.visible = false;
  }

  set(terrain: Terrain, origins: readonly GunOrigin[], weapons: MountedWeapon[]): void {
    this.draw(terrain, weapons.map((w) => ({ ...originOf(origins, w.unit), range: w.def.range, spans: w.spans })));
  }

  hide(): void {
    this.root.visible = false;
  }

  private draw(terrain: Terrain, reaches: (GunOrigin & { range: number; spans: readonly FireSpan[] })[]): void {
    this.root.visible = reaches.length > 0;
    const points: THREE.Vector3[] = [];
    const idx: number[] = [];
    const outlines = reaches.flatMap(({ pos, heading, range, spans }) => {
      const at = (x: number, y: number) => new THREE.Vector3(x * S, markHeightAt(terrain, pos, x, y) * S + LIFT, y * S);
      const center = at(pos.x, pos.y);
      const middle = points.length;
      points.push(center);
      return spans.map((span) => {
        const rim = rimPoints(span, heading, (a) => at(pos.x + Math.cos(a) * range, pos.y + Math.sin(a) * range));
        const first = points.length;
        points.push(...rim);
        for (let i = 0; i < rim.length - 1; i++) idx.push(middle, first + i, first + i + 1);
        return span.to - span.from >= 360 ? rim : [center, ...rim, center];
      });
    });
    this.fill.geometry.dispose();
    this.fill.geometry = new THREE.BufferGeometry().setFromPoints(points).setIndex(idx);
    this.fill.material.opacity = FILL_ALPHA;
    this.drawEdges(outlines, LINE_ALPHA);
  }

  setDrawSize(width: number, height: number): void {
    this.drawSize = { width, height };
    for (const edge of this.edges) edge.material.resolution.set(width, height);
  }

  private drawEdges(outlines: THREE.Vector3[][], opacity: number): void {
    while (this.edges.length < outlines.length) {
      const edge = new Line2(new LineGeometry(), new LineMaterial({ color: this.color, linewidth: LINE_WIDTH_PX, transparent: true, opacity: LINE_ALPHA, depthTest: false }));
      edge.renderOrder = 811;
      this.edges.push(edge);
      this.root.add(edge);
    }
    this.edges.forEach((edge, i) => {
      const outline = outlines[i];
      edge.visible = outline !== undefined;
      if (!outline) return;
      edge.geometry.dispose();
      edge.geometry = new LineGeometry().setPositions(outline.flatMap((p) => [p.x, p.y, p.z]));
      edge.material.resolution.set(this.drawSize.width, this.drawSize.height);
      edge.material.opacity = opacity;
    });
  }
}

export type GunOrigin = { pos: Vec; heading: number };

function originOf(origins: readonly GunOrigin[], unit: number): GunOrigin {
  const origin = origins[unit];
  if (!origin) throw new Error(`No gun origin for unit ${unit}`);
  return origin;
}

export function vehicleOrigins(v: Vehicle): GunOrigin[] {
  return unitPoses(v);
}

export function frameOrigins(frame: VehicleFrame): GunOrigin[] {
  const front = { pos: toMap(frame.pos), heading: headingOf(frame.rot) };
  return frame.rear ? [front, { pos: toMap(frame.rear.pos), heading: headingOf(frame.rear.rot) }] : [front];
}

function rimPoints(span: FireSpan, heading: number, point: (angle: number) => THREE.Vector3): THREE.Vector3[] {
  const steps = Math.max(1, Math.ceil((span.to - span.from) / DEG_PER_STEP));
  return Array.from({ length: steps + 1 }, (_, i) => point(heading + (span.from + ((span.to - span.from) * i) / steps) * DEG));
}


export type IconSpot = { angle: number; distance: number };
export type HoverArc = { weapon: MountedWeapon; slot: number; spans: readonly FireSpan[]; spent: boolean; spot: IconSpot };

const ICON_RANGE_SHARE = 0.5;
const ICON_NUDGE_SHARE = 0.15;
const SAME_SPOT_TILES = 1.5;

export function iconSpot(spans: readonly FireSpan[], range: number, taken: readonly IconSpot[]): IconSpot {
  const widest = spans.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
  const angle = (widest.from + widest.to) / 2;
  let distance = range * ICON_RANGE_SHARE;
  while (taken.some((t) => Math.hypot(t.distance * Math.cos(t.angle * DEG) - distance * Math.cos(angle * DEG), t.distance * Math.sin(t.angle * DEG) - distance * Math.sin(angle * DEG)) < SAME_SPOT_TILES)) {
    distance += range * ICON_NUDGE_SHARE;
  }
  return { angle, distance };
}

export function hoverArcs(world: World, vehicle: Vehicle, weapons: readonly MountedWeapon[]): HoverArc[] {
  const arcs: HoverArc[] = [];
  for (const [i, weapon] of weapons.entries()) {
    const block = fireBlock(world, vehicle, weapon, null);
    const { spans } = weapon;
    if (block === 'disabled' || spans.length === 0) continue;
    const spot = iconSpot(spans, weapon.def.range, arcs.map((arc) => arc.spot));
    arcs.push({ weapon, slot: i + 1, spans, spent: block === 'empty' || block === 'cooldown', spot });
  }
  return arcs;
}

export class HoverArcsView {
  readonly root = new THREE.Group();
  private readonly ready = new WeaponRangeView(PAL.select, READY_ARC_BIT);
  private readonly spent = new WeaponRangeView(PAL.arcSpent, SPENT_ARC_BIT);
  private readonly icons = new Map<string, HTMLElement>();

  constructor(private readonly overlay: HTMLElement, private readonly rig: CameraRig) {
    this.root.add(this.ready.root, this.spent.root);
    this.hide();
  }

  setDrawSize(width: number, height: number): void {
    this.ready.setDrawSize(width, height);
    this.spent.setDrawSize(width, height);
  }

  follow(world: World, hovered: string | null, frames: Record<string, VehicleFrame>, off: boolean): void {
    const vehicle = hovered === null ? undefined : world.vehicles.find((v) => v.id === hovered);
    const frame = vehicle && frames[vehicle.id];
    if (off || !vehicle || !frame) return this.hide();
    this.update(world.terrain, hoverArcs(world, vehicle, vehicleStats(world, vehicle).weapons), frame);
  }

  private update(terrain: Terrain, arcs: HoverArc[], frame: VehicleFrame): void {
    const origins = frameOrigins(frame);
    this.ready.set(terrain, origins, arcs.filter((a) => !a.spent).map((a) => a.weapon));
    this.spent.set(terrain, origins, arcs.filter((a) => a.spent).map((a) => a.weapon));
    this.root.visible = true;
    this.syncIcons(arcs);
    for (const arc of arcs) {
      const { pos, heading } = originOf(origins, arc.weapon.unit);
      const a = heading + arc.spot.angle * DEG;
      const x = pos.x + Math.cos(a) * arc.spot.distance;
      const y = pos.y + Math.sin(a) * arc.spot.distance;
      const p = layerPointOf(this.rig.screenOf({ x: x * S, y: markHeightAt(terrain, pos, x, y) * S, z: y * S }));
      const node = this.icons.get(arc.weapon.part.id)!;
      node.style.left = `${p.x}px`;
      node.style.top = `${p.y}px`;
      node.classList.toggle('spent', arc.spent);
    }
  }

  hide(): void {
    this.root.visible = false;
    for (const node of this.icons.values()) node.remove();
    this.icons.clear();
  }

  private syncIcons(arcs: HoverArc[]): void {
    const ids = new Set(arcs.map((a) => a.weapon.part.id));
    for (const [id, node] of this.icons) {
      if (ids.has(id)) continue;
      node.remove();
      this.icons.delete(id);
    }
    for (const arc of arcs) {
      const id = arc.weapon.part.id;
      if (this.icons.has(id)) continue;
      const number = el('span', { class: 'arc-icon-slot' }, num(arc.slot, 'int'));
      const node = el('div', { class: 'arc-icon' }, createBareItemIcon(arc.weapon.part.defId), number);
      node.style.width = `${ICON_PX}px`;
      node.style.height = `${ICON_PX}px`;
      node.style.opacity = `${ICON_ALPHA}`;
      this.overlay.appendChild(node);
      this.icons.set(id, node);
    }
  }
}
