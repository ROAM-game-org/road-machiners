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
    const r = runFight({ ...FIGHT, a: parseLineup('buggy:buggy@standard@buggy#1'), b: parseLineup('buggy:buggy@standard@buggy#1'), seed: 1, maxTurns: 12 });
    expect(r.a.rounds).toBeGreaterThan(0);
    expect(r.b.rounds).toBeGreaterThan(0);
    expect(r.a.speed).toBeGreaterThan(0);
  });

  it('names the courier side when it flees a stronger truck', () => {
    forceOption('truceOffered', 'refuse');
    forceOption('mercyBegged', 'finish');
    const r = firstFight(SEEDS, (seed) => ({ ...FIGHT, a: parseLineup('merc:snowball'), b: parseLineup('courier:courier@poor@courier#2'), seed, maxTurns: 40 }), (f) => f.outcome === 'b fled' || f.outcome === 'a fled', 'a flight');
    expect(r.outcome).toBe('b fled');
  });

  it('fights to a knockout inside the arena rather than stopping at a truce', () => {
    const r = firstFight(SEEDS, (seed) => ({ ...FIGHT, a: parseLineup('merc:snowball'), b: parseLineup('buggy:standard'), seed, maxTurns: 140, arena: 9 }), (x) => x.outcome === 'won', 'a knockout');
    expect(r.outcome).toBe('won');
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

it('counts destroyed truck damage from the recorded impacts', async () => {
  const { turnPartHits } = await import('../sim/combat');
  const totals = new Map<string, number>();
  let destroyed: string | null = null;
  const deathChance = RULES.npcDeathChance;
  setNumber('RULES.npcDeathChance=1');
  try {
    const report = runFight({ ...FIGHT, a: parseLineup('merc:snowball'), b: parseLineup('buggy:standard'), seed: 1, maxTurns: 140, arena: 9 }, w => {
      for (const [id, hits] of turnPartHits(w)) totals.set(id, (totals.get(id) ?? 0) + hits.reduce((sum, hit) => sum + hit.damage, 0));
      for (const event of w.events) if (event.t === 'destroyed') destroyed = event.vehicle;
    });
    expect(report.outcome).toBe('won');
    expect(destroyed).not.toBeNull();
    expect(report.a.damage).toBe(totals.get(destroyed!));
  } finally { setNumber(`RULES.npcDeathChance=${deathChance}`); }
});

it('waits for a launched shot after its shooter is destroyed', async () => {
  const { wreckVehicle } = await import('../sim/combat');
  let removed: string | null = null;
  let laterImpacts = 0, pending = -1;
  const fight = { ...FIGHT, a: parseLineup('buggy:mg/bare@hauler~0'), b: parseLineup('buggy:cannon/bare@hauler~0'), seed: 1337, maxTurns: 5 };
  const report = runFight(fight, (w, turn) => {
    if (turn === 1) {
      const flight = w.combat.flights.find(f => f.shooterId !== w.player.vehicleId);
      expect(flight).toBeDefined();
      const shooter = w.vehicles.find(v => v.id === flight!.shooterId)!;
      removed = shooter.id;
      wreckVehicle(w, shooter);
    } else laterImpacts += w.events.filter(e => e.t === 'shot' && e.shooter === removed).length;
    pending = w.combat.flights.length;
  });
  expect(report.turns).toBeGreaterThan(1);
  expect(laterImpacts).toBeGreaterThan(0);
  expect(pending).toBe(0);
});

it('settles pending shots without steering a scripted driver toward a defeated opponent', async () => {
  const { wreckVehicle } = await import('../sim/combat');
  let pending = -1;
  const report = runFight({ ...FIGHT, a: parseLineup('stand:mg/bare~0'), b: parseLineup('buggy:cannon/bare~0'), seed: 1, maxTurns: 5 }, (w, turn) => {
    if (turn === 1) {
      const flight = w.combat.flights.find(f => f.shooterId === w.player.vehicleId);
      expect(flight).toBeDefined();
      const target = w.vehicles.find(v => v.id === flight!.targetId)!;
      wreckVehicle(w, target);
    }
    pending = w.combat.flights.length;
  });
  expect(report.outcome).toBe('won');
  expect(report.turns).toBeGreaterThan(1);
  expect(pending).toBe(0);
});

it('settles pending shots without issuing orders to a knocked-out scripted driver', async () => {
  const { checkKnockout } = await import('../sim/defeat');
  const { corePart } = await import('../sim/grid');
  let pending = -1;
  const report = runFight({ ...FIGHT, a: parseLineup('stand:mg/bare~0'), b: parseLineup('buggy:cannon/bare~0'), seed: 1, maxTurns: 5 }, (w, turn) => {
    if (turn === 1) {
      expect(w.combat.flights.length).toBeGreaterThan(0);
      const player = w.vehicles.find(v => v.id === w.player.vehicleId)!;
      corePart(player, 'cab').hp = 0;
      checkKnockout(w);
    }
    pending = w.combat.flights.length;
  });
  expect(report.outcome).toBe('lost');
  expect(report.turns).toBeGreaterThan(1);
  expect(pending).toBe(0);
});
