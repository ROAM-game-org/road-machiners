import { describe, expect, it } from 'vitest';
import type { Suite } from 'vitest';
import { getHooks, setHooks } from 'vitest/suite';
import { settleHooks } from './settled-runner';

type HookName = 'beforeAll' | 'beforeEach' | 'afterEach' | 'afterAll';
type Hook = (...args: unknown[]) => unknown;

const HOOK_NAMES: HookName[] = ['beforeAll', 'beforeEach', 'afterEach', 'afterAll'];

function suiteWith(hooks: Partial<Record<HookName, Hook>>): Suite {
  const suite = {} as Suite;
  setHooks(suite, {
    beforeAll: hooks.beforeAll ? [hooks.beforeAll] : [],
    beforeEach: hooks.beforeEach ? [hooks.beforeEach] : [],
    afterEach: hooks.afterEach ? [hooks.afterEach] : [],
    afterAll: hooks.afterAll ? [hooks.afterAll] : [],
  } as never);
  return suite;
}

function openReply() {
  let release = () => {};
  const reply = new Promise<void>((resolve) => { release = resolve; });
  return { settled: () => reply, release };
}

function hookOf(suite: Suite, name: HookName): Hook {
  return (getHooks(suite) as unknown as Record<HookName, Hook[]>)[name][0]!;
}

describe('settled runner hooks', () => {
  for (const name of HOOK_NAMES) {
    it(`${name} waits for the open update reply`, async () => {
      const calls: string[] = [];
      const suite = suiteWith({ [name]: () => { calls.push(name); } });
      const reply = openReply();
      settleHooks(suite, reply.settled);

      const running = hookOf(suite, name)();
      await Promise.resolve();
      expect(calls).toEqual([]);

      reply.release();
      await running;
      expect(calls).toEqual([name]);
    });
  }

  it('returns what the original hook returns', async () => {
    const cleanup = () => {};
    const suite = suiteWith({ beforeAll: () => cleanup });
    settleHooks(suite, async () => {});

    expect(await hookOf(suite, 'beforeAll')()).toBe(cleanup);
  });

  it('passes the hook arguments through', async () => {
    const seen: unknown[][] = [];
    const suite = suiteWith({ beforeEach: (...args) => { seen.push(args); } });
    settleHooks(suite, async () => {});

    await hookOf(suite, 'beforeEach')('context', 'suite');

    expect(seen).toEqual([['context', 'suite']]);
  });

  it('wraps a suite only once', async () => {
    let waits = 0;
    const suite = suiteWith({ beforeAll: () => {} });
    const settled = async () => { waits++; };
    settleHooks(suite, settled);
    settleHooks(suite, settled);

    await hookOf(suite, 'beforeAll')();

    expect(waits).toBe(1);
  });
});
