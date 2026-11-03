import { expect, it } from 'vitest';
import { campWarmSteps } from './camp-warm';
import { chaosHighwayStart } from './testkit';
import { standardWorld } from '../test/world-cache';
import { turfClaimants } from './hunting-spots';

it('does not prepare roaming camp posts on the highway map', () => {
  const steps = campWarmSteps(chaosHighwayStart(1));
  for (const step of steps) step();
  expect(steps).toEqual([]);
});

it('prepares hunting grounds and both post lists for every roaming camp', () => {
  const steps = campWarmSteps(standardWorld(1));
  expect(steps).toHaveLength(1 + turfClaimants().length * 2);
  for (const step of steps) step();
});
