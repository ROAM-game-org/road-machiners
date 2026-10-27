import type { TestModule } from 'vitest/node';

const WORKER_RPC_TIMEOUT = '[vitest-worker]: Timeout calling "onTaskUpdate"';

export type RunVerdict = 'passed' | 'passedPastRpcTimeouts' | 'failed';

function finished(mod: TestModule): boolean {
  const done = mod.state() === 'passed' || mod.state() === 'skipped';
  return done && [...mod.children.allTests()].every((test) => test.result().state !== 'pending');
}

function isWorkerRpcTimeout(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'message' in error && error.message === WORKER_RPC_TIMEOUT;
}

export function runVerdict(modules: readonly TestModule[], unhandledErrors: readonly unknown[]): RunVerdict {
  if (!modules.every(finished)) return 'failed';
  if (unhandledErrors.length === 0) return 'passed';
  return unhandledErrors.every(isWorkerRpcTimeout) ? 'passedPastRpcTimeouts' : 'failed';
}

export function rpcTimeoutNote(count: number): string {
  return `[test-cache] every test passed, so the run ignores ${count} vitest worker RPC timeout${count === 1 ? '' : 's'} calling onTaskUpdate`;
}
