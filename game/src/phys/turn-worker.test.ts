import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scope = globalThis as { onmessage?: unknown };

describe('the turn worker start', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('self', globalThis);
    delete scope.onmessage;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('./drive');
    delete scope.onmessage;
  });

  it('starts no worker when the turn module is imported', async () => {
    await import('./turn');
    expect(scope.onmessage).toBeFalsy();
  });

  it('starts the worker and Rapier once from the worker entry', async () => {
    let inits = 0;
    vi.doMock('./drive', async () => {
      const actual = await vi.importActual<typeof import('./drive')>('./drive');
      return {
        ...actual,
        initPhysics: () => {
          inits++;
          return actual.initPhysics();
        },
      };
    });
    await import('./turn-worker');
    expect(typeof scope.onmessage).toBe('function');
    expect(inits).toBe(1);
    await import('./turn');
    expect(inits).toBe(1);
  });
});
