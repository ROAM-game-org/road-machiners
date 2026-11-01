import { cardFlow, moveCard } from '../card-events';
import { BRANCH, GAME_DIR, TASK_FILE, type Ctx } from '../types';
import { SUITE_FIX_RULES, cardSuiteFailure } from './card-suite';
import { untilPasses } from './checkpoint';
import { BASE_BRANCH, agentHome, baseBranchFor, docsOnly, fillPrompt, guardAndPush, mergeBase, prepareOutputs, readOutput, runAgent, throwIfNeedsCommittee, unfinishedBaseMerge, workDir, writeIssueInput } from './common';

const PRINCIPLES = `${GAME_DIR}/docs/architecture/principles.md`;

export async function runStage(ctx: Ctx, issue: number): Promise<void> {
  const item = await ctx.github.issue(issue);
  const base = baseBranchFor(ctx, item.labels);
  await ctx.repo.prepareWorkClone(BRANCH(issue), base, workDir(ctx, issue));
  const home = agentHome(workDir(ctx, issue), GAME_DIR);
  prepareOutputs(ctx, issue, home);
  await writeIssueInput(ctx, issue, home);
  const { commit: merged, note } = await mergeBase(ctx, issue, base, home, 'harden');
  if (readOutput(home, 'merge-conflicts.md') === null && await docsOnly(ctx, issue, base)) ctx.log('harden', issue, 'a docs change, so no hardening agent');
  else await runAgent(ctx, issue, 'harden', 'harden', await hardenPrompt(ctx, issue, base, note));
  throwIfNeedsCommittee(home);
  await guardAndPush(ctx, issue, base, 'harden');
  const unfinished = await unfinishedBaseMerge(ctx, issue, base, merged);
  if (unfinished !== null) {
    await runAgent(ctx, issue, 'harden', 'harden', `The factory's check of your pushed branch failed. ${unfinished}`, { continue: true });
    throwIfNeedsCommittee(home);
    await guardAndPush(ctx, issue, base, 'harden');
    const still = await unfinishedBaseMerge(ctx, issue, base, merged);
    if (still !== null) throw new Error(still);
  }
  await untilPasses(ctx.cfg.hardeningBudgetUsd, 0, suiteCheckpoint(ctx, issue, base), (failure) => fixRound(ctx, issue, home, failure));
  await moveCard(ctx, issue, 'Merging', 'hardened', cardFlow(item.labels));
}

const NO_COMMIT = 'Your last round made no commit, so the head is the one that failed and the factory did not run the suite again. The failure above still stands. Commit the fix. Changes left uncommitted are never tested.';

function suiteCheckpoint(ctx: Ctx, issue: number, base: string): () => Promise<string | null> {
  let failed: { head: string; failure: string } | null = null;
  return async () => {
    await guardAndPush(ctx, issue, base, 'harden');
    const head = await ctx.repo.headHash(BRANCH(issue));
    if (failed?.head === head) return `${failed.failure}\n\n${NO_COMMIT}`;
    const failure = await cardSuiteFailure(ctx, 'harden', issue, base, head);
    failed = failure === null ? null : { head, failure };
    return failure;
  };
}

async function fixRound(ctx: Ctx, issue: number, home: string, failure: string): Promise<string> {
  const stream = await runAgent(ctx, issue, 'harden', 'harden', `The full suite of your pushed branch failed. ${SUITE_FIX_RULES} Commit, and end again. The failure:\n\n${failure}`, { continue: true });
  throwIfNeedsCommittee(home);
  return stream;
}

export async function hardenPrompt(ctx: Ctx, issue: number, base: string, baseNote: string): Promise<string> {
  return fillPrompt('harden', {
    issue: String(issue), taskFile: TASK_FILE(issue), branch: BRANCH(issue), base, baseNote,
    principles: await ctx.repo.readFile(BASE_BRANCH, PRINCIPLES),
  });
}
