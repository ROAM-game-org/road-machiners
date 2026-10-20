import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHASSIS, PAINT } from '../data/chassis';
import { REGION } from '../data/region';
import { buyChassis, paintPrice, repaint } from './economy';
import { sitePads } from './sites';
import { emptyWorld, parkedAtOutpost } from './testkit';
import type { World } from './types';
import { Refused } from './world';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const atBowl = (): World => {
  const w = emptyWorld(sitePads(bowl)[0]);
  w.player.money = 1_000_000;
  return w;
};

describe('a paint job', () => {
  it('starts every new player at the standard paint', () => {
    expect(emptyWorld().player.paint).toBe(PAINT.standard);
  });

  it('costs a share of the chassis the player drives', () => {
    const w = atBowl();
    expect(paintPrice(w)).toBe(Math.round(PAINT.share * CHASSIS[w.vehicles[0].chassisId].value));
    const longbed = buyChassis(w, 'longbed');
    expect(paintPrice(longbed)).toBe(Math.round(PAINT.share * CHASSIS.longbed.value));
  });

  it('charges the price and sets the paint with no turn, event or XP', () => {
    const w = atBowl();
    const done = repaint(w, 'plum');
    expect(done.player.paint).toBe('plum');
    expect(done.player.money).toBe(w.player.money - paintPrice(w));
    expect(done.turn).toBe(w.turn);
    expect(done.events).toEqual(w.events);
    expect(done.player.xp).toBe(w.player.xp);
    expect(done.player.xpBySource).toEqual(w.player.xpBySource);
    expect(w.player.paint).toBe(PAINT.standard);
  });

  it('refuses a player who cannot pay and changes nothing', () => {
    const w = atBowl();
    w.player.money = paintPrice(w) - 1;
    expect(() => repaint(w, 'mint')).toThrow(Refused);
    expect(w.player.paint).toBe(PAINT.standard);
    w.player.money = paintPrice(w);
    expect(repaint(w, 'mint').player.money).toBe(0);
  });

  it('throws away from a town, on an unknown paint and on the current paint', () => {
    expect(() => repaint({ ...emptyWorld(), player: { ...emptyWorld().player, money: 1_000_000 } }, 'plum')).toThrow(/town/);
    expect(() => repaint(atBowl(), 'gold')).toThrow(/gold/);
    expect(() => repaint(atBowl(), PAINT.standard)).toThrow(/already/);
  });

  it('is not sold at a Chaos Highway outpost', () => {
    const w = parkedAtOutpost();
    w.player.money = 1_000_000;
    expect(() => repaint(w, 'plum')).toThrow(/town/);
  });

  it('stays through a chassis swap', () => {
    const painted = repaint(atBowl(), 'rose');
    expect(buyChassis(painted, 'longbed').player.paint).toBe('rose');
  });

  it('is read by no sim rule but the repaint and the rescue', () => {
    const readers = readdirSync('src/sim', { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => /player\.paint\b/.test(readFileSync(`src/sim/${f}`, 'utf8')));
    expect(readers.sort()).toEqual(['economy.ts', 'world.ts']);
  });
});
