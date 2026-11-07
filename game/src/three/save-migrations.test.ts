import { describe, expect, it } from 'vitest';
import { RELEASE_STEPS, TINY_STEPS } from './save-migrations';

describe('step names', () => {
  it('are unique camelCase words without digits across tiny steps and release steps', () => {
    const names = [...TINY_STEPS.map((named) => named.name), ...RELEASE_STEPS.flatMap((release) => release.names ?? [])];
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name, name).toMatch(/^[a-z][A-Za-z]*$/);
  });
});
