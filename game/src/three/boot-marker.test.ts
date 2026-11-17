import { describe, expect, it } from 'vitest';
import { BootUnfinished, clearMark, markStep, markWaiting, takeUnfinished, watchBootEnd } from './boot-marker';

function session(): Storage {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  } as unknown as Storage;
}

describe('the boot marker', () => {
  it('hands back a boot left at a step, once', () => {
    const storage = session();
    markStep(storage, 'roam', 'building the ground', 'new', '2.1.0', 5_000);

    expect(takeUnfinished(storage, 'roam')).toEqual({ step: 'building the ground', request: 'new', version: '2.1.0', startedAt: 5_000 });
    expect(takeUnfinished(storage, 'roam')).toBeNull();
  });

  it('does not count a menu wait, a cleared mark or a fresh visit', () => {
    const storage = session();
    expect(takeUnfinished(storage, 'roam')).toBeNull();

    markStep(storage, 'roam', 'loading the save', 'menu', '2.1.0', 0);
    markWaiting(storage, 'roam');
    expect(takeUnfinished(storage, 'roam')).toBeNull();

    markStep(storage, 'roam', 'running', 'menu', '2.1.0', 0);
    clearMark(storage, 'roam');
    expect(takeUnfinished(storage, 'roam')).toBeNull();
  });

  it('ignores a mark it cannot read', () => {
    const storage = session();
    storage.setItem('roam.boot-mark', '{not json');

    expect(takeUnfinished(storage, 'roam')).toBeNull();
  });

  it('keeps the quest view and the main game apart', () => {
    const storage = session();
    markStep(storage, 'roam-quest-view', 'running', 'menu', '2.1.0', 0);

    expect(takeUnfinished(storage, 'roam')).toBeNull();
  });

  it('names the step and the version in its error', () => {
    const error = new BootUnfinished({ step: 'building the ground', request: 'new', version: '2.1.0' }, 0);

    expect(error.message).toBe('The last start of 2.1.0 did not finish. It died in the step: building the ground, started from: new');
  });
});

function page() {
  const listeners = new Map<string, (() => void)[]>();
  const target = {
    visibilityState: 'visible',
    addEventListener: (name: string, fn: () => void) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
  } as unknown as EventTarget & { visibilityState: string };
  const fire = (name: string) => (listeners.get(name) ?? []).forEach((fn) => fn());
  return { target, fire };
}

describe('how an unfinished start ended', () => {
  function watched() {
    const storage = session();
    const window = page();
    const document = page();
    let clock = 0;
    watchBootEnd(window.target, document.target, storage, 'roam', () => clock);
    const at = (ms: number) => (clock = ms);
    const hide = () => {
      document.target.visibilityState = 'hidden';
      document.fire('visibilitychange');
    };
    const show = () => {
      document.target.visibilityState = 'visible';
      document.fire('visibilitychange');
    };
    const message = (now: number) => new BootUnfinished(takeUnfinished(storage, 'roam')!, now).message;
    return { storage, leave: () => window.fire('pagehide'), hide, show, at, message };
  }

  it('says the page was closed or reloaded, and how long into the step', () => {
    const boot = watched();
    markStep(boot.storage, 'roam', 'building the first cells', 'new', '2.1.0', 10_000);
    boot.at(16_400);
    boot.hide();
    boot.leave();

    expect(boot.message(90_000)).toBe('The last start of 2.1.0 did not finish. It died in the step: building the first cells, started from: new. The page was closed or reloaded 6 s into the step.');
  });

  it('says the page stopped with no unload when nothing fired', () => {
    const boot = watched();
    markStep(boot.storage, 'roam', 'building the HUD', 'new', '2.1.0', 10_000);

    expect(boot.message(41_000)).toContain('The page stopped with no unload; the next start came 31 s after the step began.');
  });

  it('says the page was hidden when it went hidden and never unloaded', () => {
    const boot = watched();
    markStep(boot.storage, 'roam', 'building the HUD', 'new', '2.1.0', 10_000);
    boot.at(12_000);
    boot.hide();

    expect(boot.message(60_000)).toContain('The page was hidden 2 s into the step and never came back to finish it.');
  });

  it('forgets a hide when the page came back before it stopped', () => {
    const boot = watched();
    markStep(boot.storage, 'roam', 'building the HUD', 'new', '2.1.0', 10_000);
    boot.at(12_000);
    boot.hide();
    boot.show();

    expect(boot.message(20_000)).toContain('The page stopped with no unload; the next start came 10 s after the step began.');
  });

  it('starts a new step with no ending', () => {
    const boot = watched();
    markStep(boot.storage, 'roam', 'building the HUD', 'new', '2.1.0', 10_000);
    boot.hide();
    markStep(boot.storage, 'roam', 'running', 'new', '2.1.0', 11_000);

    expect(takeUnfinished(boot.storage, 'roam')).toEqual({ step: 'running', request: 'new', version: '2.1.0', startedAt: 11_000 });
  });

  it('leaves a menu wait, a cleared mark and a fresh visit alone', () => {
    const boot = watched();
    boot.leave();
    expect(takeUnfinished(boot.storage, 'roam')).toBeNull();

    markWaiting(boot.storage, 'roam');
    boot.leave();
    expect(takeUnfinished(boot.storage, 'roam')).toBeNull();

    markStep(boot.storage, 'roam', 'running', 'menu', '2.1.0', 0);
    clearMark(boot.storage, 'roam');
    boot.hide();
    boot.leave();
    expect(takeUnfinished(boot.storage, 'roam')).toBeNull();
  });

  it('reads a mark from an older build as before', () => {
    const boot = watched();
    boot.storage.setItem('roam.boot-mark', JSON.stringify({ step: 'starting the game', request: 'new', version: '2.0.0' }));

    expect(boot.message(1_000)).toBe('The last start of 2.0.0 did not finish. It died in the step: starting the game, started from: new');
  });

  it('ignores a mark with an ending it does not know', () => {
    const boot = watched();
    boot.storage.setItem('roam.boot-mark', JSON.stringify({ step: 'running', request: 'new', version: '2.0.0', startedAt: 0, ended: 'crashed' }));

    expect(takeUnfinished(boot.storage, 'roam')).toBeNull();
  });
});
