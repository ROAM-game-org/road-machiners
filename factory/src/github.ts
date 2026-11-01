import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { must } from './exec';
import { COLUMNS, FACTORY_MARK } from './types';
import type { Card, Column, FactoryConfig, FailedTest, FingerprintIssue, GitHub, Issue, IssueComment, Run, RunResult, SuiteFailures } from './types';

const ISSUE_FIELDS = 'number,title,body,labels,createdAt,state,author';

type Board = { projectId: string; fieldId: string; options: Record<string, string> };
type RawIssue = Omit<Issue, 'labels' | 'author'> & { labels: { name: string }[]; author: { login: string } };
type Vars = Record<string, string | number>;

type BoardData = {
  id: string;
  field: { id: string; options: { id: string; name: string }[] } | null;
};

const PROJECT_FIELDS = 'id field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }';

const ITEM_FIELDS = `id fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
    content { ... on Issue { number title repository { nameWithOwner } labels(first: 50) { nodes { name } } } }`;

const ITEMS_QUERY = `query($project: ID!, $cursor: String) { node(id: $project) { ... on ProjectV2 {
  items(first: 100, after: $cursor) { totalCount pageInfo { hasNextPage endCursor } nodes { ${ITEM_FIELDS} } } } } }`;

const ITEMS_PROBE = `query($project: ID!) { node(id: $project) { ... on ProjectV2 {
  items(first: 1, orderBy: {field: POSITION, direction: DESC}) { totalCount nodes { id } } } } }`;

const ISSUE_ITEMS_QUERY = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) {
  projectItems(first: 20, includeArchived: false) { nodes { project { id } ${ITEM_FIELDS} } } } } }`;

const OPEN_ISSUES_QUERY = `query($owner: String!, $name: String!, $cursor: String) { repository(owner: $owner, name: $name) {
  issues(states: OPEN, first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: ASC}) { totalCount pageInfo { hasNextPage endCursor }
    nodes { number title labels(first: 50) { nodes { name } } projectItems(first: 20, includeArchived: false) { nodes { id project { id } fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } } }`;

const CANDIDATES_QUERY = `query($search: String!, $cursor: String) { search(type: ISSUE, query: $search, first: 100, after: $cursor) {
  pageInfo { hasNextPage endCursor } nodes { ... on Issue { number title body createdAt state author { login } labels(first: 50) { nodes { name } }
    projectItems(first: 20) { nodes { project { id } } } } } } }`;

const SEARCH_RESULT_CAP = 1000;

type CandidateNode = {
  number: number; title: string; body: string; createdAt: string; state: Issue['state']; author: { login: string } | null;
  labels: { nodes: { name: string }[] };
  projectItems: { nodes: { project: { id: string } }[] };
};

type CandidatesPage = {
  data: { search: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: CandidateNode[] } };
};

const ADD_ITEM =`mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: {projectId: $project, contentId: $content}) { item { id } } }`;

const SET_STATUS = `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field, value: {singleSelectOptionId: $option}}) { projectV2Item { id } } }`;

type ItemNode = {
  id: string;
  fieldValueByName: { name?: string } | null;
  content: { number?: number; title?: string; repository?: { nameWithOwner: string }; labels?: { nodes: { name: string }[] } } | null;
};

type ItemsPage = {
  data: { node: { items: { totalCount: number; pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (ItemNode | null)[] } | null } | null };
};

type OpenIssueNode = {
  number: number; title: string; labels: { nodes: { name: string }[] };
  projectItems: { nodes: ({ id: string; project: { id: string } | null; fieldValueByName: { name?: string } | null } | null)[] };
};

type OpenIssuesPage = {
  data: { repository: { issues: { totalCount: number; pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (OpenIssueNode | null)[] } } | null };
};

type ProbePage = { data: { node: { items: { totalCount: number; nodes: unknown[] } | null } | null } };

type IssueItemsPage = {
  data: { repository: { issue: { projectItems: { nodes: ((ItemNode & { project: { id: string } | null }) | null)[] } } | null } | null };
};

const PAGE_SIZE = 100;

const NOT_THIS_KIND = /Could not resolve to an? (User|Organization)/;

const RATE_LIMITED = /rate limit|HTTP 429|submitted too quickly/i;
const UPSTREAM_DOWN = /HTTP 50[234]\b/;
const CONNECTION_LOST = /stream error|connection reset|unexpected EOF|TLS handshake timeout|i\/o timeout/i;
const READ_COMMANDS = new Set(['view', 'list', 'download']);
const FIELD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input']);
const TAG_EXISTS = /a release with the same tag name already exists/;

export class GithubError extends Error {}

export class BoardReadError extends GithubError {}

class IncompleteBoard extends Error {}

type Wait = (ms: number) => Promise<void>;
const sleep: Wait = (ms) => new Promise((done) => setTimeout(done, ms));

export const SUITE_WORKFLOW = 'game-suite.yml';
export const SUITE_STATUS_CONTEXT = 'game suite';
const FULL_SHA =/^[0-9a-f]{40}$/;
export const SUITE_TESTS_STEP = 'tests';
export const SUITE_FAILURES_ARTIFACT = 'test-failures';
const SUITE_FAILURES_FILE = 'test-failures.json';

type RawRun = { status: string; conclusion: string | null; html_url: string };
type RawJob = { status: string; steps: { name: string; conclusion: string | null }[] };

type RawComment ={ login: string; body: string; createdAt: string; appId: number | null };

type ClientConfig = Pick<FactoryConfig, 'githubAppId' | 'repo' | 'projectOwner' | 'projectNumber' | 'githubRetries' | 'githubRetryBaseSeconds' | 'githubTimeoutSeconds'>;

export function ghClient(run: Run, cfg: ClientConfig, wait: Wait = sleep): GitHub {
  const repo = cfg.repo;
  let board: Board | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function attempt(args: string[]): Promise<RunResult> {
    const read = isRead(args);
    for (let retry = 0; ; retry++) {
      const result = await run('gh', args, { activity: 'git', timeoutMs: cfg.githubTimeoutSeconds * 1000 });
      if (result.code === 0 || !retriable(result, read) || retry === cfg.githubRetries) return result;
      await wait(cfg.githubRetryBaseSeconds * 1000 * 2 ** retry);
    }
  }

  function call(args: string[]): Promise<RunResult> {
    const result = queue.then(() => attempt(args));
    queue = result.catch(() => undefined);
    return result;
  }

  async function gh(args: string[]): Promise<string> {
    return must(await call(args), `gh ${args.slice(0, 3).join(' ')}`, GithubError);
  }

  async function graphql(query: string, vars: Vars): Promise<string> {
    return gh(graphqlArgs(query, vars));
  }

  async function lines(args: string[]): Promise<string[]> {
    return (await gh(args)).split('\n').filter((line) => line.trim() !== '');
  }

  let repoLabels: Set<string> | null = null;

  async function ensureLabel(label: string): Promise<void> {
    repoLabels ??= new Set(await lines(['label', 'list', '-R', repo, '--limit', '1000', '--json', 'name', '--jq', '.[].name']));
    if (repoLabels.has(label)) return;
    await gh(['label', 'create', label, '-R', repo]);
    repoLabels.add(label);
  }

  function fill(raw: RawIssue): Issue {
    return { ...raw, author: raw.author.login, labels: raw.labels.map((label) => label.name) };
  }

  async function candidates(labels: string[]): Promise<Issue[]> {
    const search = `repo:${repo} is:issue is:open label:${labels.map((label) => `"${label}"`).join(',')}`;
    const { projectId } = await loadBoard();
    const found: Issue[] = [];
    let cursor = '';
    for (;;) {
      const vars: Vars = cursor ? { search, cursor } : { search };
      const page = JSON.parse(await graphql(CANDIDATES_QUERY, vars)) as CandidatesPage;
      for (const node of page.data.search.nodes) {
        if (!node.projectItems.nodes.some((item) => item.project.id === projectId)) found.push(toIssue(node));
      }
      if (!page.data.search.pageInfo.hasNextPage) return found;
      cursor = page.data.search.pageInfo.endCursor;
    }
  }

  async function findProject(): Promise<BoardData> {
    for (const kind of ['user', 'organization']) {
      const query = `query($owner: String!, $number: Int!) { ${kind}(login: $owner) { projectV2(number: $number) { ${PROJECT_FIELDS} } } }`;
      const result = await call(graphqlArgs(query, { owner: cfg.projectOwner, number: cfg.projectNumber }));
      if (result.code !== 0 && NOT_THIS_KIND.test(result.stderr)) continue;
      must(result, `gh api graphql ${kind} project`);
      const data = JSON.parse(result.stdout) as { data: Record<string, { projectV2: BoardData | null } | null> };
      const project = data.data[kind]?.projectV2;
      if (project) return project;
    }
    throw new Error(`Project ${cfg.projectNumber} not found for ${cfg.projectOwner}`);
  }

  async function loadBoard(): Promise<Board> {
    if (board) return board;
    const project = await findProject();
    if (!project.field) throw new Error('Project has no single-select field named "Status"');
    const options: Record<string, string> = {};
    for (const option of project.field.options) options[option.name] = option.id;
    for (const column of COLUMNS) {
      if (!options[column]) throw new Error(`Project Status field has no option named "${column}"`);
    }
    board = { projectId: project.id, fieldId: project.field.id, options };
    return board;
  }

  async function setStatus(itemId: string, column: Column): Promise<void> {
    const b = await loadBoard();
    await graphql(SET_STATUS, { project: b.projectId, item: itemId, field: b.fieldId, option: b.options[column] });
  }

  async function readBoardOnce(projectId: string): Promise<{ cards: Card[]; total: number }> {
    const found: Card[] = [];
    const seen = new Set<string>();
    let total: number | null = null;
    let cursor = '';
    for (let pages = 1; ; pages++) {
      const vars: Vars = cursor ? { project: projectId, cursor } : { project: projectId };
      const items = (JSON.parse(await graphql(ITEMS_QUERY, vars)) as ItemsPage).data.node?.items;
      if (!items) throw new IncompleteBoard(`page ${pages} has no items list`);
      if (total !== null && items.totalCount !== total) throw new IncompleteBoard(`page ${pages} counts ${items.totalCount} items, page 1 counted ${total}`);
      total = items.totalCount;
      for (const node of items.nodes) {
        if (node === null) throw new IncompleteBoard(`page ${pages} has a null item`);
        if (seen.has(node.id)) throw new IncompleteBoard(`page ${pages} repeats item ${node.id}`);
        seen.add(node.id);
        const card = toCard(node, repo);
        if (card) found.push(card);
      }
      if (seen.size > total) throw new IncompleteBoard(`the pages hold ${seen.size} items, more than the ${total} they count`);
      if (!items.pageInfo.hasNextPage) break;
      if (items.nodes.length === 0 || !items.pageInfo.endCursor) throw new IncompleteBoard(`page ${pages} is empty but says more pages follow`);
      if (pages * PAGE_SIZE >= total + PAGE_SIZE) throw new IncompleteBoard(`page ${pages} still says more pages follow after all ${total} items`);
      cursor = items.pageInfo.endCursor;
    }
    if (seen.size !== total) throw new IncompleteBoard(`the pages hold ${seen.size} of the ${total} items they count`);
    if (total === 0) await confirmEmpty(projectId);
    return { cards: withOpenCards(found, await readOpenCards(projectId)), total };
  }

  async function readOpenCards(projectId: string): Promise<Card[]> {
    const [owner, name] = repo.split('/');
    const found: Card[] = [];
    const seen = new Set<number>();
    let total = -1;
    let cursor: string | null = '';
    for (let page = 1; cursor !== null; page++) {
      const vars: Vars = cursor ? { owner, name, cursor } : { owner, name };
      const issues = openIssuesOf(JSON.parse(await graphql(OPEN_ISSUES_QUERY, vars)) as OpenIssuesPage, page, total);
      total = issues.totalCount;
      for (const node of issues.nodes) found.push(...openCardOf(node, projectId, seen, page));
      cursor = nextOpenCursor(issues, seen.size, page);
    }
    if (seen.size !== total) throw new IncompleteBoard(`the open issue pages hold ${seen.size} of the ${total} issues they count`);
    return found;
  }

  async function confirmEmpty(projectId: string): Promise<void> {
    const items = (JSON.parse(await graphql(ITEMS_PROBE, { project: projectId })) as ProbePage).data.node?.items;
    if (!items) throw new IncompleteBoard('the second read of an empty board has no items list');
    if (items.totalCount !== 0 || items.nodes.length !== 0) throw new IncompleteBoard(`the items list is empty, but a second read counts ${items.totalCount} items`);
  }

  async function cards(): Promise<Card[]> {
    const b = await loadBoard();
    let reason = '';
    for (let retry = 0; ; retry++) {
      try {
        const read = await readBoardOnce(b.projectId);
        if (read.total > 0 || retry === cfg.githubRetries) return read.cards;
        reason = 'the board read came back empty';
      } catch (error) {
        if (!(error instanceof IncompleteBoard)) throw error;
        reason = error.message;
        if (retry === cfg.githubRetries) break;
      }
      await wait(cfg.githubRetryBaseSeconds * 1000 * 2 ** retry);
    }
    throw new BoardReadError(`The project board read stayed incomplete after ${cfg.githubRetries + 1} reads, last: ${reason}. The factory acts on no partial board.`);
  }

  async function card(number: number): Promise<Card | null> {
    const b = await loadBoard();
    const [owner, name] = repo.split('/');
    const page = JSON.parse(await graphql(ISSUE_ITEMS_QUERY, { owner, name, number })) as IssueItemsPage;
    const item = page.data.repository?.issue?.projectItems.nodes.find((node) => node?.project?.id === b.projectId);
    const direct = item ? toCard(item, repo) : null;
    if (direct) return direct;
    return (await cards()).find((row) => row.issue === number) ?? null;
  }

  async function allIssues(): Promise<Issue[]> {
    const search = `repo:${repo} is:issue`;
    const found: Issue[] = [];
    let cursor = '';
    for (;;) {
      const vars: Vars = cursor ? { search, cursor } : { search };
      const page = JSON.parse(await graphql(CANDIDATES_QUERY, vars)) as CandidatesPage;
      found.push(...page.data.search.nodes.map(toIssue));
      if (found.length >= SEARCH_RESULT_CAP) throw new Error(`The issue search reached GitHub's cap of ${SEARCH_RESULT_CAP} results, so the issue list for grooming would be cut`);
      if (!page.data.search.pageInfo.hasNextPage) return found;
      cursor = page.data.search.pageInfo.endCursor;
    }
  }

  async function issue(number: number): Promise<Issue> {
    const out = await gh(['issue', 'view', String(number), '-R', repo, '--json', ISSUE_FIELDS]);
    return fill(JSON.parse(out) as RawIssue);
  }

  return {
    candidates,
    allIssues,
    issue,
    async comments(number): Promise<IssueComment[]> {
      const rows = await lines(['api', `repos/${repo}/issues/${number}/comments`, '--paginate',
        '--jq', '.[] | {login: .user.login, body: .body, createdAt: .created_at, appId: .performed_via_github_app.id}']);
      return rows.map((row) => {
        const { appId, ...comment } = JSON.parse(row) as RawComment;
        return { ...comment, byFactory: appId !== null && String(appId) === cfg.githubAppId };
      });
    },
    async comment(number, body) {
      await gh(['issue', 'comment', String(number), '-R', repo, '--body', `${body}\n\n${FACTORY_MARK}`]);
    },
    async addLabel(number, label) {
      await ensureLabel(label);
      await gh(['issue', 'edit', String(number), '-R', repo, '--add-label', label]);
    },
    async removeLabel(number, label) {
      await gh(['issue', 'edit', String(number), '-R', repo, '--remove-label', label]);
    },
    async close(number, reason) {
      await gh(['issue', 'close', String(number), '-R', repo, '--reason', reason]);
    },
    async createIssue(title, body, labels) {
      for (const label of labels) await ensureLabel(label);
      const args = ['api', `repos/${repo}/issues`, '-f', `title=${title}`, '-f', `body=${body}`];
      for (const label of labels) args.push('-f', `labels[]=${label}`);
      args.push('--jq', '.number');
      const number = Number((await gh(args)).trim());
      if (!Number.isInteger(number)) throw new Error('gh api returned no issue number for the new issue');
      return number;
    },
    async editIssue(number, title, body) {
      await gh(['issue', 'edit', String(number), '-R', repo, '--title', title, '--body', body]);
    },
    cards,
    card,
    async addCard(number, column) {
      const b = await loadBoard();
      const view = JSON.parse(await gh(['issue', 'view', String(number), '-R', repo, '--json', 'id'])) as { id: string };
      const added = JSON.parse(await graphql(ADD_ITEM, { project: b.projectId, content: view.id })) as {
        data: { addProjectV2ItemById: { item: { id: string } } };
      };
      await setStatus(added.data.addProjectV2ItemById.item.id, column);
    },
    async move(number, column) {
      const found = await card(number);
      if (!found) throw new Error(`Issue ${number} is not on the board`);
      await setStatus(found.itemId, column);
    },
    async createRelease(tag, target, title, notes) {
      const result = await call(['release', 'create', tag, '-R', repo, '--target', target, '--title', title, '--notes', notes]);
      if (!TAG_EXISTS.test(result.stderr)) must(result, 'gh release create');
    },
    async openPullRequest(branch, base, title, body) {
      const out = await gh(['pr', 'create', '-R', repo, '--head', branch, '--base', base, '--title', title, '--body', body]);
      return out.trim();
    },
    async pullRequestFor(branch) {
      const out = await gh(['pr', 'list', '-R', repo, '--head', branch, '--state', 'open', '--json', 'url']);
      const found = JSON.parse(out) as { url: string }[];
      return found[0]?.url ?? null;
    },
    async closePullRequest(branch, comment) {
      await gh(['pr', 'close', branch, '-R', repo, '--comment', comment]);
    },
    async reopen(number) {
      await gh(['issue', 'reopen', String(number), '-R', repo]);
    },
    async dispatchSuite(sha, scope) {
      if (!FULL_SHA.test(sha)) throw new Error(`The dispatch of ${SUITE_WORKFLOW} needs a full 40 character commit sha, not ${sha}`);
      const inputs = scope === undefined ? [] : ['-f', `inputs[files]=${scope.files.join(' ')}`, '-f', `inputs[workers]=${scope.workers}`];
      const out = await gh(['api', '-X', 'POST', `repos/${repo}/actions/workflows/${SUITE_WORKFLOW}/dispatches`, '-f', 'ref=main', '-f', `inputs[sha]=${sha}`, ...inputs, '-F', 'return_run_details=true']);
      const id = out.trim() === '' ? undefined : (JSON.parse(out) as { workflow_run_id?: number }).workflow_run_id;
      if (typeof id !== 'number') throw new Error(`The dispatch of ${SUITE_WORKFLOW} for ${sha} returned no run id: ${out.trim()}`);
      return id;
    },
    async suiteRun(id) {
      const run = JSON.parse(await gh(['api', `repos/${repo}/actions/runs/${id}`])) as RawRun;
      const { jobs } = JSON.parse(await gh(['api', `repos/${repo}/actions/runs/${id}/jobs`])) as { jobs: RawJob[] };
      const done = run.status === 'completed';
      return {
        done,
        started: done || jobs.some((job) => job.status === 'in_progress' || job.status === 'completed'),
        passed: done && run.conclusion === 'success',
        testsFailed: jobs.some((job) => job.steps.some((step) => step.name === SUITE_TESTS_STEP && step.conclusion === 'failure')),
        conclusion: run.conclusion,
        url: run.html_url,
      };
    },
    async suiteLog(id) {
      return gh(['run', 'view', String(id), '-R', repo, '--log-failed']);
    },
    async suiteFailures(id) {
      const dir = mkdtempSync(join(tmpdir(), 'suite-failures-'));
      try {
        const result = await call(['run', 'download', String(id), '-R', repo, '-n', SUITE_FAILURES_ARTIFACT, '-D', dir]);
        const file = join(dir, SUITE_FAILURES_FILE);
        return result.code === 0 && existsSync(file) ? suiteFailuresOf(readFileSync(file, 'utf8')) : null;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    async suitePassed(sha) {
      if (!FULL_SHA.test(sha)) throw new Error(`A suite status needs a full 40 character commit sha, not ${sha}`);
      const status = JSON.parse(await gh(['api', `repos/${repo}/commits/${sha}/status`])) as { statuses: { context: string; state: string }[] };
      return status.statuses.some((entry) => entry.context === SUITE_STATUS_CONTEXT && entry.state === 'success');
    },
    async errorIssue(number) {
      const issue = JSON.parse(await gh(['issue', 'view', String(number), '-R', repo, '--json', 'number,state,stateReason,closedAt'])) as FingerprintIssue;
      return { ...issue, stateReason: issue.stateReason || null, closedAt: issue.closedAt || null };
    },
  };
}

const isFailedTest = (row: unknown): row is FailedTest => {
  const { file, test } = (row ?? {}) as { file?: unknown; test?: unknown };
  return typeof file === 'string' && file !== '' && (test === null || typeof test === 'string');
};

const isFileList = (value: unknown): value is string[] => Array.isArray(value) && value.every((file) => typeof file === 'string' && file !== '');

type RawFailures = { failed?: unknown; unfinished?: unknown; unhandledErrors?: unknown };

function isWellFormed(raw: RawFailures): raw is SuiteFailures {
  const failedOk = Array.isArray(raw.failed) && raw.failed.every(isFailedTest);
  return failedOk && isFileList(raw.unfinished) && Number.isInteger(raw.unhandledErrors) && (raw.unhandledErrors as number) >= 0;
}

export function suiteFailuresOf(text: string): SuiteFailures | null {
  try {
    const raw = JSON.parse(text) as RawFailures;
    if (!isWellFormed(raw)) return null;
    return { failed: raw.failed.map(({ file, test }) => ({ file, test })), unfinished: raw.unfinished, unhandledErrors: raw.unhandledErrors };
  } catch {
    return null;
  }
}

function retriable(result: RunResult, read: boolean): boolean {
  if (RATE_LIMITED.test(result.stderr)) return true;
  return read && (result.timedOut === true || UPSTREAM_DOWN.test(result.stderr) || CONNECTION_LOST.test(result.stderr));
}

export function isRead(args: string[]): boolean {
  if (args[0] !== 'api') return READ_COMMANDS.has(args[1]);
  if (args[1] === 'graphql') return !/^query=\s*mutation\b/.test(args[3] ?? '');
  const method = args.findIndex((arg) => arg === '-X' || arg === '--method');
  if (method !== -1) return args[method + 1] === 'GET';
  return !args.some((arg) => FIELD_FLAGS.has(arg));
}

function graphqlArgs(query: string, vars: Vars): string[] {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [name, value] of Object.entries(vars)) {
    args.push(typeof value === 'number' ? '-F' : '-f', `${name}=${value}`);
  }
  return args;
}

type OpenIssues = NonNullable<OpenIssuesPage['data']['repository']>['issues'];

function openIssuesOf(page: OpenIssuesPage, number: number, total: number): OpenIssues {
  const issues = page.data.repository?.issues;
  if (!issues) throw new IncompleteBoard(`open issues page ${number} has no issues list`);
  if (total >= 0 && issues.totalCount !== total) throw new IncompleteBoard(`open issues page ${number} counts ${issues.totalCount} issues, page 1 counted ${total}`);
  return issues;
}

function openCardOf(node: OpenIssueNode | null, projectId: string, seen: Set<number>, page: number): Card[] {
  if (node === null) throw new IncompleteBoard(`open issues page ${page} has a null issue`);
  if (seen.has(node.number)) throw new IncompleteBoard(`open issues page ${page} repeats issue ${node.number}`);
  seen.add(node.number);
  const item = node.projectItems.nodes.find((row) => row?.project?.id === projectId);
  return item?.fieldValueByName?.name ? [openCard(node, item)] : [];
}

function openCard(node: OpenIssueNode, item: NonNullable<OpenIssueNode['projectItems']['nodes'][number]>): Card {
  return { itemId: item.id, issue: node.number, column: item.fieldValueByName?.name as Column, labels: node.labels.nodes.map((label) => label.name), title: node.title };
}

function nextOpenCursor(issues: OpenIssues, seen: number, page: number): string | null {
  if (seen > issues.totalCount) throw new IncompleteBoard(`the open issue pages hold ${seen} issues, more than the ${issues.totalCount} they count`);
  if (!issues.pageInfo.hasNextPage) return null;
  if (issues.nodes.length === 0 || !issues.pageInfo.endCursor) throw new IncompleteBoard(`open issues page ${page} is empty but says more pages follow`);
  if (seen >= issues.totalCount) throw new IncompleteBoard(`open issues page ${page} still says more pages follow after all ${issues.totalCount} issues`);
  return issues.pageInfo.endCursor;
}

function withOpenCards(listed: Card[], open: Card[]): Card[] {
  const fresh = new Map(open.map((card) => [card.issue, card]));
  const known = new Set(listed.map((card) => card.issue));
  return [...listed.map((card) => fresh.get(card.issue) ?? card), ...open.filter((card) => !known.has(card.issue))];
}

function toIssue(node: CandidateNode): Issue {
  return {
    number: node.number, title: node.title, body: node.body, createdAt: node.createdAt, state: node.state,
    author: node.author?.login ?? 'ghost', labels: node.labels.nodes.map((label) => label.name),
  };
}

function toCard(node: ItemNode, repo: string): Card | null {
  const content = node.content;
  const column = node.fieldValueByName?.name;
  if (!content || !column || !content.number || !inRepo(content, repo)) return null;
  return { itemId: node.id, issue: content.number, column: column as Column, labels: labelsOf(content), title: titleOf(content) };
}

const titleOf = (content: NonNullable<ItemNode['content']>): string => content.title ?? '';

function inRepo(content: NonNullable<ItemNode['content']>, repo: string): boolean {
  return content.repository?.nameWithOwner === repo;
}

function labelsOf(content: NonNullable<ItemNode['content']>): string[] {
  return (content.labels?.nodes ?? []).map((label) => label.name);
}
