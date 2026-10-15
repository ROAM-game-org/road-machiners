import { describe, expect, it } from 'vitest';
import { subsetCommand, testSubset } from './subset';

const existing = (...files: string[]) => (file: string) => files.includes(file);

describe('testSubset', () => {
  it('takes a changed test file that still exists', () => {
    expect(testSubset(['game/src/sim/fuel.test.ts'], existing('src/sim/fuel.test.ts'))).toEqual(['src/sim/fuel.test.ts']);
  });

  it('drops a changed test file that the change deleted', () => {
    expect(testSubset(['game/src/sim/fuel.test.ts'], existing())).toEqual([]);
  });

  it('takes the test next to a changed source file', () => {
    expect(testSubset(['game/src/sim/fuel.ts', 'game/src/ui/panel.tsx'], existing('src/sim/fuel.test.ts', 'src/ui/panel.test.ts'))).toEqual(['src/sim/fuel.test.ts', 'src/ui/panel.test.ts']);
  });

  it('runs nothing for a source file with no test next to it', () => {
    expect(testSubset(['game/src/sim/fuel.ts'], existing())).toEqual([]);
  });

  it('lists a test once when both it and its source changed', () => {
    expect(testSubset(['game/src/sim/fuel.ts', 'game/src/sim/fuel.test.ts'], existing('src/sim/fuel.test.ts'))).toEqual(['src/sim/fuel.test.ts']);
  });

  it('ignores files outside the game', () => {
    expect(testSubset(['factory/src/tick.test.ts', 'factory/src/tick.ts'], existing('src/tick.test.ts'))).toEqual([]);
  });

  it.each(['game/package-lock.json', 'game/vitest.config.ts', 'game/scripts/test-cache.mjs', 'game/src/test/settled-runner.ts'])('runs every test when %s changes how tests run', (file) => {
    expect(testSubset([file, 'game/src/sim/fuel.test.ts'], existing('src/sim/fuel.test.ts'))).toBe('all');
  });
});

describe('subsetCommand', () => {
  it('runs nothing for an empty subset', () => {
    expect(subsetCommand([])).toBe('');
  });

  it('runs the listed files with no cache', () => {
    expect(subsetCommand(['src/a.test.ts', 'src/b.test.ts'])).toBe('npm run test:cached -- src/a.test.ts src/b.test.ts');
  });

  it('runs the whole suite with no cache', () => {
    expect(subsetCommand('all')).toBe('npm run test:cached');
  });
});
