import { addCard } from '../card-events';
import { newPlaytest, readState, updateState } from '../state';
import { MAINTENANCE_LABEL, RELEASE_LABEL, RELEASE_TASK_LABEL, type Ctx } from '../types';
import { fillPrompt } from './common';
import { mergeResolving } from './merge-resolve';
import { featureLine, recordReleaseTask, toFeatures } from './release-common';

const CLEANUP_TASKS = [
  { title: 'Optimize against the speed budget', prompt: 'release-optimize' },
  { title: 'Code janitor pass', prompt: 'release-janitor' },
] as const;

export async function release(ctx: Ctx): Promise<void> {
  const now = ctx.now();
  await ctx.repo.fetch();
  await bringMainIntoDev(ctx);
  const merges = readState(ctx.statePath).devMerges;
  const features = toFeatures(merges);
  if (features.length === 0) {
    ctx.log('release', null, 'nothing new on dev, skipped');
    updateState(ctx.statePath, (state) => ({ ...state, lastRelease: now.toISOString(), pendingCut: null }));
    return;
  }
  const day = now.toISOString().slice(0, 10);
  const branch = `release/${day}`;
  await ctx.repo.createBranch(branch, 'dev');
  const body = `The factory cut branch ${branch} from dev.\n\nFeatures:\n${features.map((feature) => `- ${featureLine(feature)}`).join('\n')}\n\nThe candidate post in the committee chat comes when the cleanup tasks are done and the release playtest passes.`;
  const tracking = await ctx.github.createIssue(`Release ${day}`, body, [RELEASE_LABEL]).catch(async (error: unknown) => {
    await ctx.repo.deleteBranch(branch);
    throw error;
  });
  updateState(ctx.statePath, (state) => ({ ...state, lastRelease: now.toISOString(), pendingCut: null, devMerges: state.devMerges.slice(merges.length), release: { issue: tracking, branch, day, postId: null, candidateSha: null, removed: [], tasks: [], merges, playtest: newPlaytest(day) } }));
  await addCard(ctx, tracking, 'Approval', now.toISOString(), 'release');
  for (const task of CLEANUP_TASKS) {
    const n = await ctx.github.createIssue(`${task.title} (release ${day})`, fillPrompt(task.prompt, {}), [RELEASE_TASK_LABEL, MAINTENANCE_LABEL]);
    recordReleaseTask(ctx, n);
    await addCard(ctx, n, 'Design', ctx.now().toISOString(), 'release-task');
  }
  ctx.log('release', tracking, `cut ${branch} with ${features.length} features`);
}

async function bringMainIntoDev(ctx: Ctx): Promise<void> {
  if (await ctx.repo.isMerged('main', 'dev')) return;
  await mergeResolving(ctx, 'release', [{ branch: 'main', into: 'dev', message: 'Merge main into dev before the release cut', issue: null }]);
  ctx.log('release', null, 'merged main into dev before the cut');
}
