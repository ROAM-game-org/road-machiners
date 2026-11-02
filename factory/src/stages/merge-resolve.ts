import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { cardSession } from '../card-session';
import { changesSaveMajor } from '../save-guard';
import { GAME_DIR, MergeConflictError, RevertConflictError, type CheckedBuild, type Ctx, type IssueMerge, type MergeStep, type Resolution, type Stage } from '../types';
import { withWorkFolder } from '../work-lock';
import { factoryPaths } from '../diff-guard';
import { agentHome, fillPrompt, resetOutputs } from './common';
import { releaseLog } from './release-common';

export type MergeOptions = { checked?: CheckedBuild; card?: number };

export async function mergeResolving(ctx: Ctx, stage: Stage, steps: MergeStep[], { checked, card }: MergeOptions = {}): Promise<void> {
  const resolutions: Resolution[] = [];
  for (;;) {
    try {
      await ctx.repo.merge(steps, resolutions, checked);
      return;
    } catch (error) {
      if (!(error instanceof MergeConflictError) || error.step.issue !== null) throw error;
      resolutions.push(...error.done, await resolve(ctx, stage, error, card));
    }
  }
}

export async function revertResolving(ctx: Ctx, stage: Stage, merge: Pick<IssueMerge, 'issue' | 'sha'>, branch: string): Promise<void> {
  const resolutions: Resolution[] = [];
  for (;;) {
    try {
      return await ctx.repo.revertMerge(merge, branch, resolutions);
    } catch (error) {
      if (!(error instanceof RevertConflictError)) throw error;
      resolutions.push(await resolve(ctx, stage, error));
    }
  }
}

export type CardConflict = { issue: number; clone: string; what: string; prompt: string; log: string };

export function cardConflictRun(ctx: Ctx, stage: Stage, conflict: CardConflict): Promise<string> | null {
  const session = cardSession(ctx.cfg.home, conflict.issue);
  if (session === null) {
    ctx.log(stage, conflict.issue, `#${conflict.issue} has no kept session, so a fresh agent resolves the conflict of ${conflict.what}`);
    return null;
  }
  ctx.log(stage, conflict.issue, `the kept session ${session.id} of #${conflict.issue} resolves the conflict of ${conflict.what}`);
  return ctx.container.agent({ clone: conflict.clone, dir: GAME_DIR, model: ctx.cfg.buildModel, prompt: conflict.prompt, log: conflict.log, session });
}

export function cardMergePrompt(issue: number, branch: string, into: string, reason: string, files: string[]): string {
  return fillPrompt('card-merge', { issue: String(issue), branch, into, reason, files: files.map((file) => `- ${file}`).join('\n') });
}

function conflictAgent(ctx: Ctx, stage: Stage, conflict: MergeConflictError | RevertConflictError, dir: string, log: string, card?: number): Promise<string> {
  const files = conflict.files.map((file) => `- ${file}`).join('\n');
  if (conflict instanceof RevertConflictError) return ctx.container.agent({ clone: dir, dir: GAME_DIR, model: ctx.cfg.buildModel, prompt: fillPrompt('revert-merge', { into: conflict.into, issue: String(conflict.issue), files }), log });
  const own = card === undefined ? null : cardConflictRun(ctx, stage, { issue: card, clone: dir, what: `${conflict.branch} into ${conflict.into}`, prompt: cardMergePrompt(card, conflict.branch, conflict.into, conflict.step.message, conflict.files), log });
  return own ?? ctx.container.agent({ clone: dir, dir: GAME_DIR, model: ctx.cfg.buildModel, prompt: fillPrompt('merge-branches', { into: conflict.into, branch: conflict.branch, reason: conflict.step.message, files }), log });
}

function resolve(ctx: Ctx, stage: Stage, conflict: MergeConflictError | RevertConflictError, card?: number): Promise<Resolution> {
  return withWorkFolder(ctx, `merge-${conflict.into.replaceAll('/', '-')}`, () => resolveIn(ctx, stage, conflict, card));
}

async function resolveIn(ctx: Ctx, stage: Stage, conflict: MergeConflictError | RevertConflictError, card?: number): Promise<Resolution> {
  const slug = conflict.into.replaceAll('/', '-');
  const dir = join(ctx.cfg.home, 'work', `merge-${slug}`);
  ctx.log(stage, null, `${conflict.message} An agent resolves it.`);
  await ctx.repo.openConflict(dir, conflict);
  resetOutputs(agentHome(dir, GAME_DIR));
  await conflictAgent(ctx, stage, conflict, dir, releaseLog(ctx, `merge-${slug}`), card);
  const { resolution, diff, files: changed } = await ctx.repo.closeConflict(dir, conflict);
  const leaked = factoryPaths(changed);
  if (leaked.length) throw new Error(`The agent's resolution on ${conflict.into} touches paths an agent may not push: ${leaked.join(', ')}`);
  if (conflict instanceof MergeConflictError && changesSaveMajor(diff)) {
    throw new Error(`The agent's resolution on ${conflict.into} bumps SAVE_MAJOR in game/src/three/save-migrations.ts. The committee must decide on a major save bump before this can go on.`);
  }
  rmSync(dir, { recursive: true, force: true });
  ctx.log(stage, null, `resolved on ${conflict.into} at ${resolution.head.slice(0, 7)}`);
  return resolution;
}
