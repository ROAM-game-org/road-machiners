import { chassisDef, HAULER_CHASSIS } from '../data/chassis';
import { isRig } from './body';
import { boxCorners, frontAhead, rigBoxes } from './rig';
import { FORTRESS } from '../data/fortress';
import { CHAOS_HIGHWAY } from '../data/modes';
import { RULES } from '../data/rules';
import { playerTrucks } from './damage';
import { outpostFort, outpostGateSpots, outpostId, outpostSite, outpostYardHalf, type GateSide, type GateSpot } from './highway';
import type { ChaosHighwayRun, Vehicle, World } from './types';
import type { Vec } from './vec';

export type GateState = { id: string; milestone: number; side: GateSide; spot: GateSpot; closed: boolean; movable: boolean };
export type YardSpots = { hauler: Vec; truck: Vec };

const SPOTS = CHAOS_HIGHWAY.outpost.spots;
const GATES = CHAOS_HIGHWAY.outpost;

function runOf(world: World): ChaosHighwayRun {
  if (!world.chaosHighway) throw new Error('No Chaos Highway run in this world');
  return world.chaosHighway;
}

export function betweenLevels(world: World): boolean {
  return world.chaosHighway !== null && world.chaosHighway.waitingAt !== null;
}

type YardFrame = { along: number; across: number };

function yardFrame(world: World, j: number, pos: Vec): YardFrame {
  const run = runOf(world);
  const center = outpostFort(world.seed, run.window, j).pos;
  const { heading } = outpostSite(world.seed, j);
  const dx = pos.x - center.x;
  const dy = pos.y - center.y;
  const ahead = { x: Math.cos(heading), y: Math.sin(heading) };
  return { along: dx * ahead.x + dy * ahead.y, across: dx * -ahead.y + dy * ahead.x };
}

function innerHalf(): number {
  return outpostYardHalf() - FORTRESS.wallDepth / 2;
}

export function inYard(world: World, pos: Vec, j: number): boolean {
  const f = yardFrame(world, j, pos);
  return Math.abs(f.along) <= innerHalf() && Math.abs(f.across) <= innerHalf();
}

export function wholeInYard(world: World, truck: Vehicle, j: number): boolean {
  if (isRig(truck.chassisId)) return rigBoxes(truck).flatMap(boxCorners).every((corner) => cornerInYard(yardFrame(world, j, corner)));
  const f = yardFrame(world, j, truck.pos);
  const r = chassisDef(truck.chassisId).radius;
  return Math.abs(f.across) <= innerHalf() - r && Math.abs(f.along) <= outpostYardHalf() - GATES.leafInset - GATES.gateMargin - r;
}

function cornerInYard(f: YardFrame): boolean {
  return Math.abs(f.across) <= innerHalf() && Math.abs(f.along) <= outpostYardHalf() - GATES.leafInset - GATES.gateMargin;
}

export function yardSpots(world: World, j: number): YardSpots {
  return yardSpotsAt(world.seed, runOf(world).window, j);
}

export function yardSpotsAt(seed: number, window: number, j: number): YardSpots {
  const center = outpostFort(seed, window, j).pos;
  const { heading } = outpostSite(seed, j);
  const across = { x: -Math.sin(heading), y: Math.cos(heading) };
  const ahead = { x: Math.cos(heading), y: Math.sin(heading) };
  const at = (offset: number, along: number): Vec => ({ x: center.x + across.x * offset + ahead.x * along, y: center.y + across.y * offset + ahead.y * along });
  return { hauler: at(SPOTS.hauler, frontAhead(HAULER_CHASSIS)), truck: at(SPOTS.truck, 0) };
}

export function gatesShut(world: World): boolean {
  const run = world.chaosHighway;
  if (run === null || run.waitingAt === null) return false;
  const post = run.waitingAt;
  return playerTrucks(world).every((truck) => truck.speed <= RULES.parkedSpeed && wholeInYard(world, truck, post));
}

export function outpostGates(world: World): GateState[] {
  const run = runOf(world);
  const shut = gatesShut(world);
  const shutHere = shut && run.waitingAt === run.window;
  const shutNext = shut && run.waitingAt === run.window + 1;
  const gate = (j: number, side: GateSide, closed: boolean, movable: boolean): GateState => ({
    id: `${outpostId(j)}-${side}`,
    milestone: j,
    side,
    spot: outpostGateSpots(world.seed, run.window, j)[side],
    closed,
    movable,
  });
  const last = [gate(run.window, 'south', true, false), gate(run.window, 'north', shutHere, true)];
  const next = run.window + 1;
  return [...last, gate(next, 'south', shutNext, true), gate(next, 'north', true, false)];
}
