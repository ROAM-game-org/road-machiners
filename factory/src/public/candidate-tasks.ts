import { readState } from '../state';
import { recordReleaseTask } from '../stages/release-common';
import type { Ctx } from '../types';
import type { PublicStore } from './store';

export async function taskCandidateReports(ctx: Ctx, store: PublicStore): Promise<void> {
  const release = readState(ctx.statePath).release;
  if (release === null || release.shipping !== undefined) return;
  for (const issue of store.untaskedCandidateReports(release.issue)) {
    recordReleaseTask(ctx, issue);
    store.markTasked(release.issue, issue, ctx.now());
    ctx.log('public', issue, `a player report from the candidate is a task of release ${release.day}`);
    await ctx.github.comment(release.issue, `A player report from the candidate is filed as #${issue}, a task of this release. The playtest, the candidate and Ship wait until triage refuses it or its approved change merges into this release and dev.`);
  }
}
