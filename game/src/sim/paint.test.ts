import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHASSIS, PAINT, type TruckPaint } from '../data/chassis';
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

const OXBLOOD: TruckPaint = { body: 'oxblood', cab: 'olive', gear: 'tan' };

describe('a paint job', () => {
  it('starts every new player at the standard paint', () => {
    expect(emptyWorld().player.paint).toEqual(PAINT.standard);
  });

  it('costs a share of the chassis the player drives', () => {
    const w = atBowl();
    expect(paintPrice(w)).toBe(Math.round(PAINT.share * CHASSIS[w.vehicles[0].chassisId].value));
    const longbed = buyChassis(w, 'longbed');
    expect(paintPrice(longbed)).toBe(Math.round(PAINT.share * CHASSIS.longbed.value));
  });

  it('charges the price and sets the paint with no turn, event or XP', () => {
    const w = atBowl();
    const done = repaint(w, OXBLOOD);
    expect(done.player.paint).toEqual(OXBLOOD);
    expect(done.player.money).toBe(w.player.money - paintPrice(w));
    expect(done.turn).toBe(w.turn);
    expect(done.events).toEqual(w.events);
    expect(done.player.xp).toBe(w.player.xp);
    expect(done.player.xpBySource).toEqual(w.player.xpBySource);
    expect(w.player.paint).toEqual(PAINT.standard);
  });

  it.each(['body', 'cab', 'gear'] as const)('sets the %s alone and keeps the other two slots', (slot) => {
    const w = atBowl();
    const done = repaint(w, { ...PAINT.standard, [slot]: 'slate' });
    expect(done.player.paint).toEqual({ ...PAINT.standard, [slot]: 'slate' });
    expect(done.player.money).toBe(w.player.money - paintPrice(w));
  });

  it('keeps its own copy of the paint it was given', () => {
    const asked = { ...OXBLOOD };
    const done = repaint(atBowl(), asked);
    asked.body = 'chalk';
    expect(done.player.paint.body).toBe('oxblood');
  });

  it('refuses a player who cannot pay and changes nothing', () => {
    const w = atBowl();
    w.player.money = paintPrice(w) - 1;
    expect(() => repaint(w, OXBLOOD)).toThrow(Refused);
    expect(w.player.paint).toEqual(PAINT.standard);
    w.player.money = paintPrice(w);
    expect(repaint(w, OXBLOOD).player.money).toBe(0);
  });

  it('throws away from a town, on an unknown color and on the current paint', () => {
    expect(() => repaint({ ...emptyWorld(), player: { ...emptyWorld().player, money: 1_000_000 } }, OXBLOOD)).toThrow(/town/);
    expect(() => repaint(atBowl(), { ...OXBLOOD, cab: 'gold' } as unknown as TruckPaint)).toThrow(/gold/);
    expect(() => repaint(atBowl(), { ...PAINT.standard })).toThrow(/already/);
  });

  it('is not sold at a Chaos Highway outpost', () => {
    const w = parkedAtOutpost();
    w.player.money = 1_000_000;
    expect(() => repaint(w, OXBLOOD)).toThrow(/town/);
  });

  it('stays through a chassis swap', () => {
    const painted = repaint(atBowl(), OXBLOOD);
    expect(buyChassis(painted, 'longbed').player.paint).toEqual(OXBLOOD);
  });

  it('is read by no sim rule but the repaint and the rescue', () => {
    const readers = readdirSync('src/sim', { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => /player\.paint\b/.test(readFileSync(`src/sim/${f}`, 'utf8')));
    expect(readers.sort()).toEqual(['economy.ts', 'progression/sim-mode.ts', 'world.ts']);
  });
});
