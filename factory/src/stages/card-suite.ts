import { readState, updateState } from '../state';
import { BRANCH, type Ctx, type Stage } from '../types';
import { withoutBaseline } from './baseline';
import { BaselineFailureError } from './checkpoint';
import { isGameSource } from './common';
import { remoteSuiteResult } from './remote-suite';

export class SuiteNotGreenError extends Error {
  constructor(issue: number, build: string) {
    super(`Issue #${issue} build ${build} has no green full suite, so the card cannot go on.`);
  }
}

export const SUITE_FIX_RULES = 'Fix every failure it lists in this round, not only the first or the last one, since each one you leave costs another full run of the suite. Run every failed test file together before and after the fix. A test over its CPU limit gets cheaper: find the work it repeats and make that cheaper, and build shared worlds once and clone them. Never cut its cases, seeds, turns or samples, and never raise a limit.';

export async function suiteRequired(ctx: Ctx, issue: number, base: string): Promise<boolean> {
  return (await ctx.repo.changedFiles(base, BRANCH(issue))).some(isGameSource);
}

async function greenAt(ctx: Ctx, issue: number, sha: string): Promise<boolean> {
  return readState(ctx.statePath).suiteCleared[String(issue)] === sha || ctx.github.suitePassed(sha);
}

async function anyGreen(ctx: Ctx, issue: number, shas: string[]): Promise<boolean> {
  for (const sha of shas) if (await greenAt(ctx, issue, sha)) return true;
  return false;
}

export async function suiteSettled(ctx: Ctx, issue: number, base: string, build: string): Promise<boolean> {
  return !(await suiteRequired(ctx, issue, base)) || greenAt(ctx, issue, await ctx.repo.fullHash(build));
}

export async function ownWorkSettled(ctx: Ctx, issue: number, base: string): Promise<boolean> {
  return !(await suiteRequired(ctx, issue, base)) || anyGreen(ctx, issue, await ctx.repo.ownHeads(base, BRANCH(issue)));
}

export async function requireSettledSuite(ctx: Ctx, issue: number, base: string, build: string): Promise<void> {
  if (!(await suiteSettled(ctx, issue, base, build))) throw new SuiteNotGreenError(issue, build);
}

export async function cardSuiteFailure(ctx: Ctx, stage: Stage, issue: number, base: string, build: string): Promise<string | null> {
  if (await suiteSettled(ctx, issue, base, build)) return null;
  const result = await remoteSuiteResult(ctx, { stage, issue }, build);
  if (result.failure === null) return null;
  const check = { stage, into: base, base: await ctx.repo.headHash(base), head: build };
  try {
    return await withoutBaseline(ctx, check, result);
  } catch (error) {
    if (!(error instanceof BaselineFailureError)) throw error;
    const sha = await ctx.repo.fullHash(build);
    updateState(ctx.statePath, (state) => ({ ...state, suiteCleared: { ...state.suiteCleared, [String(issue)]: sha } }));
    ctx.log(stage, issue, `the suite fails only on tests that fail on ${base} too, so the card passes it`);
    return null;
  }
}
