import { describe, expect, it } from 'vitest';
import { recordTurns, stepsFrom } from '../sim/progression/record';
import { playerVehicle } from '../sim/damage';
import { outpostPad } from '../sim/fury-road';
import { furyRoadWorld } from '../sim/testkit';
import { dist } from '../sim/vec';
import { endTurn } from '../sim/world';
import { physicsMover } from './recorder-mover';

describe('the physics mover of the progression recorder', () => {
  it('moves the runner by physics, not by the cheap far rules', async () => {
    const mover = await physicsMover();
    const steps = [...recordTurns(1, 'runner', 25, {}, mover)];
    const cheap = [...recordTurns(1, 'runner', 25)];
    const last = steps.at(-1)!.world;

    expect(steps).toHaveLength(25);
    expect(dist(playerVehicle(last).pos, playerVehicle(steps[0].world).pos)).toBeGreaterThan(20);
    expect(playerVehicle(last).pos).not.toEqual(playerVehicle(cheap.at(-1)!.world).pos);
  }, 120_000);

  it('rebuilds the physics world when the road window moves under the truck', async () => {
    const w = furyRoadWorld();
    playerVehicle(w).pos = outpostPad(w, 1);
    playerVehicle(w).speed = 0;
    const start = endTurn(w, () => {});
    const mover = await physicsMover();

    const steps = [...stepsFrom(start, 'window', 'runner', 6, {}, mover)];
    const last = steps.at(-1)!.world;

    expect(last.furyRoad?.window).toBe(1);
    expect(dist(playerVehicle(last).pos, outpostPad(last, 2))).toBeLessThan(dist(playerVehicle(steps[0].world).pos, outpostPad(last, 2)));
  }, 120_000);
});
