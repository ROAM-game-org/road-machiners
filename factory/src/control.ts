import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCommittee } from './committee';
import { reportFailure, withoutFailuresOf } from './fail';
import { holdCard, releaseHold } from './hold';
import { killJob } from './jobs';
import { appendLedger, recordJob } from './ledger';
import { CARD_JOBS, MOVE_TARGETS, isMerging, type MoveTarget } from './position';
import { withStatus } from './post-status';
import { dropReplyMedia } from './reply-media';
import { clearSessions } from './sessions';
import { readState, updateState } from './state';
import { ownWorkSettled } from './stages/card-suite';
import { BASE_BRANCH, HOTFIX_BASE, agentHome, baseBranchFor, workDir } from './stages/common';
import { closeCard } from './stages/approval';
import { mergeOf, requireRelease } from './stages/release-common';
import { invalidateApproval } from './stages/kept-approval';
import { addCard, moveCard, type CardStep } from './card-events';
import { openStore } from './public/store';
import { closeByHand } from './public/votes';
import { BRANCH, GAME_DIR, NEEDS_INFO_LABEL, RELEASE_LABEL, STUCK_LABEL, TASK_FILE, VOTING_LABEL, isCleanupTask, type Card, type Column, type Ctx, type FactoryState } from './types';

export const DROP_QUEUES = ['approval', 'removal', 'ship', 'incident'] as const;
export type DropQueue = (typeof DROP_QUEUES)[number];

export type ControlAction =
  | { action: 'move'; issue: number; to: MoveTarget }
  | { action: 'merge'; issue: number }
  | { action: 'ship' }
  | { action: 'playtest' }
  | { action: 'remove'; issue: number }
  | { action: 'drop'; queue: DropQueue; id: number | null }
  | { action: 'hold'; issue: number }
  | { action: 'unhold'; issue: number }
  | { action: 'adopt'; branch: string; title: string };
export type ControlCommand = ControlAction & { by: string; reason: string };

type Outcome = { issue: number | null; text: string };

export function writeControl(home: string, command: ControlCommand, now: Date): string {
  const dir = join(home, 'inbox');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${now.getTime()}-control.json`);
  writeFileSync(`${path}.tmp`, JSON.stringify({ kind: 'control', ...command }));
  renameSync(`${path}.tmp`, path);
  return path;
}

type Data = Record<string, unknown>;

function requireText(data: Data, name: string): string {
  const value = data[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`A control command needs a text field "${name}".`);
  return value;
}

function requireNumber(data: Data, name: string): number {
  const value = data[name];
  if (!Number.isInteger(value)) throw new Error(`A ${String(data.action)} command needs a whole number field "${name}".`);
  return value as number;
}

function requireOneOf<T extends string>(data: Data, name: string, allowed: readonly T[]): T {
  const value = data[name];
  if (!allowed.includes(value as T)) throw new Error(`A ${String(data.action)} command needs "${name}" to be one of ${allowed.join(', ')}.`);
  return value as T;
}

function requireDropId(data: Data): number | null {
  if (data.id === null) return null;
  return requireNumber(data, 'id');
}

const SHAPES: { [A in ControlAction['action']]: (data: Data) => Extract<ControlAction, { action: A }> } = {
  move: (data) => ({ action: 'move', issue: requireNumber(data, 'issue'), to: requireOneOf(data, 'to', MOVE_TARGETS) }),
  merge: (data) => ({ action: 'merge', issue: requireNumber(data, 'issue') }),
  ship: () => ({ action: 'ship' }),
  playtest: () => ({ action: 'playtest' }),
  remove: (data) => ({ action: 'remove', issue: requireNumber(data, 'issue') }),
  drop: (data) => ({ action: 'drop', queue: requireOneOf(data, 'queue', DROP_QUEUES), id: requireDropId(data) }),
  hold: (data) => ({ action: 'hold', issue: requireNumber(data, 'issue') }),
  unhold: (data) => ({ action: 'unhold', issue: requireNumber(data, 'issue') }),
  adopt: (data) => ({ action: 'adopt', branch: requireText(data, 'branch'), title: requireText(data, 'title') }),
};

export function parseControl(raw: unknown): ControlCommand {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('A control command must be a JSON object.');
  const data = raw as Data;
  const by = requireText(data, 'by');
  const reason = requireText(data, 'reason');
  const name = String(data.action);
  if (!Object.hasOwn(SHAPES, name)) throw new Error(`Unknown control action ${name}`);
  return { ...(SHAPES[name as ControlAction['action']](data) as ControlAction), by, reason };
}

export function resolveActor(ctx: Ctx, by: string, gated: boolean): string {
  if (by === 'hermes') {
    if (gated) throw new Error('This action needs a committee member, not Hermes. Pass --by <member>.');
    return 'Hermes';
  }
  const { home, committeeBootstrapTelegram: telegram, committeeBootstrapGithub: github } = ctx.cfg;
  const member = readCommittee(home, { telegram, github }).find((item) => [item.telegram, item.github, item.name].includes(by));
  if (member === undefined) throw new Error(`${by} is no committee member, and only hermes may act without being one.`);
  return member.name ?? member.github ?? member.telegram;
}

export function isGated(ctx: Ctx, command: ControlCommand): boolean {
  if (command.action === 'ship' || command.action === 'remove' || command.action === 'adopt') return true;
  if (!approves(command)) return false;
  const { approvedResolving, pendingApprovals } = readState(ctx.statePath);
  const key = String(command.issue);
  return !(key in approvedResolving) && !(key in pendingApprovals);
}

function approves(command: ControlCommand): command is Extract<ControlCommand, { action: 'merge' | 'move' }> {
  return command.action === 'merge' || (command.action === 'move' && APPROVES.includes(command.to));
}

type Handlers = { [A in ControlAction['action']]: (ctx: Ctx, command: Extract<ControlCommand, { action: A }>, by: string) => Promise<Outcome> };

const HANDLERS: Handlers = {
  move, merge, ship, playtest, remove, drop,
  hold: async (ctx, command, by) => ({ issue: command.issue, text: await holdCard(ctx, command.issue, by, command.reason) }),
  unhold: async (ctx, command) => ({ issue: command.issue, text: releaseHold(ctx, command.issue) }),
  adopt,
};

export async function applyControl(ctx: Ctx, command: ControlCommand): Promise<string> {
  const by = resolveActor(ctx, command.by, isGated(ctx, command));
  const handler = HANDLERS[command.action] as (ctx: Ctx, command: ControlCommand, by: string) => Promise<Outcome>;
  const { issue, text } = await handler(ctx, command, by);
  if (issue !== null) await ctx.github.comment(issue, `${text}\n\nOrdered by ${by}. Reason: ${command.reason}`);
  appendLedger(ctx.cfg.home, { kind: 'control', action: command.action, issue, by, reason: command.reason, at: ctx.now().toISOString() });
  return text;
}

const COLUMN: Record<MoveTarget, Column> = { triage: 'Triage', design: 'Design', implement: 'Implementation', verify: 'Testing', approval: 'Testing', harden: 'Hardening', merging: 'Merging', done: 'Done' };
const DROPS_APPROVAL: MoveTarget[] = ['triage', 'design', 'implement', 'verify', 'approval', 'done'];
const APPROVES: MoveTarget[] = ['harden', 'merging'];

function isApproved(state: FactoryState, card: Card): boolean {
  return String(card.issue) in state.approvedResolving || isCleanupTask(card.labels);
}

async function requireCard(ctx: Ctx, issue: number): Promise<Card> {
  const found = await ctx.github.card(issue);
  if (found === null) throw new Error(`Issue #${issue} is not on the board.`);
  return found;
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
}

function cardPosts(state: FactoryState, issue: number): string[] {
  return Object.entries(state.approvalPosts).filter(([, number]) => number === issue).map(([id]) => id);
}

function requireLeavable(ctx: Ctx, card: Card): void {
  const { issue } = card;
  const state = readState(ctx.statePath);
  if (isMerging(state, card)) throw new Error(`Issue #${issue} is merging now. Repeat the order after the merge.`);
  const missing = cardPosts(state, issue).find((id) => state.postCaptions[id] === undefined);
  if (missing !== undefined) throw new Error(`No caption is recorded for post ${missing}`);
}

async function editPost(ctx: Ctx, issue: number, id: string, text: string, isText: boolean): Promise<void> {
  try {
    if (isText) await ctx.telegram.editText(ctx.cfg.committeeChat, Number(id), text);
    else await ctx.telegram.editCaption(ctx.cfg.committeeChat, Number(id), text);
  } catch (error) {
    await reportFailure(ctx, 'control', issue, `post ${id} is closed, but its edit to the new status failed: ${error instanceof Error ? error.message : String(error)}`, null, []);
  }
}

async function closePosts(ctx: Ctx, issue: number, status: string): Promise<void> {
  const before = readState(ctx.statePath);
  for (const id of cardPosts(before, issue)) {
    const next = withStatus(before.postCaptions[id], status);
    updateState(ctx.statePath, (state) => ({ ...state, postCaptions: { ...state.postCaptions, [id]: next }, approvalPosts: omitKey(state.approvalPosts, id) }));
    dropReplyMedia(ctx.cfg.home, [Number(id)]);
    await editPost(ctx, issue, id, next, before.textPosts.includes(id));
  }
}

async function stopJobs(ctx: Ctx, issue: number): Promise<void> {
  const jobs = readState(ctx.statePath).jobs.filter((job) => job.issue === issue && CARD_JOBS.includes(job.stage));
  for (const job of jobs) {
    await killJob(ctx.run, job.pid, job.id);
    recordJob(ctx.cfg.home, ctx.cfg.tokenPrices, ctx.now(), job, 'stopped');
  }
  updateState(ctx.statePath, (state) => ({ ...state, jobs: state.jobs.filter((job) => !jobs.some((stopped) => stopped.id === job.id)) }));
}

function clearCardState(state: FactoryState, issue: number, dropsApproval: boolean): FactoryState {
  const key = String(issue);
  return {
    ...state,
    postOnly: state.postOnly.filter((number) => number !== issue),
    asked: omitKey(state.asked, key),
    interrupted: state.interrupted.filter((number) => number !== issue),
    pendingApprovals: omitKey(state.pendingApprovals, key),
    approvedResolving: dropsApproval ? omitKey(state.approvedResolving, key) : state.approvedResolving,
    unroutedReplies: Object.fromEntries(Object.entries(state.unroutedReplies).filter(([, reply]) => reply.issue !== issue)),
    failures: withoutFailuresOf(state.failures, issue),
  };
}

async function clearFlags(ctx: Ctx, card: Card): Promise<void> {
  for (const label of [STUCK_LABEL, NEEDS_INFO_LABEL, VOTING_LABEL]) if (card.labels.includes(label)) await ctx.github.removeLabel(card.issue, label);
  if (card.labels.includes(VOTING_LABEL)) await closeProposal(ctx, card.issue);
}

async function closeProposal(ctx: Ctx, issue: number): Promise<void> {
  const store = openStore(ctx.cfg.home);
  try {
    await closeByHand(ctx, store, issue);
  } finally {
    store.close();
  }
}

async function requireBranch(ctx: Ctx, issue: number): Promise<void> {
  await ctx.repo.fetch();
  try {
    await ctx.repo.headHash(BRANCH(issue));
  } catch (error) {
    throw new Error(`Issue #${issue} has no branch ${BRANCH(issue)} on GitHub (${(error as Error).message}); move it to design, which creates the branch.`);
  }
}

async function requireTaskFile(ctx: Ctx, issue: number): Promise<void> {
  const path = join(agentHome(workDir(ctx, issue), GAME_DIR), TASK_FILE(issue));
  if (!existsSync(path)) throw new Error(`Issue #${issue} has no task file ${path}; move it to design, which writes the task.`);
}

type Need = (ctx: Ctx, issue: number) => Promise<void>;
const NEEDS: Partial<Record<MoveTarget, Need[]>> = {
  implement: [requireTaskFile],
  verify: [requireBranch],
  approval: [requireBranch],
  harden: [requireBranch],
  merging: [requireBranch],
};

async function requireWorkCard(ctx: Ctx, issue: number): Promise<Card> {
  const found = await requireCard(ctx, issue);
  if (found.labels.includes(RELEASE_LABEL)) throw new Error(`Issue #${issue} is the release tracking card. The release flow owns it.`);
  return found;
}

type Relocation = { column: Column; step: CardStep; status: string; dropsApproval: boolean; enter: (state: FactoryState) => FactoryState };

async function relocate(ctx: Ctx, card: Card, needs: Need[], plan: Relocation): Promise<void> {
  const { issue } = card;
  requireLeavable(ctx, card);
  for (const need of needs) await need(ctx, issue);
  await stopJobs(ctx, issue);
  await moveCard(ctx, issue, plan.column, plan.step);
  updateState(ctx.statePath, (state) => plan.enter(clearCardState(state, issue, plan.dropsApproval)));
  clearSessions(ctx.cfg.home, issue);
  await closePosts(ctx, issue, plan.status);
  await clearFlags(ctx, card);
}

async function hardenFirst(ctx: Ctx, card: Card): Promise<boolean> {
  await requireBranch(ctx, card.issue);
  return !(await ownWorkSettled(ctx, card.issue, baseBranchFor(ctx, card.labels)));
}

const HARDEN_FIRST = 'Its head has no green full suite, so it goes to Hardening first. Hardening runs the suite and then moves it to Merging.';

async function move(ctx: Ctx, command: Extract<ControlCommand, { action: 'move' }>, by: string): Promise<Outcome> {
  const { issue } = command;
  const card = await requireWorkCard(ctx, issue);
  if (command.to === 'merging' && await hardenFirst(ctx, card)) {
    const moved = await moveTo(ctx, card, 'harden', command.reason, by);
    return { ...moved, text: `Moved to harden. ${HARDEN_FIRST}` };
  }
  return moveTo(ctx, card, command.to, command.reason, by);
}

async function moveTo(ctx: Ctx, card: Card, to: MoveTarget, reason: string, by: string): Promise<Outcome> {
  const { issue } = card;
  const key = String(issue);
  await relocate(ctx, card, NEEDS[to] ?? [], {
    column: COLUMN[to],
    step: to === 'done' ? 'dropped' : 'moved',
    status: `↪️ Moved to ${to} by ${by}: ${reason}`,
    dropsApproval: DROPS_APPROVAL.includes(to),
    enter: (state) => {
      const posted = to === 'approval' ? { ...state, postOnly: [...state.postOnly, issue] } : state;
      const kept = { ...posted, held: keptHold(posted.held, key, to) };
      return APPROVES.includes(to) && !isApproved(kept, card) ? { ...kept, approvedResolving: { ...kept.approvedResolving, [key]: by } } : kept;
    },
  });
  if (to === 'done') await closeCard(ctx, issue, `Dropped by ${by}: ${reason}`, 'dropped');
  else if (to !== 'verify') await invalidateApproval(ctx, issue, `${by} moved the card to ${to}: ${reason}`);
  return { issue, text: `Moved to ${to}.` };
}

function keptHold(held: FactoryState['held'], key: string, to: MoveTarget): FactoryState['held'] {
  if (!(key in held)) return held;
  return to === 'done' ? omitKey(held, key) : { ...held, [key]: { ...held[key], stage: null } };
}

async function merge(ctx: Ctx, command: Extract<ControlCommand, { action: 'merge' }>, by: string): Promise<Outcome> {
  const { issue } = command;
  const card = await requireWorkCard(ctx, issue);
  if (await hardenFirst(ctx, card)) {
    const moved = await moveTo(ctx, card, 'harden', command.reason, by);
    return { ...moved, text: `Moved to harden. ${HARDEN_FIRST}` };
  }
  const key = String(issue);
  await relocate(ctx, card, [requireBranch], {
    column: 'Merging',
    step: 'merge-ordered',
    status: `↪️ Merge ordered by ${by}: ${command.reason}`,
    dropsApproval: false,
    enter: (state) => ({ ...state, approvedResolving: { ...state.approvedResolving, [key]: by } }),
  });
  await invalidateApproval(ctx, issue, `${by} sent the card to the merge queue: ${command.reason}`);
  return { issue, text: 'The card joins the merge queue.' };
}

export function queueShip(ctx: Ctx, issue: number, by: string, postId: number | null = null): string {
  const release = requireRelease(ctx);
  if (release.issue !== issue) throw new Error(`Issue #${issue} is not the open release, #${release.issue} is.`);
  if (release.postId === null) throw new Error('The release has no current candidate post yet. Wait for the next one.');
  if (postId !== null && postId !== release.postId) throw new Error(`That candidate post is no longer current, since a newer candidate replaced it. Only the newest post, ${release.postId}, can ship.`);
  updateState(ctx.statePath, (state) => ({ ...state, pendingShip: by }));
  return `Ship of release ${release.day} is queued. The merge into main starts on a coming tick.`;
}

export function queueRemoval(ctx: Ctx, issue: number, by: string, text: string, finishRemoved = false): string {
  const release = requireRelease(ctx);
  if (release.removed.includes(issue) && !finishRemoved) throw new Error(`Issue #${issue} is already removed from release ${release.day}.`);
  if (mergeOf(readState(ctx.statePath).devMerges, issue) === undefined) throw new Error(`Issue #${issue} has no merge on dev, so no release holds it.`);
  if (readState(ctx.statePath).pendingRemovals.some((item) => item.issue === issue)) throw new Error(`A removal of #${issue} is already queued.`);
  updateState(ctx.statePath, (state) => ({ ...state, pendingRemovals: [...state.pendingRemovals, { issue, by, text }] }));
  return `Removal of #${issue} from dev is queued. The revert starts on a coming tick.`;
}

async function ship(ctx: Ctx, _command: Extract<ControlCommand, { action: 'ship' }>, by: string): Promise<Outcome> {
  const { issue } = requireRelease(ctx);
  return { issue, text: queueShip(ctx, issue, by) };
}

async function remove(ctx: Ctx, command: Extract<ControlCommand, { action: 'remove' }>, by: string): Promise<Outcome> {
  return { issue: command.issue, text: queueRemoval(ctx, command.issue, by, command.reason, true) };
}

async function playtest(ctx: Ctx, _command: Extract<ControlCommand, { action: 'playtest' }>, by: string): Promise<Outcome> {
  const release = requireRelease(ctx);
  updateState(ctx.statePath, (state) => ({ ...state, pendingPlaytest: by }));
  return { issue: release.issue, text: 'A release playtest on the dev tip is ordered. It starts on a coming tick.' };
}

type Drop = { has: (state: FactoryState, id: number) => boolean; without: (state: FactoryState, id: number) => FactoryState };

const DROPS: Record<DropQueue, Drop> = {
  approval: {
    has: (state, id) => String(id) in state.pendingApprovals || String(id) in state.keptApprovals,
    without: (state, id) => ({ ...state, pendingApprovals: omitKey(state.pendingApprovals, String(id)), keptApprovals: omitKey(state.keptApprovals, String(id)) }),
  },
  removal: { has: (state, id) => state.pendingRemovals.some((item) => item.issue === id), without: (state, id) => ({ ...state, pendingRemovals: state.pendingRemovals.filter((item) => item.issue !== id) }) },
  ship: { has: (state) => state.pendingShip !== null, without: (state) => ({ ...state, pendingShip: null }) },
  incident: { has: (state, id) => state.pendingIncidents.includes(id), without: (state, id) => ({ ...state, pendingIncidents: state.pendingIncidents.filter((item) => item !== id) }) },
};
const ISSUE_QUEUES: DropQueue[] = ['approval', 'removal', 'incident'];

function requireEntryId(queue: DropQueue, id: number | null): number {
  if (id !== null) return id;
  if (queue !== 'ship') throw new Error(`The ${queue} queue needs an id.`);
  return 0;
}

async function drop(ctx: Ctx, command: Extract<ControlCommand, { action: 'drop' }>): Promise<Outcome> {
  const { queue, id } = command;
  const entry = requireEntryId(queue, id);
  const name = `${queue} queue entry${id === null ? '' : ` ${id}`}`;
  if (!DROPS[queue].has(readState(ctx.statePath), entry)) throw new Error(`The ${name} is not there.`);
  updateState(ctx.statePath, (state) => DROPS[queue].without(state, entry));
  return { issue: ISSUE_QUEUES.includes(queue) ? id : null, text: `Dropped the ${name}.` };
}

async function adoptedHead(ctx: Ctx, branch: string): Promise<string> {
  if ([BASE_BRANCH, HOTFIX_BASE].includes(branch)) throw new Error(`${branch} is a base branch, so it cannot become a card.`);
  await ctx.repo.fetch();
  try {
    return await ctx.repo.fullHash(`origin/${branch}`);
  } catch (error) {
    throw new Error(`Branch ${branch} is not on GitHub (${(error as Error).message}). Push it first.`);
  }
}

async function adopt(ctx: Ctx, command: Extract<ControlCommand, { action: 'adopt' }>, by: string): Promise<Outcome> {
  const head = await adoptedHead(ctx, command.branch);
  const issue = await ctx.github.createIssue(command.title, command.reason, []);
  try {
    await ctx.repo.push(head, BRANCH(issue));
  } catch (error) {
    await ctx.github.close(issue, 'not planned');
    throw error;
  }
  updateState(ctx.statePath, (state) => ({ ...state, approvedResolving: { ...state.approvedResolving, [String(issue)]: by } }));
  await addCard(ctx, issue, 'Hardening', ctx.now().toISOString());
  return { issue, text: `Adopted branch ${command.branch} as ${BRANCH(issue)}. The card is in Hardening, which runs the full suite and then merges it.` };
}
