import { NPC_BEHAVIOR } from '../../data/npcs';
import { RULES } from '../../data/rules';
import type { Vehicle, World } from '../types';
import { dist, type Vec } from '../vec';

export type Flight = { point: Vec; seen: number };

const FLIGHTS = new Map<string, Flight>();

function keyOf(world: World, me: Vehicle): string {
  return `${world.seed}:${me.id}`;
}

export function forgetFlights(): void {
  FLIGHTS.clear();
}

export function liveFlights(): [string, Flight][] {
  return [...FLIGHTS].map(([key, flight]) => [key, { point: { ...flight.point }, seen: flight.seen }]);
}

export function restoreFlights(flights: readonly [string, Flight][]): void {
  FLIGHTS.clear();
  for (const [key, flight] of flights) FLIGHTS.set(key, { point: { ...flight.point }, seen: flight.seen });
}

export function startFlight(world: World, me: Vehicle, point: Vec): void {
  FLIGHTS.set(keyOf(world, me), { point, seen: world.turn });
}

export function sawThreat(world: World, me: Vehicle): void {
  const flight = FLIGHTS.get(keyOf(world, me));
  if (flight) flight.seen = world.turn;
}

function liveFlight(world: World, me: Vehicle): Flight | null {
  const key = keyOf(world, me);
  const flight = FLIGHTS.get(key);
  if (!flight) return null;
  if (flight.seen <= world.turn && world.turn - flight.seen <= NPC_BEHAVIOR.fleeCalmTurns) return flight;
  FLIGHTS.delete(key);
  return null;
}

function drivesTo(me: Vehicle, point: Vec): boolean {
  const order = me.order;
  return order !== null && order.kind !== 'brake' && order.dest.x === point.x && order.dest.y === point.y;
}

export function heldFlight(world: World, me: Vehicle): Flight | null {
  const flight = liveFlight(world, me);
  return flight && drivesTo(me, flight.point) ? flight : null;
}

export function reachedFlight(world: World, me: Vehicle): boolean {
  const flight = heldFlight(world, me);
  return flight !== null && dist(me.pos, flight.point) <= RULES.arriveRadius * 2;
}
