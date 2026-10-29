import { expect, it } from 'vitest';
import { checkScript } from './checks';

it('runs the playtest without the host-wide TEST_TIMEOUTS=off, so a stuck turn fails by its own limit', () => {
  expect(checkScript('npm run playtest', '')).toContain('\nenv -u TEST_TIMEOUTS npm run playtest\n');
});
