import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_TOPIC, TOPIC_VALUES, TOPICS, topicAnswer, WIKI_ROOT } from './topics';

describe('public topics', () => {
  it('link only wiki pages that exist on this checkout', () => {
    const missing = TOPICS.flatMap((topic) => (topic.page === null || existsSync(join('..', WIKI_ROOT, topic.page)) ? [] : [topic.page]));
    expect(missing).toEqual([]);
  });

  it('have unique values and end with the no-topic choice', () => {
    expect(new Set(TOPIC_VALUES).size).toBe(TOPIC_VALUES.length);
    expect(TOPIC_VALUES.at(-1)).toBe(NO_TOPIC);
  });

  it('answer with the fixed text and the wiki page on main, and give no answer for none', () => {
    expect(topicAnswer('o/r', 'truck')).toBe('The truck page covers the inventory grid, refits, mass, gun power draw, utilities, the claymore ram, wear, breakdowns and field repair: https://github.com/o/r/blob/main/game/docs/wiki/mechanics/truck.md');
    expect(topicAnswer('o/r', 'taking-part')).not.toContain('http');
    expect(topicAnswer('o/r', NO_TOPIC)).toBeNull();
  });
});
