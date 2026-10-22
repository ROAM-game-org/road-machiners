import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../phys/drive';
import { parseLineup, parseRoad, parseTruck, runFight, type Fight } from './combat-harness';
import { FIGHT } from './combat-fight';

beforeAll(async () => {
  await initPhysics();
});

describe('truck specs', () => {
  it('reads a driver and each kind of gear', () => {
    expect(parseTruck('merc').gear).toEqual({ kind: 'npc', template: 'merc', level: null });
    expect(parseTruck('stand').gear).toEqual({ kind: 'kit', id: 'standard' });
    expect(parseTruck('merc:snowball').gear).toEqual({ kind: 'kit', id: 'snowball' });
    expect(parseTruck('merc:buggy@heavy').gear).toEqual({ kind: 'npc', template: 'buggy', level: 'heavy' });
    expect(parseTruck('kite:mg/plates+ram').gear).toEqual({ kind: 'outfit', outfit: { gun: 'mg', armor: 'plates', ram: 'ram' } });
    expect(parseTruck('merc:mg/bare').gear).toEqual({ kind: 'outfit', outfit: { gun: 'mg', armor: null } });
  });

  it('reads a ram after an outfit as part of that truck, and any other + as a new truck', () => {
    expect(parseLineup('kite:mg/plates+ram').map((t) => t.gear)).toEqual([{ kind: 'outfit', outfit: { gun: 'mg', armor: 'plates', ram: 'ram' } }]);
    expect(parseLineup('kite:mg/plates+ram+buggy').map((t) => t.driver)).toEqual(['kite', 'buggy']);
    expect(parseLineup('buggy+buggy').map((t) => t.driver)).toEqual(['buggy', 'buggy']);
  });

  it('refuses an unknown driver, gear or level', () => {
    expect(() => parseTruck('nobody')).toThrow('Unknown driver');
    expect(() => parseTruck('merc:nothing')).toThrow('Unknown gear');
    expect(() => parseTruck('merc:buggy@rich')).toThrow('Unknown gear level');
  });

  it('refuses a scripted driver on side b or beside another truck', () => {
    expect(() => runFight({ ...FIGHT, b: parseLineup('stand') })).toThrow('alone on side a');
    expect(() => runFight({ ...FIGHT, a: parseLineup('stand+merc') })).toThrow('alone on side a');
  });
});

describe('side b hp left', () => {
  it('reports a share between 0 and 1 for a won fight', () => {
    const r = runFight({ ...FIGHT, a: parseLineup('charge:autocannon/plates'), b: parseLineup('buggy:mg/bare'), seed: 1, maxTurns: 60 });
    expect(r.outcome).toBe('won');
    expect(r.bHpLeft).toBeGreaterThan(0);
    expect(r.bHpLeft).toBeLessThan(1);
  }, 90_000);

  it('is null for a fight that is not won', () => {
    expect(runFight({ ...FIGHT, maxTurns: 1 }).bHpLeft).toBeNull();
  });
});

describe('combat harness on the Fury Road highway', () => {
  const ROAD_FIGHT: Fight = { a: parseLineup('orbit:furyRoad'), b: parseLineup('buggy'), seed: 2, gap: 8, orbit: 6, maxTurns: 3, arena: null, road: 1 };

  it('reads the map flag', () => {
    expect([parseRoad(null), parseRoad('fury-road'), parseRoad('fury-road:7')]).toEqual([null, 1, 7]);
    expect(() => parseRoad('icarus')).toThrow(/fury-road/);
  });

  it('fights on the highway and reports how far across the road the trucks went', () => {
    const r = runFight(ROAD_FIGHT);

    expect(r.a.rounds + r.b.rounds).toBeGreaterThan(0);
    expect(r.spread).not.toBeNull();
    expect(r.spread!).toBeGreaterThanOrEqual(0);
    expect(runFight(FIGHT).spread).toBeNull();
  });
});
