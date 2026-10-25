import { PARTS } from '../../data/parts';
import { HAULER_KIT, startKit } from '../../data/start';
import type { Enemy, OutpostChoice, RunLine, StretchStats } from './run-log';

export type StretchRow = { seed: number; stretch: number; won: boolean; cause: string | null; stats: StretchStats; choice: OutpostChoice | null };
export type SeedRun = { seed: number; rows: StretchRow[]; reached: number; lostCause: string | null };
export type Verdict = { name: string; pass: boolean; detail: string };

export const TARGET_STRETCH = 10;
export const BEATABLE_SEEDS = 6;
export const SPRINT_SEEDS = 10;
export const REACT_TURNS = 10;
export const REACT_CONDITION = 0.9;
export const VARIETY_TRANSITIONS = 8;
export const QUIET_SHARE = 20;

export function seedRun(seed: number, lines: readonly RunLine[]): SeedRun {
  const rows: StretchRow[] = [];
  let lostCause: string | null = null;
  for (const line of lines) {
    if (line.t === 'stretch') rows.push({ seed, stretch: line.stretch, won: true, cause: null, stats: line.stats, choice: line.choice });
    if (line.t === 'lost') {
      lostCause = line.cause;
      rows.push({ seed, stretch: line.stretch, won: false, cause: line.cause, stats: line.stats, choice: null });
    }
  }
  return { seed, rows, reached: rows.filter((r) => r.won).length, lostCause };
}

function signature(enemies: readonly Enemy[]): string {
  return enemies.map((e) => `${e.chassis}|${[...e.guns].sort().join(',')}|${e.armor}`).sort().join(';');
}

function fraction(count: number, of: number): string {
  return `${count} of ${of}`;
}

const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

export function fightVerdict(runs: readonly SeedRun[]): Verdict {
  const rows = runs.flatMap((r) => r.rows.filter((row) => row.won));
  const quiet = rows.filter((r) => r.stats.playerShots < 1 || r.stats.fights < 1);
  return { name: 'Fight', pass: quiet.length * QUIET_SHARE <= rows.length, detail: `${fraction(rows.length - quiet.length, rows.length)} beaten stretches had a player shot and an encounter (at most 1 in ${QUIET_SHARE} may be quiet)` };
}

export function damageVerdict(runs: readonly SeedRun[]): Verdict {
  const rows = runs.flatMap((r) => r.rows);
  const hurt = rows.filter((r) => r.stats.haulerDamage > 0);
  return { name: 'Damage', pass: hurt.length * 2 > rows.length, detail: `${fraction(hurt.length, rows.length)} stretches damaged the hauler` };
}

export function reactVerdict(runs: readonly SeedRun[]): Verdict {
  const losses = runs.flatMap((r) => r.rows.filter((row) => row.cause === 'haulerLost'));
  const fresh = losses.filter((row) => row.stats.haulerStart >= REACT_CONDITION);
  const quick = fresh.filter((row) => row.stats.turnsFromFirstHit === null || row.stats.turnsFromFirstHit < REACT_TURNS);
  return { name: 'React', pass: quick.length === 0, detail: `${fraction(quick.length, fresh.length)} stretches begun at ${REACT_CONDITION * 100}% or better lost the hauler in under ${REACT_TURNS} turns` };
}

export function varietyVerdict(runs: readonly SeedRun[]): Verdict {
  const full = runs.filter((r) => r.rows.length >= TARGET_STRETCH);
  const counts = full.map((r) => r.rows.slice(0, TARGET_STRETCH).slice(1).filter((row, i) => signature(row.stats.enemies) !== signature(r.rows[i].stats.enemies)).length);
  const passing = counts.filter((n) => n >= VARIETY_TRANSITIONS).length;
  return { name: 'Variety', pass: full.length > 0 && passing * 2 > full.length, detail: `${fraction(passing, full.length)} full runs changed the enemy mix on at least ${VARIETY_TRANSITIONS} of ${TARGET_STRETCH - 1} transitions (${counts.join(', ')})` };
}

export function choiceVerdict(runs: readonly SeedRun[]): Verdict {
  const posts = runs.flatMap((r) => r.rows.flatMap((row) => (row.choice ? [row.choice] : [])));
  const real = posts.filter((c) => c.useful > 0 && c.affordable > 0 && c.total > c.money);
  return { name: 'Choice', pass: real.length * 2 > posts.length, detail: `${fraction(real.length, posts.length)} outposts had a useful part to afford and more useful parts than the money buys` };
}

export function riseVerdict(runs: readonly SeedRun[]): Verdict {
  const at = (from: number, to: number) => runs.flatMap((r) => r.rows.filter((row) => row.stretch >= from && row.stretch <= to).map((row) => row.stats.haulerDamage));
  const early = mean(at(1, 3));
  const late = mean(at(8, 10));
  return { name: 'Rise', pass: late > early, detail: `mean hauler damage ${Math.round(early)} on stretches 1 to 3, ${Math.round(late)} on 8 to 10` };
}

export function beatableVerdict(runs: readonly SeedRun[]): Verdict {
  const reached = runs.filter((r) => r.reached >= TARGET_STRETCH).length;
  return { name: 'Beatable', pass: reached >= BEATABLE_SEEDS, detail: `${fraction(reached, runs.length)} seeds beat stretch ${TARGET_STRETCH} (need ${BEATABLE_SEEDS})` };
}

export function sprintVerdict(runs: readonly SeedRun[]): Verdict {
  const lost = runs.filter((r) => r.lostCause !== null && r.reached < TARGET_STRETCH).length;
  return { name: 'Not sprintable', pass: runs.length >= SPRINT_SEEDS && lost === runs.length, detail: `${fraction(lost, runs.length)} sprinter seeds lost the run before stretch ${TARGET_STRETCH} (need ${SPRINT_SEEDS} of ${SPRINT_SEEDS})` };
}

export function playVerdicts(escort: readonly SeedRun[]): Verdict[] {
  return [fightVerdict(escort)];
}

export function balanceVerdicts(escort: readonly SeedRun[], sprinter: readonly SeedRun[]): Verdict[] {
  return [damageVerdict(escort), reactVerdict(escort), varietyVerdict(escort), choiceVerdict(escort), riseVerdict(escort), beatableVerdict(escort), sprintVerdict(sprinter)];
}

export function table(runs: readonly SeedRun[], cell: (row: StretchRow) => string): string[][] {
  const stretches = Array.from({ length: Math.max(0, ...runs.flatMap((r) => r.rows.map((row) => row.stretch))) }, (_, i) => i + 1);
  const head = ['stretch', ...runs.map((r) => `seed ${r.seed}`)];
  return [head, ...stretches.map((j) => [String(j), ...runs.map((r) => { const row = r.rows.find((x) => x.stretch === j); return row ? cell(row) : '-'; })])];
}

export function startGearM(): number {
  const kit = startKit('chaosHighway');
  const parts = [...kit.parts, ...(kit.placed ?? []).map((p) => p.defId), ...HAULER_KIT.parts];
  return Math.round(parts.reduce((sum, id) => sum + PARTS[id].value, 0) / 100);
}

export function gearShares(lines: readonly RunLine[]): number[] {
  const start = startGearM();
  return lines.flatMap((line) => (line.t === 'leave' && line.paid > 0 ? [(line.kit.gear + line.haulerKit.gear - start) / line.paid] : []));
}

export function median(xs: readonly number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
}
