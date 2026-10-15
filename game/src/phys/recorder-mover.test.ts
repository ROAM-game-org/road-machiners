import { describe, expect, it } from 'vitest';
import { recordTurns, stepsFrom } from '../sim/progression/record';
import { playerVehicle } from '../sim/damage';
import { yardSpots } from '../sim/outpost-gates';
import { furyRoadWorld, parkInYard } from '../sim/testkit';
import { dist } from '../sim/vec';
import { endTurn } from '../sim/world';
import { physicsMover } from './recorder-mover';

describe('the physics mover of the progression recorder', () => {
  it('moves the escort by physics, not by the cheap far rules', async () => {
    const mover = await physicsMover();
    const steps = [...recordTurns(1, 'escort', 25, {}, mover)];
    const cheap = [...recordTurns(1, 'escort', 25)];
    const last = steps.at(-1)!.world;

    expect(steps).toHaveLength(25);
    expect(dist(playerVehicle(last).pos, playerVehicle(steps[0].world).pos)).toBeGreaterThan(20);
    expect(playerVehicle(last).pos).not.toEqual(playerVehicle(cheap.at(-1)!.world).pos);
  }, 120_000);

  it('rebuilds the physics world when the road window moves under the truck', async () => {
    const w = furyRoadWorld();
    parkInYard(w, 1);
    const start = endTurn(w, () => {});
    const mover = await physicsMover();

    const steps = [...stepsFrom(start, 'window', 'escort', 6, {}, mover)];
    const last = steps.at(-1)!.world;

    expect(last.furyRoad?.window).toBe(1);
    expect(dist(playerVehicle(last).pos, yardSpots(last, 2).truck)).toBeLessThan(dist(playerVehicle(steps[0].world).pos, yardSpots(last, 2).truck));
  }, 120_000);
});
