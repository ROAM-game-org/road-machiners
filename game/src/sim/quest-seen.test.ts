import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { compileBundle, withEnglishTwins } from '../test/quest-compile';
import { chooseQuestOption, questView, relanguageQuest, seenChoices, setQuestLanguage, startQuest } from './quests';
import { defaultSetup } from './settings';
import type { World } from './types';
import { cloneWorld, newWorld } from './world';

const BODY = `
VAR open = false
VAR price = 5

=== start ===
# checkpoint: start
You stand at the counter.
-> hub

= hub
# checkpoint: start.hub
+ [About the road…]
  -> road
+ [How is business?]
  Business is slow, and a drink is {price}.
  -> hub
+ [Raise the price.]
  Done.
  ~ price = 7
  -> hub
+ [Open the cellar.]
  Opened.
  ~ open = true
  -> hub
+ [Take a coin.]
  ~ give_money(1)
  -> hub
+ [Leave.]
  -> END

= road
+ [Which way is Nose?]
  North.
  -> road
+ {open} [Who drinks there?]
  Nobody.
  -> road
+ [Back.]
  -> hub
`;

const QUESTS = compileBundle(withEnglishTwins({ 'world.ink': 'EXTERNAL money()\nEXTERNAL give_money(amount)\n', 'q.ink': `INCLUDE world.ink\n${BODY}` }));

function start(): World {
  return startQuest(newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false), QUESTS, 'q', 'start');
}

function pick(w: World, text: string): World {
  const index = questView(w, QUESTS).choices.indexOf(text);
  if (index < 0) throw new Error(`No choice ${text} in ${questView(w, QUESTS).choices.join(', ')}`);
  return chooseQuestOption(w, QUESTS, index);
}

function seenMap(w: World): Record<string, boolean> {
  const view = questView(w, QUESTS);
  return Object.fromEntries(view.choices.map((text, i) => [text, view.seen[i]]));
}

describe('a talk question that holds nothing new', () => {
  it('is new before its first pick and seen after it', () => {
    const w = start();
    expect(seenMap(w)['How is business?']).toBe(false);
    const after = pick(w, 'How is business?');
    expect(seenMap(after)['How is business?']).toBe(true);
    expect(seenMap(after)['Raise the price.']).toBe(false);
  });

  it('turns new again when its reply changes, and seen again once heard', () => {
    let w = pick(start(), 'How is business?');
    w = pick(w, 'Raise the price.');
    expect(seenMap(w)['How is business?']).toBe(false);
    w = pick(w, 'How is business?');
    expect(seenMap(w)['How is business?']).toBe(true);
  });

  it('is never marked for a way out or a choice that calls an effect, even after it was picked', () => {
    const w = pick(start(), 'Take a coin.');
    expect(seenMap(w)['Take a coin.']).toBe(false);
    expect(seenMap(w)['Leave.']).toBe(false);
  });
});

describe('a talk topic', () => {
  it('is new until every question inside was heard, then seen, and new again when a question opens', () => {
    let w = start();
    expect(seenMap(w)['About the road…']).toBe(false);
    w = pick(w, 'About the road…');
    w = pick(w, 'Which way is Nose?');
    w = pick(w, 'Back.');
    expect(seenMap(w)['About the road…']).toBe(true);
    w = pick(w, 'Open the cellar.');
    expect(seenMap(w)['About the road…']).toBe(false);
  });

  it('keeps its page questions marked on the page', () => {
    let w = pick(start(), 'About the road…');
    expect(seenMap(w)['Which way is Nose?']).toBe(false);
    w = pick(w, 'Which way is Nose?');
    expect(seenMap(w)['Which way is Nose?']).toBe(true);
    expect(seenMap(w)['Back.']).toBe(false);
  });
});

describe('looking ahead', () => {
  it('runs no effect and changes nothing in the world', () => {
    const w = pick(start(), 'How is business?');
    const before = JSON.stringify(w);
    const money = w.player.money;
    const copy = cloneWorld(w);
    seenChoices(copy, QUESTS);
    expect(JSON.stringify(copy)).toBe(before);
    expect(copy.player.money).toBe(money);
  });

  it('leaves a later pick playing exactly as it would without it', () => {
    const w = pick(start(), 'How is business?');
    const looked = cloneWorld(w);
    seenChoices(looked, QUESTS);
    const plain = pick(cloneWorld(w), 'Take a coin.');
    const after = pick(looked, 'Take a coin.');
    expect(after.player.money).toBe(plain.player.money);
    expect(after.player.quests.live).toEqual(plain.player.quests.live);
  });
});

describe('where seen is kept', () => {
  it('survives a copy of the world, as a save and load give', () => {
    const w = pick(start(), 'How is business?');
    const loaded = cloneWorld(JSON.parse(JSON.stringify(w)) as World);
    expect(seenMap(loaded)['How is business?']).toBe(true);
  });

  it('is dropped for the quest when the language switches', () => {
    const w = pick(start(), 'How is business?');
    setQuestLanguage('ru');
    try {
      const switched = relanguageQuest(w, QUESTS);
      expect(switched.player.quests.seen).toEqual({});
      expect(seenMap(switched)['How is business?']).toBe(false);
    } finally {
      setQuestLanguage('en');
    }
  });
});
