import { describe, expect, it } from 'vitest';
import { runNow, runStepped } from './stepped';

function pieces(log: string[], failAt?: string): Generator<string, number> {
  return (function* () {
    for (const name of ['a', 'b', 'c']) {
      yield name;
      if (name === failAt) throw new Error(`${name} failed`);
      log.push(`built ${name}`);
    }
    return 7;
  })();
}

describe('the stepped build', () => {
  it('waits for the paint before each piece and returns the result', async () => {
    const log: string[] = [];

    const result = await runStepped(pieces(log), async (name) => void log.push(`paint before ${name}`));

    expect(result).toBe(7);
    expect(log).toEqual(['paint before a', 'built a', 'paint before b', 'built b', 'paint before c', 'built c']);
  });

  it('rejects with the error of a piece and starts no later piece', async () => {
    const log: string[] = [];

    await expect(runStepped(pieces(log, 'b'), async (name) => void log.push(`paint before ${name}`))).rejects.toThrow('b failed');

    expect(log).toEqual(['paint before a', 'built a', 'paint before b']);
  });

  it('runs the same pieces in one go with the same result', () => {
    const log: string[] = [];

    expect(runNow(pieces(log))).toBe(7);
    expect(log).toEqual(['built a', 'built b', 'built c']);
  });
});
