import { committeeIds } from '../committee';
import { reportFailure } from '../fail';
import type { Card, Column, Ctx } from '../types';
import type { Classify, Decision, FilterInput, PublicFilter } from './decision';
import { isolated } from './isolate';
import type { Judged, KnownWork, PublicStore, StoredComment } from './store';
import { rankByWords } from './wiki';

const WORK_CANDIDATES = 6;
const BUILT: Column[] = ['Design', 'Implementation', 'Testing', 'Approval'];
const APPROVED: Column[] = ['Hardening', 'Merging'];

type Candidate = KnownWork & { status: string };

export async function classifyComments(ctx: Ctx, store: PublicStore, filter: PublicFilter): Promise<void> {
  const waiting = store.unclassifiedComments(ctx.cfg.filterPerTick);
  if (waiting.length === 0) return;
  const active = await activeWork(ctx);
  const members = committeeIds(ctx);
  for (const comment of waiting) {
    store.classify(comment.id, 'rejected', 'none', ctx.now());
    if (overLimit(ctx, store, comment)) {
      ctx.log('public', comment.issue, `player comment ${comment.id} is over the hourly limit of its sender, so it stays rejected`);
      continue;
    }
    const judge = { store, classify: filter.classify, active, member: comment.sender !== null && members.includes(comment.sender) };
    await isolated(ctx, comment.issue, `the filter failed on player comment ${comment.id}, so it stays rejected`, () => classifyOne(ctx, judge, comment));
  }
}

function statusOf(card: Card): string | null {
  if (BUILT.includes(card.column)) return 'being built';
  return APPROVED.includes(card.column) ? 'approved, being finished' : null;
}

async function activeWork(ctx: Ctx): Promise<Candidate[]> {
  try {
    return (await ctx.github.cards()).flatMap((card) => {
      const status = statusOf(card);
      return status === null ? [] : [{ issue: card.issue, text: card.title, status }];
    });
  } catch (error) {
    await reportFailure(ctx, 'public', null, `the board could not be read, so player comments are matched only to chat work this tick: ${error instanceof Error ? error.message : String(error)}`, null, []);
    return [];
  }
}

function overLimit(ctx: Ctx, store: PublicStore, comment: StoredComment): boolean {
  if (comment.source !== 'telegram' || comment.sender === null) return false;
  return !store.takeHit(`telegram:${comment.sender}`, ctx.now(), ctx.cfg.reportIpPerHour).taken;
}

function chatWork(store: PublicStore): Candidate[] {
  return store.knownWork().map((work) => ({ ...work, status: store.proposal(work.issue) === null ? 'filed from the chat' : 'proposal' }));
}

const namedIssues = (text: string): number[] => [...text.matchAll(/#(\d+)\b/g)].map((match) => Number(match[1]));

export function targetIssue(comment: StoredComment): number | null {
  if (comment.filedIssue !== null && !comment.linked) return comment.filedIssue;
  return comment.relevance === 'other' ? null : comment.issue;
}

function knownCandidates(store: PublicStore, active: Candidate[]): Candidate[] {
  const chat = chatWork(store);
  const activeIssues = new Set(active.map((work) => work.issue));
  const withChatText = active.map((work) => ({ ...work, text: chat.find((known) => known.issue === work.issue)?.text ?? work.text }));
  return [...withChatText, ...chat.filter((work) => !activeIssues.has(work.issue))];
}

async function openIssue(ctx: Ctx, issue: number): Promise<Candidate[]> {
  try {
    const found = await ctx.github.issue(issue);
    return found.state === 'OPEN' ? [{ issue, text: found.title, status: 'open issue' }] : [];
  } catch (error) {
    ctx.log('public', issue, `the issue a player comment names could not be read, so it is no candidate: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function namedWork(ctx: Ctx, text: string, known: Candidate[], left: Set<number | null>): Promise<Candidate[]> {
  const named = [...new Set(namedIssues(text))].filter((issue) => !left.has(issue)).slice(0, WORK_CANDIDATES);
  const found: Candidate[] = [];
  for (const issue of named) {
    const listed = known.filter((work) => work.issue === issue);
    found.push(...(listed.length > 0 ? listed : await openIssue(ctx, issue)));
  }
  return found;
}

async function candidateWork(ctx: Ctx, judge: Judge, comment: StoredComment, corrected: StoredComment | null): Promise<Candidate[]> {
  const left = new Set([comment.issue, corrected === null ? null : targetIssue(corrected)]);
  const known = knownCandidates(judge.store, judge.active).filter((work) => !left.has(work.issue));
  const query = [comment.text, comment.context ?? '', corrected?.text ?? ''].join(' ');
  const named = await namedWork(ctx, comment.text, known, left);
  const ranked = rankByWords(known.map((work) => work.text), query, WORK_CANDIDATES).map((index) => known[index]!);
  const newest = [...known].sort((a, b) => b.issue - a.issue);
  const seen = new Set<number>();
  return [...named, ...ranked, ...newest].filter((work) => !seen.has(work.issue) && seen.add(work.issue)).slice(0, WORK_CANDIDATES);
}

function filterInput(store: PublicStore, comment: StoredComment, work: Candidate[], corrected: StoredComment | null): FilterInput {
  const judged = { text: comment.text, context: comment.context, work: work.map((known) => `#${known.issue} (${known.status}) ${known.text}`), ...(corrected === null ? {} : { corrected: corrected.text }) };
  if (comment.issue === null) return { source: 'message', ...judged };
  return { source: 'comment', parent: store.parentPitch(comment.issue), ...judged };
}

const keepsWork = (decision: Decision): boolean => decision.verdict === 'accept' && decision.kind !== 'chatter';

function pickedWork(decision: Decision, work: Candidate[], correcting: boolean): number | null {
  if ((!correcting && !keepsWork(decision)) || decision.work === undefined) return null;
  return work[decision.work]?.issue ?? null;
}

export function answeredMessage(store: PublicStore, answers: number | null): StoredComment | null {
  const answered = answers === null ? null : store.comment(answers);
  return answered?.kind === 'correction' ? answeredMessage(store, answered.answers) : answered;
}

type Judge = { store: PublicStore; classify: Classify; active: Candidate[]; member: boolean };

function isCorrection(decision: Decision, corrected: StoredComment | null, member: boolean): boolean {
  return corrected !== null && decision.corrects === true && (decision.verdict === 'accept' || member);
}

async function classifyOne(ctx: Ctx, judge: Judge, comment: StoredComment): Promise<void> {
  const { store } = judge;
  const corrected = answeredMessage(store, comment.answers);
  const work = await candidateWork(ctx, judge, comment, corrected);
  const decision = await judge.classify(filterInput(store, comment, work, corrected));
  const correcting = isCorrection(decision, corrected, judge.member);
  const kind = correcting ? 'correction' : decision.verdict === 'reject' ? 'rejected' : decision.kind;
  const judged: Judged = { workIssue: pickedWork(decision, work, correcting), language: decision.language ?? null };
  store.classify(comment.id, kind, correcting ? 'none' : decision.route, ctx.now(), decision.relevance, judged);
}
