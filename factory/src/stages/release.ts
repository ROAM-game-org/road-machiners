import { addCard } from '../card-events';
import { newPlaytest, readState, updateState } from '../state';
import { MAINTENANCE_LABEL, RELEASE_LABEL, type Ctx } from '../types';
import { fillPrompt } from './common';

const CLEANUP_TASKS = [
  { title: 'Optimize against the speed budget', prompt: 'release-optimize' },
  { title: 'Code janitor pass', prompt: 'release-janitor' },
] as const;

export async function openPendingRelease(ctx: Ctx): Promise<void> {
  const state = readState(ctx.statePath);
  if (state.release === null) await openRelease(ctx);
  if (state.pendingCleanup !== null) await openCleanupTasks(ctx, state.pendingCleanup);
}

export async function openRelease(ctx: Ctx): Promise<void> {
  const open = readState(ctx.statePath).release;
  if (open !== null) throw new Error(`Release ${open.day} is open on #${open.issue}, so no new release opens.`);
  const now = ctx.now();
  const day = now.toISOString().slice(0, 10);
  const body = `The release of ${day} is the newest commit on dev that the release playtest passes.\n\nThe playtest comments and the candidate post of the committee chat follow here. Shipping the candidate closes this issue.`;
  const tracking = await ctx.github.createIssue(`Release ${day}`, body, [RELEASE_LABEL]);
  updateState(ctx.statePath, (state) => ({ ...state, release: { issue: tracking, day, postId: null, candidate: null, removed: [], playtest: newPlaytest(day) } }));
  await addCard(ctx, tracking, 'Approval', now.toISOString(), 'release');
  ctx.log('release', tracking, `opened the release of ${day}`);
}

async function openCleanupTasks(ctx: Ctx, shippedDay: string): Promise<void> {
  for (const task of CLEANUP_TASKS) {
    const n = await ctx.github.createIssue(`${task.title} (after release ${shippedDay})`, fillPrompt(task.prompt, {}), [MAINTENANCE_LABEL]);
    await addCard(ctx, n, 'Design', ctx.now().toISOString());
  }
  updateState(ctx.statePath, (state) => ({ ...state, pendingCleanup: null }));
  ctx.log('release', null, `opened the cleanup cards after release ${shippedDay}`);
}
