import { FULL_STEPS, evidenceFor, recordEvidence, toolchainKey, type Evidence, type Step } from '../check-evidence';
import { GAME_DIR, type Ctx } from '../types';
import { checkScript } from './checks';
import { playtestCommand } from './common';

export type Revision = { commit: string; tree: string; evidence: Evidence | null };

export type IntegrationInput = { merged: Revision; hotfix: Revision; main: Revision; conflicted: boolean; shared: string[] };

export type IntegrationPlan = { steps: Step[]; reused: string[]; reason: string };

const short = (commit: string): string => commit.slice(0, 7);

function checked(revision: Revision): boolean {
  const ran = revision.evidence?.ran ?? [];
  return ran.includes('typecheck') && ran.includes('suite');
}

export function integrationChecks({ merged, hotfix, main, conflicted, shared }: IntegrationInput): IntegrationPlan {
  if (merged.tree === hotfix.tree) {
    return { steps: [], reused: hotfix.evidence ? [hotfix.commit] : [], reason: 'main brought no game change the hotfix lacks, so the merge holds exactly the game code the committee played' };
  }
  if (merged.evidence !== null) return { steps: [], reused: [merged.evidence.commit], reason: `the same merged code passed its checks at ${short(merged.evidence.commit)}` };
  const unchecked = [hotfix, main].filter((revision) => !checked(revision)).map((revision) => short(revision.commit));
  if (unchecked.length > 0) return { steps: FULL_STEPS, reused: [], reason: `no passing checks are on record for ${unchecked.join(' and ')}, so skipping any check cannot be shown safe` };
  return { ...targetedChecks(conflicted, shared), reused: [hotfix.commit, main.commit] };
}

function targetedChecks(conflicted: boolean, shared: string[]): Pick<IntegrationPlan, 'steps' | 'reason'> {
  if (conflicted) return { steps: ['typecheck', 'suite', 'playtest'], reason: 'the merge conflicted and an agent resolved it' };
  if (shared.length > 0) return { steps: ['typecheck', 'suite', 'playtest'], reason: `the hotfix and main both changed ${shared.join(', ')}` };
  return { steps: ['typecheck', 'suite'], reason: 'the merge was clean and the hotfix and main changed no file in common' };
}

export function currentToolchain(ctx: Ctx): string {
  return toolchainKey(checkScript(playtestCommand(ctx.cfg, false)));
}

export async function revisionOf(ctx: Ctx, commit: string, toolchain: string): Promise<Revision> {
  const tree = await ctx.repo.treeOf(commit, GAME_DIR);
  return { commit, tree, evidence: evidenceFor(ctx.cfg.home, tree, toolchain) };
}

export async function recordPassed(ctx: Ctx, commit: string, record: Pick<Evidence, 'ran' | 'reused' | 'by' | 'issue'>): Promise<void> {
  const tree = await ctx.repo.treeOf(commit, GAME_DIR);
  recordEvidence(ctx.cfg.home, { tree, commit, toolchain: currentToolchain(ctx), ...record, at: ctx.now().toISOString() }, ctx.now());
}

const STEP_NAMES: Record<Step, string> = { typecheck: 'the typecheck', suite: 'the suite', playtest: 'the playtest', build: 'the build' };

export function stepsText(steps: Step[], counts: { ran: number; skipped: number } | null): string {
  const named = steps.map((step) => (step === 'suite' && counts !== null ? `the suite (it ran ${counts.ran} test files and skipped ${counts.skipped} that already passed on the same inputs)` : STEP_NAMES[step]));
  return named.length === 1 ? named[0]! : `${named.slice(0, -1).join(', ')} and ${named.at(-1)!}`;
}

export function checksSummary(plan: IntegrationPlan, merged: string, counts: { ran: number; skipped: number } | null): string {
  const reused = plan.reused.length === 0 ? 'It reuses no earlier checks.' : `It reuses the passing checks of ${plan.reused.map(short).join(' and ')}.`;
  if (plan.steps.length === 0) return `No check ran again, since ${plan.reason}. ${reused}`;
  return `On the merge with main, ${short(merged)}, the factory ran ${stepsText(plan.steps, counts)}, since ${plan.reason}. ${reused}`;
}
