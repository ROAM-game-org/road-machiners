import { must } from './exec';
import { COLUMNS, FACTORY_MARK } from './types';
import type { Card, Column, FactoryConfig, FingerprintIssue, GitHub, Issue, IssueComment, Run, RunResult } from './types';

const ISSUE_FIELDS = 'number,title,body,labels,createdAt,state,author';

type Board = { projectId: string; fieldId: string; options: Record<string, string> };
type RawIssue = Omit<Issue, 'labels' | 'author'> & { labels: { name: string }[]; author: { login: string } };
type Vars = Record<string, string | number>;

type BoardData = {
  id: string;
  field: { id: string; options: { id: string; name: string }[] } | null;
};

const PROJECT_FIELDS = 'id field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }';

const ITEMS_QUERY = `query($project: ID!, $cursor: String) { node(id: $project) { ... on ProjectV2 {
  items(first: 100, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { id
    fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
    content { ... on Issue { number title repository { nameWithOwner } labels(first: 50) { nodes { name } } } } } } } } }`;

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
  data: { node: { items: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: ItemNode[] } } };
};

const NOT_THIS_KIND = /Could not resolve to an? (User|Organization)/;

const RATE_LIMITED = /rate limit|HTTP 429|submitted too quickly/i;
const TAG_EXISTS = /a release with the same tag name already exists/;

export class GithubError extends Error {}

type Wait = (ms: number) => Promise<void>;
const sleep: Wait = (ms) => new Promise((done) => setTimeout(done, ms));

export const SUITE_WORKFLOW = 'game-suite.yml';
export const SUITE_TESTS_STEP = 'tests';

type RawRun = { status: string; conclusion: string | null; html_url: string };
type RawJob = { status: string; steps: { name: string; conclusion: string | null }[] };

type RawComment ={ login: string; body: string; createdAt: string; appId: number | null };

type ClientConfig = Pick<FactoryConfig, 'githubAppId' | 'repo' | 'projectOwner' | 'projectNumber' | 'githubRetries' | 'githubRetryBaseSeconds' | 'githubTimeoutSeconds'>;

export function ghClient(run: Run, cfg: ClientConfig, wait: Wait = sleep): GitHub {
  const repo = cfg.repo;
  let board: Board | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function attempt(args: string[]): Promise<RunResult> {
    for (let retry = 0; ; retry++) {
      const result = await run('gh', args, { activity: 'git', timeoutMs: cfg.githubTimeoutSeconds * 1000 });
      if (result.code === 0 || !RATE_LIMITED.test(result.stderr) || retry === cfg.githubRetries) return result;
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

  async function cards(): Promise<Card[]> {
    const b = await loadBoard();
    const found: Card[] = [];
    let cursor = '';
    for (;;) {
      const vars: Vars = cursor ? { project: b.projectId, cursor } : { project: b.projectId };
      const page = JSON.parse(await graphql(ITEMS_QUERY, vars)) as ItemsPage;
      const items = page.data.node.items;
      for (const node of items.nodes) {
        const card = toCard(node, repo);
        if (card) found.push(card);
      }
      if (!items.pageInfo.hasNextPage) return found;
      cursor = items.pageInfo.endCursor;
    }
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
    async addCard(number, column) {
      const b = await loadBoard();
      const view = JSON.parse(await gh(['issue', 'view', String(number), '-R', repo, '--json', 'id'])) as { id: string };
      const added = JSON.parse(await graphql(ADD_ITEM, { project: b.projectId, content: view.id })) as {
        data: { addProjectV2ItemById: { item: { id: string } } };
      };
      await setStatus(added.data.addProjectV2ItemById.item.id, column);
    },
    async move(number, column) {
      const card = (await cards()).find((c) => c.issue === number);
      if (!card) throw new Error(`Issue ${number} is not on the board`);
      await setStatus(card.itemId, column);
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
    async dispatchSuite(sha) {
      const out = await gh(['api', '-X', 'POST', `repos/${repo}/actions/workflows/${SUITE_WORKFLOW}/dispatches`, '-f', 'ref=main', '-f', `inputs[sha]=${sha}`, '-F', 'return_run_details=true']);
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
    async errorIssue(number) {
      const issue = JSON.parse(await gh(['issue', 'view', String(number), '-R', repo, '--json', 'number,state,stateReason,closedAt'])) as FingerprintIssue;
      return { ...issue, stateReason: issue.stateReason || null, closedAt: issue.closedAt || null };
    },
  };
}

function graphqlArgs(query: string, vars: Vars): string[] {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [name, value] of Object.entries(vars)) {
    args.push(typeof value === 'number' ? '-F' : '-f', `${name}=${value}`);
  }
  return args;
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
