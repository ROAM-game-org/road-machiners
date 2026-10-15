import { readState, updateState } from './state';
import { FEEDBACK_HEADING, NEEDS_INFO_LABEL, PLAYER_REPORT_HEADING, QUESTIONS_HEADING, ROUTING_MARK, type Card, type Ctx, type FilledRecord, type IssueComment, type PendingFeedback } from './types';

const LEGACY_POST_MARK = 'Ready for approval:';
const FEEDBACK_COLUMNS = ['Design', 'Implementation', 'Testing'];

type Filled = { asked: Record<string, string>; pendingFeedback: Record<string, PendingFeedback>; routed: number[] };

function legacyAsk(card: Card, comments: IssueComment[]): string | null {
  if (!card.labels.includes(NEEDS_INFO_LABEL)) return null;
  return comments.filter((comment) => comment.byFactory && comment.body.startsWith(QUESTIONS_HEADING)).at(-1)?.createdAt ?? null;
}

function legacyFeedback(card: Card, comments: IssueComment[]): PendingFeedback | null {
  if (!FEEDBACK_COLUMNS.includes(card.column)) return null;
  const factory = comments.filter((comment) => comment.byFactory);
  const sincePost = factory.slice(factory.map((comment) => comment.body.startsWith(LEGACY_POST_MARK)).lastIndexOf(true) + 1);
  const latest = sincePost.filter((comment) => comment.body.startsWith(FEEDBACK_HEADING) || comment.body.startsWith(PLAYER_REPORT_HEADING)).at(-1);
  if (latest === undefined) return null;
  return { source: latest.body.startsWith(PLAYER_REPORT_HEADING) ? 'player' : 'committee', body: latest.body };
}

function legacyRouted(fill: FilledRecord[], comments: IssueComment[]): boolean {
  return fill.includes('routed') && comments.some((comment) => comment.byFactory && comment.body.includes(ROUTING_MARK));
}

function fillCard(filled: Filled, fill: FilledRecord[], card: Card, comments: IssueComment[]): void {
  const key = String(card.issue);
  const asked = fill.includes('asked') ? legacyAsk(card, comments) : null;
  const feedback = fill.includes('pendingFeedback') ? legacyFeedback(card, comments) : null;
  if (asked !== null) filled.asked[key] = asked;
  if (feedback !== null) filled.pendingFeedback[key] = feedback;
  if (legacyRouted(fill, comments)) filled.routed.push(card.issue);
}

export async function migrateRecords(ctx: Ctx): Promise<void> {
  const fill = readState(ctx.statePath).recordsToFill;
  if (fill.length === 0) return;
  const filled: Filled = { asked: {}, pendingFeedback: {}, routed: [] };
  for (const card of (await ctx.github.cards()).filter((open) => open.column !== 'Done')) fillCard(filled, fill, card, await ctx.github.comments(card.issue));
  updateState(ctx.statePath, (state) => ({
    ...state, asked: { ...filled.asked, ...state.asked }, pendingFeedback: { ...filled.pendingFeedback, ...state.pendingFeedback }, routed: [...new Set([...filled.routed, ...state.routed])], recordsToFill: [],
  }));
  ctx.log('tick', null, `filled records from issue comments once: ${Object.keys(filled.asked).length} asks, ${Object.keys(filled.pendingFeedback).length} pending feedback, ${filled.routed.length} routed`);
}
