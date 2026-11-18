import { describe, expect, it } from 'vitest';
import { PLAYER_CHASSIS } from '../data/chassis';
import { gunSpans } from './armor';
import { CheatError, kitChoices, randomKit } from './cheats';
import { playerVehicle } from './damage';
import { mountedItems } from './grid';
import { generateNpcLoadout } from './npc-loadout';
import { emptyWorld } from './testkit';

describe('randomkit', () => {
  it('gives the player a player chassis with at least one gun, and every gun can fire', () => {
    const chassis = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const w = emptyWorld();
      w.rngState = seed * 7919;
      const before = playerVehicle(w);
      const next = randomKit(w, null);
      const me = playerVehicle(next);
      chassis.add(me.chassisId);
      expect(me.id).toBe(before.id);
      expect(PLAYER_CHASSIS).toContain(me.chassisId);
      const guns = mountedItems(me, 'weapon');
      expect(guns.length).toBeGreaterThan(0);
      for (const item of guns) expect(gunSpans(me, item).length).toBeGreaterThan(0);
    }
    expect(chassis.size).toBeGreaterThan(2);
  });

  it('every template and player chassis pair rolls a loadout', () => {
    for (const { tpl, chassisId } of kitChoices()) {
      expect(generateNpcLoadout(emptyWorld(), tpl, chassisId).chassisId).toBe(chassisId);
    }
  });

  it('refuses while the player is knocked out', () => {
    const w = emptyWorld();
    w.player.state = 'knockedOut';
    expect(() => randomKit(w, null)).toThrow(CheatError);
  });

  it('a higher gear level rolls more guns on average', () => {
    const guns = (level: number) => {
      let sum = 0;
      for (let seed = 1; seed <= 36; seed++) {
        const w = emptyWorld();
        w.rngState = seed * 104729;
        sum += mountedItems(playerVehicle(randomKit(w, level)), 'weapon').length;
      }
      return sum;
    };
    expect(guns(5)).toBeGreaterThan(guns(1));
  });

  it('rejects a gear level outside 1 to 5', () => {
    for (const level of [0, 6, 2.5]) expect(() => randomKit(emptyWorld(), level)).toThrow(CheatError);
  });
});
