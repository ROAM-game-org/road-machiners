import { addCard } from './card-events';
import { CANDIDATE_LABELS, ERROR_REPORT_LABEL, HOTFIX_LABEL } from './types';
import type { Ctx, Issue } from './types';

const HOUR_MS = 3_600_000;

function isAged(issue: Issue, now: Date, minAgeHours: number): boolean {
  return (now.getTime() - new Date(issue.createdAt).getTime()) / HOUR_MS >= minAgeHours;
}

export async function intake(ctx: Ctx): Promise<number[]> {
  const { cfg, github } = ctx;
  const onBoard = new Set((await github.cards()).map((card) => card.issue));
  const candidates = await github.candidates([...CANDIDATE_LABELS, HOTFIX_LABEL]);
  const added: number[] = [];
  for (const issue of candidates) {
    const hotfix = issue.labels.includes(HOTFIX_LABEL);
    const immediate = hotfix || issue.labels.includes(ERROR_REPORT_LABEL);
    if (onBoard.has(issue.number) || !(immediate || isAged(issue, ctx.now(), cfg.minAgeHours))) continue;
    await addToBoard(ctx, issue.number, hotfix);
    added.push(issue.number);
  }
  return added;
}

async function addToBoard(ctx: Ctx, issue: number, hotfix: boolean): Promise<void> {
  const column = hotfix ? 'Design' : 'Triage';
  await addCard(ctx, issue, column, hotfix ? 'hotfix' : undefined);
  ctx.log('intake', issue, `added to ${column}`);
}
