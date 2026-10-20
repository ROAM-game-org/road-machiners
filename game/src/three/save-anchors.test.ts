import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { highwayMap } from '../sim/highway';
import { TEST_MAP } from '../test/map';
import { RELEASE_STEPS, SAVE_MAJOR, TINY_FROM, type ReleaseStep, type SavedJson } from './save-migrations';
import { SAVE_FORMAT } from './save';

const WINDOW_RELEASES = 10;
const SHAPE = 'src/three/save-shape.json';
const ANCHOR_DIR = join(__dirname, 'save-fixtures/anchors');

type ShippedTag = { name: string; major: number; minor: number };

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function shippedTags(): ShippedTag[] {
  const names = git('tag', '--list', 'release-*', 'hotfix-*', '--sort=creatordate').split('\n').filter((name) => name !== '');
  if (names.length === 0) throw new Error('This clone holds no release or hotfix tags, so the shipped save formats are unknown. Fetch the tags.');
  return names.map((name) => {
    const format = (JSON.parse(git('show', `${name}:./${SHAPE}`)) as { format: string }).format;
    const [major, minor] = format.split('.').map(Number);
    return { name, major, minor };
  });
}

function windowOf(tags: readonly ShippedTag[], releases: number): ShippedTag[] {
  const releaseAt = tags.flatMap((tag, i) => (tag.name.startsWith('release-') ? [i] : []));
  const from = releaseAt.length > releases ? releaseAt[releaseAt.length - releases] : 0;
  return tags.slice(from);
}

function reachable(minor: number, releases: readonly ReleaseStep[], tinyFrom: number, current: number): boolean {
  return (minor >= tinyFrom && minor <= current) || releases.some((release) => release.from === minor);
}

function onOlderMap(file: string, world: SavedJson): boolean {
  if (file.endsWith('-roaming.json')) return world.mapHash !== TEST_MAP.hash;
  if (!file.endsWith('-highway.json')) throw new Error(`Anchor save ${file} names no mode`);
  const run = world.furyRoad as { window: number } | null | undefined;
  return !run || highwayMap(world.seed as number, run.window).hash !== world.mapHash;
}

function formatsOnOlderMaps(): Set<number> {
  const byMinor = new Map<number, boolean[]>();
  for (const file of readdirSync(ANCHOR_DIR)) {
    const save = JSON.parse(readFileSync(join(ANCHOR_DIR, file), 'utf8')) as { format: { minor: number }; world: SavedJson };
    byMinor.set(save.format.minor, [...(byMinor.get(save.format.minor) ?? []), onOlderMap(file, save.world)]);
  }
  return new Set([...byMinor].filter(([, older]) => older.every(Boolean)).map(([minor]) => minor));
}

function anchorProblems(tags: readonly ShippedTag[], releases: readonly ReleaseStep[], tinyFrom: number, current: number, major: number, windowReleases: number, rebaked: ReadonlySet<number>): string[] {
  const shipped = tags.filter((tag) => tag.major === major);
  const inWindow = windowOf(tags, windowReleases).filter((tag) => tag.major === major);
  const formats = new Set(shipped.map((tag) => tag.minor));
  const oldest = Math.min(...inWindow.map((tag) => tag.minor));
  const unfolded = new Set(shipped.map((tag) => tag.minor).filter((minor) => minor > tinyFrom));
  const lost = inWindow.filter((tag) => !reachable(tag.minor, releases, tinyFrom, current) && !rebaked.has(tag.minor));
  return [
    ...lost.map((tag) => `${tag.name} shipped ${major}.${tag.minor}, which no release step or tiny step loads, and no save of it in save-fixtures/anchors sits on an older map`),
    ...releases.filter((release) => !formats.has(release.from)).map((release) => `Release step ${release.from} to ${release.to} starts at a format no build shipped`),
    ...(unfolded.size > 1 ? [`Formats ${[...unfolded].join(', ')} shipped after the tiny steps began at ${tinyFrom}. Fold the tiny steps up to the newest shipped format into release steps`] : []),
    ...releases.filter((release) => release.from < oldest).map((release) => `Release step ${release.from} to ${release.to} is older than the last ${windowReleases} releases. Delete it`),
    ...releases.filter((release) => rebaked.has(release.from)).map((release) => `Release step ${release.from} to ${release.to} starts at a format whose saves sit on an older map and carry over on load. Delete it`),
  ];
}

const step = (world: Record<string, unknown>) => world;
const tag = (name: string, minor: number): ShippedTag => ({ name, major: 2, minor });
const none = new Set<number>();

describe('anchorProblems', () => {
  const tags = [tag('release-a', 1), tag('hotfix-a', 4), tag('release-b', 6), tag('release-c', 9)];
  const releases = [{ from: 1, to: 4, step }, { from: 4, to: 6, step }, { from: 6, to: 9, step }];

  it('passes release steps from every shipped format into the tiny steps', () => {
    expect(anchorProblems(tags, releases, 9, 12, 2, 10, none)).toEqual([]);
  });

  it('allows one shipped format above the tiny steps and asks for a fold at the second', () => {
    expect(anchorProblems([...tags, tag('release-d', 11)], releases, 9, 12, 2, 10, none)).toEqual([]);
    expect(anchorProblems([...tags, tag('release-d', 11), tag('hotfix-d', 12)], releases, 9, 12, 2, 10, none)).toEqual([
      'Formats 11, 12 shipped after the tiny steps began at 9. Fold the tiny steps up to the newest shipped format into release steps',
    ]);
  });

  it('names a shipped format that nothing loads and a release step from a format that never shipped', () => {
    expect(anchorProblems(tags, [{ from: 2, to: 6, step }, { from: 6, to: 9, step }], 9, 12, 2, 10, none)).toEqual([
      'release-a shipped 2.1, which no release step or tiny step loads, and no save of it in save-fixtures/anchors sits on an older map',
      'hotfix-a shipped 2.4, which no release step or tiny step loads, and no save of it in save-fixtures/anchors sits on an older map',
      'Release step 2 to 6 starts at a format no build shipped',
    ]);
  });

  it('asks to delete release steps older than the window and lets the formats before it go', () => {
    expect(anchorProblems(tags, releases, 9, 12, 2, 2, none)).toEqual([
      'Release step 1 to 4 is older than the last 2 releases. Delete it',
      'Release step 4 to 6 is older than the last 2 releases. Delete it',
    ]);
    expect(anchorProblems(tags, releases.slice(2), 9, 12, 2, 2, none)).toEqual([]);
  });

  it('lets formats whose saves sit on an older map go and asks to delete their release steps', () => {
    expect(anchorProblems(tags, [], 9, 12, 2, 10, new Set([1, 4, 6]))).toEqual([]);
    expect(anchorProblems(tags, releases, 9, 12, 2, 10, new Set([1, 4]))).toEqual([
      'Release step 1 to 4 starts at a format whose saves sit on an older map and carry over on load. Delete it',
      'Release step 4 to 6 starts at a format whose saves sit on an older map and carry over on load. Delete it',
    ]);
  });
});

describe('the save steps of this build', () => {
  it('load every format shipped in the last releases whose saves sit on the current map, and stay folded', () => {
    expect(anchorProblems(shippedTags(), RELEASE_STEPS, TINY_FROM, SAVE_FORMAT.minor, SAVE_MAJOR, WINDOW_RELEASES, formatsOnOlderMaps())).toEqual([]);
  });
});
