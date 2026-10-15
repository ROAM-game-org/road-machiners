import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { suiteCounts } from '../check-evidence';
import { testPoolPin } from '../cpus';
import { guardAgainstAll } from '../diff-guard';
import { readState } from '../state';
import { BRANCH, GAME_DIR, type Ctx } from '../types';
import { withWorkFolder } from '../work-lock';
import { closeBundle } from './bundle';
import { checkScript, checkUntilReal, integrationScript, oneSuiteAtATime, runChecks } from './checks';
import { HOTFIX_BASE, agentLog, playtestCommand, resetOutputs } from './common';
import { queueIncidents } from './incident';
import { checksSummary, currentToolchain, integrationChecks, recordPassed, revisionOf, stepsText, type IntegrationPlan } from './integration';
import { landingAgent, mergeIn, type Landing } from './merge';
import { mergeResolving } from './merge-resolve';
import { itchKeys, publish } from './ship';

export class IntegrationFailure extends Error {}

const FOLDER = 'hotfix-main';
const FAILURE_LINES = 40;

export async function shipHotfix(ctx: Ctx, issue: number, title: string, by: string): Promise<string> {
  const keys = itchKeys(ctx);
  await ctx.repo.fetch();
  const checks = await withWorkFolder(ctx, FOLDER, () => landHotfix(ctx, issue, title));
  await publish(ctx, keys, `hotfix-${issue}`);
  const day = ctx.now().toISOString().slice(0, 10);
  const changelog = `ROAM hotfix ${day}\n\nFixed: #${issue} ${title}`;
  await ctx.github.createRelease(`hotfix-${day}-issue-${issue}`, HOTFIX_BASE, `ROAM hotfix ${day}`, changelog);
  const shipped = `Approved by ${by} in the committee chat and shipped as a hotfix. It is on main and itch.io.`;
  await ctx.github.comment(issue, `${shipped}\n\n${checks}`);
  await ctx.github.close(issue, 'completed');
  await closeBundle(ctx, issue, shipped);
  queueIncidents(ctx, [issue]);
  return `Hotfix #${issue} ${title} is on main and itch.io. ${checks}`;
}

type Merged = { merged: string; main: string; hotfix: string; conflicted: boolean };

async function landHotfix(ctx: Ctx, issue: number, title: string): Promise<string> {
  const dir = join(ctx.cfg.home, 'work', FOLDER);
  const toolchain = currentToolchain(ctx);
  let conflicted = false;
  const resolver = landingAgent(ctx, 'approve', dir, HOTFIX_BASE);
  const land: Landing = { stage: 'approve', dir, into: HOTFIX_BASE, guardAgainst: [], agent: (prompt) => { conflicted = true; return resolver(prompt); } };
  for (;;) {
    conflicted = false;
    const integration = await mergeInWork(ctx, issue, title, land, () => conflicted);
    const plan = await planFor(ctx, issue, integration, toolchain);
    const counts = await runPlan(ctx, issue, dir, integration, plan);
    if (await pushAtomically(ctx, issue, title, integration)) return checksSummary(plan, integration?.merged ?? '', counts);
    ctx.log('approve', issue, 'main or the hotfix branch moved during the checks, so the factory merges and decides again');
  }
}

async function mergeInWork(ctx: Ctx, issue: number, title: string, land: Landing, conflicted: () => boolean): Promise<Merged | null> {
  rmSync(land.dir, { recursive: true, force: true });
  await ctx.repo.prepareWorkClone(HOTFIX_BASE, HOTFIX_BASE, land.dir);
  resetOutputs(join(land.dir, GAME_DIR));
  const before = await ctx.repo.fetchFromWork(land.dir, HOTFIX_BASE);
  await mergeIn(ctx, land, { branch: BRANCH(issue), message: `Hotfix #${issue}: ${title}`, reason: `hotfix #${issue} was approved and main moved since its checks` });
  const merged = await ctx.repo.fetchFromWork(land.dir, HOTFIX_BASE);
  if (merged === before) return null;
  const parents = await ctx.repo.parentsOf(merged);
  if (parents.length !== 2) throw new Error(`The merge of hotfix #${issue} into main at ${merged.slice(0, 7)} has ${parents.length} parents, not main and the hotfix`);
  const [main, hotfix] = parents as [string, string];
  if (conflicted()) guardAgainstAll(await Promise.all([main, hotfix].map((side) => ctx.repo.diff(side, merged))));
  return { merged, main, hotfix, conflicted: conflicted() };
}

async function planFor(ctx: Ctx, issue: number, integration: Merged | null, toolchain: string): Promise<IntegrationPlan> {
  if (integration === null) return { steps: [], reused: [], reason: 'the hotfix is on main already' };
  requirePlayed(ctx, issue, integration.hotfix);
  const { merged, main, hotfix } = integration;
  const mainSide = new Set(await ctx.repo.changedFiles(hotfix, main));
  const shared = (await ctx.repo.changedFiles(main, hotfix)).filter((file) => mainSide.has(file));
  const plan = integrationChecks({ merged: await revisionOf(ctx, merged, toolchain), hotfix: await revisionOf(ctx, hotfix, toolchain), main: await revisionOf(ctx, main, toolchain), conflicted: integration.conflicted, shared });
  ctx.log('approve', issue, `the merge with main runs ${plan.steps.length === 0 ? 'no checks' : plan.steps.join(', ')}, since ${plan.reason}`);
  return plan;
}

function requirePlayed(ctx: Ctx, issue: number, hotfix: string): void {
  const build = readState(ctx.statePath).builds[String(issue)];
  if (build !== undefined && !hotfix.startsWith(build)) throw new IntegrationFailure(`the hotfix branch moved to ${hotfix.slice(0, 7)} after the committee played ${build}.`);
}

async function runPlan(ctx: Ctx, issue: number, dir: string, integration: Merged | null, plan: IntegrationPlan): Promise<{ ran: number; skipped: number } | null> {
  if (integration === null || plan.steps.length === 0) return null;
  const playtest = playtestCommand(ctx.cfg, false);
  const script = plan.steps.includes('build') ? checkScript(playtest) : integrationScript(plan.steps.includes('playtest') ? playtest : null);
  const at = { stage: 'approve' as const, issue };
  const log = agentLog(ctx, issue, 'checks');
  const check = () => runChecks(ctx, at, dir, script, log, { BUILD_SCOPE: 'approve' }, testPoolPin(ctx.cfg));
  const failure = await checkUntilReal(() => oneSuiteAtATime(ctx, at, check), (run) => ctx.log('approve', issue, `the merge checks only timed out, run ${run}, running them again`));
  if (failure !== null) throw new IntegrationFailure(`${stepsText(plan.steps, null)} failed on its merge with main ${integration.main.slice(0, 7)}, which the factory checked since ${plan.reason}. The end of the log:\n\n\`\`\`\n${failure.split('\n').slice(-FAILURE_LINES).join('\n')}\n\`\`\``);
  await recordPassed(ctx, integration.merged, { ran: plan.steps, reused: plan.reused, by: 'approve', issue });
  return suiteCounts(log);
}

function pushAtomically(ctx: Ctx, issue: number, title: string, integration: Merged | null): Promise<boolean> {
  const steps = [
    { branch: BRANCH(issue), into: HOTFIX_BASE, message: `Hotfix #${issue}: ${title}` },
    { branch: HOTFIX_BASE, into: 'dev', message: `Merge main into dev after hotfix #${issue}` },
  ];
  if (integration === null) return mergeResolving(ctx, 'approve', steps.slice(1));
  const { merged, main, hotfix } = integration;
  return mergeResolving(ctx, 'approve', steps, { resolutions: [{ base: main, source: hotfix, head: merged }], expected: { [HOTFIX_BASE]: main, [BRANCH(issue)]: hotfix } });
}
