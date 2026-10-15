import { readCommittee, telegramIds } from '../committee';
import { reportFailure } from '../fail';
import type { Card, Column, Ctx } from '../types';
import { applyCorrection } from './corrections';
import type { Classify, Decision, FilterInput, PublicFilter } from './decision';
import { isolated } from './isolate';
import type { CommentKind, Judged, KnownWork, PublicStore, StoredComment } from './store';
import { rankByWords } from './wiki';

const WORK_CANDIDATES = 6;
const BUILT: Column[] = ['Design', 'Implementation', 'Testing', 'Approval'];
const APPROVED: Column[] = ['Hardening', 'Merging'];

type Candidate = KnownWork & { status: string };
type Judge = { store: PublicStore; classify: Classify; active: Candidate[]; members: string[] };

export async function classifyComments(ctx: Ctx, store: PublicStore, filter: PublicFilter): Promise<void> {
  const waiting = store.unclassifiedComments(ctx.cfg.filterPerTick);
  if (waiting.length === 0) return;
  const judge = { store, classify: filter.classify, active: await activeWork(ctx), members: committeeIds(ctx) };
  for (const comment of waiting) {
    store.classify(comment.id, 'rejected', 'none', ctx.now());
    if (overLimit(ctx, store, comment)) {
      ctx.log('public', comment.issue, `player comment ${comment.id} is over the hourly limit of its sender, so it stays rejected`);
      continue;
    }
    await isolated(ctx, comment.issue, `the filter failed on player comment ${comment.id}, so it stays rejected`, () => classifyOne(ctx, judge, comment));
  }
}

function committeeIds(ctx: Ctx): string[] {
  const { home, committeeBootstrapTelegram: telegram, committeeBootstrapGithub: github } = ctx.cfg;
  return telegramIds(readCommittee(home, { telegram, github }));
}

function overLimit(ctx: Ctx, store: PublicStore, comment: StoredComment): boolean {
  if (comment.source !== 'telegram' || comment.sender === null) return false;
  return !store.takeHit(`telegram:${comment.sender}`, ctx.now(), ctx.cfg.reportIpPerHour).taken;
}

function statusOf(card: Card): string | null {
  if (BUILT.includes(card.column)) return 'being built';
  return APPROVED.includes(card.column) ? 'approved, being finished' : null;
}

async function activeWork(ctx: Ctx): Promise<Candidate[]> {
  try {
    return (await ctx.github.cards()).flatMap((card) => {
      const status = statusOf(card);
      return status === null ? [] : [{ issue: card.issue, text: card.title ?? '', status }];
    });
  } catch (error) {
    await reportFailure(ctx, 'public', null, `the board could not be read, so player comments are matched only to chat work this tick: ${error instanceof Error ? error.message : String(error)}`, null, []);
    return [];
  }
}

function knownCandidates(judge: Judge): Candidate[] {
  const chat = judge.store.knownWork();
  const active = judge.active.map((work) => ({ ...work, text: chat.find((known) => known.issue === work.issue)?.text ?? work.text }));
  const activeIssues = new Set(active.map((work) => work.issue));
  const rest = chat.filter((work) => !activeIssues.has(work.issue));
  return [...active, ...rest.map((work) => ({ ...work, status: judge.store.proposal(work.issue) === null ? 'filed from the chat' : 'proposal' }))];
}

const namedIssues = (text: string): Set<number> => new Set([...text.matchAll(/#(\d+)\b/g)].map((match) => Number(match[1])));

function candidateWork(judge: Judge, comment: StoredComment, corrected: StoredComment | null): Candidate[] {
  const left = new Set([comment.issue, corrected === null ? null : judge.store.landedIssue(corrected.id)]);
  const known = knownCandidates(judge).filter((work) => !left.has(work.issue));
  const named = namedIssues(comment.text);
  const query = [comment.text, comment.context ?? '', corrected?.text ?? ''].join(' ');
  const ranked = rankByWords(known.map((work) => work.text), query, WORK_CANDIDATES).map((index) => known[index]!);
  const newest = [...known].sort((a, b) => b.issue - a.issue);
  const ordered = [...known.filter((work) => named.has(work.issue)), ...ranked, ...newest];
  return ordered.filter((work, index) => ordered.findIndex((other) => other.issue === work.issue) === index).slice(0, WORK_CANDIDATES);
}

function filterInput(store: PublicStore, comment: StoredComment, work: Candidate[], corrected: StoredComment | null): FilterInput {
  const judged = { text: comment.text, context: comment.context, work: work.map((known) => `#${known.issue} [${known.status}] ${known.text}`), ...(corrected === null ? {} : { corrected: corrected.text }) };
  if (comment.issue === null) return { source: 'message', ...judged };
  return { source: 'comment', parent: store.parentPitch(comment.issue), ...judged };
}

const keepsWork = (decision: Decision): boolean => decision.verdict === 'accept' && decision.kind !== 'chatter';

function pickedWork(decision: Decision, work: Candidate[], correcting: boolean): number | null {
  if ((!correcting && !keepsWork(decision)) || decision.work === undefined) return null;
  return work[decision.work]?.issue ?? null;
}

function correctedOf(judge: Judge, comment: StoredComment): StoredComment | null {
  if (comment.answers === null || comment.sender === null || !judge.members.includes(comment.sender)) return null;
  const answered = judge.store.comment(comment.answers);
  return answered === null || answered.kind === 'correction' ? null : answered;
}

const kindOf = (decision: Decision): CommentKind => (decision.verdict === 'reject' ? 'rejected' : decision.kind);

async function classifyOne(ctx: Ctx, judge: Judge, comment: StoredComment): Promise<void> {
  const corrected = correctedOf(judge, comment);
  const work = candidateWork(judge, comment, corrected);
  const decision = await judge.classify(filterInput(judge.store, comment, work, corrected));
  const correcting = corrected !== null && decision.corrects === true;
  const kind = correcting ? 'correction' : kindOf(decision);
  const judged: Judged = { workIssue: pickedWork(decision, work, correcting), language: decision.language ?? null };
  judge.store.classify(comment.id, kind, correcting ? 'none' : decision.route, ctx.now(), decision.relevance, judged);
  if (correcting) await applyCorrection(ctx, judge.store, judge.store.comment(comment.id)!, corrected);
}
