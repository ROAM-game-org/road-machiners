import { CommitteeDecisionError } from './diff-guard';
import { GithubError } from './github';
import { UsageLimitError } from './pause';
import { BaselineFailureError, BudgetError } from './stages/checkpoint';
import { updateState } from './state';
import { STUCK_LABEL, type Ctx, type FactoryState, type Failure, type FailureCause, type RejectedControl, type JobStage, type Stage } from './types';

const ANSI = new RegExp(String.raw`\u001b\[[0-9;]*[A-Za-z]`, 'g');
const FAILURE_LINE = /FAIL|Error|error:|failed|×/;
const SUMMARY_LINES = 6;
const SUMMARY_CHARS = 800;
const FAILURE_KEEP_MS = 24 * 3_600_000;

export class JobTimeoutError extends Error {}
export class JobDiedError extends Error {}

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

export const FAILURE_TAIL_LINES = 150;

export function summarizeError(message: string): string {
  const lines = stripAnsi(message).split('\n').map((line) => line.trim()).filter(Boolean);
  const failures = lines.filter((line) => FAILURE_LINE.test(line));
  const picked = (failures.length ? failures : lines.slice(-SUMMARY_LINES)).slice(0, SUMMARY_LINES);
  return picked.join('\n').slice(0, SUMMARY_CHARS);
}

export function failureIssue(stage: JobStage, issue: number | null, state: FactoryState): number | null {
  if (stage === 'release') return state.release?.issue ?? null;
  return issue;
}

const UNLABELED_STAGES: Stage[] = ['catch-up', 'public'];

export async function reportFailure(ctx: Ctx, stage: Stage, issue: number | null, error: unknown, log: string | null, batch: number[], extra: Pick<Failure, 'control'> = {}): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  ctx.log(stage, issue, `failed: ${message}`);
  const failure: Failure = { stage, issue, error: summarizeError(message), cause: causeOf(error), log, at: ctx.now().toISOString(), ...(batch.length > 0 ? { batch } : {}), ...extra };
  updateState(ctx.statePath, (state) => ({ ...state, failures: [...state.failures, failure] }));
  if (issue !== null && labelsStuck(stage, error)) await ctx.github.addLabel(issue, STUCK_LABEL);
}

function labelsStuck(stage: Stage, error: unknown): boolean {
  return !UNLABELED_STAGES.includes(stage) && !(error instanceof UsageLimitError);
}

export function causeOf(error: unknown): FailureCause {
  for (let link = error; link instanceof Error; link = link.cause) {
    const cause = causeOfLink(link);
    if (cause !== null) return cause;
  }
  return 'error';
}

const CAUSE_OF_CLASS: [abstract new (...args: never[]) => Error, FailureCause][] = [
  [BudgetError, 'decision'],
  [BaselineFailureError, 'baseline'],
  [CommitteeDecisionError, 'decision'],
  [GithubError, 'github'],
  [JobTimeoutError, 'timeout'],
  [JobDiedError, 'died'],
];

function causeOfLink(error: Error): FailureCause | null {
  if ((error as NodeJS.ErrnoException).code === 'ENOSPC') return 'disk';
  return CAUSE_OF_CLASS.find(([type]) => error instanceof type)?.[1] ?? null;
}

export function withoutFailuresOf(failures: Failure[], issue: number): Failure[] {
  return failures.filter((failure) => failure.issue !== issue).flatMap((failure) => clearedOf(failure, issue));
}

function clearedOf(failure: Failure, issue: number): Failure[] {
  if (failure.batch === undefined || !failure.batch.includes(issue)) return [failure];
  const cleared = [...new Set([...(failure.cleared ?? []), issue])];
  return failure.batch.every((member) => cleared.includes(member)) ? [] : [{ ...failure, cleared }];
}

export function withoutRejectionsOf(failures: Failure[], control: RejectedControl): Failure[] {
  return failures.filter((failure) => failure.control?.action !== control.action || failure.control.issue !== control.issue);
}

export function withoutStageFailuresOf(failures: Failure[], stage: Stage, issue: number): Failure[] {
  return failures.filter((failure) => failure.stage !== stage || failure.issue !== issue);
}

export function isClearedFor(failure: Failure, issue: number): boolean {
  return (failure.cleared ?? []).includes(issue);
}

export function pruneFailures(now: Date): (state: FactoryState) => FactoryState {
  return (state) => ({ ...state, failures: state.failures.filter((failure) => now.getTime() - new Date(failure.at).getTime() < FAILURE_KEEP_MS) });
}
