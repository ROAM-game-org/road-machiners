import { chassisDef } from '../data/chassis';
import { FORTRESS } from '../data/fortress';
import { FURY_ROAD } from '../data/modes';
import { RULES } from '../data/rules';
import { playerTrucks } from './damage';
import { outpostFort, outpostGateSpots, outpostId, outpostSite, outpostYardHalf, type GateSide, type GateSpot } from './highway';
import type { FuryRoadRun, Vehicle, World } from './types';
import type { Vec } from './vec';

export type GateState = { id: string; milestone: number; side: GateSide; spot: GateSpot; closed: boolean; movable: boolean };
export type YardSpots = { hauler: Vec; truck: Vec };

const SPOTS = FURY_ROAD.outpost.spots;
const GATES = FURY_ROAD.outpost;

function runOf(world: World): FuryRoadRun {
  if (!world.furyRoad) throw new Error('No Fury Road run in this world');
  return world.furyRoad;
}

export function betweenLevels(world: World): boolean {
  const run = world.furyRoad;
  if (run === null) return false;
  const next = run.outposts.find((o) => o.milestone === run.window + 1);
  if (!next) throw new Error(`The run holds no outpost ${run.window + 1} in window ${run.window}`);
  return next.paid;
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
  const f = yardFrame(world, j, truck.pos);
  const r = chassisDef(truck.chassisId).radius;
  return Math.abs(f.across) <= innerHalf() - r && Math.abs(f.along) <= outpostYardHalf() - GATES.leafInset - GATES.gateMargin - r;
}

export function yardSpots(world: World, j: number): YardSpots {
  const run = runOf(world);
  const center = outpostFort(world.seed, run.window, j).pos;
  const { heading } = outpostSite(world.seed, j);
  const across = { x: -Math.sin(heading), y: Math.cos(heading) };
  const at = (offset: number): Vec => ({ x: center.x + across.x * offset, y: center.y + across.y * offset });
  return { hauler: at(SPOTS.hauler), truck: at(SPOTS.truck) };
}

export function gatesShut(world: World): boolean {
  const run = world.furyRoad;
  if (run === null || !betweenLevels(world)) return false;
  return playerTrucks(world).every((truck) => truck.speed <= RULES.parkedSpeed && wholeInYard(world, truck, run.window + 1));
}

export function outpostGates(world: World): GateState[] {
  const run = runOf(world);
  const shut = gatesShut(world);
  const gate = (j: number, side: GateSide, closed: boolean, movable: boolean): GateState => ({
    id: `${outpostId(j)}-${side}`,
    milestone: j,
    side,
    spot: outpostGateSpots(world.seed, run.window, j)[side],
    closed,
    movable,
  });
  const last = run.window >= 1 ? [gate(run.window, 'south', true, false), gate(run.window, 'north', false, true)] : [];
  const next = run.window + 1;
  return [...last, gate(next, 'south', shut, true), gate(next, 'north', true, false)];
}
