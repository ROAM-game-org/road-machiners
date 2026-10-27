import { describe, expect, it } from 'vitest';
import { TRAIT_TALK } from '../data/dialogue';
import { LESSON_LINE_IDS } from '../data/lessons';
import type { TraitId } from '../data/npcs';
import { ROAD_STORIES, STORY_LINE_IDS, STORY_TRADES, type StoryTrade } from '../data/road-stories';
import { lineKey } from '../text/names';
import { entryText } from '../text/resolve';
import { pickStory, storyTrade, talesHeard } from './road-stories';
import { npcTraits } from './npc-decisions';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { Vehicle, World } from './types';

function driver(w: World, traits: TraitId[], id?: string): Vehicle {
  const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 36, y: 30 });
  npc.brain = npcBrain('trader', npc.pos, traits);
  if (id) npc.id = id;
  return npc;
}

function settleTales(w: World, count: number): void {
  for (let i = 0; i < count; i++) w.player.talked[`tale-${i}`] = { tale: 'done' };
}

describe('road story data', () => {
  it('gives eight distinct stories to each trade, none of them a lesson', () => {
    const used = Object.values(ROAD_STORIES).flat();
    expect(Object.values(ROAD_STORIES).map((stories) => stories.length)).toEqual([8, 8, 8]);
    expect([...used].sort()).toEqual([...STORY_LINE_IDS].sort());
    expect(new Set(used).size).toBe(24);
    for (const id of used) expect(LESSON_LINE_IDS as readonly string[]).not.toContain(id);
  });

  it('gives a story trade to every trait that tells tales', () => {
    for (const [trait, talk] of Object.entries(TRAIT_TALK)) {
      expect(Object.hasOwn(STORY_TRADES, trait), trait).toBe(talk.topics.includes('tale'));
    }
  });
});

describe('road story text', () => {
  it('holds no digit and stays under forty words in English', () => {
    for (const id of STORY_LINE_IDS) {
      const text = entryText('en', lineKey(id));
      expect(text, id).not.toMatch(/\d/);
      expect(text.split(/\s+/).length, id).toBeLessThanOrEqual(40);
    }
  });

  it('holds no digit in Russian', () => {
    for (const id of STORY_LINE_IDS) expect(entryText('ru', lineKey(id)), id).not.toMatch(/\d/);
  });
});

describe('story trade', () => {
  it('takes the trade of the first trait that has one', () => {
    const w = emptyWorld();
    const expected: [TraitId, StoryTrade][] = [['trader', 'hauler'], ['supplier', 'hauler'], ['scavenger', 'salvager'], ['roamer', 'salvager'], ['courier', 'courier']];
    for (const [trait, trade] of expected) expect(storyTrade(driver(w, [trait]))).toBe(trade);
  });

  it('throws for a driver with no story trade', () => {
    const w = emptyWorld();
    const lawman = driver(w, ['lawman']);
    expect(npcTraits(lawman)).toEqual(['lawman']);
    expect(() => storyTrade(lawman)).toThrow(/no trait with a story trade/);
    expect(() => pickStory(w, lawman)).toThrow(/no trait with a story trade/);
  });
});

describe('pick story', () => {
  it('gives the same story for the same seed, trade and count', () => {
    const w = emptyWorld();
    expect(pickStory(w, driver(w, ['trader'], 'a'))).toBe(pickStory(w, driver(w, ['supplier'], 'b')));
  });

  it('never repeats back to back and covers the pool in eight tales', () => {
    const w = emptyWorld();
    const npc = driver(w, ['scavenger']);
    const told: string[] = [];
    for (let i = 0; i < 8; i++) {
      settleTales(w, i);
      told.push(pickStory(w, npc));
    }
    expect(new Set(told).size).toBe(8);
    expect(told.every((id) => (ROAD_STORIES.salvager as readonly string[]).includes(id))).toBe(true);
  });

  it('moves the walk on with a tale of any trade', () => {
    const w = emptyWorld();
    const npc = driver(w, ['courier']);
    const before = pickStory(w, npc);
    w.player.talked.someone = { tale: 'refused' };
    expect(talesHeard(w)).toBe(1);
    expect(pickStory(w, npc)).not.toBe(before);
  });

  it('ignores outcomes of other topics', () => {
    const w = emptyWorld();
    const npc = driver(w, ['trader']);
    const before = pickStory(w, npc);
    w.player.talked.someone = { tips: 'done' };
    expect(pickStory(w, npc)).toBe(before);
  });

  it('starts at a different story for some seed', () => {
    const starts = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const w = emptyWorld();
      w.seed = seed;
      starts.add(pickStory(w, driver(w, ['trader'])));
    }
    expect(starts.size).toBeGreaterThan(1);
  });
});
