import { describe, expect, it } from 'vitest';
import { count, runs, SEEDS, SLOW_PASS_TURNS, summary } from '../test/drive-by-scene';

const HALVES = [SEEDS.slice(0, SEEDS.length / 2), SEEDS.slice(SEEDS.length / 2)];

describe.each([['by day', false], ['at night', true]])('drive-by %s on the real map', (_label, night) => {
  it.each(HALVES.map((half) => [half]))('leaves no feud with an empty-handed player on seeds %j', (seeds) => {
    const empty = runs('playerEmpty', night, SLOW_PASS_TURNS, seeds);
    expect(count(empty, (r) => r.engaged || r.feud), summary(empty, seeds)).toBe(0);
  });

  it('shows the pass line "nothing worth taking" when the raider sees an empty-handed player', () => {
    const empty = runs('playerEmpty', night, SLOW_PASS_TURNS);
    const shown = empty.flatMap((r) => r.hover);
    if (!night) expect(shown.length, summary(empty)).toBeGreaterThan(0);
    for (const line of shown) expect(line).toBe('Lets you pass: nothing worth taking');
  });
});
