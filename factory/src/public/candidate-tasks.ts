import { readState } from '../state';
import { claimReleaseTask } from '../stages/release-common';
import type { Ctx } from '../types';
import type { PublicStore } from './store';

export async function taskCandidateReports(ctx: Ctx, store: PublicStore): Promise<void> {
  const release = readState(ctx.statePath).release;
  if (release === null) return;
  for (const issue of store.untaskedCandidateReports(release.issue)) {
    if ('refusal' in claimReleaseTask(ctx, issue, release.issue)) return;
    store.markTasked(release.issue, issue, ctx.now());
    ctx.log('public', issue, `a player report from the candidate is a task of release ${release.day}`);
    await ctx.github.comment(release.issue, `A player report from the candidate is filed as #${issue}, a task of this release. Any current candidate post no longer ships. The playtest, a new candidate and Ship wait until triage refuses it or its approved change merges into this release and dev.`);
  }
}
