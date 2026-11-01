import { addCard } from '../card-events';
import { newPlaytest, readState, updateState } from '../state';
import { RELEASE_LABEL, type Ctx } from '../types';

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
