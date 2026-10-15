import { GAME_DIR } from '../types';

const GAME_PREFIX = `${GAME_DIR}/`;
const TEST_SETUP = ['package-lock.json', 'vitest.config.ts', 'scripts/test-cache.mjs'];
const TEST_SETUP_DIR = 'src/test/';
const TEST_FILE = /\.test\.ts$/;
const SOURCE_FILE = /\.tsx?$/;

export function testSubset(changed: string[], exists: (gamePath: string) => boolean): string[] | 'all' {
  const game = changed.filter((file) => file.startsWith(GAME_PREFIX)).map((file) => file.slice(GAME_PREFIX.length));
  if (game.some(changesHowTestsRun)) return 'all';
  const tests = game.map(testOf).filter((test): test is string => test !== null && exists(test));
  return [...new Set(tests)];
}

function changesHowTestsRun(file: string): boolean {
  return TEST_SETUP.includes(file) || file.startsWith(TEST_SETUP_DIR);
}

function testOf(file: string): string | null {
  if (TEST_FILE.test(file)) return file;
  if (SOURCE_FILE.test(file)) return file.replace(SOURCE_FILE, '.test.ts');
  return null;
}

export function subsetCommand(tests: string[] | 'all'): string {
  if (tests === 'all') return 'npm run test:cached';
  if (tests.length === 0) return '';
  return `npm run test:cached -- ${tests.join(' ')}`;
}
