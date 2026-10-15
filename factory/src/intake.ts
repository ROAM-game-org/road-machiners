import { addCard } from './card-events';
import { CANDIDATE_LABELS, ERROR_REPORT_LABEL, HOTFIX_LABEL, PLAYER_REPORT_LABEL } from './types';
import type { Ctx, Issue } from './types';

const HOUR_MS = 3_600_000;

function isAged(issue: Issue, now: Date, minAgeHours: number): boolean {
  return (now.getTime() - new Date(issue.createdAt).getTime()) / HOUR_MS >= minAgeHours;
}

const IMMEDIATE_LABELS = [HOTFIX_LABEL, ERROR_REPORT_LABEL, PLAYER_REPORT_LABEL];

const isImmediate = (issue: Issue): boolean => issue.labels.some((label) => IMMEDIATE_LABELS.includes(label));

export async function intake(ctx: Ctx): Promise<number[]> {
  const { cfg, github } = ctx;
  const onBoard = new Set((await github.cards()).map((card) => card.issue));
  const candidates = await github.candidates([...CANDIDATE_LABELS, HOTFIX_LABEL]);
  const added: number[] = [];
  for (const issue of candidates) {
    const hotfix = issue.labels.includes(HOTFIX_LABEL);
    if (onBoard.has(issue.number) || !(isImmediate(issue) || isAged(issue, ctx.now(), cfg.minAgeHours))) continue;
    await addToBoard(ctx, issue, hotfix);
    added.push(issue.number);
  }
  return added;
}

async function addToBoard(ctx: Ctx, issue: Issue, hotfix: boolean): Promise<void> {
  const column = hotfix ? 'Design' : 'Triage';
  await addCard(ctx, issue.number, column, issue.createdAt, hotfix ? 'hotfix' : undefined);
  ctx.log('intake', issue.number, `added to ${column}`);
}
