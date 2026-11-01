import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isLocked } from './lock';
import { RUN_KEY, RUN_LOCK_NAME, type Card, type FactoryState } from './types';

type Keep = (id: number, state: FactoryState, cards: Card[]) => boolean;

const openCard: Keep = (id, _state, cards) => cards.length === 0 || cards.some((card) => card.issue === id && card.column !== 'Done');

const NUMBERED = /^(issue|check-issue|adhoc|change|incident)-(\d+)$/;
const KEEP_NUMBERED: Record<string, Keep> = {
  issue: openCard,
  adhoc: openCard,
  'check-issue': () => false,
  change: () => false,
  incident: (id, state) => state.pendingIncidents.includes(id),
};
const NAMED: Record<string, { stages: string[]; keep: (state: FactoryState) => boolean }> = {
  'dev-build': { stages: ['dev'], keep: () => false },
  'release-main': { stages: ['ship'], keep: () => false },
  'release-candidate': { stages: ['candidate', 'ship'], keep: (state) => state.release?.candidate != null },
  'release-playtest': { stages: ['playtest'], keep: (state) => state.release?.playtest.work != null },
  'release-baseline': { stages: ['playtest'], keep: () => false },
  waste: { stages: ['waste'], keep: () => false },
  answer: { stages: ['answer'], keep: () => false },
  'merge-queue': { stages: ['merge'], keep: (state) => state.landings.merge !== undefined },
  'ship-main': { stages: ['ship'], keep: (state) => state.landings.ship !== undefined },
};
const OPEN_CARD_CLONES: Record<string, true> = { issue: true, adhoc: true };
const OWN = new Set(['land']);
const PACKAGE_DIRS = ['node_modules', 'game/node_modules', 'factory/node_modules', 'quality/node_modules'];

export type Swept = { removed: string[]; stripped: string[]; unknown: string[] };

const isClone = (name: string): boolean => NUMBERED.test(name) || name in NAMED;

const running = (lockRoot: string, key: string): boolean => isLocked(join(lockRoot, RUN_LOCK_NAME(key)));

function busyNamed(name: string, state: FactoryState, lockRoot: string): boolean {
  const stages = NAMED[name].stages;
  return stages.some((stage) => running(lockRoot, RUN_KEY.stage(stage))) || state.jobs.some((job) => stages.includes(job.stage));
}

function busyNumbered(id: number, state: FactoryState, lockRoot: string, unconfirmed: ReadonlySet<number>): boolean {
  if (unconfirmed.has(id) || running(lockRoot, RUN_KEY.issue(id))) return true;
  return state.jobs.some((job) => job.issue === id) || state.interrupted.includes(id) || String(id) in state.held;
}

function busy(name: string, state: FactoryState, lockRoot: string, unconfirmed: ReadonlySet<number>): boolean {
  if (isLocked(join(lockRoot, name))) return true;
  const numbered = NUMBERED.exec(name);
  return numbered ? busyNumbered(Number(numbered[2]), state, lockRoot, unconfirmed) : busyNamed(name, state, lockRoot);
}

function needed(name: string, state: FactoryState, cards: Card[]): boolean {
  const numbered = NUMBERED.exec(name);
  return numbered ? KEEP_NUMBERED[numbered[1]](Number(numbered[2]), state, cards) : NAMED[name].keep(state);
}

function stripPackages(dir: string): boolean {
  const packages = PACKAGE_DIRS.map((sub) => join(dir, sub)).filter((path) => existsSync(path));
  for (const path of packages) rmSync(path, { recursive: true, force: true });
  return packages.length > 0;
}

function sweepOne(workRoot: string, lockRoot: string, name: string, state: FactoryState, cards: Card[], unconfirmed: ReadonlySet<number>, swept: Swept): void {
  if (!isClone(name)) return void swept.unknown.push(name);
  if (busy(name, state, lockRoot, unconfirmed)) return;
  const dir = join(workRoot, name);
  if (!needed(name, state, cards)) {
    rmSync(dir, { recursive: true, force: true });
    return void swept.removed.push(name);
  }
  if (stripPackages(dir)) swept.stripped.push(name);
}

export function removalCandidates(workRoot: string, state: FactoryState, cards: Card[]): number[] {
  if (!existsSync(workRoot)) return [];
  const ids = readdirSync(workRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => NUMBERED.exec(entry.name))
    .filter((match): match is RegExpExecArray => match !== null && match[1] in OPEN_CARD_CLONES)
    .filter((match) => !openCard(Number(match[2]), state, cards))
    .map((match) => Number(match[2]));
  return [...new Set(ids)];
}

export function sweepWork(workRoot: string, lockRoot: string, state: FactoryState, cards: Card[], unconfirmed: ReadonlySet<number> = new Set()): Swept {
  const swept: Swept = { removed: [], stripped: [], unknown: [] };
  if (!existsSync(workRoot)) return swept;
  const folders = readdirSync(workRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !OWN.has(entry.name));
  for (const folder of folders) sweepOne(workRoot, lockRoot, folder.name, state, cards, unconfirmed, swept);
  return swept;
}

const KEEP_LOGS = new Set(['tick.log', 'update.log']);

function oldFile(path: string, cutoff: number): boolean {
  const stat = statSync(path);
  return stat.isFile() && stat.mtimeMs < cutoff;
}

export function sweepLogs(logRoot: string, state: FactoryState, now: Date, days: number): string[] {
  if (!existsSync(logRoot)) return [];
  const cutoff = now.getTime() - days * 24 * 3_600_000;
  const named = new Set(state.failures.map((failure) => failure.log));
  const removed = readdirSync(logRoot).filter((name) => !KEEP_LOGS.has(name) && !named.has(join(logRoot, name)) && oldFile(join(logRoot, name), cutoff));
  for (const name of removed) rmSync(join(logRoot, name));
  return removed;
}

