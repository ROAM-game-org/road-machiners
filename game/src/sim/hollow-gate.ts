import { HOLLOW, HOLLOW_GATE_ID, SUNWARD } from '../data/sunward';
import { PHYSICS } from '../data/physics';
import { fortressGates, fortressPieces, insideCurtain } from './fortress';
import { isDefeated } from './defeat';
import { propBoxes, type PosedBox } from './mapgen';
import { rigBoxes, type RigBox } from './rig';
import { vehicleStats } from './stats';
import { isSunwardMember, orderStands } from './sunward';
import type { NpcState, Obstacle, Vehicle, World } from './types';
import { bearing, dist, type Vec } from './vec';

const RESCUE_DEALS = new Set<NpcState['kind']>(['tow', 'towPromise', 'patch', 'aid']);
const TOUCH_SLACK = 0.02;

type GatePose = { pos: Vec; yaw: number };

let pose: GatePose | null = null;
let leaf: Obstacle | null = null;
let footprint: readonly PosedBox[] | null = null;

export function hollowGatePose(): GatePose {
  if (pose === null) {
    const gate = fortressGates(HOLLOW.site)[0];
    const [a, b] = fortressPieces(HOLLOW.site)
      .filter((p) => p.kind === 'tower')
      .sort((p, q) => dist(p.pos, gate.gate) - dist(q.pos, gate.gate));
    pose = { pos: { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 }, yaw: bearing(HOLLOW.pos, gate.gate) };
  }
  return { pos: { ...pose.pos }, yaw: pose.yaw };
}

export function hollowGateLeaf(): Obstacle {
  leaf ??= { id: HOLLOW_GATE_ID, kind: 'landmark', look: 'fortScrapShut', pos: hollowGatePose().pos, r: SUNWARD.gate.halfSpan, yaw: hollowGatePose().yaw };
  return { ...leaf, pos: { ...leaf.pos } };
}

export function isHollowGate(o: Obstacle): boolean {
  return o.id === HOLLOW_GATE_ID;
}

export function hollowGateShut(world: Pick<World, 'obstacles'>): boolean {
  return world.obstacles.some(isHollowGate);
}

function inYard(p: Vec): boolean {
  return insideCurtain(HOLLOW.site, p);
}

function rescuesInside(world: World, v: Vehicle): boolean {
  return world.states.some((s) => {
    if (!RESCUE_DEALS.has(s.kind) || (s.holder !== v.id && s.other !== v.id)) return false;
    const partner = world.vehicles.find((x) => x.id === (s.holder === v.id ? s.other : s.holder));
    return partner !== undefined && inYard(partner.pos);
  });
}

export function passesHollowGate(world: World, v: Vehicle): boolean {
  return inYard(v.pos) || (orderStands(world) && isSunwardMember(v)) || rescuesInside(world, v);
}

function crossesCurtain(v: Vehicle): boolean {
  const order = v.order;
  return order !== null && order.kind !== 'brake' && inYard(order.dest) !== inYard(v.pos);
}

function travelOf(world: World, v: Vehicle): number {
  const stats = vehicleStats(world, v);
  return Math.min(stats.maxSpeed, v.speed + stats.accel) * PHYSICS.turnSeconds;
}

function inReach(world: World, v: Vehicle, gate: Vec): boolean {
  const far = dist(v.pos, gate);
  return far <= SUNWARD.gate.nearby && far <= travelOf(world, v) + SUNWARD.gate.reach;
}

export function hollowGateWanted(world: World): boolean {
  const gate = hollowGatePose().pos;
  return world.vehicles.some((v) => !isDefeated(v) && inReach(world, v, gate) && crossesCurtain(v) && passesHollowGate(world, v));
}

function separated(a: RigBox | PosedBox, b: RigBox | PosedBox, axis: Vec): boolean {
  const reach = (box: RigBox | PosedBox): number => box.half.x * Math.abs(box.axis.x * axis.x + box.axis.y * axis.y) + box.half.y * Math.abs(-box.axis.y * axis.x + box.axis.x * axis.y);
  const between = Math.abs((b.center.x - a.center.x) * axis.x + (b.center.y - a.center.y) * axis.y);
  return between >= reach(a) + reach(b) - TOUCH_SLACK;
}

function boxesTouch(a: RigBox | PosedBox, b: RigBox | PosedBox): boolean {
  const axes = [a.axis, { x: -a.axis.y, y: a.axis.x }, b.axis, { x: -b.axis.y, y: b.axis.x }];
  return axes.every((axis) => !separated(a, b, axis));
}

export function hollowGateOccupied(world: World): boolean {
  const { pos } = hollowGatePose();
  const leafBoxes = (footprint ??= propBoxes(hollowGateLeaf()));
  return world.vehicles.some((v) => dist(v.pos, pos) < SUNWARD.gate.nearby && rigBoxes(v).some((body) => leafBoxes.some((leafBox) => boxesTouch(body, leafBox))));
}

export function swingHollowGate(world: World): void {
  if (world.sunward === null) return;
  const shut = !hollowGateWanted(world) && !hollowGateOccupied(world);
  if (shut === hollowGateShut(world)) return;
  world.obstacles = shut ? [...world.obstacles, hollowGateLeaf()] : world.obstacles.filter((o) => !isHollowGate(o));
}

export function gatePassing(world: World, driver: Vehicle | undefined): () => boolean {
  return () => driver !== undefined && passesHollowGate(world, driver);
}
