import { describe, expect, it } from 'vitest';
import type { TestModule } from 'vitest/node';
import { runVerdict } from './verdict';

type TestState = 'passed' | 'failed' | 'skipped' | 'pending';

function moduleOf(state: 'passed' | 'failed' | 'skipped' | 'pending', tests: TestState[]): TestModule {
  const children = { allTests: () => tests.map((test) => ({ result: () => ({ state: test }) })) };
  return { state: () => state, children } as unknown as TestModule;
}

const RPC_TIMEOUT = { message: '[vitest-worker]: Timeout calling "onTaskUpdate"' };

describe('runVerdict', () => {
  it('passes a finished run with no unhandled errors, and with only worker RPC timeouts', () => {
    const modules = [moduleOf('passed', ['passed', 'skipped']), moduleOf('skipped', ['skipped'])];
    expect(runVerdict(modules, [])).toBe('passed');
    expect(runVerdict(modules, [RPC_TIMEOUT, RPC_TIMEOUT])).toBe('passedPastRpcTimeouts');
  });

  it('fails an incomplete run even when worker RPC timeouts are its only errors', () => {
    expect(runVerdict([moduleOf('passed', ['passed']), moduleOf('pending', ['pending'])], [RPC_TIMEOUT])).toBe('failed');
    expect(runVerdict([moduleOf('passed', ['passed', 'pending'])], [RPC_TIMEOUT])).toBe('failed');
  });

  it('fails a run with a failed test beside worker RPC timeouts', () => {
    expect(runVerdict([moduleOf('failed', ['passed', 'failed'])], [RPC_TIMEOUT])).toBe('failed');
  });

  it('fails a run with any other error, also one that only looks like a worker RPC timeout', () => {
    const modules = [moduleOf('passed', ['passed'])];
    expect(runVerdict(modules, [RPC_TIMEOUT, new Error('boom')])).toBe('failed');
    expect(runVerdict(modules, [{ message: '[vitest-worker]: Timeout calling "onCollected"' }])).toBe('failed');
    expect(runVerdict(modules, ['[vitest-worker]: Timeout calling "onTaskUpdate"'])).toBe('failed');
  });
});
