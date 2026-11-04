import { describe, expect, it } from 'vitest';
import { emptyWorld } from '../sim/testkit';
import { stopsTravel } from './travel-stops';

describe('travel stops', () => {
  it.each(['engineHot', 'overdriveCutOut'] as const)('stops automatic travel on %s', (id) => {
    expect(stopsTravel({ t: 'info', note: { id } }, emptyWorld())).toBe(true);
  });
});
