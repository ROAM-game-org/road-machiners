
import { CLOUD_SHADOWS } from './cloudShadows';
import { MODEL_FILL } from './modelFill';
import * as THREE from 'three';
import { chassisDef, type TruckPaint } from '../../data/chassis';
import { isShield, partDef, type PartDef, type PartKind } from '../../data/parts';
import { PHYSICS } from '../../data/physics';
import { wheelMounts } from '../../phys/body';
import { aimWithin, gunSpans, spansHold, type FireSpan } from '../../sim/armor';
import { cellRect, engineFloor, ringMiddles, highestUnder, restOn, roofSpot, spanOf, surfaceSamples, unitOfCells, unitsOf, type Body, type CellRect, type Rest } from '../../sim/body';
import { headingOf, headingQuat, type V3, type VehicleFrame } from '../../phys/frames';
import { PAL, paintOf, type TruckColors } from '../../render/palette';
import { BODY_PARTS, TRUCK_LOOK, baseModel, columnTops, drawnWheelPoints, dentOffset, dentsOf, type PartBox, grayShare, grayed, itemLookId, partModel, weaponLook, wearLookStep } from '../../render/partLooks';
import { baseGrid, facingOf, isMounted, itemBulk, itemCells } from '../../sim/grid';
import type { GridItem, Vehicle } from '../../sim/types';
import { angleDiff, DEG } from '../../sim/vec';
import { clearTop, headShape, signedDegrees, sweepOf, type Obstacle } from './gunClearance';
import { bottomOf, bottomRect, highestAhead, itemSpot, moveBySpot, plateLegs, plateOf, plateSpot, postBottom, postColumn, postStands, rearHang, underSpots, type ItemSpot } from './gunStand';
import { GLASS, LAMP, model, RADIO, socket, TRUCK_BIT, type ModelName } from './models';
import { addTwins, bodyPaint, CONTACT_SHADOW, contactShadowFor, mergeParts, mergeStatic } from './truckMesh';
import { armorPlacement, cutSpec, lampIslands, withCut, type CutSpec } from './armorCut';
import { hashStr } from '../../render/noise';
import { TruckMotion, WHIPS } from './truckMotion';
import { weaponHead } from './weaponHead';
import { cornerWheels, nearestWheels } from './wheelItems';

const T = PHYSICS.truck;
const CELL = PHYSICS.cell;


type PartItem = Extract<GridItem, { kind: 'part' }>;

const PAINT = 'paint';
const TRIM = 'trim';

const BROKEN_TONE: Record<PartKind, number> = { weapon: 0.5, armor: 0.6, accessory: 0.6, engine: 0.6, cargo: 0.6, core: 0.6, scanner: 0.6, store: 0.6, utility: 0.6 };

const ROT_YAW = Math.PI / 2;



const GUN_GAP = 0.03;
export const LANE_GAP = 0.01;
const MIN_LANE_SCALE = 0.5;
const SAMPLE_REACH = 0.1;

const SILHOUETTE_OPACITY = 0.5;
const SILHOUETTE_ORDER = 810;
const TRUCK_STENCIL = TRUCK_BIT;

type Wheel = { mount: THREE.Group; spin: THREE.Object3D; restY: number; follows: number };
type Shock = { obj: THREE.Object3D; top: THREE.Vector3; wheel: number; z: number };
type Axle = { obj: THREE.Object3D; a: number; b: number; inset: number };
type ContactShadow = { unit: UnitView; mesh: THREE.Mesh };
type UnitView = { index: number; root: THREE.Object3D; body: THREE.Group; b: Body; wheels: Wheel[]; shocks: Shock[]; axles: Axle[]; motion: TruckMotion; still: THREE.Group; obstacles: Obstacle[]; base: THREE.Object3D };

const SHOCK_R = 0.2;
const UP = new THREE.Vector3(0, 1, 0);
const ANTENNA_INSET = 0.12;
const RADIO_TIP = 1.6;
const RADIO_HALO = 0.6;
const CHAIN_SIDE = 0.4;

type Turret = { head: THREE.Group; tip: THREE.Vector3; spans: readonly FireSpan[]; facing: number; unit: number };

type Look = { tone: number; step: number; partId: string | null; dents: boolean };
const PRISTINE: Look = { tone: 1, step: 0, partId: null, dents: false };

export type ViewScene = 'world' | 'portrait' | 'xray';

type Anchor = { local: THREE.Vector3; parent: THREE.Object3D };

type Placement = { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 };

export function signatureOf(v: Vehicle, playerPaint: TruckPaint): string {
  const items = v.items
    .map((it) => {
      const what = it.kind === 'part' ? `${it.part.defId}#${it.part.id}:${wearLookStep(it.part)}` : itemLookId(it);
      return `${what}@${it.x},${it.y},${it.rot}`;
    })
    .join(',');
  const paint = paintOf(v, playerPaint);
  return `${v.chassisId}|${paint.body}|${paint.cab}|${paint.gear}|${items}`;
}

export type RebuildBudget = { take(): boolean; ready(root: THREE.Object3D): boolean };

const UNLIMITED: RebuildBudget = { take: () => true, ready: () => true };

class PerAnimationFrame implements RebuildBudget {
  private frame: CSSNumberish | null | undefined = undefined;
  private left = 0;

  constructor(private readonly perFrame: number) {}

  ready(): boolean {
    return true;
  }

  take(): boolean {
    const frame = document.timeline.currentTime;
    if (frame !== this.frame) {
      this.frame = frame;
      this.left = this.perFrame;
    }
    if (this.left <= 0) return false;
    this.left--;
    return true;
  }
}

export const FRAME_REBUILDS: RebuildBudget = new PerAnimationFrame(1);

function advanceBuild(pending: { steps: Generator<void, void>; built: boolean }, budget: RebuildBudget): boolean {
  while (!pending.built && budget.take()) pending.built = Boolean(pending.steps.next().done);
  return pending.built;
}

export class VehicleView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();

  private sig = '';
  private pending: { sig: string; twin: VehicleView; steps: Generator<void, void>; built: boolean } | null = null;
  private units: UnitView[] = [];
  private running = false;
  private turrets = new Map<string, Turret>();
  private anchors = new Map<string, Anchor>();
  private spots = new Map<GridItem, ItemSpot>();
  private headings: number[] = [0];
  private lastFrame: VehicleFrame | null = null;
  private rearFrame: VehicleFrame | null = null;
  private lampMat = new THREE.MeshBasicMaterial({ color: PAL.lamp.off });
  private radioMat = new THREE.MeshBasicMaterial({ color: PAL.radioLight.off });
  private halo: THREE.Sprite | null = null;
  private radioOn = false;
  private glassMat = new THREE.MeshLambertMaterial({ flatShading: true });
  private readonly glassGlow = new THREE.Color(0);
  private silhouettes: THREE.MeshBasicMaterial[] = [];
  private contactShadows: ContactShadow[] = [];
  private darkMat!: THREE.MeshBasicMaterial;
  private dark = false;

  constructor(v: Vehicle | null, seen: boolean, playerPaint: TruckPaint, private readonly scene: ViewScene) {
    this.root.add(this.body);
    if (v) this.update(v, seen, playerPaint);
  }

  update(v: Vehicle, seen: boolean, playerPaint: TruckPaint, budget: RebuildBudget = UNLIMITED): void {
    const sig = signatureOf(v, playerPaint);
    if (sig !== this.sig) this.rebuildToward(v, playerPaint, sig, budget);
    for (const silhouette of this.silhouettes) silhouette.visible = seen;
    this.running = engineRuns(v);
  }

  pose(f: VehicleFrame, dt: number): void {
    this.root.position.set(f.pos.x, f.pos.y, f.pos.z);
    this.root.quaternion.set(f.rot.x, f.rot.y, f.rot.z, f.rot.w);
    this.headings = [headingOf(f.rot)];
    this.poseWheels(this.units[0], f.wheels);
    this.units[0].motion.step(f, dt, this.running);
    this.poseRear(f, dt);
    for (const unit of this.units) {
      unit.body.updateMatrix();
      poseSuspension(unit);
    }
    for (const shadow of this.contactShadows) groundContactShadow(shadow);
  }

  private poseRear(f: VehicleFrame, dt: number): void {
    const rear = this.units[1];
    if (Boolean(rear) !== Boolean(f.rear)) {
      if (this.pending) return;
      throw new Error(`A view of ${this.units.length} units got a frame ${f.rear ? 'with' : 'without'} a rear unit`);
    }
    if (!rear || !f.rear) return;
    const inverse = this.root.quaternion.clone().invert();
    rear.root.position.set(f.rear.pos.x - f.pos.x, f.rear.pos.y - f.pos.y, f.rear.pos.z - f.pos.z).applyQuaternion(inverse);
    rear.root.quaternion.copy(inverse).multiply(new THREE.Quaternion(f.rear.rot.x, f.rear.rot.y, f.rear.rot.z, f.rear.rot.w));
    this.headings.push(headingOf(f.rear.rot));
    this.poseWheels(rear, f.rear.wheels);
    rear.motion.step(this.rearOf(f), dt, this.running);
  }

  private rearOf(f: VehicleFrame): VehicleFrame {
    if (f !== this.lastFrame || !this.rearFrame) {
      if (!f.rear) throw new Error('A rig frame has no rear unit');
      this.lastFrame = f;
      this.rearFrame = { pos: f.rear.pos, rot: f.rear.rot, acc: f.acc, wheels: f.rear.wheels };
    }
    return this.rearFrame;
  }

  private poseWheels(unit: UnitView, frames: VehicleFrame['wheels']): void {
    unit.wheels.forEach((wheel) => {
      const w = frames[wheel.follows];
      if (!w) return;
      wheel.mount.position.y = wheel.restY - w.suspension;
      wheel.mount.rotation.y = w.steer;
      wheel.spin.rotation.z = -w.spin;
    });
  }

  private buildContactShadows(): void {
    this.contactShadows = this.units.map((unit) => ({ unit, mesh: contactShadowFor(unit.b) }));
    for (const shadow of this.contactShadows) {
      shadow.unit.root.add(shadow.mesh);
      groundContactShadow(shadow);
    }
  }

  dropContactShadow(): void {
    for (const shadow of this.contactShadows) shadow.mesh.removeFromParent();
  }

  private isContactShadow(o: THREE.Object3D): boolean {
    return this.contactShadows.some((shadow) => shadow.mesh === o);
  }

  lamps(on: boolean): void {
    this.lampMat.color.setHex(on ? PAL.lamp.on : PAL.lamp.off);
  }

  radio(lit: boolean): void {
    this.radioOn = lit;
    this.radioMat.color.setHex(radioColor(lit));
    if (this.halo) this.halo.visible = lit;
  }

  outline(dark: boolean): void {
    if (dark === this.dark) return;
    this.dark = dark;
    this.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || this.keepsLook(o)) return;
      if (dark) {
        o.userData.litMat = o.material;
        o.material = o.userData.darkMat ?? this.darkMat;
      } else {
        o.material = o.userData.litMat;
        delete o.userData.litMat;
      }
    });
  }

  private keepsLook(o: THREE.Mesh): boolean {
    const m = (o.material as THREE.Material).userData.fadeOf ?? o.material;
    return this.silhouettes.includes(m as THREE.MeshBasicMaterial) || m === this.lampMat || m === this.radioMat || this.isContactShadow(o) || o.userData.outline;
  }

  windows(glow: THREE.Color): void {
    this.glassGlow.copy(glow);
    this.glassMat.emissive.copy(glow);
  }

  aim(yawOf: (partId: string) => number | null): void {
    for (const [id, turret] of this.turrets) {
      const yaw = yawOf(id);
      const heading = this.headings[turret.unit] ?? this.headings[0];
      const want = yaw === null ? turret.facing : angleDiff(heading, yaw) / DEG;
      const turn = aimWithin(sweepOf(turret.spans, true, turret.facing), want);
      const q = headingQuat(turn * DEG);
      turret.head.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }

  turretUnit(partId: string): number {
    const turret = this.turrets.get(partId);
    if (!turret) throw new Error(`Vehicle view has no mounted weapon ${partId}`);
    return turret.unit;
  }

  covers(partId: string, heading: number, yaw: number): boolean {
    const turret = this.turrets.get(partId);
    if (!turret) throw new Error(`Vehicle view has no mounted weapon ${partId}`);
    return spansHold(sweepOf(turret.spans, true, turret.facing), angleDiff(heading, yaw) / DEG);
  }

  muzzle(partId: string): { pos: V3; dir: V3 } {
    const turret = this.turrets.get(partId);
    if (!turret) throw new Error(`Vehicle view has no mounted weapon ${partId}`);
    turret.head.updateWorldMatrix(true, false);
    const pos = turret.tip.clone().applyMatrix4(turret.head.matrixWorld);
    const dir = new THREE.Vector3(1, 0, 0).transformDirection(turret.head.matrixWorld);
    return { pos: { x: pos.x, y: pos.y, z: pos.z }, dir: { x: dir.x, y: dir.y, z: dir.z } };
  }

  dispose(): void {
    this.dropPending();
    disposeChildren(this.root);
  }

  private rebuildToward(v: Vehicle, playerPaint: TruckPaint, sig: string, budget: RebuildBudget): void {
    const pending = this.pending?.sig === sig ? this.pending : this.startRebuild(v, playerPaint, sig);
    if (advanceBuild(pending, budget) && budget.ready(pending.twin.root)) this.finishRebuild(pending.twin, sig);
  }

  get built(): boolean {
    return this.sig !== '';
  }

  private startRebuild(v: Vehicle, playerPaint: TruckPaint, sig: string): NonNullable<VehicleView['pending']> {
    this.dropPending();
    const twin = new VehicleView(null, false, playerPaint, this.scene);
    this.pending = { sig, twin, steps: twin.build(v, paintOf(v, playerPaint)), built: false };
    return this.pending;
  }

  private finishRebuild(twin: VehicleView, sig: string): void {
    if (twin !== this) this.adopt(twin);
    this.sig = sig;
    this.pending = null;
  }

  private dropPending(): void {
    if (this.pending && this.pending.twin !== this) this.pending.twin.dispose();
    this.pending = null;
  }

  private adopt(twin: VehicleView): void {
    disposeChildren(this.root);
    this.root.add(...twin.root.children);
    twin.units[0].root = this.root;
    twin.units.forEach((unit, i) => this.units[i] && unit.motion.carryFrom(this.units[i].motion));
    ({ body: this.body, units: this.units, turrets: this.turrets, anchors: this.anchors, lampMat: this.lampMat, radioMat: this.radioMat, halo: this.halo } = twin);
    ({ glassMat: this.glassMat, silhouettes: this.silhouettes, contactShadows: this.contactShadows, darkMat: this.darkMat, dark: this.dark } = twin);
    this.lastFrame = null;
    this.rearFrame = null;
  }

  private *build(v: Vehicle, colors: TruckColors): Generator<void, void> {
    this.units = unitsOf(v.chassisId).map((u) => this.unitView(v, u.index, u.body));
    const paint = colors.gear;
    this.freshMaterials();
    const onBody = v.items.filter((item) => onChassis(v, item));
    const bases = this.buildBases(v, colors.body, colors.cab, cabLook(v));
    yield;
    const { wheelItems, guns } = yield* this.drawItems(v, onBody, paint);
    for (const gun of guns) {
      this.buildWeapon(v, gun, isMounted(v.chassisId, gun), paint);
      yield;
    }
    this.buildWheels(v, wheelItems, paint);
    this.buildContactShadows();
    yield;
    this.anchorUndrawn(v);
    for (const unit of this.units) this.buildSuspension(unit, paint);
    this.buildLooseParts(v, onBody.length === v.items.length);
    this.dentBases(bases, cabLook(v));
    yield;
    const merged: THREE.Group[] = [];
    yield* this.mergeUnits(v, merged);
    this.buildSilhouette(colors.body);
    yield;
    this.darkMat = new THREE.MeshBasicMaterial({ color: PAL.outline });
    markStencil(this.darkMat);
    this.dark = false;
    this.finishLook(merged);
  }

  private freshMaterials(): void {
    const on = this.lampMat.color.getHex() === PAL.lamp.on;
    this.lampMat = new THREE.MeshBasicMaterial({ color: on ? PAL.lamp.on : PAL.lamp.off });
    this.radioMat = new THREE.MeshBasicMaterial({ color: radioColor(this.radioOn) });
    this.halo = null;
    this.glassMat = new THREE.MeshLambertMaterial({ flatShading: true, emissive: this.glassGlow });
  }

  private *drawItems(v: Vehicle, onBody: GridItem[], paint: number): Generator<void, { wheelItems: PartItem[]; guns: PartItem[] }> {
    const wheelItems: PartItem[] = [];
    const guns: PartItem[] = [];
    this.spots.clear();
    const drawn = (it: GridItem) => (hidesInside(v, it) ? this.scene === 'xray' && this.standsUp(v, it, true) : !wouldFloat(v, it) && this.standsUp(v, it));
    for (const item of onBody.filter(drawn)) {
      this.drawItem(v, item, paint, wheelItems, guns);
      yield;
    }
    return { wheelItems, guns };
  }

  private *mergeUnits(v: Vehicle, merged: THREE.Group[]): Generator<void, void> {
    const armorIds = armorIdsOf(v);
    for (const unit of this.units) {
      const group = mergeParts(unit.still, armorIds, this.scene === 'world' ? 'armor' : 'parts');
      unit.body.add(group);
      merged.push(group);
      yield;
    }
  }

  private finishLook(merged: THREE.Group[]): void {
    if (this.scene === 'world') for (const shade of [CLOUD_SHADOWS, MODEL_FILL]) shade.shadeTree(this.root);
    const plain = [...this.silhouettes];
    this.units.forEach((unit, i) => this.cutArmor(unit, merged[i], plain));
    if (this.scene !== 'world') {
      this.dropContactShadow();
      dropShadows(this.root);
    }
  }

  private cutArmor(unit: UnitView, merged: THREE.Group, plain: THREE.MeshBasicMaterial[]): void {
    const lamps = merged.children.flatMap((o) => (o instanceof THREE.Mesh && o.material === this.lampMat ? lampIslands(o.geometry) : []));
    const spec = cutSpec(restingWheelBoxes(unit), lamps, unit.b.half, TRUCK_LOOK);
    const cut: ArmorCut = {
      spec,
      depth: withCut(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), spec),
      dark: withCut(this.darkMat, spec),
      silhouettes: new Map(plain.map((s) => [s, withCut(s, spec)])),
    };
    this.silhouettes.push(...cut.silhouettes.values());
    unit.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.armor && this.unitOwns(unit, o)) cutMesh(o, cut);
    });
  }

  private unitOwns(unit: UnitView, o: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) {
      const owner = this.units.find((u) => u.root === p);
      if (owner) return owner === unit;
    }
    return false;
  }

  private unitView(v: Vehicle, index: number, b: Body): UnitView {
    const root = index === 0 ? this.root : new THREE.Group();
    const body = index === 0 ? this.body : new THREE.Group();
    if (index > 0) {
      root.add(body);
      this.root.add(root);
    }
    const motion = new TruckMotion(body, new THREE.Vector3(0, b.wheelY, 0), spanOf(v.chassisId).half.x, hashStr(`${v.id}:${index}`));
    return { index, root, body, b, wheels: [], shocks: [], axles: [], motion, still: new THREE.Group(), obstacles: [], base: new THREE.Group() };
  }

  private unitOf(v: Vehicle, item: GridItem): UnitView {
    const unit = this.units[unitOfCells(v.chassisId, itemCells(item)).index];
    if (!unit) throw new Error(`Vehicle view of ${v.chassisId} has no unit for item ${item.id}`);
    return unit;
  }

  private drawItem(v: Vehicle, item: GridItem, paint: number, wheelItems: PartItem[], guns: PartItem[]): void {
    const unit = this.unitOf(v, item);
    if (item.kind === 'part') return this.drawPart(v, unit, item, paint, wheelItems, guns);
    const good = this.placeItem(v, item, paint);
    good.name = item.id;
    unit.still.add(good);
    unit.obstacles.push(obstacleOf(good));
  }

  private drawPart(v: Vehicle, unit: UnitView, item: PartItem, paint: number, wheelItems: PartItem[], guns: PartItem[]): void {
    const def = partDef(item.part.defId);
    const mounted = isMounted(v.chassisId, item);
    if (BODY_PARTS.has(def.id)) return;
    if (def.kind === 'weapon') guns.push(item);
    else if (isWheel(def) && mounted) wheelItems.push(item);
    else this.drawModel(v, unit, item, def, paint);
  }

  private drawModel(v: Vehicle, unit: UnitView, item: PartItem, def: PartDef, paint: number): void {
    const obj = this.placedPart(v, unit.b, item, def, paint);
    obj.name = item.id;
    const spot = this.spots.get(item);
    if (spot?.legs) for (const leg of plateLegs(unit.base, bottomRect(obj, unit.index), spot.y, (role) => this.legModel(item, paint, role), underSpots(obj))) unit.still.add(leg);
    unit.still.add(obj);
    this.anchors.set(item.part.id, { local: new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()), parent: unit.body });
    if (blocksGuns(v, item, def)) unit.obstacles.push(obstacleOf(obj));
  }

  private placedPart(v: Vehicle, body: Body, item: PartItem, def: PartDef, paint: number): THREE.Object3D {
    const mounted = isMounted(v.chassisId, item);
    if (isWheel(def)) return this.spareWheel(v, body, item, paint, standingY(v, item));
    if (isShield(def)) return this.placeArmor(v, item, paint);
    if (def.kind === 'engine' && mounted) return this.placeEngine(v, item, paint);
    return this.placeItem(v, item, paint);
  }

  private anchorUndrawn(v: Vehicle): void {
    const last = this.units[this.units.length - 1];
    for (const item of v.items) {
      if (item.kind !== 'part' || this.anchors.has(item.part.id)) continue;
      if (onChassis(v, item)) this.anchors.set(item.part.id, { local: anchorPoint(v, item), parent: this.unitOf(v, item).body });
      else this.anchors.set(item.part.id, { local: new THREE.Vector3(-last.b.half.x, last.b.half.y, 0), parent: last.body });
    }
  }

  hasPart(partId: string): boolean {
    return this.anchors.has(partId);
  }

  partPoint(partId: string): V3 {
    const anchor = this.anchors.get(partId);
    if (!anchor) throw new Error(`Vehicle view has no part ${partId}`);
    anchor.parent.updateWorldMatrix(true, false);
    const p = anchor.local.clone().applyMatrix4(anchor.parent.matrixWorld);
    return { x: p.x, y: p.y, z: p.z };
  }

  center(): V3 {
    const { x, y, z } = this.root.position;
    return { x, y, z };
  }

  private buildSilhouette(paint: number): void {
    const silhouette = this.scene === 'world' ? silhouetteMaterial(paint) : null;
    this.silhouettes = silhouette ? [silhouette] : [];
    const meshes: THREE.Mesh[] = [];
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && !this.isContactShadow(o) && !o.userData.outline) meshes.push(o);
    });
    for (const mesh of meshes) markStencil(mesh.material as THREE.Material);
    if (silhouette) addTwins(meshes, silhouette, SILHOUETTE_ORDER);
  }

  private useLamp(obj: THREE.Object3D): void {
    const shared: Record<string, THREE.Material> = { [LAMP]: this.lampMat, [RADIO]: this.radioMat, [GLASS]: this.glassMat };
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mat = shared[o.material.name];
      if (!mat) return;
      if (mat === this.glassMat) this.glassMat.color.copy(o.material.color);
      o.material.dispose();
      o.material = mat;
      o.userData.lamp = true;
    });
  }

  private buildBases(v: Vehicle, paint: number, trim: number, look: Look): THREE.Object3D[] {
    return this.units.map((unit) => {
      const obj = model(baseModel(v.chassisId, unit.index));
      obj.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material.name === TRIM) o.material.color.setHex(trim);
      });
      tint(obj, paint, { ...look, dents: false });
      this.useLamp(obj);
      unit.still.add(obj);
      unit.base = obj;
      return obj;
    });
  }

  private dentBases(bases: THREE.Object3D[], look: Look): void {
    if (!look.partId || look.step === 0) return;
    this.units.forEach((unit, i) => {
      const base = bases[i];
      const keepOut = [...unit.still.children, ...unit.body.children].filter((o) => o !== base && o !== unit.still && this.standsOnBody(o)).map((o) => unitBox(o, unit.body));
      dent(base, look.partId as string, look.step, { top: true, keepOut });
    });
  }

  private standsOnBody(o: THREE.Object3D): boolean {
    let drawn = false;
    o.traverse((m) => {
      if (m instanceof THREE.Mesh && !this.isContactShadow(m) && !m.userData.outline) drawn = true;
    });
    return drawn;
  }

  private standsUp(v: Vehicle, item: GridItem, level = false): boolean {
    if (!standsFlat(v, item)) return true;
    const spot = itemSpotOf(v, item, this.unitOf(v, item).base) ?? (level ? { dx: 0, dz: 0, y: standingY(v, item), slope: { x: 0, z: 0 }, legs: false } : null);
    if (spot) this.spots.set(item, spot);
    return spot !== null;
  }

  private placeItem(v: Vehicle, item: GridItem, paint: number): THREE.Object3D {
    const obj = model(itemModel(item));
    const spot = this.spots.get(item);
    if (!spot) throw new Error(`Item ${item.id} on ${v.chassisId} has no standing spot`);
    const at = footprint(v, item, spot.y);
    at.pos.x += spot.dx;
    at.pos.z += spot.dz;
    place(obj, at);
    lean(obj, spot.slope);
    tint(obj, paint, lookOf(item));
    return obj;
  }

  private placeEngine(v: Vehicle, item: PartItem, paint: number): THREE.Object3D {
    const obj = model(itemModel(item));
    place(obj, footprint(v, item, engineFloor(v.chassisId), rectOf(v, item)));
    tint(obj, paint, lookOf(item));
    return obj;
  }

  private placeArmor(v: Vehicle, item: PartItem, paint: number): THREE.Object3D {
    const def = partDef(item.part.defId);
    if (!isShield(def)) throw new Error(`Part ${def.id} is not armor or an accessory`);
    const obj = model(partModel(def.id));
    place(obj, armorPlacement(v, item, new THREE.Box3().setFromObject(obj), this.unitOf(v, item).base));
    tint(obj, paint, lookOf(item));
    return obj;
  }

  private riser(stand: ReturnType<typeof weaponStand>, item: PartItem, paint: number, into: THREE.Group, top: number): Placement {
    const { at, foot } = stand;
    const bottom = postBottom(foot, top);
    const mount = { ...at, pos: at.pos.clone().setY(top) };
    if (bottom >= top || !postStands(this.units[stand.plate.unit].base, at.pos, bottom)) return mount;
    const post = model('wmount_riser');
    place(post, { pos: at.pos.clone().setY(bottom), yaw: 0, scale: new THREE.Vector3(1, (top - bottom) / socket('wmount_riser', 'top').y, 1) });
    tint(post, paint, lookOf(item));
    post.name = `${item.id} post`;
    into.add(post);
    return mount;
  }

  private legModel(item: PartItem, paint: number, role: 'leg' | 'brace'): THREE.Object3D {
    const leg = model('wmount_leg');
    tint(leg, paint, lookOf(item));
    leg.name = `${item.id} ${role}`;
    return leg;
  }

  private buildWeapon(v: Vehicle, item: PartItem, active: boolean, paint: number): void {
    const unit = this.unitOf(v, item);
    const look = weaponLook(item.part.id, item.part.defId);
    const wear = lookOf(item);
    const { head: parts, tip } = weaponHead(look);
    for (const p of parts.children) tint(p, paint, wear);
    const head = mergeStatic(parts);

    const stand = weaponStand(v, item, unit.base);
    const headAt = socket(look.mount, 'head');
    const facing = signedDegrees(facingOf(item));
    const spans = gunSpans(v, item);
    const shape = headShape(head, socket(look.receiver, 'muzzle').x);
    const mount = model(look.mount);
    place(mount, stand.at);
    mount.updateMatrix();
    const across = item.rot % 2 === 0 ? 'z' : 'x';
    const pivot = headAt.clone().applyMatrix4(mount.matrix);
    const own = rectOf(v, item);
    const fit = laneFit(head, pivot, facing, own, across, weaponReach(item));
    head.scale.z = fit.scale;
    const along = across === 'z' ? 'x' : 'z';
    pivot[across] += fit.shift;
    pivot[along] += fit.slide;
    const ground = surfaceSamples(v.chassisId, own.unit, pivot, Math.max(shape.core, shape.reach) + SAMPLE_REACH)
      .filter((s) => !(s.x >= own.x0 && s.x <= own.x1 && s.z >= own.z0 && s.z <= own.z1))
      .map((s): Obstacle => ({ x0: s.x - s.half, x1: s.x + s.half, z0: s.z - s.half, z1: s.z + s.half, top: s.y }));
    const clear = clearTop(pivot, shape, sweepOf(spans, active, facing), [...unit.obstacles, ...ground], GUN_GAP);
    const top = Math.max(stand.top, clear - headAt.y - shape.bottom);
    if (!Number.isFinite(top)) throw new Error(`Gun ${item.part.id} on ${v.chassisId} has a post height of ${top}`);

    const at = this.riser(stand, item, paint, unit.still, top);
    place(mount, at);
    tint(mount, paint, wear);
    mount.name = `${item.id} mount`;
    head.name = `${item.id} head`;
    unit.still.add(mount);
    for (const leg of plateLegs(unit.base, plateOf(look.mount, unit.index, at), top, (role) => this.legModel(item, paint, role))) unit.still.add(leg);
    mount.updateMatrix();
    head.position.copy(headAt.applyMatrix4(mount.matrix));
    head.position[across] += fit.shift;
    head.position[along] += fit.slide;
    this.anchors.set(item.part.id, { local: head.position.clone(), parent: unit.body });
    const turn = headingQuat(facing * DEG);
    head.quaternion.set(turn.x, turn.y, turn.z, turn.w);
    if (!active) {
      unit.still.add(head);
      return;
    }
    unit.body.add(head);
    this.turrets.set(item.part.id, { head, tip, spans, facing, unit: unit.index });
  }

  private buildWheels(v: Vehicle, items: PartItem[], paint: number): void {
    const mounts = this.units.flatMap((unit) => drawnWheelPoints(unit.b, unit.index).map((m) => ({ unit, m })));
    const looks = this.units.length === 1 ? cornerWheels(v, mounts.map(({ m }) => m), items) : nearestWheels(v, mounts.map(({ unit, m }) => ({ unit: unit.index, m })), items);
    mounts.forEach(({ unit, m }, i) => {
      const item = looks[i];
      const mount = new THREE.Group();
      mount.position.set(m.x, m.y - T.suspensionRest, m.z);
      const spin = this.wheelModel(unit.b, paint, lookOf(item));
      mount.add(spin);
      if (!this.anchors.has(item.part.id)) this.anchors.set(item.part.id, { local: new THREE.Vector3(), parent: mount });
      unit.root.add(mount);
      unit.wheels.push({ mount, spin, restY: m.y, follows: m.follows });
    });
  }

  private buildSuspension(unit: UnitView, paint: number): void {
    const body = unit.b;
    const thick = new THREE.Vector3(body.wheelRadius, 1, body.wheelRadius);
    const inset = body.wheelHalfWidth + SHOCK_R * body.wheelRadius;
    wheelMounts(body, unit.index).forEach((m, wheel) => {
      const z = -Math.sign(m.z) * inset;
      const obj = this.stretchModel(unit, 'coilover', thick, paint);
      unit.shocks.push({ obj, top: new THREE.Vector3(m.x, -body.half.y, m.z + z), wheel, z });
    });
    const pairs = unit.index === 0 ? [[0, 1], [2, 3]] : [[0, 1]];
    for (const [a, b] of pairs) unit.axles.push({ obj: this.stretchModel(unit, 'axle', thick, paint), a, b, inset: body.wheelHalfWidth });
  }

  private stretchModel(unit: UnitView, name: ModelName, thick: THREE.Vector3, paint: number): THREE.Object3D {
    const raw = model(name);
    tint(raw, paint, PRISTINE);
    const inner = new THREE.Group();
    inner.add(raw);
    const merged = mergeStatic(inner);
    merged.scale.copy(thick);
    merged.traverse((o) => (o.castShadow = false));
    const outer = new THREE.Group();
    outer.add(merged);
    unit.root.add(outer);
    return outer;
  }

  private buildLooseParts(v: Vehicle, bareRear: boolean): void {
    const cab = cabOf(v);
    if (!cab) throw new Error(`${v.id} has no cab`);
    const rect = cellRect(v.chassisId, itemCells(cab));
    const spot = roofSpot(v.chassisId, rect, ANTENNA_INSET);
    const cabUnit = this.units[rect.unit];
    const tip = wrapped(model('antenna'));
    this.useLamp(tip);
    const antenna = mergeStatic(tip);
    antenna.name = 'antenna';
    this.halo = radioHalo(this.radioOn);
    antenna.add(this.halo);
    antenna.position.set(spot.x, spot.y, spot.z);
    cabUnit.body.add(antenna);
    cabUnit.motion.addWhip(antenna, WHIPS.antenna);
    if (!bareRear) return;
    const last = this.units[this.units.length - 1];
    const chain = mergeStatic(wrapped(model('tow_chain')));
    chain.position.copy(rearHang(last.base, last.b.half.z * CHAIN_SIDE));
    last.body.add(chain);
    last.motion.addWhip(chain, WHIPS.chain);
  }

  private spareWheel(v: Vehicle, body: Body, item: PartItem, paint: number, y: number): THREE.Object3D {
    const wheel = this.wheelModel(body, paint, lookOf(item));
    const at = footprint(v, item, y);
    wheel.position.set(at.pos.x, at.pos.y + body.wheelRadius, at.pos.z);
    return wheel;
  }

  private wheelModel(body: Body, paint: number, look: Look): THREE.Object3D {
    const raw = model('wheel');
    tint(raw, paint, { ...look, dents: false });
    const wrap = new THREE.Group();
    wrap.add(raw);
    const wheel = mergeStatic(wrap);
    wheel.scale.set(body.wheelRadius, body.wheelRadius, body.wheelHalfWidth * 2);
    return wheel;
  }
}

function poseSuspension(unit: UnitView): void {
  const hub = (i: number, dz: number) => {
    const p = unit.wheels[i].mount.position;
    return new THREE.Vector3(p.x, p.y, p.z + dz);
  };
  for (const s of unit.shocks) stretch(s.obj, hub(s.wheel, s.z), s.top.clone().applyMatrix4(unit.body.matrix), 0);
  for (const a of unit.axles) stretch(a.obj, hub(a.a, a.inset), hub(a.b, -a.inset), 0.5);
}

type ArmorCut = { spec: CutSpec; depth: THREE.MeshDepthMaterial; dark: THREE.MeshBasicMaterial; silhouettes: Map<THREE.MeshBasicMaterial, THREE.MeshBasicMaterial> };

function cutMesh(mesh: THREE.Mesh, cut: ArmorCut): void {
  const plain = mesh.material as THREE.Material;
  const twin = cut.silhouettes.get(plain as THREE.MeshBasicMaterial);
  if (twin) {
    mesh.material = twin;
    return;
  }
  mesh.material = withCut(plain, cut.spec);
  mesh.userData.cut = cut.spec;
  mesh.userData.darkMat = cut.dark;
  if (mesh.userData.outline) return;
  plain.dispose();
  mesh.customDepthMaterial = cut.depth;
}

function dropShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = false;
    o.receiveShadow = false;
  });
}

function armorIdsOf(v: Vehicle): Set<string> {
  return new Set(v.items.flatMap((it) => (it.kind === 'part' && isShield(partDef(it.part.defId)) ? [it.part.id] : [])));
}

function restingWheelBoxes(unit: UnitView): THREE.Box3[] {
  const reach = new THREE.Vector3(unit.b.wheelRadius, unit.b.wheelRadius, unit.b.wheelHalfWidth);
  return drawnWheelPoints(unit.b, unit.index).map((m) => {
    const center = new THREE.Vector3(m.x, m.y - T.suspensionRest, m.z);
    return new THREE.Box3(center.clone().sub(reach), center.add(reach));
  });
}

function engineRuns(v: Vehicle): boolean {
  return v.items.some((it) => it.kind === 'part' && it.part.hp > 0 && partDef(it.part.defId).kind === 'engine' && isMounted(v.chassisId, it));
}

function wrapped(obj: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.add(obj);
  return g;
}

function stretch(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, at: number): void {
  const dir = to.clone().sub(from);
  const length = dir.length();
  if (!(length > 0)) throw new Error('Suspension part has zero length');
  obj.position.copy(from).addScaledVector(dir, at);
  obj.quaternion.setFromUnitVectors(UP, dir.divideScalar(length));
  obj.scale.set(1, length, 1);
}

function silhouetteMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: SILHOUETTE_OPACITY,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    stencilWrite: true,
    stencilRef: TRUCK_STENCIL,
    stencilFuncMask: TRUCK_STENCIL,
    stencilWriteMask: TRUCK_STENCIL,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
}

function markStencil(mat: THREE.Material): void {
  mat.stencilWrite = true;
  mat.stencilRef = TRUCK_STENCIL;
  mat.stencilWriteMask = TRUCK_STENCIL;
  mat.stencilFunc = THREE.AlwaysStencilFunc;
  mat.stencilZPass = THREE.ReplaceStencilOp;
}

function onChassis(v: Vehicle, item: GridItem): boolean {
  const grid = baseGrid(v.chassisId);
  const cells = itemCells(item);
  const inside = cells.filter((c) => c.y < grid.h).length;
  if (inside !== 0 && inside !== cells.length) throw new Error(`Item ${item.id} lies across the end of the ${v.chassisId} grid`);
  return inside === cells.length;
}

export function hidesInside(v: Pick<Vehicle, 'chassisId'>, item: GridItem): boolean {
  if (inCargoBay(v, item)) return true;
  if (item.kind !== 'part') return false;
  const def = partDef(item.part.defId);
  const chassis = chassisDef(v.chassisId);
  if (def.kind === 'engine' && isMounted(v.chassisId, item)) return !chassis.showsEngine;
  return def.kind === 'core' && (def.role === 'transmission' || def.role === 'tank') && !chassis.showsCores;
}

function inCargoBay(v: Pick<Vehicle, 'chassisId'>, item: GridItem): boolean {
  const grid = baseGrid(v.chassisId);
  return itemCells(item).every((c) => grid.cells[c.y]?.[c.x] === 'C');
}

export function weaponStand(v: Pick<Vehicle, 'chassisId'>, item: GridItem, body: THREE.Object3D): { at: Placement; bottom: number; top: number; foot: number; plate: CellRect } {
  if (item.kind !== 'part') throw new Error(`Item ${item.id} is not a gun`);
  const mount = weaponLook(item.part.id, item.part.defId).mount;
  const at = footprint(v, item, standingY(v, item));
  const cells = rectOf(v, item);
  const standing = at.pos.y;
  const topOf = (moved: CellRect) => {
    const under = highestUnder(v.chassisId, moved);
    return Math.max(under === -Infinity ? standing : under, highestAhead(v.chassisId, moved));
  };
  moveBySpot(at, plateSpot(body, v.chassisId, plateOf(mount, cells.unit, at), cells, topOf));
  const unit = cells.unit;
  const plate = plateOf(mount, unit, at);
  const under = highestUnder(v.chassisId, plate);
  const rest = under === -Infinity ? at.pos.y : under;
  at.pos.y = rest;
  const top = Math.max(rest, highestAhead(v.chassisId, plate));
  const foot = highestUnder(v.chassisId, postColumn(at.pos, plate.unit));
  if (foot === -Infinity && isMounted(v.chassisId, item)) {
    const cells = itemCells(item).map((c) => `${c.x},${c.y}`).join(' ');
    throw new Error(`The ${v.chassisId} model has no surface under the post of gun ${item.part.defId} mounted on ${cells}`);
  }
  return { at, bottom: postBottom(foot, top), top, foot, plate };
}

function anchorPoint(v: Pick<Vehicle, 'chassisId'>, item: GridItem): THREE.Vector3 {
  const rect = rectOf(v, item);
  const surface = highestUnder(v.chassisId, rect);
  const y = surface === -Infinity ? standingY(v, item) : surface;
  return new THREE.Vector3((rect.x0 + rect.x1) / 2, y, (rect.z0 + rect.z1) / 2);
}

const FORWARD = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }] as const;

export function laneFit(head: THREE.Object3D, pivot: { x: number; z: number }, facing: number, lane: CellRect, across: 'x' | 'z', reach: number): { scale: number; shift: number; slide: number } {
  const box = new THREE.Box3().setFromObject(head);
  const turn = headingQuat(facing * DEG);
  const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(turn.x, turn.y, turn.z, turn.w));
  const sign = (across === 'z' ? dir.z : dir.x) >= 0 ? 1 : -1;
  const [lo, hi] = (across === 'z' ? [lane.z0, lane.z1] : [lane.x0, lane.x1]).map((e, i) => e + (i === 0 ? LANE_GAP : -LANE_GAP));
  const [behind, ahead] = sign > 0 ? [-box.min.z, box.max.z] : [box.max.z, -box.min.z];
  const width = Math.max(behind, 0) + Math.max(ahead, 0);
  const scale = width > 0 ? Math.max(MIN_LANE_SCALE, Math.min(1, (hi - lo) / width)) : 1;
  const at = pivot[across];
  const low = lo + Math.max(behind, 0) * scale;
  const high = hi - Math.max(ahead, 0) * scale;
  const shift = low > high ? (low + high) / 2 - at : Math.min(Math.max(at, low), high) - at;
  return { scale, shift, slide: alongSlide(box, pivot, facing, lane, reach) };
}

function alongSlide(box: THREE.Box3, pivot: { x: number; z: number }, facing: number, lane: CellRect, reach: number): number {
  const heading = FORWARD[(((facing / 90) % 4) + 4) % 4];
  const axis = heading.x !== 0 ? 'x' : 'z';
  const sign = heading.x !== 0 ? heading.x : heading.z;
  const [a, b] = axis === 'x' ? [lane.x0, lane.x1] : [lane.z0, lane.z1];
  const rear = sign > 0 ? a : b;
  const center = (a + b) / 2;
  const at = pivot[axis] * sign;
  const forward = Math.max(box.max.x, 0);
  const back = Math.max(-box.min.x, 0);
  const high = center * sign + reach - forward;
  const low = rear * sign + back;
  const wanted = low > high ? high : Math.min(Math.max(at, low), high);
  return (wanted - at) * sign;
}

function weaponReach(item: PartItem): number {
  const def = partDef(item.part.defId);
  if (def.kind !== 'weapon') throw new Error(`Part ${def.id} is not a gun`);
  return def.reach;
}

function rectOf(v: Pick<Vehicle, 'chassisId'>, item: GridItem): CellRect {
  return cellRect(v.chassisId, itemCells(item));
}

export function wouldFloat(v: Pick<Vehicle, 'chassisId'>, item: GridItem): boolean {
  return !alwaysDrawn(v, item) && !standsFlat(v, item) && restOf(v, item).perched;
}

export function itemSpotOf(v: Pick<Vehicle, 'chassisId'>, item: GridItem, base: THREE.Object3D): ItemSpot | null {
  const rest = restOf(v, item);
  return itemSpot(base, bottomOf(itemModel(item), rest.rect.unit, footprint(v, item, rest.y)), rest, rectOf(v, item), ringMiddles(v.chassisId, item.y), item.kind === 'part');
}

function standsFlat(v: Pick<Vehicle, 'chassisId'>, item: GridItem): boolean {
  if (item.kind !== 'part') return true;
  const def = partDef(item.part.defId);
  if (BODY_PARTS.has(def.id) || isWheel(def)) return false;
  return !hangsOnTruck(def) && !(def.kind === 'engine' && isMounted(v.chassisId, item));
}

function hangsOnTruck(def: PartDef): boolean {
  return def.kind === 'weapon' || isShield(def);
}

function alwaysDrawn(v: Pick<Vehicle, 'chassisId'>, item: GridItem): boolean {
  if (item.kind !== 'part') return false;
  const def = partDef(item.part.defId);
  if (def.kind === 'weapon') return true;
  return (isShield(def) || def.kind === 'engine' || isWheel(def)) && isMounted(v.chassisId, item);
}

function restOf(v: Pick<Vehicle, 'chassisId'>, item: GridItem): Rest {
  return restOn(v.chassisId, rectOf(v, item));
}

export function standingY(v: Pick<Vehicle, 'chassisId'>, item: GridItem): number {
  return restOf(v, item).y;
}

function itemModel(item: GridItem) {
  return partModel(itemLookId(item));
}

function cabOf(v: Vehicle): GridItem | undefined {
  return v.items.find((it) => it.kind === 'part' && BODY_PARTS.has(it.part.defId));
}

function cabLook(v: Vehicle): Look {
  const cab = cabOf(v);
  return cab ? lookOf(cab) : PRISTINE;
}

function lookOf(item: GridItem): Look {
  if (item.kind !== 'part') return PRISTINE;
  const step = wearLookStep(item.part);
  const kind = partDef(item.part.defId).kind;
  return { tone: item.part.hp > 0 ? 1 : BROKEN_TONE[kind], step, partId: item.part.id, dents: kind !== 'weapon' };
}

export function footprint(v: Pick<Vehicle, 'chassisId'>, item: GridItem, y: number, rect: CellRect = restOf(v, item).rect): Placement {
  const size = itemBulk(item);
  const dx = rect.x1 - rect.x0 > 0 ? rect.x1 - rect.x0 : size.h * CELL.along;
  const dz = rect.z1 - rect.z0 > 0 ? rect.z1 - rect.z0 : size.w * CELL.across;
  const own = item.kind === 'part' ? partDef(item.part.defId).bulk : { w: 1, h: 1 };
  const pos = new THREE.Vector3((rect.x0 + rect.x1) / 2, y, (rect.z0 + rect.z1) / 2);
  if (item.rot % 2 === 0) return { pos, yaw: 0, scale: new THREE.Vector3(dx / (own.h * CELL.along), 1, dz / (own.w * CELL.across)) };
  return { pos, yaw: ROT_YAW, scale: new THREE.Vector3(dz / (own.h * CELL.along), 1, dx / (own.w * CELL.across)) };
}

function blocksGuns(v: Vehicle, item: PartItem, def: PartDef): boolean {
  return !(isMounted(v.chassisId, item) && def.kind === 'engine');
}

function obstacleOf(obj: THREE.Object3D): Obstacle {
  const box = new THREE.Box3().setFromObject(obj);
  return { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, top: box.max.y };
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function lean(obj: THREE.Object3D, slope: Rest['slope']): void {
  if (slope.x === 0 && slope.z === 0) return;
  const pitch = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, Math.atan(slope.x));
  const roll = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -Math.atan(slope.z));
  obj.quaternion.premultiply(pitch.multiply(roll));
}

function place(obj: THREE.Object3D, at: Placement): void {
  obj.position.copy(at.pos);
  obj.rotation.set(0, at.yaw, 0);
  obj.scale.copy(at.scale);
}

function tint(obj: THREE.Object3D, paint: number, look: Look): void {
  const share = grayShare(look.step);
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mat = o.material;
    if (!(mat instanceof THREE.MeshLambertMaterial)) throw new Error(`Part mesh ${o.name} has material ${mat.type}, expected one Lambert material`);
    if (mat.name === PAINT) mat.color.setHex(bodyPaint(paint));
    mat.color.setHex(grayed(mat.color.getHex(), share));
    mat.color.multiplyScalar(look.tone);
    if (look.partId) o.userData.partId = look.partId;
  });
  if (look.partId && look.dents && look.step > 0) dent(obj, look.partId, look.step);
}

const WELD_MM = 1000;

function weldKey(p: THREE.Vector3): string {
  return `${Math.round(p.x * WELD_MM)},${Math.round(p.y * WELD_MM)},${Math.round(p.z * WELD_MM)}`;
}

function modelPoints(obj: THREE.Object3D, toModel: THREE.Matrix4): THREE.Vector3[] {
  const points = new Map<string, THREE.Vector3>();
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = (o.geometry as THREE.BufferGeometry).getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(toModel);
      points.set(weldKey(p), p);
    }
  });
  return [...points.values()];
}

type DentCover = { top: boolean; keepOut: PartBox[] };

function unitBox(o: THREE.Object3D, body: THREE.Object3D): PartBox {
  const box = new THREE.Box3().setFromObject(o);
  if (o.parent === body) box.applyMatrix4(body.matrixWorld.clone().invert());
  return box;
}

export function dent(obj: THREE.Object3D, partId: string, step: number, cover: DentCover = { top: false, keepOut: [] }): void {
  obj.updateMatrixWorld(true);
  const toModel = obj.matrixWorld.clone().invert();
  const points = modelPoints(obj, toModel);
  const surface = { box: new THREE.Box3().setFromPoints(points), points, tops: cover.top ? columnTops(points) : null, keepOut: cover.keepOut };
  const dents = dentsOf(partId, step, surface);
  const pinned = pinnedUnder(obj, toModel, cover.keepOut);
  const offsets = new Map<string, THREE.Vector3Like>();
  const offsetAt = (p: THREE.Vector3): THREE.Vector3Like => {
    const key = weldKey(p);
    const known = offsets.get(key);
    if (known) return known;
    const found = pinned.has(key) ? { x: 0, y: 0, z: 0 } : dentOffset(dents, surface, p);
    offsets.set(key, found);
    return found;
  };
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = o.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const toMesh = toModel.clone().multiply(o.matrixWorld).invert();
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(toModel);
      p.add(offsetAt(p)).applyMatrix4(toMesh);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
    if (geo.getAttribute('normal')) geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
  });
}

function pinnedUnder(obj: THREE.Object3D, toModel: THREE.Matrix4, keepOut: readonly PartBox[]): Set<string> {
  const pinned = new Set<string>();
  if (keepOut.length === 0) return pinned;
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    const index = o.geometry.getIndex();
    const at = (k: number) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(o.matrixWorld).applyMatrix4(toModel);
    for (let k = 0; k < (index ? index.count : pos.count); k += 3) {
      const tri = [at(k), at(k + 1), at(k + 2)];
      if (keepOut.some((b) => overlapsXZ(tri, b))) for (const p of tri) pinned.add(weldKey(p));
    }
  });
  return pinned;
}

function overlapsXZ(tri: THREE.Vector3[], box: PartBox): boolean {
  const xs = tri.map((p) => p.x);
  const zs = tri.map((p) => p.z);
  return Math.max(...xs) >= box.min.x && Math.min(...xs) <= box.max.x && Math.max(...zs) >= box.min.z && Math.min(...zs) <= box.max.z;
}

function radioColor(lit: boolean): number {
  return lit ? PAL.radioLight.on : PAL.radioLight.off;
}

function radioHalo(lit: boolean): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap(), color: PAL.radioLight.on, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  sprite.scale.setScalar(RADIO_HALO);
  sprite.raycast = () => {};
  sprite.position.set(0, RADIO_TIP, 0);
  sprite.visible = lit;
  return sprite;
}

let haloTexture: THREE.DataTexture | null = null;
function haloMap(): THREE.DataTexture {
  if (haloTexture) return haloTexture;
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const d = Math.hypot((i % size) - size / 2 + 0.5, Math.floor(i / size) - size / 2 + 0.5) / (size / 2);
    data.set([255, 255, 255, Math.round(255 * Math.max(0, 1 - d) ** 2)], i * 4);
  }
  haloTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  haloTexture.needsUpdate = true;
  return haloTexture;
}

function groundContactShadow({ unit, mesh }: ContactShadow): void {
  if (unit.wheels.length === 0) throw new Error(`Truck unit ${unit.index} has no wheels to rest its contact shadow on`);
  const hubs = unit.wheels.reduce((sum, w) => sum + w.mount.position.y, 0) / unit.wheels.length;
  mesh.position.y = hubs - unit.b.wheelRadius + CONTACT_SHADOW.lift;
}

function disposeChildren(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}

function isWheel(def: PartDef): boolean {
  return def.kind === 'core' && def.role === 'wheel';
}
