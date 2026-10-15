import { BRANCH, type Ctx, type KeptApproval } from '../types';
import { closeBundle } from './bundle';
import { HOTFIX_BASE } from './common';
import { queueIncidents } from './incident';
import { mergeResolving } from './merge-resolve';
import { itchKeys, publish } from './ship';

export async function shipHotfix(ctx: Ctx, issue: number, title: string, approval: KeptApproval, build: string): Promise<string> {
  const keys = itchKeys(ctx);
  await ctx.repo.fetch();
  await mergeResolving(ctx, 'approve', [
    { branch: BRANCH(issue), into: HOTFIX_BASE, message: `Hotfix #${issue}: ${title}`, issue },
    { branch: HOTFIX_BASE, into: 'dev', message: `Merge main into dev after hotfix #${issue}`, issue: null },
  ], { branch: BRANCH(issue), build, base: HOTFIX_BASE });
  await publish(ctx, keys, `hotfix-${issue}`);
  const day = ctx.now().toISOString().slice(0, 10);
  const changelog = `ROAM hotfix ${day}\n\nFixed: #${issue} ${title}`;
  await ctx.github.createRelease(`hotfix-${day}-issue-${issue}`, HOTFIX_BASE, `ROAM hotfix ${day}`, changelog);
  const shipped = `Approved by ${approval.by} in the committee chat and shipped as a hotfix. It is on main and itch.io.${lineage(approval, build)}`;
  await ctx.github.comment(issue, shipped);
  await ctx.github.close(issue, 'completed');
  await closeBundle(ctx, issue, shipped);
  queueIncidents(ctx, [issue]);
  return `Hotfix #${issue} ${title} is on main and itch.io.`;
}

function lineage(approval: KeptApproval, build: string): string {
  if (build === approval.build) return '';
  return ` The approval was of build ${approval.build}. The shipped build ${build} merges newer main into it, and the full checks passed on it.`;
}
