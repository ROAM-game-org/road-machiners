import { describe, expect, it } from 'vitest';
import { subsetCommand, testSubset } from './subset';

describe('testSubset', () => {
  it('takes a changed test file', () => {
    expect(testSubset(['game/src/sim/fuel.test.ts'])).toEqual(['src/sim/fuel.test.ts']);
  });

  it('takes every changed game source, whether or not a test sits next to it', () => {
    expect(testSubset(['game/src/sim/fuel.ts', 'game/src/text/ru/story.ts', 'game/src/ui/panel.tsx'])).toEqual(['src/sim/fuel.ts', 'src/text/ru/story.ts', 'src/ui/panel.tsx']);
  });

  it('takes changed data files outside src', () => {
    expect(testSubset(['game/public/maps/icarus.bin'])).toEqual(['public/maps/icarus.bin']);
  });

  it('ignores game docs', () => {
    expect(testSubset(['game/docs/notes.md'])).toEqual([]);
  });

  it('ignores files outside the game', () => {
    expect(testSubset(['factory/src/tick.test.ts', 'factory/src/tick.ts'])).toEqual([]);
  });

  it.each(['game/package-lock.json', 'game/vitest.config.ts', 'game/scripts/test-cache.mjs', 'game/src/test/settled-runner.ts', 'game/src/test/cpu-limits.ts', 'game/src/test/cache/stall.ts'])('runs every test when %s changes how tests run', (file) => {
    expect(testSubset([file, 'game/src/sim/fuel.test.ts'])).toBe('all');
  });
});

describe('subsetCommand', () => {
  it('runs nothing for an empty subset', () => {
    expect(subsetCommand([])).toBe('');
  });

  it('runs the tests that import the changed files, with no cache', () => {
    expect(subsetCommand(['src/sim/fuel.ts', 'src/b.test.ts'])).toBe('npm run test:cached -- --related src/sim/fuel.ts src/b.test.ts');
  });

  it('runs the whole suite with no cache', () => {
    expect(subsetCommand('all')).toBe('npm run test:cached');
  });
});
