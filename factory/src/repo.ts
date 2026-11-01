import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { GUARD_HOOK } from './container';
import { must, withActivity } from './exec';
import { withLock } from './lock';
import { createLockWaitReporter } from './observability';
import { BaseMovedError, CLONE_LOCK_MS, MEDIA_DIR, MergeConflictError, OUT_DIR, RevertConflictError, TASK_DIR, WORK_LOCK, type CheckedBuild, type FactoryConfig, type HostRepo, type MergeStep, type Resolution, type Run } from './types';

const NO_HOOKS = ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=ROAM Factory', '-c', 'user.email=factory@roam.invalid'];

const lines = (text: string): string[] => text.split('\n').filter(Boolean);

const nulSeparated = (text: string): string[] => text.split('\0').filter(Boolean);

const mergeFlags = (message: string | undefined): string[] => (message === undefined ? ['--no-edit'] : ['--no-ff', '-m', message]);

export function hostRepo(observedRun: Run, cfg: FactoryConfig, jobId: string | null = null): HostRepo {
  const run = withActivity(observedRun, 'git');
  const path = `${cfg.home}/repo`;
  const landDir = join(cfg.home, 'work', 'land');
  const gitIn = async (cwd: string, args: string[]): Promise<string> => must(await run('git', [...NO_HOOKS, ...args], { cwd }), `git ${args.join(' ')}`);
  const git = (args: string[]): Promise<string> => gitIn(path, args);
  const hasRef = async (cwd: string, ref: string): Promise<boolean> => (await run('git', [...NO_HOOKS, 'rev-parse', '--verify', '--quiet', ref], { cwd })).code === 0;

  async function ref(name: string): Promise<string> {
    return (await hasRef(path, `refs/remotes/origin/${name}`)) ? `origin/${name}` : name;
  }

  async function commitOf(name: string): Promise<string> {
    return (await git(['rev-parse', `${await ref(name)}^{commit}`])).trim();
  }

  async function inWorktree<T>(commit: string, work: (dir: string) => Promise<T>): Promise<T> {
    rmSync(landDir, { recursive: true, force: true });
    await git(['worktree', 'prune']);
    await git(['worktree', 'add', '--detach', landDir, commit]);
    try {
      return await work(landDir);
    } finally {
      rmSync(landDir, { recursive: true, force: true });
      await git(['worktree', 'prune']);
    }
  }

  async function isAncestor(older: string, newer: string): Promise<boolean> {
    const result = await run('git', [...NO_HOOKS, 'merge-base', '--is-ancestor', older, newer], { cwd: path });
    if (result.code === 0 || result.code === 1) return result.code === 0;
    throw new Error(`git merge-base --is-ancestor ${older} ${newer} failed: ${result.stderr.trim()}`);
  }

  async function requireChecked({ branch, build, base }: CheckedBuild): Promise<void> {
    const built = await commitOf(build);
    const tip = await commitOf(branch);
    if (tip !== built) throw new BaseMovedError(branch, build, `${branch} is at ${tip.slice(0, 7)}, not at the checked build ${build}.`);
    const target = await commitOf(base);
    if ((await isAncestor(target, built)) || (await isAncestor(built, target))) return;
    throw new BaseMovedError(branch, build, `${base} moved to ${target.slice(0, 7)} after the checks ran on ${build}, so they no longer count.`);
  }

  async function conflictedFiles(dir: string): Promise<string[]> {
    return lines(await gitIn(dir, ['diff', '--name-only', '--diff-filter=U']));
  }

  function mergeCommit(source: string, base: string, step: MergeStep, resolutions: Resolution[], done: Resolution[]): Promise<string> {
    const resolved = resolutions.find((item) => item.base === base && item.source === source);
    if (resolved) return Promise.resolve(resolved.head);
    return inWorktree(base, async (dir) => {
      const result = await run('git', [...NO_HOOKS, 'merge', '--no-ff', '-m', step.message, source], { cwd: dir });
      if (result.code !== 0) {
        const files = await conflictedFiles(dir);
        const reason = (result.stderr || result.stdout).trim();
        if (files.length === 0) throw new Error(`merge of ${step.branch} into ${step.into} failed without a conflict: ${reason}`);
        throw new MergeConflictError(step, files, reason, base, source, done);
      }
      return (await gitIn(dir, ['rev-parse', 'HEAD'])).trim();
    });
  }

  async function revertCommit(issue: number, branch: string, at: { tip: string; hash: string }, resolutions: Resolution[]): Promise<string> {
    const resolved = resolutions.find((item) => item.base === at.tip && item.source === at.hash);
    if (resolved) return resolved.head;
    return inWorktree(at.tip, async (dir) => {
      const result = await run('git', [...NO_HOOKS, 'revert', '--no-edit', '-m', '1', at.hash], { cwd: dir });
      if (result.code === 0) return (await gitIn(dir, ['rev-parse', 'HEAD'])).trim();
      const files = await conflictedFiles(dir);
      const reason = (result.stderr || result.stdout).trim();
      if (files.length === 0) throw new Error(`revert of issue #${issue} on ${branch} failed without a conflict: ${reason}`);
      throw new RevertConflictError(issue, branch, files, reason, at.tip, at.hash);
    });
  }

  async function pushUnlessMoved(heads: Map<string, string>, started: Map<string, string>): Promise<boolean> {
    const pushed = await run('git', [...NO_HOOKS, 'push', '--atomic', 'origin', ...[...heads].map(([branch, commit]) => `${commit}:refs/heads/${branch}`)], { cwd: path });
    if (pushed.code === 0) return true;
    await git(['fetch', '--prune', 'origin']);
    const moved = await Promise.all([...started].map(async ([branch, commit]) => (await commitOf(branch)) !== commit));
    if (!moved.includes(true)) throw new Error(`push of ${[...heads.keys()].join(', ')} failed: ${(pushed.stderr || pushed.stdout).trim()}`);
    return false;
  }

  async function mergeSteps(steps: MergeStep[], resolutions: Resolution[]): Promise<{ heads: Map<string, string>; started: Map<string, string> }> {
    const heads = new Map<string, string>();
    const started = new Map<string, string>();
    const tip = async (name: string): Promise<string> => heads.get(name) ?? commitOf(name);
    const done: Resolution[] = [];
    for (const step of steps) {
      if (!started.has(step.into)) started.set(step.into, await commitOf(step.into));
      const [source, base] = [await tip(step.branch), await tip(step.into)];
      const head = await mergeCommit(source, base, step, resolutions, done);
      done.push({ base, source, head });
      heads.set(step.into, head);
    }
    return { heads, started };
  }

  async function pushAll(heads: Map<string, string>): Promise<void> {
    await git(['push', '--atomic', 'origin', ...[...heads].map(([branch, commit]) => `${commit}:refs/heads/${branch}`)]);
  }

  async function headFromWork(dir: string, branch: string): Promise<string> {
    const head = (await gitIn(dir, ['rev-parse', `refs/heads/${branch}`])).trim();
    await git(['fetch', dir, `refs/heads/${branch}`]);
    return head;
  }

  async function prepareClone(branch: string, base: string, dir: string): Promise<void> {
    if (existsSync(dir)) {
      if (existsSync(join(dir, '.git')) && (await hasRef(dir, 'HEAD'))) return installGuardHook(dir);
      console.error(`${dir} has no commit checked out, so it is cloned again`);
      rmSync(dir, { recursive: true, force: true });
    }
    await initClone(dir);
    await checkoutBranch(dir, branch, base);
    installGuardHook(dir);
  }

  function installGuardHook(dir: string): void {
    mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
    writeFileSync(join(dir, '.git', 'hooks', 'pre-commit'), GUARD_HOOK, { mode: 0o755 });
  }

  async function initClone(dir: string): Promise<void> {
    mkdirSync(dir, { recursive: true });
    await gitIn(dir, ['init', '--quiet']);
    await gitIn(dir, ['remote', 'add', 'origin', path]);
    await gitIn(dir, ['config', 'remote.origin.fetch', '+refs/remotes/origin/*:refs/remotes/origin/*']);
    await gitIn(dir, ['fetch', '--quiet', 'origin']);
    appendFileSync(join(dir, '.git', 'info', 'exclude'), `\n${OUT_DIR}/\n${TASK_DIR}/\n${MEDIA_DIR}/\n`);
  }

  async function openWork(dir: string): Promise<string[]> {
    const marks = await Promise.all(['MERGE_HEAD', 'REVERT_HEAD', 'CHERRY_PICK_HEAD'].map(async (mark) => ((await hasRef(dir, mark)) ? [mark] : [])));
    const gitDir = (await gitIn(dir, ['rev-parse', '--absolute-git-dir'])).trim();
    const rebases = ['rebase-merge', 'rebase-apply'].filter((name) => existsSync(join(gitDir, name)));
    return [...marks.flat(), ...rebases, ...(await conflictedFiles(dir))];
  }

  async function openMergeOf(dir: string, branch: string): Promise<{ commit: string; conflicts: string[] } | null> {
    if (!(await hasRef(dir, 'MERGE_HEAD'))) return null;
    const commit = (await gitIn(dir, ['rev-parse', 'MERGE_HEAD'])).trim();
    if ((await run('git', [...NO_HOOKS, 'merge-base', '--is-ancestor', commit, `origin/${branch}`], { cwd: dir })).code !== 0) return null;
    const conflicts = await conflictedFiles(dir);
    return { commit, conflicts: conflicts.length > 0 ? conflicts : lines(await gitIn(dir, ['diff', '--name-only', 'HEAD', 'MERGE_HEAD'])) };
  }

  async function requireNoOpenWork(dir: string): Promise<void> {
    const open = await openWork(dir);
    if (open.length > 0) throw new Error(`${dir} has an unfinished merge or conflicts (${open.join(', ')}), so the factory left it as it is. Repair it with factory repair-clone.`);
  }

  async function mergeBranchCommit(dir: string, branch: string, commit: string, message?: string): Promise<{ commit: string; conflicts: string[] }> {
    const result = await run('git', [...NO_HOOKS, 'merge', ...mergeFlags(message), commit], { cwd: dir });
    if (result.code === 0) return { commit, conflicts: [] };
    const conflicts = await conflictedFiles(dir);
    if (conflicts.length === 0) throw new Error(`merge of ${branch} into ${dir} failed without a conflict: ${(result.stderr || result.stdout).trim()}`);
    return { commit, conflicts };
  }

  async function untouchable(dir: string): Promise<string | null> {
    await requireNoOpenWork(dir);
    const changed = lines(await gitIn(dir, ['status', '--porcelain', '--untracked-files=no']));
    return changed.length === 0 ? null : `uncommitted changes in ${changed.map((line) => line.slice(3)).join(', ')}`;
  }

  async function mergeBaseCommit(dir: string, base: string, commit: string): Promise<{ commit: string | null; conflicts: string[]; kept: string | null }> {
    const result = await run('git', [...NO_HOOKS, 'merge', '--no-edit', commit], { cwd: dir });
    if (result.code === 0) return { commit, conflicts: [], kept: null };
    const conflicts = await conflictedFiles(dir);
    if (conflicts.length > 0) return { commit, conflicts, kept: null };
    const reason = (result.stderr || result.stdout).trim();
    if ((await openWork(dir)).length > 0) throw new Error(`merge of ${base} into ${dir} failed without a conflict and left it open: ${reason}`);
    return { commit: null, conflicts: [], kept: `git refused the merge of ${base}: ${reason}` };
  }

  async function requireFinished(dir: string, into: string, source: string): Promise<void> {
    const open = (await conflictedFiles(dir)).length > 0 || (await hasRef(dir, 'MERGE_HEAD')) || (await hasRef(dir, 'REVERT_HEAD'));
    if (open) throw new Error(`The agent left the conflict of ${source} on ${into} unfinished`);
  }

  async function requireDescends(head: string, ancestor: string, what: string): Promise<void> {
    const result = await run('git', [...NO_HOOKS, 'merge-base', '--is-ancestor', ancestor, head], { cwd: path });
    if (result.code !== 0 || head === ancestor) throw new Error(`The agent's commit ${head.slice(0, 7)} does not hold ${ancestor.slice(0, 7)}, ${what}`);
  }

  async function agentAdded(base: string, source: string, head: string): Promise<{ files: string[]; diff: string }> {
    const names = async (side: string): Promise<string[]> => nulSeparated(await git(['diff', '--name-only', '-z', side, head]));
    const fromSource = new Set(await names(source));
    const files = (await names(base)).filter((file) => fromSource.has(file));
    return { files, diff: files.length === 0 ? '' : await git(['diff', base, head, '--', ...files]) };
  }

  async function checkoutBranch(dir: string, branch: string, base: string): Promise<void> {
    const start = (await hasRef(dir, `refs/remotes/origin/${branch}`)) ? branch : base;
    await gitIn(dir, ['checkout', '-B', branch, `origin/${start}`]);
  }

  return lockEach(cfg, jobId, {
    path,
    async fetch() {
      if (!existsSync(path)) {
        mkdirSync(dirname(path), { recursive: true });
        await gitIn(dirname(path), ['clone', `https://github.com/${cfg.repo}.git`, path]);
      }
      await git(['fetch', '--prune', 'origin']);
      const local = lines(await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads']));
      if (local.length === 0) return;
      await git(['checkout', '--detach']);
      const free = lines(await git(['for-each-ref', '--format=%(if)%(worktreepath)%(then)%(else)%(refname:short)%(end)', 'refs/heads']));
      if (free.length > 0) await git(['branch', '-D', ...free]);
    },
    async createBranch(name, from) {
      if (await hasRef(path, `refs/remotes/origin/${name}`)) throw new Error(`branch ${name} exists on GitHub already`);
      await pushAll(new Map([[name, await commitOf(from)]]));
    },
    async revertMerge(merge, branch, resolutions = []) {
      for (;;) {
        const tip = await commitOf(branch);
        if ((await run('git', [...NO_HOOKS, 'merge-base', '--is-ancestor', merge.sha, tip], { cwd: path })).code !== 0) throw new Error(`The recorded merge ${merge.sha} of issue #${merge.issue} is not on ${branch}`);
        const head = await revertCommit(merge.issue, branch, { tip, hash: merge.sha }, resolutions);
        if (await pushUnlessMoved(new Map([[branch, head]]), new Map([[branch, tip]]))) return;
      }
    },
    async containsCommit(branch, sha) { return containsIn(run, path, branch, sha, await ref(branch)); },
    async workHead(dir) { return (await gitIn(dir, ['rev-parse', 'HEAD'])).trim(); },
    async openConflict(dir, conflict) {
      rmSync(dir, { recursive: true, force: true });
      await prepareClone(conflict.into, conflict.into, dir);
      const [source, command] = conflict instanceof MergeConflictError
        ? [conflict.source, ['merge', '--no-ff', '-m', conflict.step.message, conflict.source]]
        : [conflict.merge, ['revert', '--no-edit', '-m', '1', conflict.merge]];
      await gitIn(dir, ['fetch', '--quiet', 'origin', conflict.base, source]);
      await gitIn(dir, ['checkout', '-B', conflict.into, conflict.base]);
      const result = await run('git', [...NO_HOOKS, ...command], { cwd: dir });
      if (result.code === 0) throw new Error(`${command[0]} of ${source} on ${conflict.into} went through in the work clone though it conflicted`);
      if ((await conflictedFiles(dir)).length === 0) throw new Error(`${command[0]} of ${source} on ${conflict.into} failed in the work clone without a conflict: ${(result.stderr || result.stdout).trim()}`);
    },
    async closeConflict(dir, conflict) {
      const merging = conflict instanceof MergeConflictError;
      const source = merging ? conflict.source : conflict.merge;
      await requireFinished(dir, conflict.into, source);
      const head = await headFromWork(dir, conflict.into);
      await requireDescends(head, conflict.base, `the tip of ${conflict.into}`);
      if (merging) await requireDescends(head, source, `the commit to merge into ${conflict.into}`);
      const { files, diff } = merging ? await agentAdded(conflict.base, source, head) : { files: nulSeparated(await git(['diff', '--name-only', '--no-renames', '-z', conflict.base, head])), diff: await git(['diff', conflict.base, head]) };
      return { resolution: { base: conflict.base, source, head }, diff, files };
    },
    async deleteBranch(branch) {
      if (lines(await git(['ls-remote', '--heads', 'origin', branch])).length > 0) await git(['push', 'origin', '--delete', branch]);
    },
    prepareWorkClone: prepareClone,
    async cloneBranch(branch, dir) {
      if (!(await hasRef(path, `refs/remotes/origin/${branch}`))) throw new Error(`branch ${branch} is not in the host clone, so GitHub has no such branch as of the last fetch`);
      if (existsSync(dir)) throw new Error(`${dir} exists already`);
      await initClone(dir);
      await gitIn(dir, ['checkout', '--quiet', '-B', branch, `origin/${branch}`]);
      return (await gitIn(dir, ['rev-parse', 'HEAD'])).trim();
    },
    async untrackFactoryFiles(dir) {
      const tracked = lines(await gitIn(dir, ['ls-files', '--', `:(glob)**/${TASK_DIR}/**`, `:(glob)**/${OUT_DIR}/**`, `:(glob)**/${MEDIA_DIR}/**`]));
      if (tracked.length === 0) return [];
      await gitIn(dir, ['rm', '-r', '-q', '--cached', '--', ...tracked]);
      await gitIn(dir, ['commit', '-q', '-m', 'Keep factory task files out of the branch']);
      return tracked;
    },
    fetchFromWork: headFromWork,
    push: (commit, branch) => pushAll(new Map([[branch, commit]])),
    replaceBranch: async (commit, branch) => void (await git(['push', '--force', 'origin', `${commit}:refs/heads/${branch}`])),
    async catchUpBase(dir, base) {
      await gitIn(dir, ['fetch', '--quiet', 'origin']);
      const open = await openMergeOf(dir, base);
      if (open !== null) return { ...open, kept: null };
      const kept = await untouchable(dir);
      if (kept !== null) return { commit: null, conflicts: [], kept };
      const commit = (await gitIn(dir, ['rev-parse', `origin/${base}^{commit}`])).trim();
      if ((await run('git', [...NO_HOOKS, 'merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: dir })).code === 0) return { commit: null, conflicts: [], kept: null };
      return mergeBaseCommit(dir, base, commit);
    },
    async mergeBranchIntoWork(dir, branch, message) {
      await gitIn(dir, ['fetch', 'origin']);
      if (!(await hasRef(dir, `refs/remotes/origin/${branch}`))) return { commit: null, conflicts: [] };
      const open = await openMergeOf(dir, branch);
      if (open !== null) return open;
      const commit = (await gitIn(dir, ['rev-parse', `origin/${branch}`])).trim();
      if ((await run('git', [...NO_HOOKS, 'merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: dir })).code === 0) return { commit: null, conflicts: [] };
      await requireNoOpenWork(dir);
      return mergeBranchCommit(dir, branch, commit, message);
    },
    async isMerged(base, branch) {
      const result = await run('git', [...NO_HOOKS, 'merge-base', '--is-ancestor', await ref(base), await ref(branch)], { cwd: path });
      if (result.code === 0 || result.code === 1) return result.code === 0;
      throw new Error(`git merge-base --is-ancestor ${base} ${branch} failed: ${result.stderr.trim()}`);
    },
    async headHash(branch) {
      return (await git(['rev-parse', '--short', await ref(branch)])).trim();
    },
    async fullHash(commit) {
      return (await git(['rev-parse', '--verify', '--end-of-options', `${commit}^{commit}`])).trim();
    },
    async forkPoint(a, b) {
      return (await git(['rev-parse', '--short', (await git(['merge-base', await ref(a), await ref(b)])).trim()])).trim();
    },
    diff: async (base, branch) => git(['diff', '--no-renames', `${await ref(base)}...${await ref(branch)}`]),
    readFile: async (branch, path) => git(['show', `${await ref(branch)}:${path}`]),
    ownHeads: async (base, branch) => ownHeadsIn(run, path, await ref(base), await ref(branch)),
    async changedFiles(base, branch) {
      return nulSeparated(await git(['diff', '--name-only', '--no-renames', '-z', `${await ref(base)}...${await ref(branch)}`]));
    },
    changedInWork: async (dir, from) => nulSeparated(await gitIn(dir, ['diff', '--name-only', '--no-renames', '-z', `${from}...HEAD`])),
    foreignCommits: async (head, base, other) => foreignCommitsIn(run, path, await ref(head), await ref(base), await ref(other)),
    async hasNewCommits(base, branch) {
      return Number((await git(['rev-list', '--count', `${await ref(base)}..${await ref(branch)}`])).trim()) > 0;
    },
    async merge(steps, resolutions = [], checked) {
      for (;;) {
        if (checked) await requireChecked(checked);
        const { heads, started } = await mergeSteps(steps, resolutions);
        if (await pushUnlessMoved(heads, started)) return;
      }
    },
  });
}

async function ownHeadsIn(run: Run, path: string, baseTip: string, branchTip: string): Promise<string[]> {
  const lines = must(await run('git', [...NO_HOOKS, 'rev-list', '--first-parent', '--parents', branchTip, `^${baseTip}`], { activity: 'git', cwd: path }), `git rev-list ${branchTip}`).trim();
  const heads: string[] = [];
  for (const line of lines === '' ? [] : lines.split('\n')) {
    const [sha, , mergedIn] = line.split(' ');
    heads.push(sha!);
    if (mergedIn === undefined || !(await containsIn(run, path, baseTip, mergedIn, baseTip))) return heads;
  }
  return heads;
}

async function foreignCommitsIn(run: Run, path: string, head: string, base: string, other: string): Promise<number> {
  const shared = await run('git', [...NO_HOOKS, 'merge-base', '--all', head, other], { activity: 'git', cwd: path });
  if (shared.code === 1 && shared.stdout.trim() === '') return 0;
  const ancestors = lines(must(shared, `git merge-base --all ${head} ${other}`));
  return Number(must(await run('git', [...NO_HOOKS, 'rev-list', '--count', ...ancestors, `^${base}`], { activity: 'git', cwd: path }), `git rev-list ${head}`).trim());
}

async function containsIn(run: Run, path: string, branch: string, sha: string, tip: string): Promise<boolean> {
  const result = await run('git', [...NO_HOOKS, 'merge-base', '--is-ancestor', sha, tip], { activity: 'git', cwd: path });
  if (result.code === 0 || result.code === 1) return result.code === 0;
  throw new Error(`git merge-base --is-ancestor ${sha} ${branch} failed: ${result.stderr.trim()}`);
}

const REPO_LOCK_MS = 15 * 60_000;

function lockEach(cfg: FactoryConfig, jobId: string | null, repo: HostRepo): HostRepo {
  const dir = join(cfg.home, 'locks', 'repo');
  const entries = Object.entries(repo).map(([key, value]) => {
    if (typeof value !== 'function') return [key, value];
    const method = value as (...args: unknown[]) => Promise<unknown>;
    const locked = (...args: unknown[]): Promise<unknown> => withLock(dir, REPO_LOCK_MS, () => method(...args), createLockWaitReporter(cfg.home, jobId, cfg.observationHeartbeatMs));
    if (key !== 'prepareWorkClone') return [key, locked];
    return [key, (...args: unknown[]) => withCloneLock(cfg.home, String(args[2]), () => locked(...args))];
  });
  return Object.fromEntries(entries) as HostRepo;
}

function withCloneLock(home: string, clone: string, work: () => Promise<unknown>): Promise<unknown> {
  const name = basename(clone);
  if (dirname(clone) !== join(home, 'work') || !/^issue-\d+$/.test(name)) return work();
  return withLock(WORK_LOCK(home, name), CLONE_LOCK_MS, work);
}
