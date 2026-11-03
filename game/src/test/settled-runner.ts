import type { RunnerTestCase, RunnerTaskEventPack, RunnerTaskResultPack, Suite } from 'vitest';
import { VitestTestRunner } from 'vitest/runners';
import { getFn, getHooks, setHooks } from 'vitest/suite';

type TaskUpdate = (packs: RunnerTaskResultPack[], events: RunnerTaskEventPack[]) => Promise<void>;
type Hook = (...args: never[]) => unknown;

const HOOK_NAMES = ['beforeAll', 'beforeEach', 'afterEach', 'afterAll'] as const;
const settledSuites = new WeakSet<Suite>();

export function settleHooks(suite: Suite, settled: () => Promise<void>): void {
  const hooks = getHooks(suite);
  if (!hooks || settledSuites.has(suite)) return;
  settledSuites.add(suite);
  for (const name of HOOK_NAMES) {
    hooks[name] = (hooks[name] as Hook[]).map((hook): Hook => async (...args) => {
      await settled();
      return hook(...args);
    }) as never;
  }
  setHooks(suite, hooks);
}

export default class SettledRunner extends VitestTestRunner {
  private readonly pending = new Set<Promise<void>>();
  private sendUpdate: TaskUpdate | undefined;

  constructor(...args: ConstructorParameters<typeof VitestTestRunner>) {
    super(...args);
    Object.defineProperty(this, 'onTaskUpdate', {
      configurable: true,
      get: () => this.sendUpdate,
      set: (send: TaskUpdate) => {
        this.sendUpdate = (packs, events) => {
          const reply = send(packs, events);
          this.pending.add(reply);
          reply.then(() => this.pending.delete(reply), () => this.pending.delete(reply));
          return reply;
        };
      },
    });
  }

  async settled(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  async onBeforeRunSuite(suite: Suite): Promise<void> {
    await super.onBeforeRunSuite(suite);
    settleHooks(suite, () => this.settled());
  }

  async runTask(test: RunnerTestCase): Promise<void> {
    await this.settled();
    await getFn(test)();
  }
}
