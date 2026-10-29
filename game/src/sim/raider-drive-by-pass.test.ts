import { describe, expect, it } from 'vitest';
import { count, runs, SEEDS, SLOW_PASS_TURNS, summary } from '../test/drive-by-scene';

const FIRST = SEEDS.slice(0, 4);

describe.each([['by day', false], ['at night', true]])('drive-by %s on the real map', (_label, night) => {
  it('leaves no feud with an empty-handed player', () => {
    const empty = runs('playerEmpty', night, SLOW_PASS_TURNS, FIRST);
    expect(count(empty, (r) => r.engaged || r.feud), summary(empty, FIRST)).toBe(0);
  });

  it('shows the pass line "let you be this time" when the raider sees an empty-handed player, whose empty hold it takes for room to carry', () => {
    const empty = runs('playerEmpty', night, SLOW_PASS_TURNS, FIRST);
    const shown = empty.flatMap((r) => r.hover);
    if (!night) expect(shown.length, summary(empty, FIRST)).toBeGreaterThan(0);
    for (const line of shown) expect(line).toBe('Lets you pass: let you be this time');
  });
});
