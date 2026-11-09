import { describe, expect, it } from 'vitest';
import { emptyWorld } from '../sim/testkit';
import { landingScreen } from './landing-screen';

describe('the screen a turn lands on', () => {
  it('opens the look screen for the look-over the player finished', () => {
    const w = emptyWorld();
    w.events = [{ t: 'lookedOver', by: w.player.vehicleId, target: 'v9' }];
    expect(landingScreen(w)).toEqual({ kind: 'look', id: 'v9' });
  });

  it('opens nothing when a driver looked the player over', () => {
    const w = emptyWorld();
    w.events = [{ t: 'lookedOver', by: 'v9', target: w.player.vehicleId }];
    expect(landingScreen(w)).toBeNull();
  });

  it('prefers the search, which moves loot', () => {
    const w = emptyWorld();
    w.events = [
      { t: 'lookedOver', by: w.player.vehicleId, target: 'v9' },
      { t: 'searched', stock: 'wreck1' } as never,
    ];
    expect(landingScreen(w)).toEqual({ kind: 'loot', id: 'wreck1' });
  });
});
