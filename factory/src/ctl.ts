import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { readLedger } from './ledger';
import { DROP_QUEUES, isGated, resolveActor, writeControl, type ControlAction, type DropQueue } from './control';
import { pauseFile, readPause, writePause, type PauseRecord } from './pause';
import { publicRows } from './public/overview';
import { openStore } from './public/store';
import { repairClone } from './repair-clone';
import { clearStuck } from './stuck';
import { MOVE_TARGETS, causeText, cardDrift, cardPosition, holdDrift, releaseDrift, runningJobs, stuckText, type MoveTarget } from './position';
import { resetSpend } from './landing-work';
import { readState, updateState } from './state';
import { editState } from './state-edit';
import { STUCK_LABEL, type Card, type Ctx, type FactoryState, type Hold, type IssueMerge, type KeptApproval, type LandingWork, type PlaytestState, type ReleasePost, type ReleaseState } from './types';

const SNAPSHOT_AGENT = 'curl/8.0';
const LOG_TAIL_LINES = 50;

type Handler = (ctx: Ctx, args: string[]) => Promise<void> | void;
type Builder = (args: string[]) => ControlAction;

const READ: Record<string, { usage: string; help: string; run: Handler }> = {
  status: { usage: 'status', help: 'print the factory snapshot the dashboard shows', run: status },
  cards: { usage: 'cards', help: 'list every open card with its position and labels', run: cards },
  card: { usage: 'card N', help: 'print one card across every store, and each store that disagrees', run: card },
  jobs: { usage: 'jobs', help: 'list the running jobs', run: jobs },
  queues: { usage: 'queues', help: 'list the pending queues', run: queues },
  release: { usage: 'release', help: 'print the open release', run: release },
  failures: { usage: 'failures', help: 'list the recent failed jobs', run: failures },
  stuck: { usage: 'stuck', help: "list the stuck sweep's record of each stuck card: its kind, incident, cause and what the sweep did", run: stuckRecords },
  log: { usage: 'log N [stage]', help: 'print the tail of the newest log of a card', run: log },
  audit: { usage: 'audit', help: 'print each drift between stores, and nothing when all agree', run: audit },
  public: { usage: 'public', help: 'list the proposals with their votes and posted time, the open build posts and the latest player chat messages with their outcome', run: publicState },
  help: { usage: 'help', help: 'list the commands', run: help },
};

const IMMEDIATE: Record<string, { usage: string; help: string; run: Handler }> = {
  retry: { usage: 'retry N --by <who> ["decision"]', help: 'remove the stuck label and the failures of a card. A kept merge or ship work that holds the card starts a new fix budget. On the release tracking card it also lifts a playtest block, so a new playtest job runs, and records the decision, which only the next playtest job reads', run: retry },
  pause: { usage: 'pause <reason> [--pid N] [--by who]', help: 'pause the factory. --pid ties the pause to a process, and the tick lifts it when that process ends. --by or --pid makes a member pause, which resume refuses', run: pause },
  resume: { usage: 'resume', help: 'remove the pause', run: resume },
  'set-state': { usage: 'set-state <path> <json>|--delete --by <who> --reason <why>', help: 'set or delete one value of the state file under its lock, like release.postId null, while every job keeps running. Prints the old and the new value', run: setStateCommand },
  'repair-clone': { usage: 'repair-clone N --by <who> --reason <why> [--backup-merge]', help: "replace a card's broken work clone with a fresh clone of its GitHub branch. Needs no running job of the card, and holds the card while it works. The old clone moves whole to $FACTORY_HOME/clone-backups, and only its .factory, .factory-tasks and .factory-media folders are copied over. --backup-merge also takes a clone with an open merge or conflicts. A repair that works also removes the stuck label and the failures of the card, like retry", run: repairCloneCommand },
};

const WRITE: Record<string, { usage: string; help: string; build: Builder }> = {
  move: { usage: 'move N <to>', help: `put a card in one of ${MOVE_TARGETS.join(', ')}`, build: ([n, to]) => ({ action: 'move', issue: number(n), to: target(to) }) },
  merge: { usage: 'merge N', help: 'put a card in the merge queue, past its post and hardening', build: ([n]) => ({ action: 'merge', issue: number(n) }) },
  ship: { usage: 'ship', help: 'ship the open release now', build: () => ({ action: 'ship' }) },
  playtest: { usage: 'playtest', help: 'order a release playtest on the dev tip now, also when dev has not moved or the last playtest started recently', build: () => ({ action: 'playtest' }) },
  remove: { usage: 'remove N', help: 'take a feature out of dev and the release: its merge on dev is reverted, the candidate is dropped and the card returns to design', build: ([n]) => ({ action: 'remove', issue: number(n) }) },
  drop: { usage: `drop <${DROP_QUEUES.join('|')}> <id>`, help: 'drop one queued entry', build: ([queue, id]) => dropAction(queue, id) },
  'pause-card': { usage: 'pause-card N', help: "hold a card: stop its job, keep its work clone and agent sessions, and start no job on it until resume-card", build: ([n]) => ({ action: 'hold', issue: number(n) }) },
  adopt: { usage: 'adopt <branch> <title>', help: 'bring a branch that is on GitHub in as a new card in Hardening: open an issue with the reason as its body, push the branch as its factory branch and set its board status. Needs a member in --by. Hardening then runs the full suite and merges the card', build: ([branch, ...title]) => adoptAction(branch, title) },
  'resume-card': { usage: 'resume-card N', help: 'lift the hold of a card, so its stage continues in the stopped sessions', build: ([n]) => ({ action: 'unhold', issue: number(n) }) },
};

export async function runCtl(ctx: Ctx, args: string[]): Promise<void> {
  const [command = '', ...rest] = args;
  if (Object.hasOwn(READ, command)) return READ[command].run(ctx, rest);
  if (Object.hasOwn(IMMEDIATE, command)) return IMMEDIATE[command].run(ctx, rest);
  if (Object.hasOwn(WRITE, command)) return writeCommand(ctx, command, rest);
  throw new Error(`Unknown command "${command}". Run "factory help" for the commands.`);
}

function help(): void {
  const rows = [
    ...Object.values(READ).map((row) => [row.usage, row.help]),
    ...Object.values(WRITE).map((row) => [`${row.usage} --by <who> --reason <why>`, `${row.help}. Applies on the next tick.`]),
    ...Object.values(IMMEDIATE).map((row) => [row.usage, row.help]),
  ];
  for (const [usage, text] of rows) console.log(`${usage}: ${text}`);
}

function number(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`"${value}" is not an issue number or id.`);
  return n;
}

function target(value: string | undefined): MoveTarget {
  if (!MOVE_TARGETS.includes(value as MoveTarget)) throw new Error(`Unknown position "${value}". Use one of ${MOVE_TARGETS.join(', ')}.`);
  return value as MoveTarget;
}

function dropAction(queue: string | undefined, id: string | undefined): ControlAction {
  if (!DROP_QUEUES.includes(queue as DropQueue)) throw new Error(`Unknown queue "${queue}". Use one of ${DROP_QUEUES.join(', ')}.`);
  return { action: 'drop', queue: queue as DropQueue, id: queue === 'ship' && id === undefined ? null : number(id) };
}

function adoptAction(branch: string | undefined, title: string[]): ControlAction {
  const text = title.join(' ').trim();
  if (branch === undefined || text === '') throw new Error(`adopt needs a branch and a title. Usage: ${WRITE.adopt.usage}`);
  return { action: 'adopt', branch, title: text };
}

function takeFlag(args: string[], name: string): { value: string; rest: string[] } {
  const at = args.indexOf(name);
  const value = args[at + 1];
  if (at < 0 || value === undefined || value.startsWith('--')) throw new Error(`Missing ${name}. Every write command needs --by and --reason.`);
  return { value, rest: args.filter((_, i) => i !== at && i !== at + 1) };
}

function writeCommand(ctx: Ctx, name: string, args: string[]): void {
  const by = takeFlag(args, '--by');
  const reason = takeFlag(by.rest, '--reason');
  const command = { ...WRITE[name].build(reason.rest), by: by.value, reason: reason.value };
  resolveActor(ctx, command.by, isGated(ctx, command));
  const path = writeControl(ctx.cfg.home, command, ctx.now());
  console.log(`Wrote ${path}. It applies on the next tick.`);
  const paused = readPause(ctx.cfg.home);
  if (paused !== null) console.log(`The factory is paused: ${paused.note}. The order applies when the pause is lifted.`);
}

async function repairCloneCommand(ctx: Ctx, args: string[]): Promise<void> {
  const by = takeFlag(args, '--by');
  const reason = takeFlag(by.rest, '--reason');
  const backupMerge = reason.rest.includes('--backup-merge');
  const [n, ...extra] = reason.rest.filter((arg) => arg !== '--backup-merge');
  if (extra.length > 0) throw new Error(`Unexpected "${extra.join(' ')}". Usage: ${IMMEDIATE['repair-clone'].usage}`);
  const actor = resolveActor(ctx, by.value, false);
  for (const line of await repairClone(ctx, { issue: number(n), by: actor, reason: reason.value, backupMerge, refuseUnpushed: false })) console.log(line);
}

function setStateCommand(ctx: Ctx, args: string[]): void {
  const by = takeFlag(args, '--by');
  const reason = takeFlag(by.rest, '--reason');
  const remove = reason.rest.includes('--delete');
  const [path, json, ...extra] = reason.rest.filter((arg) => arg !== '--delete');
  if (path === undefined || (json === undefined) !== remove || extra.length > 0) throw new Error(`Usage: ${IMMEDIATE['set-state'].usage}`);
  const actor = resolveActor(ctx, by.value, false);
  const { before, after } = editState(ctx.statePath, path, remove ? null : json);
  ctx.log('tick', null, `${actor} set ${path} from ${JSON.stringify(before)} to ${JSON.stringify(after)}: ${reason.value}`);
  console.log(`${path}: ${JSON.stringify(before)} -> ${after === undefined ? 'deleted' : JSON.stringify(after)}`);
}

async function status(ctx: Ctx): Promise<void> {
  const url = `${ctx.cfg.publicUrl}/factory/api/snapshot`;
  const response = await (ctx.fetch ?? fetch)(url, { headers: { Accept: 'application/json', 'User-Agent': SNAPSHOT_AGENT } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  const held = Object.entries(readState(ctx.statePath).held).map(([issue, hold]) => ({ issue: Number(issue), ...hold }));
  console.log(JSON.stringify({ ...((await response.json()) as object), held }, null, 2));
}

async function cards(ctx: Ctx): Promise<void> {
  const state = readState(ctx.statePath);
  for (const card of await ctx.github.cards()) {
    const hold = state.held[String(card.issue)];
    console.log(`#${card.issue} ${cardPosition(card, state)} ${card.column} [${card.labels.join(', ')}]${hold === undefined ? '' : ` held by ${hold.by}: ${hold.reason}`}`);
  }
}

async function findCard(ctx: Ctx, value: string | undefined): Promise<Card> {
  const issue = number(value);
  const card = await ctx.github.card(issue);
  if (card === null) throw new Error(`No card for #${issue} on the board.`);
  return card;
}

async function card(ctx: Ctx, args: string[]): Promise<void> {
  const found = await findCard(ctx, args[0]);
  const state = readState(ctx.statePath);
  for (const line of [...cardFacts(found, state), ...cardDrift(found, state).map((row) => `drift: ${row}`), ...jobNote(found, state)]) console.log(line);
}

function jobNote(found: Card, state: FactoryState): string[] {
  const stages = runningJobs(found, state).map((job) => job.stage);
  return stages.length === 0 ? [] : [`note: a ${stages.join(', ')} job is running, so the drift above may pass in seconds`];
}

const shown = (value: string | undefined): string => (value === undefined || value === '' ? 'none' : value);

function cardFacts(found: Card, state: FactoryState): string[] {
  const key = String(found.issue);
  const posts = Object.entries(state.approvalPosts).filter(([, issue]) => issue === found.issue).map(([id]) => id);
  const running = state.jobs.filter((job) => job.issue === found.issue).map((job) => `${job.stage} since ${job.startedAt}`);
  const own = state.failures.filter((failure) => failure.issue === found.issue).map((failure) => `${failure.stage}: ${failure.error.split('\n')[0]}`);
  return [
    `position: ${cardPosition(found, state)}`,
    `column: ${found.column}`,
    `labels: ${shown(found.labels.join(', '))}`,
    `post only: ${state.postOnly.includes(found.issue) ? 'yes' : 'no'}`,
    `questions asked: ${shown(state.asked[key])}`,
    `questions posts: ${shown(Object.entries(state.questionPosts).filter(([, issue]) => issue === found.issue).map(([id]) => id).join(', '))}`,
    `pending feedback from: ${shown(state.pendingFeedback[key]?.source)}`,
    `approvedResolving: ${shown(state.approvedResolving[key])}`,
    `queued approval: ${shown(state.pendingApprovals[key])}`,
    `kept approval: ${keptText(state.keptApprovals[key])}`,
    `open posts: ${shown(posts.join(', '))}`,
    `build: ${shown(state.builds[key])}`,
    `suite passed on base failures only: ${shown(state.suiteCleared[key])}`,
    `running job: ${shown(running.join(', '))}`,
    `failures: ${shown(own.join(' | '))}`,
    `held: ${holdText(state.held[key])}`,
    `stuck sweep: ${stuckText(state.stuck[key])}`,
  ];
}

function keptText(kept: KeptApproval | undefined): string {
  if (kept === undefined) return 'none';
  return `by ${kept.by} at ${kept.at} of build ${kept.build}, checked ${kept.checked.join(', ') || 'none yet'}${kept.reason === null ? '' : `, last: ${kept.reason}`}`;
}

function holdText(hold: Hold | undefined): string {
  if (hold === undefined) return 'none';
  return `by ${hold.by} since ${hold.at}, ${hold.stage === null ? 'no job stopped' : `stopped ${hold.stage}`}: ${hold.reason}`;
}

function printRows(rows: string[]): void {
  console.log(rows.length === 0 ? 'none' : rows.join('\n'));
}

function publicState(ctx: Ctx): void {
  const store = openStore(ctx.cfg.home);
  try {
    printRows(publicRows(ctx, store));
  } finally {
    store.close();
  }
}

function jobs(ctx: Ctx): void {
  printRows(readState(ctx.statePath).jobs.map((job) => `${job.stage} ${job.issue === null ? '-' : `#${job.issue}`} pid ${job.pid} since ${job.startedAt} log ${job.log}${job.batch === undefined ? '' : ` batch ${job.batch.map((issue) => `#${issue}`).join(',')}`}`));
}

function queues(ctx: Ctx): void {
  const state = readState(ctx.statePath);
  const approvals = Object.entries(state.pendingApprovals).map(([issue, by]) => `#${issue} by ${by}`);
  const removals = state.pendingRemovals.map((row) => `#${row.issue} by ${row.by}`);
  console.log(`approval: ${listOrNone(approvals)}`);
  console.log(`removal: ${listOrNone(removals)}`);
  console.log(`ship: ${state.pendingShip ?? 'none'}`);
  console.log(`playtest: ${state.pendingPlaytest ?? 'none'}`);
  console.log(`incident: ${listOrNone(state.pendingIncidents.map((issue) => `#${issue}`))}`);
  console.log(`caught up: ${listOrNone(Object.entries(state.caughtUpTo).map(([issue, head]) => `#${issue} at ${head}`))}`);
  console.log(`answer: ${listOrNone(state.pendingAnswers.map((id) => `player comment ${id}`))}`);
  console.log(`kept landing: ${listOrNone(Object.entries(state.landings).map(([stage, work]) => keptLanding(stage, work)))}`);
}

function keptLanding(stage: string, work: LandingWork): string {
  return `${stage} of ${work.cards.map((issue) => `#${issue}`).join(' ')} into ${work.into} since ${work.since}, session ${work.session}, $${work.spentUsd.toFixed(2)} of fix rounds spent${work.merged ? '' : ', merge unfinished'}`;
}

function listOrNone(rows: string[]): string {
  return rows.length === 0 ? 'none' : rows.join(', ');
}

function formatMerges(merges: IssueMerge[]): string {
  return merges.map((merge) => `#${merge.issue} ${merge.sha.slice(0, 7)}${merge.reverted.length ? ` reverted on ${merge.reverted.join(', ')}` : ''}`).join(', ') || 'none';
}

function release(ctx: Ctx): void {
  const state = readState(ctx.statePath);
  console.log(`last release: ${state.lastRelease ?? 'none'}`);
  console.log(`playtest ordered: ${state.pendingPlaytest ?? 'none'}`);
  console.log(`public post: ${publicPost(state.releasePost)}`);
  console.log(`merged into dev, not yet shipped: ${formatMerges(state.devMerges)}`);
  if (state.release === null) return console.log('open release: none');
  console.log(`open release: #${state.release.issue} opened ${state.release.day}`);
  console.log(`candidate post: ${candidatePost(state.release)}`);
  console.log(`removed: ${state.release.removed.map((issue) => `#${issue}`).join(', ') || 'none'}`);
  console.log(`playtest fixes to land on dev: ${state.release.playtest.fixes ?? 'none'}`);
  for (const line of playtestLines(state.release.playtest, ctx.cfg.playtestRuns)) console.log(line);
}

function publicPost(post: ReleasePost | null): string {
  if (post === null) return 'none due';
  if (post.postId === null) return `release ${post.day} waits for Hermes's draft`;
  return `release ${post.day} draft ${post.postId} waits for Publish`;
}

function candidatePost(release: ReleaseState): string {
  if (release.postId === null) return 'none';
  return `${release.postId} of ${release.candidate?.sha ?? 'no commit'} with ${formatMerges(release.candidate?.features ?? [])}`;
}

function playtestLines(playtest: PlaytestState, runs: number): string[] {
  const lines = [`playtest: seed ${playtest.seed}, ${playtest.runs} plays, at most ${runs} per job, passed ${passedText(playtest)}, last start ${playtest.lastStart?.sha ?? 'none'}`];
  return [...lines, ...keptPlaytestLines(playtest)];
}

function passedText(playtest: PlaytestState): string {
  if (playtest.passed === null) return 'none';
  return `${playtest.passed.sha} with ${formatMerges(playtest.passed.features)}`;
}

function keptPlaytestLines(playtest: PlaytestState): string[] {
  const lines: string[] = [];
  if (playtest.blocked) lines.push(`playtest blocked at ${playtest.blocked.sha}: ${playtest.blocked.reason}`);
  if (playtest.work) lines.push(`playtest work kept from ${playtest.work.start}: ${playtest.work.plays} plays spent, ${playtest.work.features.length} features`);
  if (playtest.fixes) lines.push(`playtest fixes ${playtest.fixes} wait on factory/playtest-fixes for the merge job`);
  if (playtest.decision) lines.push(`playtest decision from ${playtest.decision.by} at ${playtest.decision.at}: ${playtest.decision.text}`);
  return lines;
}

function failures(ctx: Ctx): void {
  printRows(readState(ctx.statePath).failures.map((row) => `${row.at} ${row.stage}${row.issue === null ? '' : ` #${row.issue}`}: ${row.error.split('\n')[0]} (cause ${causeText(row.cause)}, log ${row.log ?? 'none'})${issueList(' batch', row.batch)}${issueList(' cleared', row.cleared)}${row.control === undefined ? '' : ` rejected ${row.control.action}`}`));
}

function issueList(name: string, issues: number[] | undefined): string {
  return issues === undefined ? '' : `${name} ${issues.map((issue) => `#${issue}`).join(',')}`;
}

function stuckRecords(ctx: Ctx): void {
  const state = readState(ctx.statePath);
  if (state.sweepError !== null) console.log(`sweep error: ${state.sweepError.split('\n')[0]}`);
  printRows(Object.entries(state.stuck).map(([issue, record]) => `#${issue} ${stuckText(record)}`));
}

type LogRecord = { at: string; log: string };

function logRecords(ctx: Ctx, issue: number, stage: string | null): LogRecord[] {
  const state = readState(ctx.statePath);
  const matches = (row: { issue: number | null; stage: string }): boolean => row.issue === issue && (stage === null || row.stage === stage);
  const running = state.jobs.filter(matches).map((job) => ({ at: job.startedAt, log: job.log }));
  const failed = state.failures.filter(matches).flatMap((row) => (row.log === null ? [] : [{ at: row.at, log: row.log }]));
  const finished = readLedger(ctx.cfg.home, new Date(0)).flatMap((line) => (line.kind === 'job' && matches(line) && line.log !== undefined ? [{ at: line.endedAt, log: line.log }] : []));
  return [...running, ...failed, ...finished];
}

function newestLog(ctx: Ctx, issue: number, stage: string | null): string {
  const records = logRecords(ctx, issue, stage).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (records.length === 0) throw new Error(`No log for #${issue}${stage === null ? '' : ` stage ${stage}`} in the state or the ledger.`);
  if (!existsSync(records[0].log)) throw new Error(`The newest log of #${issue} is ${records[0].log}, and the file is gone.`);
  return records[0].log;
}

function log(ctx: Ctx, args: string[]): void {
  const path = newestLog(ctx, number(args[0]), args[1] ?? null);
  console.log(`# ${path}`);
  console.log(readFileSync(path, 'utf8').split('\n').slice(-LOG_TAIL_LINES).join('\n'));
}

async function audit(ctx: Ctx): Promise<void> {
  const state = readState(ctx.statePath);
  const board = await ctx.github.cards();
  for (const line of [...board.filter((row) => runningJobs(row, state).length === 0).flatMap((row) => cardDrift(row, state)), ...releaseDrift(state, board), ...holdDrift(state, board)]) console.log(line);
}

async function retry(ctx: Ctx, args: string[]): Promise<void> {
  const by = takeFlag(args, '--by');
  const [first, ...given] = by.rest;
  const issue = number(first);
  const text = retryDecision(given);
  const actor = resolveActor(ctx, by.value, false);
  await clearStuck(ctx, issue);
  console.log(`Removed ${STUCK_LABEL} and the failures of #${issue}. The next tick continues the card.`);
  for (const stage of resetSpend(ctx, issue)) console.log(`The kept ${stage} work of #${issue} starts a new fix budget.`);
  if (readState(ctx.statePath).release?.issue === issue) console.log(await retryPlaytest(ctx, issue, { by: actor, text }));
}

function retryDecision(given: string[]): string {
  if (given.length > 1) throw new Error(`Give the decision as one quoted argument, after the flags. Usage: ${IMMEDIATE.retry.usage}`);
  const text = (given[0] ?? '').trim();
  if (/(^|\s)--[a-z]/i.test(text)) throw new Error(`The decision "${text}" holds a command flag. Put every flag before the decision. Usage: ${IMMEDIATE.retry.usage}`);
  return text;
}

async function retryPlaytest(ctx: Ctx, issue: number, decision: { by: string; text: string }): Promise<string> {
  const recorded = decision.text === '' ? null : { by: decision.by, at: ctx.now().toISOString(), text: decision.text };
  updateState(ctx.statePath, (state: FactoryState) => {
    if (state.release === null) return state;
    const playtest = state.release.playtest;
    return { ...state, pendingPlaytest: decision.by, release: { ...state.release, playtest: { ...playtest, blocked: null, decision: recorded ?? playtest.decision } } };
  });
  if (recorded !== null) await ctx.github.comment(issue, `Playtest decision from ${recorded.by}: ${recorded.text}`);
  return `Lifted the playtest block of the release. A new playtest job plays up to ${ctx.cfg.playtestRuns} times${recorded === null ? '' : ' and reads the decision'}.`;
}

function takeOptionalFlag(args: string[], name: string): { value: string | null; rest: string[] } {
  if (!args.includes(name)) return { value: null, rest: args };
  return takeFlag(args, name);
}

function pauseRecord(ctx: Ctx, note: string, pid: string | null, by: string | null): PauseRecord {
  const at = ctx.now().toISOString();
  if (pid === null && by === null) return { kind: 'factory', note, by: 'cli', at };
  const actor = resolveActor(ctx, by ?? 'hermes', false);
  return pid === null ? { kind: 'member', note, by: actor, at } : { kind: 'member', note, by: actor, at, pid: number(pid) };
}

function pause(ctx: Ctx, args: string[]): void {
  const pid = takeOptionalFlag(args, '--pid');
  const by = takeOptionalFlag(pid.rest, '--by');
  const note = by.rest.join(' ').trim();
  if (note === '') throw new Error('pause needs a reason.');
  const record = pauseRecord(ctx, note, pid.value, by.value);
  mkdirSync(ctx.cfg.home, { recursive: true });
  writePause(ctx.cfg.home, record);
  console.log(`Paused: ${note}`);
}

function resume(ctx: Ctx): void {
  const paused = readPause(ctx.cfg.home);
  if (paused?.kind === 'member') throw new Error('This pause was written by a member. Once its reason is gone, delete the pause file.');
  rmSync(pauseFile(ctx.cfg.home), { force: true });
  console.log('Resumed.');
}
