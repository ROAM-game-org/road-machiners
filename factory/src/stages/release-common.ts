import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readState, updateState } from '../state';
import { RELEASE_TASK_LABEL, type Card, type Ctx, type FactoryState, type IssueMerge, type ReleaseState } from '../types';

export type Feature = { issue: number; title: string };

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

export function taskRefusal(state: FactoryState): string | null {
  if (state.release === null) return 'no release is open';
  if (state.release.shipping !== undefined || state.jobs.some((job) => job.stage === 'ship')) return `release ${state.release.day} is shipping`;
  return null;
}

export type TaskClaim = { release: ReleaseState; added: boolean } | { refusal: string };

export function claimReleaseTask(ctx: Ctx, issue: number, tracking: number, refuse: (state: FactoryState) => string | null = taskRefusal): TaskClaim {
  let claim: TaskClaim = { refusal: 'no release is open' };
  updateState(ctx.statePath, (state) => {
    const { claimed, next } = claimIn(state, issue, tracking, refuse);
    claim = claimed;
    return next;
  });
  return claim;
}

function claimIn(state: FactoryState, issue: number, tracking: number, refuse: (state: FactoryState) => string | null): { claimed: TaskClaim; next: FactoryState } {
  const { release } = state;
  if (release?.issue !== tracking) return { claimed: { refusal: `the open release is no longer the one of #${tracking}` }, next: state };
  const refusal = refuse(state);
  if (refusal !== null) return { claimed: { refusal }, next: state };
  if (release.tasks.includes(issue)) return { claimed: { release, added: false }, next: state };
  const added = { ...release, postId: null, tasks: [...release.tasks, issue] };
  return { claimed: { release: added, added: true }, next: { ...state, pendingShip: null, release: added } };
}

export function forgetReleaseTask(ctx: Ctx, issue: number): void {
  updateState(ctx.statePath, (state) => (state.release === null ? state : { ...state, release: { ...state.release, tasks: state.release.tasks.filter((task) => task !== issue) } }));
}

export function requireRelease(ctx: Ctx): ReleaseState {
  const release = readState(ctx.statePath).release;
  if (release === null) throw new Error('No release is open');
  return release;
}

export function releaseFeatures(release: ReleaseState): Feature[] {
  return toFeatures(release.merges.filter((merge) => !release.removed.includes(merge.issue)));
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
