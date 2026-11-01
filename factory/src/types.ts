
import type { Activity } from './observability';

export const COLUMNS =['Triage', 'Design', 'Implementation', 'Testing', 'Approval', 'Hardening', 'Merging', 'Done'] as const;
export type Column = typeof COLUMNS[number];

export type CardStage = 'triage' | 'design' | 'implement' | 'verify' | 'harden';
export type ReleaseStage = 'release' | 'playtest' | 'candidate' | 'ship' | 'remove';
export type Stage = CardStage | ReleaseStage | 'checks' | 'approve' | 'merge' | 'catch-up' | 'feedback' | 'adhoc' | 'incident' | 'answer' | 'dev' | 'waste' | 'intake' | 'tick' | 'control' | 'public';

export type FactoryConfig = {
  observationHeartbeatMs: number;
  observationMaxEventBytes: number;
  repo: string;
  projectOwner: string;
  projectNumber: number;
  githubAppId: string;
  githubRetries: number;
  githubRetryBaseSeconds: number;
  githubTimeoutSeconds: number;
  home: string;
  webRoot: string;
  publicUrl: string;
  image: string;
  gpu: boolean;
  jobsSlice: string | null;
  oauthToken: string;
  elevenlabsKey: string;
  sfxMaxGenerations: number;
  agyMaxRuns: number;
  agyModel: string;
  codexModel: string;
  codexEffort: string;
  designModel: string;
  buildModel: string;
  triageModel: string;
  advisorModel: string;
  triageEffort: string;
  designEffort: string;
  tokenPrices: Record<string, TokenPrice>;
  minVotes: number;
  minAgeHours: number;
  needsInfoHours: number;
  committeeBootstrapTelegram: string;
  committeeBootstrapGithub: string;
  telegramToken: string;
  committeeChat: string;
  publicChannel: string;
  triageTimeoutMinutes: number;
  designTimeoutMinutes: number;
  implementTimeoutMinutes: number;
  verifyTimeoutMinutes: number;
  testTimeoutMinutes: number;
  branchTimeoutMinutes: number;
  agentJobMaxMinutes: number;
  agentCompactWindow: number;
  replyRouteMinutes: number;
  playtestTurns: number;
  playtestRuns: number;
  playtestReviewRepairs: number;
  playtestTimeoutMinutes: number;
  playtestHours: number;
  mergeTimeoutMinutes: number;
  checksTimeoutMinutes: number;
  testStallMinutes: number;
  suiteStartMinutes: number;
  suitePollSeconds: number;
  testingBudgetUsd: number;
  hardeningBudgetUsd: number;
  mergingBudgetUsd: number;
  wasteReviewDays: number;
  itchTarget: string | null;
  butlerKey: string | null;
  maxJobsPerCard: number;
  triageWorkers: number;
  designWorkers: number;
  implementWorkers: number;
  verifyWorkers: number;
  testWorkers: number;
  minFreeGb: number;
  minAvailableGb: number;
  logDays: number;
  transcriptDays: number;
  cpuLight: number;
  cpuImplement: number;
  cpuTest: number;
  vitestWorkersImplement: number;
  vitestWorkersTest: number;
  errorDailyIssues: number;
  errorDiskMb: number;
  errorMapDays: number;
  errorBodyKb: number;
  errorUnzippedMb: number;
  errorIpPerHour: number;
  errorOrigins: string;
  proposalChat: string;
  publicDiscussion: string;
  proposalsPerDay: number;
  answersPerDay: number;
  voteEmoji: string;
  vetoEmoji: string;
  publicDigestMinutes: number;
  openaiKey: string;
  filterModel: string;
  filterTimeoutSeconds: number;
  filterSincereMin: number;
  filterPerTick: number;
  reportIpPerHour: number;
  reportMaxChars: number;
};

export type TokenPrice = { input: number; output: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number };

export type RunOptions = { activity: Activity; cwd?: string; env?: Record<string, string>; input?: string; logPath?: string; onStdout?: (chunk: string) => void; timeoutMs?: number };
export type RunResult = { code: number; stdout: string; stderr: string; timedOut?: true };
export type Run = (cmd: string, args: string[], opts: RunOptions) => Promise<RunResult>;

export type Reaction = { login: string; content: string };
export type IssueComment = { login: string; body: string; createdAt: string; byFactory: boolean };

export type Issue = {
  number: number;
  title: string;
  body: string;
  labels: string[];
  createdAt: string;
  state: 'OPEN' | 'CLOSED';
  author: string;
};

export type Card = { itemId: string; issue: number; column: Column; labels: string[]; title?: string };

export type JobStage = CardStage | ReleaseStage | 'checks' | 'approve' | 'merge' | 'catch-up' | 'adhoc' | 'incident' | 'answer' | 'dev' | 'waste';
export const RETIRED_JOB_STAGES = ['change'] as const;
export type RetiredJobStage = typeof RETIRED_JOB_STAGES[number];
export type LedgerJobStage = JobStage | RetiredJobStage;
export const isLiveJobStage = (stage: LedgerJobStage): stage is JobStage => !(RETIRED_JOB_STAGES as readonly string[]).includes(stage);
export type Job = { id: string; stage: JobStage; issue: number | null; pid: number; startedAt: string; log: string; batch?: number[] };

export type Queue = 'branch' | 'triage' | 'design' | 'implement' | 'verify' | 'test';
export const AGENT_QUEUES: Queue[] = ['triage', 'design', 'implement', 'verify'];
export const QUEUE_OF: Record<JobStage, Queue> = {
  triage: 'triage', waste: 'triage', design: 'design', implement: 'implement', adhoc: 'implement', verify: 'verify', harden: 'verify',
  checks: 'test',
  approve: 'branch', merge: 'branch', 'catch-up': 'branch', remove: 'branch', ship: 'branch', release: 'branch', candidate: 'branch', dev: 'branch', incident: 'branch', answer: 'branch',
  playtest: 'verify',
};
export const JOB_ISSUE: Record<JobStage, 'github-issue' | 'none'> = {
  triage: 'github-issue', design: 'github-issue', implement: 'github-issue', verify: 'github-issue', harden: 'github-issue', checks: 'github-issue', adhoc: 'github-issue',
  approve: 'github-issue', 'catch-up': 'github-issue', remove: 'github-issue', ship: 'github-issue', playtest: 'github-issue', candidate: 'github-issue', incident: 'github-issue',
  release: 'none', merge: 'none', dev: 'none', waste: 'none', answer: 'none',
};
export type Route = 'answer' | 'patch' | 'redesign';
export type FailureCause = 'timeout' | 'died' | 'github' | 'disk' | 'decision' | 'baseline' | 'error';
export type RejectedControl = { action: string; issue: number | null };
export type Failure = { stage: Stage; issue: number | null; error: string; cause: FailureCause | null; log: string | null; at: string; batch?: number[]; cleared?: number[]; control?: RejectedControl };
export type ChatReply = { chat: string; messageId: number | null };
export type Removal = { issue: number; by: string; text: string };

export type IssueMerge = { issue: number; title: string; sha: string; into: string; reverted: string[] };

export type PlaytestWork = { start: string; baseline: string; features: IssueMerge[]; session: string; plays: number };
export type PlaytestDecision = { by: string; at: string; text: string };
export type PlaytestState = {
  seed: number;
  runs: number;
  lastStart: { sha: string; at: string } | null;
  passed: { sha: string; features: IssueMerge[] } | null;
  fixes: string | null;
  blocked: { sha: string; reason: string } | null;
  decision: PlaytestDecision | null;
  work: PlaytestWork | null;
};

export type LandingStage = 'merge' | 'ship';
export type LandingSource = { branch: string; sha: string };
export type LandingWork = { into: string; sources: LandingSource[]; cards: number[]; session: string; spentUsd: number; job: string | null; jobUsd: number; merged: boolean; merges: IssueMerge[]; since: string };

export type ReleaseState = {
  issue: number;
  day: string;
  postId: number | null;
  candidate: { sha: string; features: IssueMerge[] } | null;
  removed: number[];
  playtest: PlaytestState;
  shipping?: { sha: string; features: { issue: number; title: string }[] };
};

export type ReleasePost = {
  issue: number;
  day: string;
  changelog: string;
  screenshot: string;
  postId: number | null;
  draft: string | null;
};

export type FactoryState = {
  jobs: Job[];
  approvalPosts: Record<string, number>;
  lastRelease: string | null;
  pendingPlaytest: string | null;
  devMerges: IssueMerge[];
  release: ReleaseState | null;
  releasePost: ReleasePost | null;
  pendingShip: string | null;
  pendingRemovals: Removal[];
  pendingApprovals: Record<string, string>;
  approvedResolving: Record<string, string>;
  caughtUpTo: Record<string, string>;
  keptApprovals: Record<string, KeptApproval>;
  pendingIncidents: number[];
  pendingAnswers: number[];
  bundles: Record<string, number[]>;
  lastTickError: string | null;
  failures: Failure[];
  adhocReplies: Record<string, ChatReply>;
  builds: Record<string, string>;
  suiteCleared: Record<string, string>;
  cardStarts: Record<string, string[]>;
  postCaptions: Record<string, string>;
  devBuild: string | null;
  devFailed: string | null;
  devError: string | null;
  interrupted: number[];
  retried: string[];
  postOnly: number[];
  unroutedReplies: Record<string, UnroutedReply>;
  textPosts: string[];
  lastWasteReview: string | null;
  held: Record<string, Hold>;
  stuck: Record<string, StuckRecord>;
  sweepError: string | null;
  asked: Record<string, string>;
  questionPosts: Record<string, number>;
  pendingFeedback: Record<string, PendingFeedback>;
  routed: number[];
  landings: Partial<Record<LandingStage, LandingWork>>;
};

export type FeedbackSource = 'committee' | 'player';
export type PendingFeedback = { source: FeedbackSource; body: string };

export type StuckKind = 'running' | 'held' | 'merge-batch' | 'clone-merge' | 'machine' | 'blocked' | 'unrecorded';
export type StuckCause = { incident: string; stage: Stage | null; error: string; cause: FailureCause | null; log: string | null; batch: number; since: string };
export type StuckRecord = StuckCause & { column: Column; kind: StuckKind; tries: number; released: string | null; refused: string | null };

export type Hold = { by: string; reason: string; at: string; stage: JobStage | null };

export type KeptApproval = { by: string; at: string; build: string; checked: string[]; reason: string | null };

export type UnroutedReply = { issue: number; postId: number; text: string; at: string };

export interface GitHub {
  candidates(labels: string[]): Promise<Issue[]>;
  allIssues(): Promise<Issue[]>;
  issue(number: number): Promise<Issue>;
  comments(number: number): Promise<IssueComment[]>;
  comment(number: number, body: string): Promise<void>;
  addLabel(number: number, label: string): Promise<void>;
  removeLabel(number: number, label: string): Promise<void>;
  close(number: number, reason: 'completed' | 'not planned'): Promise<void>;
  createIssue(title: string, body: string, labels: string[]): Promise<number>;
  editIssue(number: number, title: string, body: string): Promise<void>;
  cards(): Promise<Card[]>;
  card(issue: number): Promise<Card | null>;
  addCard(issue: number, column: Column): Promise<void>;
  move(issue: number, column: Column): Promise<void>;
  openPullRequest(branch: string, base: string, title: string, body: string): Promise<string>;
  createRelease(tag: string, target: string, title: string, notes: string): Promise<void>;
  pullRequestFor(branch: string): Promise<string | null>;
  closePullRequest(branch: string, comment: string): Promise<void>;
  reopen(number: number): Promise<void>;
  errorIssue(number: number): Promise<FingerprintIssue>;
  dispatchSuite(sha: string, scope?: SuiteScope): Promise<number>;
  suiteRun(id: number): Promise<SuiteRun>;
  suiteLog(id: number): Promise<string>;
  suiteFailures(id: number): Promise<SuiteFailures | null>;
  suitePassed(sha: string): Promise<boolean>;
  suitesRunning(): Promise<number>;
}

export type SuiteRun = { done: boolean; started: boolean; passed: boolean; testsFailed: boolean; conclusion: string | null; url: string };
export type SuiteScope = { files: string[]; workers: number };
export type FailedTest = { file: string; test: string | null };
export type SuiteFailures = { failed: FailedTest[]; unfinished: string[]; unhandledErrors: number };

export type InlineButton = { text: string; data: string };

export type AlbumPhoto = { path: string; caption: string };

export interface Telegram {
  sendMessage(chat: string, text: string, replyTo?: number | null): Promise<number>;
  sendButtons(chat: string, text: string, buttons: InlineButton[][]): Promise<number>;
  sendPhoto(chat: string, pngPath: string, caption: string, buttons?: InlineButton[][]): Promise<number>;
  sendPhotos(chat: string, photos: AlbumPhoto[], replyTo?: number): Promise<number[]>;
  sendDocument(chat: string, path: string, replyTo?: number): Promise<number>;
  editCaption(chat: string, messageId: number, caption: string): Promise<void>;
  editText(chat: string, messageId: number, text: string): Promise<void>;
  sendHtml(chat: string, html: string): Promise<number>;
  editHtml(chat: string, messageId: number, html: string): Promise<void>;
  downloadFile(fileId: string): Promise<Buffer>;
}

export type AgentSession = { dir: string; id: string; resume: boolean };
export type AgentRun = { clone: string; dir: string; model: string; prompt: string; log: string; openNetwork?: boolean; mediaDir?: string; readOnly?: Record<string, string>; session?: AgentSession; skill?: string; effort?: string; disallowedTools?: string[]; advisor?: string; subagentModel?: string; publicOutput?: true };

export type Pin = { cpus: string | null; testWorkers: number | null };

export type ShellKind = 'checks' | 'build';

export interface Container {
  agent(run: AgentRun): Promise<string>;
  shell(kind: ShellKind, clone: string, script: string, log: string, env?: Record<string, string>, mounts?: Record<string, string>, limitMinutes?: number, pin?: Pin): Promise<void>;
}

export type MergeStep = { branch: string; into: string; message: string; issue: number | null };

export interface HostRepo {
  path: string;
  fetch(): Promise<void>;
  createBranch(name: string, from: string): Promise<void>;
  revertMerge(merge: Pick<IssueMerge, 'issue' | 'sha'>, branch: string, resolutions?: Resolution[]): Promise<void>;
  workHead(dir: string): Promise<string>;
  containsCommit(branch: string, sha: string): Promise<boolean>;
  openConflict(dir: string, conflict: MergeConflictError | RevertConflictError): Promise<void>;
  closeConflict(dir: string, conflict: MergeConflictError | RevertConflictError): Promise<{ resolution: Resolution; diff: string; files: string[] }>;
  deleteBranch(branch: string): Promise<void>;
  prepareWorkClone(branch: string, base: string, dir: string): Promise<void>;
  cloneBranch(branch: string, dir: string): Promise<string>;
  untrackFactoryFiles(dir: string): Promise<string[]>;
  fetchFromWork(dir: string, branch: string): Promise<string>;
  push(commit: string, branch: string): Promise<void>;
  replaceBranch(commit: string, branch: string): Promise<void>;
  catchUpBase(dir: string, base: string): Promise<{ commit: string | null; conflicts: string[]; kept: string | null }>;
  mergeBranchIntoWork(dir: string, branch: string, message?: string): Promise<{ commit: string | null; conflicts: string[] }>;
  isMerged(base: string, branch: string): Promise<boolean>;
  headHash(branch: string): Promise<string>;
  fullHash(commit: string): Promise<string>;
  forkPoint(a: string, b: string): Promise<string>;
  diff(base: string, branch: string): Promise<string>;
  changedFiles(base: string, branch: string): Promise<string[]>;
  ownHeads(base: string, branch: string): Promise<string[]>;
  changedInWork(dir: string, from: string): Promise<string[]>;
  readFile(branch: string, path: string): Promise<string>;
  hasNewCommits(base: string, branch: string): Promise<boolean>;
  foreignCommits(head: string, base: string, other: string): Promise<number>;
  merge(steps: MergeStep[], resolutions?: Resolution[], checked?: CheckedBuild): Promise<void>;}

export type Resolution = { base: string; source: string; head: string };

export type CheckedBuild = { branch: string; build: string; base: string };

export class BaseMovedError extends Error {
  constructor(readonly branch: string, readonly build: string, reason: string) {
    super(reason);
  }
}

export class MergeConflictError extends Error {
  constructor(readonly step: MergeStep, readonly files: string[], reason: string, readonly base: string, readonly source: string, readonly done: Resolution[] = []) {
    super(`merge of ${step.branch} into ${step.into} failed. Conflicting files: ${files.join(', ')}. ${reason}`);
  }

  get branch(): string {
    return this.step.branch;
  }

  get into(): string {
    return this.step.into;
  }
}

export class RevertConflictError extends Error {
  constructor(readonly issue: number, readonly into: string, readonly files: string[], reason: string, readonly base: string, readonly merge: string) {
    super(`revert of issue #${issue} on ${into} failed. Conflicting files: ${files.join(', ')}. ${reason}`);
  }
}

export type Ctx = {
  cfg: FactoryConfig;
  run: Run;
  github: GitHub;
  telegram: Telegram;
  container: Container;
  repo: HostRepo;
  statePath: string;
  now: () => Date;
  fetch?: typeof fetch;
  log: (stage: Stage, issue: number | null, msg: string) => void;
};

export const GAME_DIR = 'game';
export const FACTORY_DIR = 'factory';
export const BRANCH = (issue: number): string => `factory/issue-${issue}`;
export const TASK_DIR = '.factory-tasks';
export const TASK_FILE = (issue: number): string => `${TASK_DIR}/issue-${issue}.md`;
export const WORK_DIR = (home: string, issue: number): string => `${home}/work/issue-${issue}`;
export const WORK_LOCK = (home: string, name: string): string => `${home}/locks/${name}`;
export const RUN_LOCK_NAME = (key: string): string => `run-${key}`;
export const RUN_KEY = { issue: (issue: number): string => `issue-${issue}`, stage: (stage: string): string => `stage-${stage}` };
export const CLONE_LOCK_MS = 15 * 60_000;
export const OUT_DIR = '.factory';
export const MEDIA_DIR = '.factory-media';
export const STUCK_LABEL = 'factory-stuck';
export const OPEN_MARKS = ['MERGE_HEAD', 'REVERT_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply'];
export const WONT_DO_LABEL = 'wont-do';
export const MAINTENANCE_LABEL = 'maintenance';
export const RELEASE_LABEL = 'release';
export const isCleanupTask = (labels: string[]): boolean => labels.includes(MAINTENANCE_LABEL);
export const PLAYTEST_FIXES_BRANCH = 'factory/playtest-fixes';
export const CANDIDATE_BRANCH = 'factory/candidate';
export const RELEASE_CANDIDATE_LABEL = 'release-candidate';
export const HOTFIX_LABEL = 'hotfix';
export const ADHOC_LABEL = 'adhoc';
export const WASTE_LABEL = 'factory-review';
export const BUG_LABEL = 'bug';
export const ERROR_REPORT_LABEL = 'error-report';
export const fingerprintLine = (fingerprint: string): string => `Error fingerprint: ${fingerprint}`;
export type FingerprintIssue = { number: number; state: 'OPEN' | 'CLOSED'; stateReason: string | null; closedAt: string | null };
export const BUNDLED_LABEL = 'bundled';
export const CANDIDATE_LABELS = ['feature-request', BUG_LABEL];
export const INCIDENT_LOG = 'docs/incident-log.md';
export const INCIDENT_BRANCH = (issue: number): string => `factory/incident-${issue}`;
export const NEEDS_INFO_LABEL = 'needs-info';
export const VOTING_LABEL = 'voting';
export const PLAYER_REPORT_LABEL = 'player-report';
export const PUBLIC_SENDER = 'public';
export const PLAYER_COMMENTS_HEADING = '## Player comments';
export const PLAYER_REPORT_HEADING = '## Player report';
export const FACTORY_MARK = '<!-- roam-factory -->';
export const QUESTIONS_HEADING = '## Questions from the factory';
export const FEEDBACK_HEADING = '## Committee feedback';
export const QUESTION_HEADING = '## Committee question';
export const AGENT_NETWORK = 'roam-factory-agents';
export const PROXY_NAME = 'roam-factory-proxy';
export const PROXY_PORT = 8888;
export const DESIGN_SONNET_LABEL = 'design-sonnet';
export const IMPLEMENTATION_OPUS_LABEL = 'implementation-opus';
export const ROUTING_MARK = 'Model routing from triage:';
export const OPEN_NETWORK_LABEL = 'open-network';
