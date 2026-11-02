import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkTests, countTimeLimits, sampleCounts } from './quality-tests.mjs';

const file = 'game/src/sim/rule.test.ts';

function testCase(body, limit = '') {
  return `it('holds the rule', () => {\n  ${body}\n}${limit});\n`;
}

test('counts each kind of test time limit', () => {
  assert.equal(countTimeLimits(testCase('expect(1).toBe(1);', ', 90_000')), 1);
  assert.equal(countTimeLimits(testCase('expect(1).toBe(1);', ', SLOW')), 1);
  assert.equal(countTimeLimits(testCase('expect(1).toBe(1);', ', budget(60_000)')), 2);
  assert.equal(countTimeLimits("it('waits', { timeout: 5000 }, () => {});"), 1);
  assert.equal(countTimeLimits("vi.setConfig({ testTimeout: 1 }); if (process.env.TEST_TIMEOUTS === 'off') {}"), 3);
});

test('does not count call arguments that close an object literal mid-line', () => {
  assert.equal(countTimeLimits("const v = addVehicle(w, 'scout', { x: 1, y: 2 }, 3);"), 0);
});

test('rejects a new time limit in a test file', () => {
  const failures = checkTests(new Map([[file, testCase('run();', ', 60_000')]]), new Map([[file, testCase('run();')]]));
  assert.match(failures.join('\n'), /test time limits: .* 1 time limits, up from 0/);
});

test('accepts time limits that move between test files in one commit', () => {
  const previous = new Map([[file, testCase('run();', ', SLOW') + testCase('walk();', ', SLOW')]]);
  const current = new Map([[file, testCase('run();', ', SLOW')], ['game/src/sim/walk.test.ts', testCase('walk();', ', SLOW')]]);
  assert.deepEqual(checkTests(current, previous), []);
});

test('accepts a time limit removed with its test file', () => {
  assert.deepEqual(checkTests(new Map(), new Map([[file, testCase('run();', ', SLOW')]])), []);
});

test('ignores files that are not game tests', () => {
  const tool = 'factory/src/job.test.ts';
  assert.deepEqual(checkTests(new Map([[tool, "spawnSync('x', { timeout: 10 });"]]), new Map([[tool, '']])), []);
});

test('reads sample counts from named counts, seed lists, array lengths and loop bounds', () => {
  const source = [
    'const SEEDS = 20;',
    'const rolls = [1, 2, 3];',
    'runOn(Array.from({ length: 10 }, (_, i) => i + 1));',
    'for (let turn = 1; turn <= 40; turn++) step();',
    'const limit = 5;',
  ].join('\n');
  assert.deepEqual([...sampleCounts(source)].map(([signature, { total }]) => [signature, total]), [
    ['const SEEDS', 20],
    ['const rolls = [...]', 3],
    ['runOn(Array.from({ length: # }, (_, i) => i + 1));', 10],
    ['for (let turn = 1; turn <= #;', 40],
  ]);
});

test('rejects a lowered seed count on the same line', () => {
  const failures = checkTests(new Map([[file, 'for (let seed = 1; seed <= 10; seed++) check(seed);']]), new Map([[file, 'for (let seed = 1; seed <= 25; seed++) check(seed);']]));
  assert.match(failures.join('\n'), /test samples: "for \(let seed = 1; seed <= #;" fell from 25 to 10/);
});

test('rejects fewer turns in a loop with a plain counter', () => {
  const failures = checkTests(new Map([[file, 'for (let i = 0; i < 30; i++) endTurn(w);']]), new Map([[file, 'for (let i = 0; i < 60; i++) endTurn(w);']]));
  assert.equal(failures.length, 1);
});

test('accepts a split that keeps the total of a count over two files', () => {
  const line = (count) => `onSeeds(Array.from({ length: ${count} }, (_, i) => i + 1));`;
  const current = new Map([[file, line(10)], ['game/src/sim/rule-more.test.ts', line(10)]]);
  assert.deepEqual(checkTests(current, new Map([[file, line(20)]])), []);
});

test('accepts a rewrite that drops a loop or adds a new one', () => {
  const previous = new Map([[file, 'for (let i = 0; i < 50; i++) a();\nfor (let i = 0; i < 8; i++) b();']]);
  assert.deepEqual(checkTests(new Map([[file, 'for (let i = 0; i < 8; i++) b();']]), previous), []);
  assert.deepEqual(checkTests(new Map([[file, 'for (let i = 0; i < 8; i++) b();\nfor (let i = 0; i < 3; i++) c();\nfor (let i = 0; i < 50; i++) a();']]), previous), []);
});

test('accepts a raised count and a new test file', () => {
  assert.deepEqual(checkTests(new Map([[file, 'const TURNS = 80;']]), new Map([[file, 'const TURNS = 40;']])), []);
  assert.deepEqual(checkTests(new Map([[file, 'const TURNS = 3;']]), new Map()), []);
});
