import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentUsage } from './ledger';
import { backupRoot } from './repair-clone';
import { readState, updateState } from './state';
import { archiveTranscripts } from './transcript-archive';
import type { AgentSession, Ctx, IssueMerge, JobStage, LandingSource, LandingStage, LandingWork } from './types';

export type LandingPlan = { into: string; sources: LandingSource[]; cards: number[] };
export type OpenedLanding = { work: LandingWork; resumed: boolean };

export const landingSessionDir = (home: string, stage: LandingStage): string => join(home, 'sessions', stage);

const sameSources = (a: LandingSource[], b: LandingSource[]): boolean => a.length === b.length && a.every((source, index) => source.branch === b[index]!.branch && source.sha === b[index]!.sha);

export function matchesPlan(work: LandingWork, plan: LandingPlan): boolean {
  return work.into === plan.into && sameSources(work.sources, plan.sources);
}

export function openLanding(ctx: Ctx, stage: LandingStage, dir: string, plan: LandingPlan, job: string | null): OpenedLanding {
  const kept = readState(ctx.statePath).landings[stage];
  if (kept !== undefined && kept.merged && matchesPlan(kept, plan) && existsSync(dir)) {
    ctx.log(stage, null, `resuming the kept ${stage} work of ${cardList(kept.cards)} into ${kept.into}, session ${kept.session}, $${kept.spentUsd.toFixed(2)} of fix rounds spent`);
    const work = { ...kept, job, jobUsd: 0 };
    writeLanding(ctx, stage, work);
    return { work, resumed: true };
  }
  if (kept !== undefined) ctx.log(stage, null, `the kept ${stage} work of ${cardList(kept.cards)} no longer matches the batch, so it moves to the clone backups`);
  setAside(ctx, stage, dir);
  const work: LandingWork = { ...plan, session: randomUUID(), spentUsd: 0, job, jobUsd: 0, merged: false, merges: [], since: ctx.now().toISOString() };
  writeLanding(ctx, stage, work);
  return { work, resumed: false };
}

function setAside(ctx: Ctx, stage: LandingStage, dir: string): void {
  if (existsSync(dir)) {
    const target = join(backupRoot(ctx.cfg.home), `${stage}-${ctx.now().toISOString().replaceAll(':', '-')}`);
    mkdirSync(backupRoot(ctx.cfg.home), { recursive: true });
    renameSync(dir, target);
    ctx.log(stage, null, `moved the old ${stage} clone to ${target}`);
  }
  dropSession(ctx, stage);
}

function dropSession(ctx: Ctx, stage: LandingStage): void {
  const sessions = landingSessionDir(ctx.cfg.home, stage);
  archiveTranscripts(ctx.cfg.home, sessions);
  rmSync(sessions, { recursive: true, force: true });
}

export function landingSession(ctx: Ctx, stage: LandingStage, work: LandingWork): AgentSession {
  const dir = landingSessionDir(ctx.cfg.home, stage);
  mkdirSync(dir, { recursive: true });
  return { dir, id: work.session, resume: savedTranscript(dir, work.session) };
}

function savedTranscript(dir: string, id: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, `${id}.jsonl`)));
}

function writeLanding(ctx: Ctx, stage: LandingStage, work: LandingWork): void {
  updateState(ctx.statePath, (state) => ({ ...state, landings: { ...state.landings, [stage]: work } }));
}

function changeLanding(ctx: Ctx, stage: LandingStage, change: (work: LandingWork) => LandingWork): void {
  updateState(ctx.statePath, (state) => {
    const work = state.landings[stage];
    if (work === undefined) throw new Error(`The ${stage} job has no landing record to update`);
    return { ...state, landings: { ...state.landings, [stage]: change(work) } };
  });
}

export function addSpend(ctx: Ctx, stage: LandingStage, usd: number): void {
  changeLanding(ctx, stage, (work) => ({ ...work, spentUsd: work.spentUsd + usd, jobUsd: work.jobUsd + usd }));
}

export function addConflictSpend(ctx: Ctx, stage: LandingStage, usd: number): void {
  changeLanding(ctx, stage, (work) => ({ ...work, jobUsd: work.jobUsd + usd }));
}

export function chargeJobSpend(statePath: string, job: { id: string | null; stage: JobStage }, agents: AgentUsage[]): void {
  if (job.id !== null && (job.stage === 'merge' || job.stage === 'ship')) chargeEndedJob(statePath, job.stage, job.id, agents);
}

function chargeEndedJob(statePath: string, stage: LandingStage, job: string, agents: AgentUsage[]): void {
  const total = agents.reduce((sum, agent) => sum + agent.costUsd, 0);
  updateState(statePath, (state) => {
    const work = state.landings[stage];
    if (work === undefined || work.job !== job || total <= work.jobUsd) return state;
    return { ...state, landings: { ...state.landings, [stage]: { ...work, spentUsd: work.spentUsd + total - work.jobUsd, jobUsd: total } } };
  });
}

export function markMerged(ctx: Ctx, stage: LandingStage, merges: IssueMerge[]): void {
  changeLanding(ctx, stage, (work) => ({ ...work, merges, merged: true }));
}

export function closeLanding(ctx: Ctx, stage: LandingStage, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  dropSession(ctx, stage);
  updateState(ctx.statePath, (state) => {
    const { [stage]: _closed, ...rest } = state.landings;
    return { ...state, landings: rest };
  });
}

export function resetSpend(ctx: Ctx, issue: number): LandingStage[] {
  const stages = (Object.entries(readState(ctx.statePath).landings) as [LandingStage, LandingWork][]).filter(([, work]) => work.cards.includes(issue)).map(([stage]) => stage);
  for (const stage of stages) changeLanding(ctx, stage, (work) => ({ ...work, spentUsd: 0 }));
  return stages;
}

const cardList = (cards: number[]): string => cards.map((card) => `#${card}`).join(' ');
