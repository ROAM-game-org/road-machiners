import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readState } from '../state';
import type { Ctx, IssueMerge, ReleaseState } from '../types';

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

export function mergeOf(merges: IssueMerge[], issue: number): IssueMerge | undefined {
  return merges.filter((merge) => merge.issue === issue).at(-1);
}

export function requireRelease(ctx: Ctx): ReleaseState {
  const release = readState(ctx.statePath).release;
  if (release === null) throw new Error('No release is open');
  return release;
}

export function passedForCandidate(release: ReleaseState): ReleaseState['playtest']['passed'] {
  const passed = release.playtest.passed;
  const removed = passed?.features.some((merge) => release.removed.includes(merge.issue));
  return removed === false ? passed : null;
}

export function candidateWanted(release: ReleaseState): boolean {
  const passed = passedForCandidate(release);
  return passed !== null && passed.sha !== release.candidate?.sha;
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
