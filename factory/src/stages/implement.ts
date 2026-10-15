import { moveCard } from '../card-events';
import { BRANCH, GAME_DIR, TASK_FILE, isCleanupTask, type Ctx } from '../types';
import { agentHome, baseBranchOf, fillPrompt, guardAndPush, prepareOutputs, runAgent, throwIfNeedsCommittee, workDir, writeIssueInput } from './common';
import { requireSkill } from './skill-calls';

export const IMPLEMENT_DISALLOWED = ['Agent'];

const DOCS_PASS = {
  stage: 'implement', skill: 'up:udocument', after: 'up:uexecute',
  ask: 'The factory found no Skill tool call of `up:udocument` after your last `up:uexecute` call in this session. Run the last step of your prompt now: invoke the ultrapack skill udocument with the Skill tool as `up:udocument` on the game docs this change made stale, commit the doc edits, and write under "Docs" in the Conclusion of the task file which docs you updated, or why none needed it.',
};

export async function runStage(ctx: Ctx, issue: number): Promise<void> {
  const clone = workDir(ctx, issue);
  const base = await baseBranchOf(ctx, issue);
  await ctx.repo.prepareWorkClone(BRANCH(issue), base, clone);
  const home = agentHome(clone, GAME_DIR);
  prepareOutputs(ctx, issue, home);
  await writeIssueInput(ctx, issue, home);
  const stream = await runAgent(ctx, issue, 'implement', 'implement', fillPrompt('implement', { issue: String(issue), taskFile: TASK_FILE(issue), branch: BRANCH(issue) }), { disallowedTools: IMPLEMENT_DISALLOWED });
  throwIfNeedsCommittee(home);
  await requireSkill(stream, DOCS_PASS, (ask) => runAgent(ctx, issue, 'implement', 'implement', ask, { continue: true, disallowedTools: IMPLEMENT_DISALLOWED }));
  throwIfNeedsCommittee(home);
  const head = await ctx.repo.fetchFromWork(clone, BRANCH(issue));
  if (await ctx.repo.isMerged(head, base)) throw new Error(`The implementation stage left ${BRANCH(issue)} with no commits beyond ${base}`);
  await guardAndPush(ctx, issue, base, 'implement');
  await moveCard(ctx, issue, isCleanupTask((await ctx.github.issue(issue)).labels) ? 'Hardening' : 'Testing', 'built');
}
