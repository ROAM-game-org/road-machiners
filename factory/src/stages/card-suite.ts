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

export async function suiteRequired(ctx: Ctx, issue: number, base: string): Promise<boolean> {
  return (await ctx.repo.changedFiles(base, BRANCH(issue))).some(isGameSource);
}

async function testedHeads(ctx: Ctx, issue: number, base: string, build: string): Promise<string[]> {
  const sha = await ctx.repo.fullHash(build);
  const heads = await ctx.repo.ownHeads(base, BRANCH(issue));
  return heads[0] === sha ? heads : [sha];
}

async function suiteGreen(ctx: Ctx, issue: number, base: string, build: string): Promise<boolean> {
  const cleared = readState(ctx.statePath).suiteCleared[String(issue)];
  for (const sha of await testedHeads(ctx, issue, base, build)) {
    if (cleared === sha || await ctx.github.suitePassed(sha)) return true;
  }
  return false;
}

export async function suiteSettled(ctx: Ctx, issue: number, base: string, build: string): Promise<boolean> {
  return !(await suiteRequired(ctx, issue, base)) || suiteGreen(ctx, issue, base, build);
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
