import { describe, expect, it } from 'vitest';
import { standardWorld } from '../test/world-cache';
import { advanceFar } from './far';
import { goodsCount } from './grid';
import { watchStock } from './market';
import type { World } from './types';
import { endTurn } from './world';

function stocks(w: World): Record<string, Record<string, number>> {
  return Object.fromEntries(Object.entries(w.shops).map(([id, s]) => [id, { ...s.goods }]));
}

describe('the stock ledger', () => {
  it('explains every stock change of a played world by a named cause, and never goes below zero', () => {
    let w = standardWorld(5);
    const start = stocks(w);
    const moved: Record<string, Record<string, number>> = {};
    watchStock((shop, good, delta) => {
      moved[shop] ??= {};
      moved[shop][good] = (moved[shop][good] ?? 0) + delta;
    });
    try {
      for (let i = 0; i < 60; i++) {
        w = endTurn(w, (x) => { for (const v of x.vehicles) advanceFar(x, v); });
        for (const s of Object.values(w.shops)) for (const n of Object.values(s.goods)) expect(Number.isInteger(n) && n >= 0).toBe(true);
      }
    } finally {
      watchStock(null);
    }
    for (const [shop, goods] of Object.entries(stocks(w))) {
      for (const [good, n] of Object.entries(goods)) expect(n, `${shop} ${good}`).toBe(start[shop][good] + (moved[shop]?.[good] ?? 0));
    }
  });

  it('spawns traders and convoys with no goods but their repair parts', () => {
    const w = standardWorld(5);
    const haulers = w.vehicles.filter((v) => v.brain?.templateId === 'trader' || v.brain?.templateId === 'convoy');
    expect(haulers.length).toBeGreaterThan(0);
    for (const v of haulers) expect(Object.keys(goodsCount(v)).filter((good) => good !== 'parts')).toEqual([]);
  });
});
