import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { savedTranscript } from './landing-work';
import { backupRoot } from './repair-clone';
import { readState, updateState } from './state';
import { archiveTranscripts } from './transcript-archive';
import type { AgentSession, Ctx, IssueMerge, PlaytestState, PlaytestWork } from './types';

export type OpenedPlaytestWork = { work: PlaytestWork; resumed: boolean };

export const playtestSessionDir = (home: string): string => join(home, 'sessions', 'playtest');

export function chooseStart(kept: PlaytestWork | null, devTip: string, baseline: string): string {
  return kept !== null && kept.baseline === baseline ? kept.start : devTip;
}

export async function openPlaytestWork(ctx: Ctx, dir: string, plan: { start: string; baseline: string }, features: () => Promise<IssueMerge[]>): Promise<OpenedPlaytestWork> {
  const kept = playtestOf(ctx).work;
  if (kept !== null && keptMatches(kept, plan) && existsSync(dir)) {
    ctx.log('playtest', null, `resuming the kept playtest work from ${kept.start}, session ${kept.session}, ${kept.plays} plays spent`);
    return { work: kept, resumed: true };
  }
  if (kept !== null) ctx.log('playtest', null, `the kept playtest work from ${kept.start} no longer matches, so it moves to the clone backups`);
  if (kept === null) rmSync(dir, { recursive: true, force: true });
  setAside(ctx, dir);
  const work: PlaytestWork = { start: plan.start, baseline: plan.baseline, features: await features(), session: randomUUID(), plays: 0 };
  changePlaytest(ctx, (playtest) => ({ ...playtest, work }));
  return { work, resumed: false };
}

function keptMatches(kept: PlaytestWork, plan: { start: string; baseline: string }): boolean {
  return kept.start === plan.start && kept.baseline === plan.baseline;
}

export function playtestSession(ctx: Ctx, work: PlaytestWork): AgentSession {
  const dir = playtestSessionDir(ctx.cfg.home);
  mkdirSync(dir, { recursive: true });
  return { dir, id: work.session, resume: savedTranscript(dir, work.session) };
}

export function countPlay(ctx: Ctx): { run: number; plays: number } {
  const next = changePlaytest(ctx, (playtest) => {
    if (playtest.work === null) throw new Error('The playtest has no kept work to count a play in');
    return { ...playtest, runs: playtest.runs + 1, work: { ...playtest.work, plays: playtest.work.plays + 1 } };
  });
  return { run: next.runs, plays: next.work!.plays };
}

export function closePlaytestWork(ctx: Ctx, dir: string, keepClone: boolean): void {
  if (keepClone) setAside(ctx, dir);
  else dropSession(ctx);
}

export function changePlaytest(ctx: Ctx, change: (playtest: PlaytestState) => PlaytestState): PlaytestState {
  const next = updateState(ctx.statePath, (state) => (state.release ? { ...state, release: { ...state.release, playtest: change(state.release.playtest) } } : state));
  if (!next.release) throw new Error('The release closed while its playtest ran');
  return next.release.playtest;
}

function playtestOf(ctx: Ctx): PlaytestState {
  const release = readState(ctx.statePath).release;
  if (release === null) throw new Error('No release is open');
  return release.playtest;
}

function setAside(ctx: Ctx, dir: string): void {
  if (existsSync(dir)) {
    const target = join(backupRoot(ctx.cfg.home), `playtest-${ctx.now().toISOString().replaceAll(':', '-')}`);
    mkdirSync(backupRoot(ctx.cfg.home), { recursive: true });
    renameSync(dir, target);
    ctx.log('playtest', null, `moved the old playtest clone to ${target}`);
  }
  dropSession(ctx);
}

function dropSession(ctx: Ctx): void {
  const sessions = playtestSessionDir(ctx.cfg.home);
  archiveTranscripts(ctx.cfg.home, sessions);
  rmSync(sessions, { recursive: true, force: true });
}
