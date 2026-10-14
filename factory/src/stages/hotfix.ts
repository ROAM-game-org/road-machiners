import { readState, updateState } from '../state';
import { BRANCH, type Ctx } from '../types';
import { closeBundle } from './bundle';
import { HOTFIX_BASE } from './common';
import { queueIncidents } from './incident';
import { mergeResolving } from './merge-resolve';
import { itchKeys, publish } from './ship';

export async function shipHotfix(ctx: Ctx, issue: number, title: string, by: string): Promise<string> {
  itchKeys(ctx);
  await ctx.repo.fetch();
  await mergeResolving(ctx, 'approve', [
    { branch: BRANCH(issue), into: HOTFIX_BASE, message: `Hotfix #${issue}: ${title}` },
    { branch: HOTFIX_BASE, into: 'dev', message: `Merge main into dev after hotfix #${issue}` },
  ]);
  updateState(ctx.statePath, (state) => ({ ...state, pendingPublish: [...new Set([...state.pendingPublish, issue])] }));
  await ctx.github.comment(issue, `Approved by ${by} in the committee chat. It is merged into main and goes to itch.io with the next hotfix upload.`);
  return `Hotfix #${issue} ${title} is merged into main and goes to itch.io with the next hotfix upload.`;
}

export async function publishHotfixes(ctx: Ctx): Promise<void> {
  const batch = readState(ctx.statePath).pendingPublish;
  if (batch.length === 0) throw new Error('The publish job has no hotfix to upload.');
  const keys = itchKeys(ctx);
  await ctx.repo.fetch();
  await publish(ctx, keys, 'publish');
  const titles = await Promise.all(batch.map(async (issue) => `#${issue} ${(await ctx.github.issue(issue)).title}`));
  const day = ctx.now().toISOString().slice(0, 10);
  const head = (await ctx.repo.headHash(HOTFIX_BASE)).slice(0, 7);
  const changelog = `ROAM hotfix ${day}\n\n${titles.map((line) => `Fixed: ${line}`).join('\n')}`;
  await ctx.github.createRelease(`hotfix-${day}-${head}`, HOTFIX_BASE, `ROAM hotfix ${day}`, changelog);
  const shipped = 'Shipped as a hotfix. It is on main and itch.io.';
  for (const issue of batch) {
    await ctx.github.comment(issue, shipped);
    await ctx.github.close(issue, 'completed');
    await closeBundle(ctx, issue, shipped);
  }
  queueIncidents(ctx, batch);
  updateState(ctx.statePath, (state) => ({ ...state, pendingPublish: state.pendingPublish.filter((issue) => !batch.includes(issue)) }));
  await ctx.telegram.sendMessage(ctx.cfg.committeeChat, `Hotfix upload is on itch.io: ${titles.join(', ')}.`);
}
