import { describe, expect, it } from 'vitest';
import type { TestModule } from 'vitest/node';
import { rpcTimeoutNote, runVerdict } from './verdict';

type ModuleState = ReturnType<TestModule['state']>;
type TestState = 'passed' | 'failed' | 'skipped' | 'pending';

const RPC_TIMEOUT = { message: '[vitest-worker]: Timeout calling "onTaskUpdate"' };

function testModule(state: ModuleState, tests: TestState[]): TestModule {
  const cases = tests.map((test) => ({ result: () => ({ state: test }) }));
  return { state: () => state, children: { allTests: () => cases.values() } } as unknown as TestModule;
}

const passed = () => testModule('passed', ['passed', 'passed']);

describe('runVerdict', () => {
  it('passes a complete run with no unhandled error', () => {
    expect(runVerdict([passed(), testModule('skipped', ['skipped'])], [])).toBe('passed');
  });

  it('passes a complete run whose every test passed when its only unhandled errors are worker RPC timeouts', () => {
    expect(runVerdict([passed(), passed()], [RPC_TIMEOUT, RPC_TIMEOUT])).toBe('passedPastRpcTimeouts');
  });

  it('fails a run with a timed out or failed test beside worker RPC timeouts', () => {
    expect(runVerdict([passed(), testModule('failed', ['passed', 'failed'])], [RPC_TIMEOUT])).toBe('failed');
  });

  it('fails an incomplete run beside worker RPC timeouts', () => {
    expect(runVerdict([passed(), testModule('pending', ['passed', 'pending'])], [RPC_TIMEOUT])).toBe('failed');
    expect(runVerdict([passed(), testModule('queued', [])], [RPC_TIMEOUT])).toBe('failed');
    expect(runVerdict([testModule('passed', ['passed', 'pending'])], [RPC_TIMEOUT])).toBe('failed');
  });

  it('fails a complete passed run with any other unhandled error', () => {
    expect(runVerdict([passed()], [RPC_TIMEOUT, new Error('boom')])).toBe('failed');
    expect(runVerdict([passed()], [{ message: '[vitest-worker]: Timeout calling "fetch" with "[]"' }])).toBe('failed');
    expect(runVerdict([passed()], ['[vitest-worker]: Timeout calling "onTaskUpdate"'])).toBe('failed');
  });

  it('names how many worker RPC timeouts a passed run ignored', () => {
    expect(rpcTimeoutNote(1)).toMatch(/ignores 1 vitest worker RPC timeout calling onTaskUpdate$/);
    expect(rpcTimeoutNote(2)).toMatch(/ignores 2 vitest worker RPC timeouts calling onTaskUpdate$/);
  });
});
