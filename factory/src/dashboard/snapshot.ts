import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ghClient } from '../github';
import { must } from '../exec';
import { readPause } from '../pause';
import { readState } from '../state';
import { toFeatures, type Feature } from '../stages/release-common';
import { LABELS, type Labels } from './labels';
import { createWorkerKey, readLiveOperations } from './live';
import { ADHOC_LABEL, QUEUE_OF, RELEASE_TASK_LABEL, STUCK_LABEL } from '../types';
import type { Card, FactoryState, GitHub, Queue, Run, RunResult } from '../types';
import { waitingMerges } from '../stages/merge';
import type { AnalyticsRunner, Analytics } from './analytics';
import type { DashboardConfig } from './config';
import type { HostSampler, HostLoad } from './host';

const runFile = promisify(execFile);
export type Source<T> = { value: T | null; at: string | null; status: 'ok' | 'stale' | 'unavailable' };
type PauseReason = 'agent-usage-limit' | 'operator';
export type Operations = ReturnType<typeof buildOperations> & { pauseReason: PauseReason | null };
export type PublicCard = { issue: number; title: string; column: string; blocked: boolean; releaseTask: boolean };
export type MergeState = 'merging' | 'next' | 'stuck' | 'held' | 'after-ship';
export type MergeQueueItem = { issue: number; title: string; state: MergeState };
export type Part<T> = { value: T; error: null } | { value: null; error: string };
export type GithubSnapshot = { cards: Part<PublicCard[]>; mergeQueue: Part<MergeQueueItem[]> };
export type Snapshot = {
  generatedAt: string; repoUrl: string; playUrl: string; channelUrl: string | null;
  operations: Source<Operations>; github: Source<GithubSnapshot>; analytics: Source<Analytics>; host: Source<HostLoad>;
  live: Source<ReturnType<typeof readLiveOperations>>;
  labels: Labels;
};
type PublicIssue = { number: number; title: string; labels: { name: string }[]; pull_request?: unknown };

function createSource<T>(): Source<T> { return { value: null, at: null, status: 'unavailable' }; }
function recordFailure<T>(source: Source<T>, name: string, error: unknown): Source<T> {
  console.error(`Dashboard ${name} unavailable:`, error);
  return { ...source, status: source.value === null ? 'unavailable' : 'stale' };
}
function recordSuccess<T>(value: T): Source<T> { return { value, at: new Date().toISOString(), status: 'ok' }; }
function expireSource<T>(source: Source<T>, budgetMs: number): Source<T> {
  if (source.at === null || source.status !== 'ok') return source;
  return Date.now() - Date.parse(source.at) > budgetMs ? { ...source, status: 'stale' } : source;
}
function getPublicIssue(stage: string, issue: number | null): number | null {
  return ['change', 'adhoc'].includes(stage) ? null : issue;
}
function readNextFeatures(state: FactoryState): Feature[] {
  if (state.release === null) return toFeatures(state.devMerges);
  const { merges, removed } = state.release;
  return toFeatures(merges.filter((merge) => !removed.includes(merge.issue)));
}
function getFactoryStatus(state: FactoryState, paused: boolean): string {
  if (paused) return 'paused';
  if (state.lastTickError !== null) return 'blocked';
  if (state.jobs.length) return 'working';
  if (state.failures.some((failure) => failure.stage !== 'catch-up')) return 'blocked';
  return 'idle';
}
export function buildOperations(state: FactoryState, paused: boolean, config: Pick<DashboardConfig, 'triageWorkers' | 'designWorkers' | 'implementWorkers' | 'verifyWorkers' | 'testWorkers' | 'publicUrl'>) {
  const jobs = state.jobs.map((job) => ({ key: createWorkerKey(job.id), stage: job.stage, issue: getPublicIssue(job.stage, job.issue), startedAt: job.startedAt, queue: QUEUE_OF[job.stage] }));
  const count = (queue: Queue, total: number) => ({ busy: jobs.filter((job) => job.queue === queue).length, total });
  const candidateUrl = state.release?.postId != null ? `${config.publicUrl}/rc/` : null;
  const release = state.release === null ? null : { issue: state.release.issue, day: state.release.day };
  return { status: getFactoryStatus(state, paused), jobs, queues: { branch: count('branch', 1), triage: count('triage', config.triageWorkers), design: count('design', config.designWorkers), implement: count('implement', config.implementWorkers), verify: count('verify', config.verifyWorkers), test: count('test', config.testWorkers) }, release, features: readNextFeatures(state), candidateUrl };
}

export class PublicGitHub {
  private readonly github: GitHub;
  constructor(private readonly config: DashboardConfig, private readonly run: Run) { this.github = ghClient(run, config); }
  private async query(args: string[]): Promise<string> { return must(await this.run('gh', args, { activity: 'git' }), 'Dashboard GitHub read'); }
  private async readIssues(): Promise<PublicIssue[]> {
    const output = await this.query(['api', `repos/${this.config.repo}/issues?state=open&per_page=100`, '--paginate', '--jq', '.[] | {number,title,labels,pull_request}']);
    return output.split('\n').filter(Boolean).map((line) => JSON.parse(line) as PublicIssue);
  }
  async read(state: FactoryState): Promise<GithubSnapshot> {
    const visibility = (await this.query(['api', `repos/${this.config.repo}`, '--jq', '.visibility'])).trim();
    if (visibility !== 'public') throw new Error('Dashboard requires a public repository');
    const [board] = await Promise.allSettled([this.readBoard()]);
    const boardPart = toPart(board, 'board');
    const cards = mapPart(boardPart, 'cards', ({ cards: raw, issues }) => selectPublicCards(raw, issues));
    const mergeQueue = mapPart(boardPart, 'merge queue', ({ cards: raw, issues }) => selectMergeQueue(state, raw, issues));
    return { cards, mergeQueue };
  }
  private async readBoard(): Promise<{ cards: Card[]; issues: PublicIssue[] }> {
    const [cards, issues] = await Promise.all([this.github.cards(), this.readIssues()]);
    return { cards, issues };
  }
}

function toPart<T>(result: PromiseSettledResult<T>, name: string): Part<T> {
  if (result.status === 'fulfilled') return { value: result.value, error: null };
  console.error(`Dashboard GitHub ${name} unavailable:`, result.reason);
  return { value: null, error: `GitHub ${name} unavailable` };
}
function mapPart<T, R>(part: Part<T>, name: string, select: (value: T) => R): Part<R> {
  if (part.error !== null) return part;
  try { return { value: select(part.value), error: null }; }
  catch (error) { return toPart<R>({ status: 'rejected', reason: error }, name); }
}
function selectPublicCards(cards: Card[], issues: PublicIssue[]): PublicCard[] {
  const byNumber = new Map(issues.filter((issue) => !issue.pull_request).map((issue) => [issue.number, issue]));
  const publicCards: PublicCard[] = [];
  for (const card of cards) {
    const issue = byNumber.get(card.issue);
    if (!issue || card.column === 'Done' || card.labels.includes(ADHOC_LABEL)) continue;
    if (issue.labels.some((label) => label.name === ADHOC_LABEL)) continue;
    publicCards.push({ issue: card.issue, title: issue.title, column: card.column, blocked: card.labels.includes(STUCK_LABEL), releaseTask: card.labels.includes(RELEASE_TASK_LABEL) });
  }
  return publicCards;
}
const MERGE_STATE_ORDER: MergeState[] = ['merging', 'next', 'stuck', 'held', 'after-ship'];
function selectMergeQueue(state: FactoryState, cards: Card[], issues: PublicIssue[]): MergeQueueItem[] {
  const shown = new Map(selectPublicCards(cards, issues).filter((card) => card.column === 'Merging').map((card) => [card.issue, card]));
  const batch = state.jobs.filter((job) => job.stage === 'merge').flatMap((job) => job.batch ?? []);
  const waiting = new Set(waitingMerges(state, cards).map((card) => card.issue));
  const shipping = state.jobs.some((job) => job.stage === 'ship');
  const tests: Record<MergeState, (card: Card) => boolean> = {
    merging: (card) => batch.includes(card.issue),
    next: (card) => waiting.has(card.issue),
    stuck: (card) => card.labels.includes(STUCK_LABEL),
    held: (card) => String(card.issue) in state.held,
    'after-ship': (card) => shipping && card.labels.includes(RELEASE_TASK_LABEL),
  };
  const readMergeState = (card: Card): MergeState => {
    const found = MERGE_STATE_ORDER.find((mergeState) => tests[mergeState](card));
    if (found === undefined) throw new Error(`Merging card ${card.issue} matches no merge queue state`);
    return found;
  };
  const items = cards.flatMap((card) => {
    const publicCard = shown.get(card.issue);
    return publicCard ? [{ issue: card.issue, title: publicCard.title, state: readMergeState(card) }] : [];
  });
  return items.sort((a, b) => MERGE_STATE_ORDER.indexOf(a.state) - MERGE_STATE_ORDER.indexOf(b.state));
}

export function createGithubRun(timeoutMs: number, env: NodeJS.ProcessEnv): Run {
  return async (command, args): Promise<RunResult> => {
    if (command !== 'gh') throw new Error('Dashboard only runs GitHub reads');
    try {
      const { stdout, stderr } = await runFile(command, args, { timeout: timeoutMs, env });
      return { code: 0, stdout, stderr };
    } catch (error) {
      const failed = error as { code: unknown; stdout: unknown; stderr: unknown };
      if (typeof failed.code !== 'number' || typeof failed.stdout !== 'string' || typeof failed.stderr !== 'string') throw error;
      return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr };
    }
  };
}

function readPauseReason(home: string): PauseReason | null {
  const pause = readPause(home);
  if (pause === null) return null;
  return pause.kind === 'usage-limit' ? 'agent-usage-limit' : 'operator';
}
function projectHostResources(host: HostLoad): HostLoad {
  if (!host.containers?.value) return host;
  const value = host.containers.value.map((row) => ({ ...row, jobId: row.jobId === null ? null : createWorkerKey(row.jobId) }));
  return { ...host, containers: { ...host.containers, value } };
}

export class SnapshotCollector {
  private state: FactoryState | null = null;
  private operations = createSource<Operations>();
  private github = createSource<GithubSnapshot>();
  private analytics = createSource<Analytics>();
  private ledgerSize: number | null = null;
  private host = createSource<HostLoad>();
  private live = createSource<ReturnType<typeof readLiveOperations>>();
  constructor(private readonly config: DashboardConfig, private readonly publicGithub: PublicGitHub, private readonly hostSampler: HostSampler, private readonly analyticsRunner: AnalyticsRunner) {}
  private refreshState(): void {
    try {
      const path = join(this.config.home, 'state', 'state.json');
      if (!existsSync(path)) throw new Error('Factory state missing');
      this.state = readState(path);
      const pauseReason = readPauseReason(this.config.home);
      this.operations = recordSuccess({ ...buildOperations(this.state, pauseReason !== null, this.config), pauseReason });
    } catch (error) { this.operations = recordFailure(this.operations, 'state', error); }
  }
  private async refreshAnalytics(): Promise<void> {
    const path = join(this.config.home, 'ledger.jsonl');
    const size = existsSync(path) ? statSync(path).size : null;
    if (size !== null && size === this.ledgerSize) return void (this.analytics = { ...this.analytics, at: new Date().toISOString(), status: 'ok' });
    try {
      this.analytics = recordSuccess(await this.analyticsRunner.read(path, new Date(), this.config.tickIntervalMs * 3));
      this.ledgerSize = size;
    } catch (error) {
      this.ledgerSize = null;
      this.analytics = recordFailure(this.analytics, 'analytics', error);
    }
  }
  private refreshLive(): void {
    if (this.state === null) return;
    try { this.live = recordSuccess(readLiveOperations(this.config.home, this.state, new Date(), this.config.observationHeartbeatMs, this.config.tickIntervalMs)); }
    catch (error) { this.live = recordFailure(this.live, 'observations', error); }
  }
  async refreshLocal(): Promise<void> {
    this.refreshState();
    this.refreshLive();
    await this.refreshAnalytics();
    try { this.host = recordSuccess(projectHostResources(await this.hostSampler.sample())); }
    catch (error) { this.host = recordFailure(this.host, 'host', error); }
  }
  async refreshGithub(): Promise<void> {
    if (this.state === null) return;
    try { this.github = recordSuccess(await this.publicGithub.read(this.state)); }
    catch (error) { this.github = recordFailure(this.github, 'GitHub', error); }
  }
  getSnapshot(): Snapshot {
    const localBudget = this.config.refreshMs + this.config.commandTimeoutMs;
    return {
      generatedAt: new Date().toISOString(), repoUrl: `https://github.com/${this.config.repo}`, playUrl: this.config.playUrl, channelUrl: this.config.channelUrl,
      live: expireSource(this.live, localBudget), operations: expireSource(this.operations, localBudget), analytics: expireSource(this.analytics, localBudget), host: expireSource(this.host, localBudget),
      github: expireSource(this.github, this.config.githubRefreshMs + this.config.commandTimeoutMs),
      labels: LABELS,
    };
  }
}
