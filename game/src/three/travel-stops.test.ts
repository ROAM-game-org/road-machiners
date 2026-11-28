import { describe, expect, it } from 'vitest';
import { emptyWorld } from '../sim/testkit';
import { stopsTravel } from './travel-stops';

describe('travel stops', () => {
  it.each(['engineHot', 'overdriveCutOut'] as const)('stops automatic travel on %s', (id) => {
    expect(stopsTravel({ t: 'info', note: { id } }, emptyWorld())).toBe(true);
  });

  it('stops automatic travel when following ends', () => {
    expect(stopsTravel({ t: 'followEnded', vehicle: 'v1', why: 'lost' }, emptyWorld())).toBe(true);
  });
});
