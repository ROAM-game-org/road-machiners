import { readState, updateState } from './state';
import { BASE_BRANCH } from './stages/common';
import type { Ctx, FactoryState, IssueMerge, ReleaseState } from './types';

const LEGACY_MERGE = /^Merge issue #(\d+): (.*)$/;

async function legacyIssueMerges(ctx: Ctx, from: string, to: string, into: (sha: string) => Promise<string>): Promise<IssueMerge[]> {
  const merges: IssueMerge[] = [];
  for (const { sha, subject } of (await ctx.repo.legacyMerges(from, to)).reverse()) {
    const match = LEGACY_MERGE.exec(subject);
    if (match) merges.push({ issue: Number(match[1]), title: match[2]!, sha, into: await into(sha), reverted: [] });
  }
  return merges;
}

function releaseMerges(ctx: Ctx, release: ReleaseState): Promise<IssueMerge[]> {
  return legacyIssueMerges(ctx, release.branch, 'main', async (sha) => ((await ctx.repo.containsCommit(BASE_BRANCH, sha)) ? BASE_BRANCH : release.branch));
}

function devMergesOf(ctx: Ctx, state: FactoryState): Promise<IssueMerge[]> {
  return legacyIssueMerges(ctx, BASE_BRANCH, state.release?.branch ?? 'main', async () => BASE_BRANCH);
}

function needsMigration(state: FactoryState): boolean {
  return state.devMerges === null || (state.release !== null && state.release.merges === null);
}

export async function migrateMerges(ctx: Ctx): Promise<void> {
  const state = readState(ctx.statePath);
  if (!needsMigration(state)) return;
  await ctx.repo.fetch();
  const devMerges = state.devMerges ?? await devMergesOf(ctx, state);
  const merges = state.release === null ? null : state.release.merges ?? await releaseMerges(ctx, state.release);
  updateState(ctx.statePath, (next) => ({ ...next, devMerges: next.devMerges ?? devMerges, release: next.release && { ...next.release, merges: next.release.merges ?? merges } }));
  ctx.log('tick', null, `filled the merge records from git once: ${devMerges.length} on dev${merges === null ? '' : `, ${merges.length} in the release`}`);
}
