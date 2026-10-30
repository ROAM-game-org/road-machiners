import { describe, expect, it } from 'vitest';
import { GithubError, ghClient, isRead } from './github';
import { COLUMNS, type FactoryConfig, type Run, type RunResult } from './types';

const CFG = { repo: 'o/r', projectOwner: 'o', projectNumber: 3, githubAppId: '42', githubRetries: 3, githubRetryBaseSeconds: 15, githubTimeoutSeconds: 60 } as FactoryConfig;
const ok = (stdout: string): RunResult => ({ code: 0, stdout, stderr: '' });
const RATE_LIMITED: RunResult = { code: 1, stdout: '', stderr: 'HTTP 403: API rate limit exceeded for user ID 1.' };

const NODE = (number: number, projects: string[] = []) => ({
  number, title: `t${number}`, body: '', labels: { nodes: [{ name: 'bug' }] }, createdAt: '2026-01-01T00:00:00Z', state: 'OPEN', author: { login: 'anna' },
  projectItems: { nodes: projects.map((id) => ({ project: { id } })) },
});

function searchPage(nodes: unknown[], endCursor = ''): string {
  return JSON.stringify({ data: { search: { pageInfo: { hasNextPage: endCursor !== '', endCursor }, nodes } } });
}

function project(options: string[]): string {
  const field = { id: 'F1', options: options.map((name) => ({ id: `id-${name}`, name })) };
  return JSON.stringify({ data: { user: { projectV2: { id: 'P1', field } } } });
}

const ALL = [...COLUMNS];

function fake(calls: string[][], projectJson: string): Run {
  return async (_cmd, args) => {
    calls.push(args);
    const text = args.join(' ');
    if (text.includes('search(type: ISSUE')) return ok(text.includes('cursor=') ? searchPage([NODE(3)]) : searchPage([NODE(1), NODE(2)], 'C1'));
    if (text.includes('repos/o/r/issues/1/comments')) return ok('{"login":"a","body":"hi\\nthere","createdAt":"t1","appId":null}\n{"login":"bot[bot]","body":"mine","createdAt":"t2","appId":42}\n{"login":"other[bot]","body":"theirs","createdAt":"t3","appId":7}\n');
    if (text.includes('projectV2(number')) return ok(projectJson);
    if (text.includes('issues(states: OPEN')) return ok(JSON.stringify({ data: { repository: { issues: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } }));
    if (text.includes('projectItems(first')) {
      const item = { id: 'I7', project: { id: 'P1' }, fieldValueByName: { name: 'Design' }, content: { number: 7, title: 'Winch', repository: { nameWithOwner: 'o/r' }, labels: { nodes: [{ name: 'bug' }] } } };
      return ok(JSON.stringify({ data: { repository: { issue: { projectItems: { nodes: text.includes('number=7') ? [item] : [] } } } } }));
    }
    if (text.includes('items(first')) {
      const items = { totalCount: 3, pageInfo: { hasNextPage: false, endCursor: '' }, nodes: [
        { id: 'I7', fieldValueByName: { name: 'Design' }, content: { number: 7, title: 'Winch', repository: { nameWithOwner: 'o/r' }, labels: { nodes: [{ name: 'bug' }] } } },
        { id: 'I8', fieldValueByName: { name: 'Done' }, content: { number: 8, repository: { nameWithOwner: 'x/y' }, labels: { nodes: [] } } },
        { id: 'I9', fieldValueByName: null, content: { number: 9, repository: { nameWithOwner: 'o/r' }, labels: { nodes: [] } } },
      ] };
      return ok(JSON.stringify({ data: { node: { items } } }));
    }
    return ok('');
  };
}

describe('ghClient', () => {
  it('reads candidates of any label in one search, page by page', async () => {
    const calls: string[][] = [];
    const found = await ghClient(fake(calls, project(ALL)), CFG).candidates(['bug', 'feature-request']);
    expect(found.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(found[0]).toMatchObject({ author: 'anna', labels: ['bug'], state: 'OPEN' });
    const searches = calls.filter((args) => args.join(' ').includes('search(type: ISSUE'));
    expect(searches).toHaveLength(2);
    expect(searches[0]).toContain('search=repo:o/r is:issue is:open label:"bug","feature-request"');
    expect(searches[1]).toContain('cursor=C1');
  });

  it('leaves out an issue the board already holds, though the board lists it late', async () => {
    const run: Run = async (_cmd, args) => {
      const text = args.join(' ');
      if (text.includes('projectV2(number')) return ok(project(ALL));
      return ok(searchPage([NODE(1, ['P1']), NODE(2, ['P-other'])]));
    };
    const found = await ghClient(run, CFG).candidates(['bug']);
    expect(found.map((i) => i.number)).toEqual([2]);
  });

  it('reads no reactions with the search', async () => {
    const calls: string[][] = [];
    await ghClient(fake(calls, project(ALL)), CFG).candidates(['bug']);
    expect(calls.flat().join(' ')).not.toMatch(/reactions/);
  });

  it('counts a release tag that already exists as made, and fails on any other error', async () => {
    const failing = (stderr: string): Run => async () => ({ code: 1, stdout: '', stderr });
    await ghClient(failing('a release with the same tag name already exists: release-x'), CFG).createRelease('release-x', 'main', 't', 'n');
    await expect(ghClient(failing('HTTP 500'), CFG).createRelease('release-x', 'main', 't', 'n')).rejects.toThrow('gh release create');
  });

  it('waits twice as long before each retry of a rate-limited call', async () => {
    const waits: number[] = [];
    let calls = 0;
    const run: Run = async () => (++calls < 4 ? RATE_LIMITED : ok(''));
    await ghClient(run, CFG, async (ms) => { waits.push(ms); }).reopen(7);
    expect(waits).toEqual([15000, 30000, 60000]);
  });

  it('fails with the rate-limit error once the retries run out', async () => {
    const waits: number[] = [];
    const client = ghClient(async () => RATE_LIMITED, CFG, async (ms) => { waits.push(ms); });
    await expect(client.reopen(7)).rejects.toThrow('rate limit');
    expect(waits).toHaveLength(3);
  });

  it('does not retry a failure that is not a rate limit', async () => {
    let calls = 0;
    const run: Run = async () => { calls++; return { code: 1, stdout: '', stderr: 'HTTP 404: Not Found' }; };
    await expect(ghClient(run, CFG, async () => {}).reopen(7)).rejects.toThrow('404');
    expect(calls).toBe(1);
  });

  it('throws a GithubError for every failed gh call', async () => {
    const run: Run = async () => ({ code: 1, stdout: '', stderr: 'HTTP 404: Not Found' });
    await expect(ghClient(run, CFG, async () => {}).reopen(7)).rejects.toBeInstanceOf(GithubError);
  });

  it('gives every call the timeout and does not retry a write that timed out', async () => {
    const timeouts: (number | undefined)[] = [];
    const run: Run = async (_cmd, _args, opts) => { timeouts.push(opts?.timeoutMs); return { code: 1, stdout: '', stderr: 'gh timed out after 60000 ms and was killed', timedOut: true }; };
    await expect(ghClient(run, CFG, async () => {}).reopen(7)).rejects.toThrow('timed out');
    expect(timeouts).toEqual([60000]);
  });

  it('retries a read that hit a GitHub gateway error, with the rate-limit waits', async () => {
    const waits: number[] = [];
    const answers: RunResult[] = [
      { code: 1, stdout: '', stderr: 'gh: HTTP 502' },
      { code: 1, stdout: '', stderr: 'gh: HTTP 504' },
      { code: 1, stdout: '', stderr: 'gh: HTTP 503' },
      ok(JSON.stringify({ number: 7, title: 't', body: '', labels: [], createdAt: 't', state: 'OPEN', author: { login: 'a' } })),
    ];
    const run: Run = async () => answers.shift() ?? ok('');
    const issue = await ghClient(run, CFG, async (ms) => { waits.push(ms); }).issue(7);
    expect(issue.number).toBe(7);
    expect(waits).toEqual([15000, 30000, 60000]);
  });

  it('retries a read that timed out', async () => {
    let calls = 0;
    const run: Run = async (_cmd, args) => {
      calls++;
      if (calls === 1) return { code: 1, stdout: '', stderr: 'gh timed out after 60000 ms and was killed', timedOut: true };
      return fake([], project(ALL))(_cmd, args, { activity: 'git' });
    };
    expect((await ghClient(run, CFG, async () => {}).cards()).map((card) => card.issue)).toEqual([7]);
    expect(calls).toBeGreaterThan(1);
  });

  it('reads the board through GraphQL gateway errors on every page query', async () => {
    const calls: string[][] = [];
    const inner = fake(calls, project(ALL));
    const failed = new Set<string>();
    const run: Run = async (cmd, args, opts) => {
      const text = args.join(' ');
      const kind = ['projectV2(number', 'items(first', 'issues(states: OPEN'].find((key) => text.includes(key));
      if (kind && !failed.has(kind)) { failed.add(kind); return { code: 1, stdout: '', stderr: 'gh: HTTP 504' }; }
      return inner(cmd, args, opts);
    };
    expect((await ghClient(run, CFG, async () => {}).cards()).map((card) => card.issue)).toEqual([7]);
    expect(failed.size).toBe(3);
  });

  it('retries a read that lost its connection, like the suite run read that ended a merge job', async () => {
    const waits: number[] = [];
    const answers: RunResult[] = [
      { code: 1, stdout: '', stderr: 'stream error: stream ID 1; CANCEL; received from peer' },
      { code: 1, stdout: '', stderr: 'read tcp 10.0.0.2:443: connection reset by peer' },
      ok(JSON.stringify({ number: 7, title: 't', body: '', labels: [], createdAt: 't', state: 'OPEN', author: { login: 'a' } })),
    ];
    const run: Run = async () => answers.shift() ?? ok('');
    expect((await ghClient(run, CFG, async (ms) => { waits.push(ms); }).issue(7)).number).toBe(7);
    expect(waits).toEqual([15000, 30000]);
  });

  it('fails a read with the gateway error once the retries run out', async () => {
    const waits: number[] = [];
    const run: Run = async () => ({ code: 1, stdout: '', stderr: 'gh: HTTP 502' });
    await expect(ghClient(run, CFG, async (ms) => { waits.push(ms); }).issue(7)).rejects.toThrow('HTTP 502');
    expect(waits).toHaveLength(3);
  });

  it('never repeats a write or a mutation that hit a gateway error or timed out', async () => {
    const failures: RunResult[] = [
      { code: 1, stdout: '', stderr: 'gh: HTTP 502' },
      { code: 1, stdout: '', stderr: 'gh timed out after 60000 ms and was killed', timedOut: true },
      { code: 1, stdout: '', stderr: 'stream error: stream ID 3; CANCEL; received from peer' },
    ];
    for (const failure of failures) {
      const calls: string[][] = [];
      const run: Run = async (cmd, args, opts) => {
        const text = args.join(' ');
        if (args[1] === 'comment' || text.includes('mutation(') || args.includes('title=t')) { calls.push(args); return failure; }
        return fake([], project(ALL))(cmd, args, opts);
      };
      const client = ghClient(run, CFG, async () => {});
      await expect(client.comment(1, 'Hello')).rejects.toThrow();
      await expect(client.move(7, 'Done')).rejects.toThrow();
      expect(calls).toHaveLength(2);
    }
  });

  it('tells reads from writes by their gh arguments', () => {
    expect(isRead(['issue', 'view', '7'])).toBe(true);
    expect(isRead(['pr', 'list', '--head', 'b'])).toBe(true);
    expect(isRead(['run', 'view', '9', '--log-failed'])).toBe(true);
    expect(isRead(['run', 'download', '9', '-n', 'test-failures'])).toBe(true);
    expect(isRead(['api', 'repos/o/r/actions/runs/9'])).toBe(true);
    expect(isRead(['api', '-X', 'GET', 'repos/o/r/issues'])).toBe(true);
    expect(isRead(['api', 'graphql', '-f', 'query=query($a: ID!) { node(id: $a) { id } }'])).toBe(true);
    expect(isRead(['api', 'graphql', '-f', 'query=mutation($a: ID!) { x(input: {id: $a}) { id } }'])).toBe(false);
    expect(isRead(['api', 'repos/o/r/issues', '-f', 'title=t'])).toBe(false);
    expect(isRead(['api', '-X', 'POST', 'repos/o/r/actions/workflows/w/dispatches'])).toBe(false);
    expect(isRead(['issue', 'comment', '7', '--body', 'b'])).toBe(false);
    expect(isRead(['issue', 'edit', '7', '--add-label', 'l'])).toBe(false);
    expect(isRead(['release', 'create', 'v1'])).toBe(false);
    expect(isRead(['label', 'create', 'l'])).toBe(false);
  });

  it('sends one call at a time, even after a failed call', async () => {
    let running = 0;
    let most = 0;
    const run: Run = async (_cmd, args) => {
      running++;
      most = Math.max(most, running);
      await new Promise((done) => setTimeout(done, 5));
      running--;
      return args.includes('1') ? { code: 1, stdout: '', stderr: 'HTTP 404' } : ok('');
    };
    const client = ghClient(run, CFG);
    const results = await Promise.allSettled([client.reopen(1), client.reopen(2), client.reopen(3)]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
    expect(most).toBe(1);
  });

  it('ends every comment with the factory marker on its own line', async () => {
    const calls: string[][] = [];
    await ghClient(fake(calls, project(ALL)), CFG).comment(1, 'Hello');
    expect(calls[0]).toEqual(['issue', 'comment', '1', '-R', 'o/r', '--body', 'Hello\n\n<!-- roam-factory -->']);
  });

  it('marks only the comments the factory app wrote', async () => {
    const list = await ghClient(fake([], project(ALL)), CFG).comments(1);
    expect(list).toEqual([
      { login: 'a', body: 'hi\nthere', createdAt: 't1', byFactory: false },
      { login: 'bot[bot]', body: 'mine', createdAt: 't2', byFactory: true },
      { login: 'other[bot]', body: 'theirs', createdAt: 't3', byFactory: false },
    ]);
  });

  it('lists cards of this repo with a status', async () => {
    const cards = await ghClient(fake([], project(ALL)), CFG).cards();
    expect(cards).toEqual([{ itemId: 'I7', issue: 7, column: 'Design', labels: ['bug'], title: 'Winch' }]);
  });

  it('move sets the status option of the item', async () => {
    const calls: string[][] = [];
    await ghClient(fake(calls, project(ALL)), CFG).move(7, 'Testing');
    const mutation = calls.find((args) => args.join(' ').includes('updateProjectV2ItemFieldValue')) ?? [];
    expect(mutation).toEqual(expect.arrayContaining(['project=P1', 'item=I7', 'field=F1', 'option=id-Testing']));
  });

  it('finds the open pull request of a branch or null', async () => {
    const run: Run = async (_cmd, args) => ok(args.includes('factory/issue-7') ? '[{"url":"https://github.com/o/r/pull/3"}]' : '[]');
    const client = ghClient(run, CFG);
    expect(await client.pullRequestFor('factory/issue-7')).toBe('https://github.com/o/r/pull/3');
    expect(await client.pullRequestFor('factory/issue-8')).toBeNull();
  });

  it('lists pull requests by head and closes one with a comment', async () => {
    const calls: string[][] = [];
    const client = ghClient(async (_cmd, args) => { calls.push(args); return ok('[]'); }, CFG);
    await client.pullRequestFor('b');
    await client.closePullRequest('b', 'Denied');
    expect(calls[0]).toEqual(['pr', 'list', '-R', 'o/r', '--head', 'b', '--state', 'open', '--json', 'url']);
    expect(calls[1]).toEqual(['pr', 'close', 'b', '-R', 'o/r', '--comment', 'Denied']);
  });

  it('names a missing Status option', async () => {
    const client = ghClient(fake([], project(['Triage', 'Design', 'Done'])), CFG);
    await expect(client.cards()).rejects.toThrow('"Implementation"');
  });

  it('names a missing Merging option', async () => {
    const client = ghClient(fake([], project(ALL.filter((name) => name !== 'Merging'))), CFG);
    await expect(client.cards()).rejects.toThrow('"Merging"');
  });

  it('shows the real error when the project lookup fails for another reason', async () => {
    const run: Run = async () => ({ code: 1, stdout: '', stderr: 'HTTP 502: Bad Gateway' });
    await expect(ghClient(run, CFG, async () => {}).cards()).rejects.toThrow('502');
  });

  it('tries the organization when the owner is not a user', async () => {
    const orgProject = JSON.stringify({ data: { organization: { projectV2: { id: 'P1', field: { id: 'F1', options: ALL.map((name) => ({ id: name, name })) } } } } });
    const run: Run = async (_cmd, args) => {
      const text = args.join(' ');
      if (text.includes('user(login')) return { code: 1, stdout: '', stderr: "Could not resolve to a User with the login of 'o'." };
      if (text.includes('organization(login')) return ok(orgProject);
      if (text.includes('issues(states: OPEN')) return ok(JSON.stringify({ data: { repository: { issues: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } }));
      return ok(JSON.stringify({ data: { node: { items: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: '' }, nodes: [] } } } }));
    };
    await expect(ghClient(run, CFG, async () => {}).cards()).resolves.toEqual([]);
  });

  it('reopens an issue', async () => {
    const calls: string[][] = [];
    await ghClient(async (_cmd, args) => { calls.push(args); return ok(''); }, CFG).reopen(7);
    expect(calls).toEqual([['issue', 'reopen', '7', '-R', 'o/r']]);
  });

  it('creates only a missing label before it opens an issue with it', async () => {
    const calls: string[][] = [];
    const run: Run = async (_cmd, args) => {
      calls.push(args);
      if (args[0] === 'label' && args[1] === 'list') return ok('maintenance\n');
      return ok(args[0] === 'api' ? '31\n' : '');
    };
    const number = await ghClient(run, CFG).createIssue('T', 'B', ['release-task', 'maintenance']);
    expect(number).toBe(31);
    expect(calls.map((args) => args.slice(0, 3).join(' '))).toEqual(['label list -R', 'label create release-task', 'api repos/o/r/issues -f']);
    expect(calls[2]).toEqual(['api', 'repos/o/r/issues', '-f', 'title=T', '-f', 'body=B', '-f', 'labels[]=release-task', '-f', 'labels[]=maintenance', '--jq', '.number']);
  });

  it('reads the repo labels once and adds a known label with one write', async () => {
    const calls: string[][] = [];
    const run: Run = async (_cmd, args) => { calls.push(args); return ok(args[1] === 'list' ? 'factory-stuck\n' : ''); };
    const client = ghClient(run, CFG);
    await client.addLabel(4, 'factory-stuck');
    await client.addLabel(5, 'factory-stuck');
    expect(calls.map((args) => args.slice(0, 3).join(' '))).toEqual(['label list -R', 'issue edit 4', 'issue edit 5']);
  });

  it('reads an open error-report issue with empty close fields as null', async () => {
    const run: Run = async () => ok(JSON.stringify({ number: 8, state: 'OPEN', stateReason: '', closedAt: '' }));
    expect(await ghClient(run, CFG).errorIssue(8)).toEqual({ number: 8, state: 'OPEN', stateReason: null, closedAt: null });
  });
});
