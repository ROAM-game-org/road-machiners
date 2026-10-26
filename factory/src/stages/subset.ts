import { GAME_DIR } from '../types';

const GAME_PREFIX = `${GAME_DIR}/`;
const TEST_SETUP = [
  'package-lock.json',
  'vitest.config.ts',
  'scripts/test-cache.mjs',
  'src/test/settled-runner.ts',
  'src/test/yield-setup.ts',
  'src/test/cpu-limits-setup.ts',
  'src/test/cpu-limits.ts',
  'src/test/empty-template-setup.ts',
  'src/test/empty-world.ts',
  'src/test/map.ts',
  'src/test/timeouts.ts',
  'src/test/workers.ts',
];
const TEST_SETUP_DIR = 'src/test/cache/';
const NO_TESTS_DIR = 'docs/';

export function testSubset(changed: string[]): string[] | 'all' {
  const game = changed.filter((file) => file.startsWith(GAME_PREFIX)).map((file) => file.slice(GAME_PREFIX.length));
  if (game.some(changesHowTestsRun)) return 'all';
  return game.filter((file) => !file.startsWith(NO_TESTS_DIR));
}

function changesHowTestsRun(file: string): boolean {
  return TEST_SETUP.includes(file) || file.startsWith(TEST_SETUP_DIR);
}

export function subsetCommand(related: string[] | 'all'): string {
  if (related === 'all') return 'npm run test:cached';
  if (related.length === 0) return '';
  return `npm run test:cached -- --related ${related.join(' ')}`;
}
