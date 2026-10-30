import { beforeAll, describe, expect, it } from 'vitest';
import { PARTS } from '../data/parts';
import { RULES } from '../data/rules';
import { mountedParts } from '../sim/grid';
import { initPhysics } from '../phys/drive';
import { forceOption } from '../sim/testkit';
import { parseGroupFlags, parseLineup, runFight, setNumber, type Fight, type FightReport } from './combat-harness';
import { FIGHT } from './combat-fight';

beforeAll(async () => {
  await initPhysics();
});


const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function firstFight(seeds: number[], make: (seed: number) => Fight, reaches: (r: FightReport) => boolean, what: string, skipErrorStart?: string): FightReport {
  for (const seed of seeds) {
    let r: FightReport;
    try {
      r = runFight(make(seed));
    } catch (e) {
      if (skipErrorStart && e instanceof Error && e.message.startsWith(skipErrorStart)) continue;
      throw e;
    }
    if (reaches(r)) return r;
  }
  throw new Error(`No seed of ${seeds.join(', ')} reached ${what}`);
}

describe('combat harness', () => {
  let base: ReturnType<typeof runFight>;
  beforeAll(() => {
    base = runFight(FIGHT);
  });

  it('gives the same report for the same fight, also after another seed ran', () => {
    runFight({ ...FIGHT, seed: 4 });
    expect(runFight(FIGHT)).toEqual(base);
  });

  it('refuses a seed that is not a whole number', () => {
    expect(() => runFight({ ...FIGHT, seed: 1.5 })).toThrow('Seed must be an integer');
  });

  it('counts the rounds both sides fire', () => {
    const r = firstFight(SEEDS, (seed) => ({ ...FIGHT, seed }), (x) => x.a.rounds > 0 && x.b.rounds > 0, 'a fight where both sides fire');
    expect(r.a.rounds).toBeGreaterThan(0);
    expect(r.b.rounds).toBeGreaterThan(0);
    expect(r.a.hits).toBeLessThanOrEqual(r.a.rounds);
    expect(r.b.hits).toBeLessThanOrEqual(r.b.rounds);
  });

  it('a standing player never moves', () => {
    expect(base.a.speed).toBe(0);
  });

  it('has two brains of one faction fight each other', () => {
    const r = runFight({ ...FIGHT, a: parseLineup('buggy:buggy@standard'), b: parseLineup('buggy:buggy@standard'), seed: 1, maxTurns: 12 });
    expect(r.a.rounds).toBeGreaterThan(0);
    expect(r.b.rounds).toBeGreaterThan(0);
    expect(r.a.speed).toBeGreaterThan(0);
  });

  it('names the courier side when it flees a stronger truck', () => {
    forceOption('truceOffered', 'refuse');
    forceOption('mercyBegged', 'finish');
    const r = runFight({ ...FIGHT, a: parseLineup('merc:snowball'), b: parseLineup('courier:courier@poor'), seed: 2, maxTurns: 40 });
    expect(r.outcome).toBe('b fled');
  });

  it('fights to a knockout inside the arena rather than stopping at a truce', () => {
    const fight = { ...FIGHT, a: parseLineup('merc:snowball'), b: parseLineup('buggy:standard'), seed: 1, maxTurns: 140, arena: 9 };
    expect(runFight(fight).outcome).toBe('won');
  });

  it('keeps every truck inside the arena ring', () => {
    const arena = 9;
    let farthest = 0;
    runFight({ ...FIGHT, a: parseLineup('merc:snowball'), b: parseLineup('buggy'), seed: 1, maxTurns: 30, arena }, (w) => {
      const center = w.obstacles.reduce((s, o) => ({ x: s.x + o.pos.x / w.obstacles.length, y: s.y + o.pos.y / w.obstacles.length }), { x: 0, y: 0 });
      for (const v of w.vehicles.filter((x) => x.id !== w.player.vehicleId)) farthest = Math.max(farthest, Math.hypot(v.pos.x - center.x, v.pos.y - center.y));
    });
    expect(farthest).toBeLessThan(arena);
  });

  it('sets an existing balance number', () => {
    const old = RULES.leadError;
    setNumber(`RULES.leadError=${old + 1}`);
    expect(RULES.leadError).toBe(old + 1);
    setNumber(`RULES.leadError=${old}`);
  });

  it('builds the next fight from a changed balance number', () => {
    const gunHp = () => {
      let hp = 0;
      runFight({ ...FIGHT, maxTurns: 1 }, (w) => { hp = mountedParts(w.vehicles[0], 'weapon')[0].hp; });
      return hp;
    };
    const old = (PARTS.mg as { hp: number }).hp;
    expect(gunHp()).toBeLessThanOrEqual(old);
    setNumber(`PARTS.mg.hp=${old * 100}`);
    try {
      expect(gunHp()).toBeGreaterThan(old);
    } finally {
      setNumber(`PARTS.mg.hp=${old}`);
    }
  });

  it('refuses a path that names no number', () => {
    expect(() => setNumber('RULES.noSuchRule=1')).toThrow('not a number');
    expect(() => setNumber('NOPE.x=1')).toThrow('Unknown table');
    expect(() => setNumber('RULES.leadError=abc')).toThrow('path=number');
  });
});

describe('group fights in the harness', () => {
  it('reads the group flags and refuses bad ones', () => {
    expect(parseGroupFlags({ crew: 'b', guard: true, late: 'b:12', bystander: 'trader' })).toEqual({ crew: 'b', guard: true, late: 12, bystander: 'trader' });
    expect(parseGroupFlags({ crew: null, guard: false, late: null, bystander: null })).toEqual({ crew: null, guard: false, late: null, bystander: null });
    expect(() => parseGroupFlags({ crew: 'c', guard: false, late: null, bystander: null })).toThrow('--crew');
    expect(() => parseGroupFlags({ crew: null, guard: false, late: 'a:3', bystander: null })).toThrow('--late');
    expect(() => parseGroupFlags({ crew: null, guard: false, late: null, bystander: 'ghost' })).toThrow('bystander');
  });

  it('reports every truck of a crew lineup on its side', () => {
    const r = runFight({ ...FIGHT, a: parseLineup('merc:snowball'), b: parseLineup('buggy+buggy+buggy'), crew: 'b', seed: 1, maxTurns: 6 });
    expect(r.tally.a.left + r.tally.a.out + r.tally.a.fled).toBe(1);
    expect(r.tally.b.left + r.tally.b.out + r.tally.b.fled).toBe(3);
    expect(r.b.rounds).toBeGreaterThan(0);
  }, 300_000);

  it('brings a late truck into its side', () => {
    const r = runFight({ ...FIGHT, a: parseLineup('merc:snowball'), b: parseLineup('buggy+buggy'), late: 3, seed: 1, maxTurns: 8 });
    expect(r.turns).toBeGreaterThan(3);
    expect(r.tally.b.left + r.tally.b.out + r.tally.b.fled).toBe(2);
  }, 300_000);

  it('lets a hired merc ride beside a scripted player and keeps a bystander out of the count', () => {
    const r = firstFight(SEEDS, (seed) => ({ ...FIGHT, a: parseLineup('stand+merc'), b: parseLineup('buggy'), guard: true, bystander: 'trader', seed, maxTurns: 6 }), () => true, 'a fight the scripted player survives', 'Player is');
    expect(r.tally.a.left + r.tally.a.out + r.tally.a.fled).toBe(2);
    expect(r.bystander).not.toBeNull();
  }, 300_000);
});
