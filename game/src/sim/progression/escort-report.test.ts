import { describe, expect, it } from 'vitest';
import { balanceVerdicts, beatableVerdict, choiceVerdict, damageVerdict, fightVerdict, playVerdicts, reactVerdict, riseVerdict, seedRun, sprintVerdict, table, varietyVerdict, type SeedRun } from './escort-report';
import type { RunLine, StretchStats } from './run-log';

const stats = (over: Partial<StretchStats> = {}): StretchStats => ({ haulerDamage: 20, haulerStart: 1, haulerEnd: 0.8, firstHit: 10, turnsFromFirstHit: 30, playerShots: 3, fights: 1, enemies: [{ chassis: 'buggy', guns: ['mg'], armor: 0 }], ...over });
const won = (stretch: number, over: Partial<StretchStats> = {}, choice = { useful: 3, affordable: 1, total: 90, money: 50 }): RunLine => ({ t: 'stretch', turn: stretch * 100, stretch, stats: stats(over), choice });
const lost = (stretch: number, over: Partial<StretchStats> = {}): RunLine => ({ t: 'lost', turn: stretch * 100, stretch, cause: 'haulerLost', money: 10, kit: { chassis: 'scout', guns: [], armor: 0, gear: 1 }, stretchDamageBy: [], stats: stats(over) });

function runOf(seed: number, n: number, over: (j: number) => Partial<StretchStats> = () => ({})): SeedRun {
  return seedRun(seed, Array.from({ length: n }, (_, i) => won(i + 1, over(i + 1))));
}

describe('the escort report', () => {
  it('reads won stretches and the lost one from the run log', () => {
    const run = seedRun(4, [won(1), won(2), lost(3)]);
    expect(run.reached).toBe(2);
    expect(run.lostCause).toBe('haulerLost');
    expect(run.rows.map((r) => [r.stretch, r.won])).toEqual([[1, true], [2, true], [3, false]]);
  });

  it('fails the fight check when a stretch had no player shot or no encounter', () => {
    expect(fightVerdict([runOf(1, 3)]).pass).toBe(true);
    expect(fightVerdict([runOf(1, 3, (j) => (j === 2 ? { playerShots: 0 } : {}))]).pass).toBe(false);
    expect(fightVerdict([runOf(1, 3, (j) => (j === 2 ? { fights: 0 } : {}))]).pass).toBe(false);
    expect(fightVerdict([runOf(1, 40, (j) => (j === 2 ? { playerShots: 0 } : {}))]).pass).toBe(true);
    expect(fightVerdict([seedRun(1, [won(1), lost(2, { playerShots: 0, fights: 0 })])]).pass).toBe(true);
  });

  it('judges whether the bot fought apart from the balance, so a quiet bot cannot pass on its win count', () => {
    const quiet = [runOf(1, 12, () => ({ playerShots: 0 }))];
    expect(playVerdicts(quiet).map((v) => [v.name, v.pass])).toEqual([['Fight', false]]);
    expect(balanceVerdicts(quiet, []).map((v) => v.name)).not.toContain('Fight');
    expect(balanceVerdicts(quiet, []).find((v) => v.name === 'Beatable')?.pass).toBe(false);
  });

  it('passes the damage check when most stretches hurt the hauler', () => {
    expect(damageVerdict([runOf(1, 4, (j) => ({ haulerDamage: j <= 3 ? 10 : 0 }))]).pass).toBe(true);
    expect(damageVerdict([runOf(1, 4, (j) => ({ haulerDamage: j <= 2 ? 10 : 0 }))]).pass).toBe(false);
  });

  it('fails the react check on a fresh hauler lost in under ten turns, and ignores a hurt one', () => {
    expect(reactVerdict([seedRun(1, [lost(2, { haulerStart: 0.95, turnsFromFirstHit: 4 })])]).pass).toBe(false);
    expect(reactVerdict([seedRun(1, [lost(2, { haulerStart: 0.95, turnsFromFirstHit: 25 })])]).pass).toBe(true);
    expect(reactVerdict([seedRun(1, [lost(2, { haulerStart: 0.5, turnsFromFirstHit: 4 })])]).pass).toBe(true);
  });

  it('wants the enemy mix to change on eight of nine transitions', () => {
    const changing = (j: number): Partial<StretchStats> => ({ enemies: [{ chassis: 'buggy', guns: ['mg'], armor: j }] });
    expect(varietyVerdict([runOf(1, 10, changing)]).pass).toBe(true);
    expect(varietyVerdict([runOf(1, 10)]).pass).toBe(false);
  });

  it('wants a useful part to afford, and not all of them affordable, at most outposts', () => {
    const run = seedRun(1, [won(1, {}, { useful: 3, affordable: 1, total: 90, money: 50 }), won(2, {}, { useful: 3, affordable: 3, total: 30, money: 50 }), won(3, {}, { useful: 2, affordable: 1, total: 80, money: 50 })]);
    expect(choiceVerdict([run]).pass).toBe(true);
    expect(choiceVerdict([seedRun(1, [won(1, {}, { useful: 3, affordable: 0, total: 90, money: 5 })])]).pass).toBe(false);
    expect(choiceVerdict([seedRun(1, [won(1, {}, { useful: 3, affordable: 3, total: 30, money: 50 })])]).pass).toBe(false);
  });

  it('wants the late stretches to hurt more than the early ones', () => {
    expect(riseVerdict([runOf(1, 10, (j) => ({ haulerDamage: j * 10 }))]).pass).toBe(true);
    expect(riseVerdict([runOf(1, 10, (j) => ({ haulerDamage: 100 - j }))]).pass).toBe(false);
  });

  it('counts the seeds that beat stretch ten, and needs six of ten', () => {
    const runs = Array.from({ length: 10 }, (_, i) => runOf(i, i < 6 ? 10 : 4));
    expect(beatableVerdict(runs).pass).toBe(true);
    expect(beatableVerdict(runs.slice(1)).pass).toBe(false);
  });

  it('needs every one of ten sprinter seeds to lose the run before stretch ten', () => {
    const lostRun = (seed: number) => seedRun(seed, [won(1), lost(2)]);
    expect(sprintVerdict(Array.from({ length: 10 }, (_, i) => lostRun(i))).pass).toBe(true);
    expect(sprintVerdict([...Array.from({ length: 9 }, (_, i) => lostRun(i)), runOf(9, 10)]).pass).toBe(false);
    expect(sprintVerdict(Array.from({ length: 9 }, (_, i) => lostRun(i))).pass).toBe(false);
  });

  it('lays a table per stretch and seed', () => {
    const rows = table([runOf(1, 2), runOf(2, 3)], (r) => String(r.stats.haulerDamage));
    expect(rows[0]).toEqual(['stretch', 'seed 1', 'seed 2']);
    expect(rows).toHaveLength(4);
    expect(rows[3]).toEqual(['3', '-', '20']);
  });
});
