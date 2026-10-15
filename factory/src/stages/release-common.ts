import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readState, updateState } from '../state';
import { RELEASE_TASK_LABEL, type Card, type Ctx, type FactoryState, type IssueMerge, type ReleaseState } from '../types';

export type Feature = { issue: number; title: string };

export function requireDevMerges(state: FactoryState): IssueMerge[] {
  if (state.devMerges === null) throw new Error('The list of merges on dev is not filled yet. The merge migration fills it at the start of a tick.');
  return state.devMerges;
}

export function requireReleaseMerges(release: ReleaseState): IssueMerge[] {
  if (release.merges === null) throw new Error(`The list of merges in release ${release.day} is not filled yet. The merge migration fills it at the start of a tick.`);
  return release.merges;
}

export function toFeatures(merges: IssueMerge[]): Feature[] {
  return merges.map(({ issue, title }) => ({ issue, title }));
}

export function featureLine(feature: Feature): string {
  return `#${feature.issue} ${feature.title}`;
}

export type Change = { issue: number; text: string };

export function readChanges(raw: string | null, features: Feature[]): Change[] {
  if (raw === null) throw new Error('release agent wrote no .factory/release.json');
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('release.json is not an array');
  const changes = data.map((item): Change => {
    const { issue, text } = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    if (!Number.isInteger(issue) || typeof text !== 'string' || text.trim() === '') throw new Error(`release.json needs each entry as {"issue": number, "text": non-empty string}, got ${JSON.stringify(item)}`);
    return { issue: issue as number, text: text.trim() };
  });
  const named = changes.map((change) => `#${change.issue}`).sort().join(', ');
  const wanted = features.map((feature) => `#${feature.issue}`).sort().join(', ');
  if (named !== wanted) throw new Error(`release.json names ${named || 'nothing'}, but the release holds ${wanted || 'nothing'}`);
  return changes;
}

export function changelogText(changes: Change[]): string {
  return changes.map((change) => `- [#${change.issue}] ${change.text}`).join('\n');
}

export async function openReleaseTasks(ctx: Ctx): Promise<number[]> {
  return openTasks(await ctx.github.cards(), requireRelease(ctx).tasks);
}

export function openTasks(cards: Card[], recorded: number[]): number[] {
  const labeled = cards.filter((card) => card.labels.includes(RELEASE_TASK_LABEL) && card.column !== 'Done').map((card) => card.issue);
  const unseen = recorded.filter((issue) => !cards.some((card) => card.issue === issue && card.column === 'Done'));
  return [...new Set([...labeled, ...unseen])].sort((a, b) => a - b);
}

export function recordReleaseTask(ctx: Ctx, issue: number): void {
  updateState(ctx.statePath, (state) => {
    if (state.release === null) throw new Error(`No release is open to record task #${issue}`);
    return state.release.tasks.includes(issue) ? state : { ...state, release: { ...state.release, tasks: [...state.release.tasks, issue] } };
  });
}

export function requireRelease(ctx: Ctx): ReleaseState {
  const release = readState(ctx.statePath).release;
  if (release === null) throw new Error('No release is open');
  return release;
}

export function releaseFeatures(release: ReleaseState): Feature[] {
  return toFeatures(requireReleaseMerges(release).filter((merge) => !release.removed.includes(merge.issue)));
}

export function candidateDir(ctx: Ctx): string {
  return join(ctx.cfg.home, 'work', 'release-candidate');
}

export function releaseLog(ctx: Ctx, name: string): string {
  const dir = join(ctx.cfg.home, 'logs');
  mkdirSync(dir, { recursive: true });
  return join(dir, `${name}.log`);
}

export function trackingLink(ctx: Ctx, issue: number): string {
  return `https://github.com/${ctx.cfg.repo}/issues/${issue}`;
}
