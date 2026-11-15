import { describe, expect, it } from 'vitest';
import { BootUnfinished, clearMark, markStep, markWaiting, takeUnfinished } from './boot-marker';

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
    markStep(storage, 'roam', 'building the ground', 'new', '2.1.0');

    expect(takeUnfinished(storage, 'roam')).toEqual({ step: 'building the ground', request: 'new', version: '2.1.0' });
    expect(takeUnfinished(storage, 'roam')).toBeNull();
  });

  it('does not count a menu wait, a cleared mark or a fresh visit', () => {
    const storage = session();
    expect(takeUnfinished(storage, 'roam')).toBeNull();

    markStep(storage, 'roam', 'loading the save', 'menu', '2.1.0');
    markWaiting(storage, 'roam');
    expect(takeUnfinished(storage, 'roam')).toBeNull();

    markStep(storage, 'roam', 'running', 'menu', '2.1.0');
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
    markStep(storage, 'roam-quest-view', 'running', 'menu', '2.1.0');

    expect(takeUnfinished(storage, 'roam')).toBeNull();
  });

  it('names the step and the version in its error', () => {
    const error = new BootUnfinished({ step: 'building the ground', request: 'new', version: '2.1.0' });

    expect(error.message).toContain('building the ground');
    expect(error.message).toContain('2.1.0');
    expect(error.message).toContain('new');
  });
});
