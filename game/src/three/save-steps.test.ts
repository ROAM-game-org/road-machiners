import { describe, expect, it } from 'vitest';
import { TINY_STEPS, type SavedJson } from './save-migrations';
import { anchorMinors, RELEASE_STEPS, SAVE_FORMAT, stepsFrom, stepsOf, TINY_FROM, type Step } from './save';

const mark = (tag: string): Step => (world) => ({ ...world, trail: [...((world.trail as string[] | undefined) ?? []), tag] });
const run = (steps: readonly Step[]): unknown => steps.reduce<SavedJson>((world, step) => step(world), { trail: [] }).trail;

const releases = [
  { from: 2, to: 5, step: mark('r2') },
  { from: 5, to: 9, step: mark('r5') },
];
const tiny = [mark('t9'), mark('t10'), mark('t11')];

describe('stepsOf', () => {
  it('gives the tail of the tiny steps from any minor inside them', () => {
    expect(run(stepsOf(releases, 9, tiny, 9)!)).toEqual(['t9', 't10', 't11']);
    expect(run(stepsOf(releases, 9, tiny, 11)!)).toEqual(['t11']);
    expect(run(stepsOf(releases, 9, tiny, 12)!)).toEqual([]);
  });

  it('chains release steps from an anchor into the tiny steps', () => {
    expect(run(stepsOf(releases, 9, tiny, 5)!)).toEqual(['r5', 't9', 't10', 't11']);
    expect(run(stepsOf(releases, 9, tiny, 2)!)).toEqual(['r2', 'r5', 't9', 't10', 't11']);
  });

  it('gives null below the first anchor, between anchors and above the current minor', () => {
    expect(stepsOf(releases, 9, tiny, 1)).toBeNull();
    expect(stepsOf(releases, 9, tiny, 3)).toBeNull();
    expect(stepsOf(releases, 9, tiny, 8)).toBeNull();
    expect(stepsOf(releases, 9, tiny, 13)).toBeNull();
  });

  it('gives null below the tiny start when there are no release steps', () => {
    expect(stepsOf([], 4, tiny, 3)).toBeNull();
    expect(run(stepsOf([], 4, tiny, 4)!)).toEqual(['t9', 't10', 't11']);
  });

  it('throws when release steps do not chain into each other', () => {
    const gap = [releases[0], { from: 6, to: 9, step: mark('r6') }];
    expect(() => stepsOf(gap, 9, tiny, 2)).toThrow();
  });

  it('throws when the last release step does not end at the tiny start', () => {
    expect(() => stepsOf(releases, 10, tiny, 2)).toThrow();
  });

  it('throws when a release step does not move forward', () => {
    expect(() => stepsOf([{ from: 5, to: 5, step: mark('r') }], 5, tiny, 5)).toThrow();
  });
});

describe('the shipped steps', () => {
  it('end at the current minor', () => {
    expect(SAVE_FORMAT.minor).toBe(TINY_FROM + TINY_STEPS.length);
  });

  it('reach the current minor from every anchor and from every minor in the tiny span', () => {
    for (const minor of anchorMinors()) expect(stepsFrom(minor)).not.toBeNull();
    for (let minor = TINY_FROM; minor <= SAVE_FORMAT.minor; minor++) {
      expect(stepsFrom(minor)).toHaveLength(SAVE_FORMAT.minor - minor);
    }
  });

  it('lists the tiny start as an anchor', () => {
    expect(anchorMinors()).toEqual([...RELEASE_STEPS.map((release) => release.from), TINY_FROM]);
  });

  it('give null above the current minor', () => {
    expect(stepsFrom(SAVE_FORMAT.minor + 1)).toBeNull();
  });
});
