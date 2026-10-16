import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_NOTES } from '../data/locals';
import * as QUEST_DATA from '../data/quests';
import { START_KITS } from '../data/start';
import { UNITS } from '../data/units';
import { TEST_MAP } from '../test/map';
import { chooseQuestOption, QUEST_QUERIES, leaveQuest, questProblems, questView, relanguageQuest, restoreQuest, setQuestLanguage, startQuest } from './quests';
import { defaultSetup } from './settings';
import { compileBundle, readQuestSources, withEnglishTwins } from '../test/quest-compile';
import type { World } from './types';
import { cloneWorld, newWorld } from './world';

type QuestBundle = QUEST_DATA.QuestBundle;

const QUESTS = compileBundle(withEnglishTwins(readQuestSources('src/test/quests')));
const RUMORS = 'Heard any rumors?';
const COIN = 'Can you spare some coin for the road?';
const LEAVE = 'Leave.';

function world(): World {
  return newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
}

function play(w: World, quest: string, checkpoint: string, picks: readonly string[]): World {
  return picks.reduce((at, pick) => chooseQuestOption(at, QUESTS, pickIndex(at, pick)), startQuest(w, QUESTS, quest, checkpoint));
}

function pickIndex(w: World, text: string): number {
  const index = questView(w, QUESTS).choices.indexOf(text);
  if (index < 0) throw new Error(`No choice ${text} in ${questView(w, QUESTS).choices.join(', ')}`);
  return index;
}

describe('startQuest', () => {
  it('plays the checkpoint lines and offers its choices', () => {
    const w = startQuest(world(), QUESTS, 'sample_bowl', 'start');
    expect(questView(w, QUESTS)).toEqual({
      quest: 'sample_bowl',
      view: 'talk',
      lines: [{ text: 'Hattie sets her bucket down by the well.', tags: [] }],
      choices: ['Heard any rumors?', 'Leave.'],
      costs: [null, null],
      checks: [null, null],
      locked: [false, false],
      stats: [],
      facts: [],
      ended: false,
      scene: { img: null, place: null },
    });
    expect(w.player.quests.session).toMatchObject({ quest: 'sample_bowl', checkpoint: 'start.talk' });
  });

  it('refuses a second quest while one is open', () => {
    const w = startQuest(world(), QUESTS, 'sample_bowl', 'start');
    expect(() => startQuest(w, QUESTS, 'sample_nose', 'start')).toThrow('Quest sample_bowl is open');
  });

  it('refuses a section that is no checkpoint', () => {
    expect(() => startQuest(world(), QUESTS, 'sample_bowl', 'middle')).toThrow('Quest sample_bowl has no checkpoint middle');
  });
});

describe('chooseQuestOption', () => {
  it('stores a world variable that another quest reads', () => {
    const bowl = play(world(), 'sample_bowl', 'start', [RUMORS, LEAVE]);
    expect(bowl.player.quests.world).toEqual({ sample_wagon_heard: true });
    const nose = startQuest(bowl, QUESTS, 'sample_nose', 'start');
    expect(questView(nose, QUESTS).choices).toContain('About that scavenger with the Army radio.');
  });

  it('keeps a quest own variable apart from the world', () => {
    const w = play(world(), 'sample_bowl', 'start', [RUMORS]);
    expect(w.player.quests.local).toEqual({ sample_bowl: { trust: 1 } });
  });

  it('pays money through the give_money effect in whole M', () => {
    const before = world();
    const after = play(before, 'sample_bowl', 'start', [RUMORS, COIN]);
    expect(after.player.money - before.player.money).toBe(5 * UNITS.centsPerM);
  });

  it('closes the session at the end and keeps the last lines on view', () => {
    const done = play(world(), 'sample_bowl', 'start', [RUMORS, LEAVE]);
    expect(done.player.quests.session).toBeNull();
    expect(questView(done, QUESTS)).toMatchObject({ quest: 'sample_bowl', lines: [], choices: [], ended: true });
  });

  it('leaves the world unchanged when a pick is out of range', () => {
    const w = startQuest(world(), QUESTS, 'sample_bowl', 'start');
    const before = JSON.stringify(w);
    expect(() => chooseQuestOption(w, QUESTS, 7)).toThrow('No choice 7');
    expect(JSON.stringify(w)).toBe(before);
  });

  it('gives the same lines, choices and variables for the same world and picks', () => {
    const a = play(world(), 'sample_bowl', 'start', [RUMORS, COIN]);
    const b = play(world(), 'sample_bowl', 'start', [RUMORS, COIN]);
    expect(b.player.quests).toEqual(a.player.quests);
  });
});

function inlineBundle(quest: string): QuestBundle {
  const sources = { 'world.ink': 'EXTERNAL money()\nEXTERNAL give_money(amount)\n', 'q.ink': `INCLUDE world.ink\n${quest}` };
  return compileBundle(withEnglishTwins(sources));
}

function withoutLive(w: World): World {
  const copy = cloneWorld(w);
  copy.player.quests.live = null;
  return copy;
}

describe('pay and begin', () => {
  const GAME_WORLD = readQuestSources('src/data/quests')['world.ink'];
  const bundleOf = (quests: Record<string, string>) => compileBundle(withEnglishTwins({ 'world.ink': GAME_WORLD, ...Object.fromEntries(Object.entries(quests).map(([id, body]) => [`${id}.ink`, `INCLUDE world.ink\n${body}`])) }));

  it('takes money in whole M through pay, and refuses more than the player holds', () => {
    const bundle = bundleOf({ q: '=== start ===\n# checkpoint: start\n+ [Pay.]\n  ~ pay(3)\n  -> END\n+ [Pay a fortune.]\n  ~ pay(999999)\n  -> END\n' });
    const before = startQuest(world(), bundle, 'q', 'start');
    expect(chooseQuestOption(before, bundle, 0).player.money).toBe(before.player.money - 3 * UNITS.centsPerM);
    expect(() => chooseQuestOption(before, bundle, 1)).toThrow('pay(999999) needs more money than the player holds');
  });

  it('opens the next quest when one ends right after begin', () => {
    const bundle = bundleOf({
      a: '=== start ===\n# checkpoint: start\n+ [Go on.]\n  ~ begin("b")\n  -> END\n',
      b: '=== start ===\n# checkpoint: start\nThe second part.\n+ [Done.] -> END\n',
    });
    const next = chooseQuestOption(startQuest(world(), bundle, 'a', 'start'), bundle, 0);
    expect(next.player.quests.session).toMatchObject({ quest: 'b', checkpoint: 'start' });
    expect(questView(next, bundle)).toMatchObject({ quest: 'b', lines: [{ text: 'The second part.', tags: [] }], choices: ['Done.'] });
  });

  it('refuses begin in a quest that goes on after it', () => {
    const bundle = bundleOf({
      a: '=== start ===\n# checkpoint: start\n+ [Go on.]\n  ~ begin("b")\n  -> start\n',
      b: '=== start ===\n# checkpoint: start\n+ [Done.] -> END\n',
    });
    expect(() => chooseQuestOption(startQuest(world(), bundle, 'a', 'start'), bundle, 0)).toThrow('Quest a called begin("b") but did not end right after it');
  });
});

describe('restoreQuest', () => {
  it('rebuilds a session without ink state at its last checkpoint with the variables kept', () => {
    const restored = withoutLive(play(world(), 'sample_bowl', 'start', [RUMORS]));
    restoreQuest(restored, QUESTS);
    expect(questView(restored, QUESTS).choices).toEqual([COIN, LEAVE]);
    expect(restored.player.quests.world).toEqual({ sample_wagon_heard: true });
  });

  it('gives back the same choices and variables for a save taken right after a checkpoint', () => {
    const w = play(world(), 'sample_bowl', 'start', [RUMORS]);
    const restored = withoutLive(w);
    restoreQuest(restored, QUESTS);
    expect(questView(restored, QUESTS).choices).toEqual(questView(w, QUESTS).choices);
    expect(restored.player.quests).toEqual({ ...w.player.quests, live: restored.player.quests.live });
  });
  it('refuses a checkpoint whose opening pays, since every load would pay again', () => {
    const bundle = inlineBundle('=== start ===\n# checkpoint: start\n~ give_money(2)\nTake this.\n+ [Thanks.] -> END\n');
    const restored = withoutLive(startQuest(world(), bundle, 'q', 'start'));
    expect(() => restoreQuest(restored, bundle)).toThrow('Effect give_money ran while loading checkpoint start');
  });

  it('refuses a checkpoint whose opening changes a variable, since every load would change it again', () => {
    const bundle = inlineBundle('VAR n = 0\n=== start ===\n# checkpoint: start\n~ n += 1\nCounted.\n+ [Done.] -> END\n');
    const restored = withoutLive(startQuest(world(), bundle, 'q', 'start'));
    expect(() => restoreQuest(restored, bundle)).toThrow('Loading checkpoint start changed its variables');
  });

  it('does nothing without an open session', () => {
    const w = world();
    restoreQuest(w, QUESTS);
    expect(w.player.quests.live).toBeNull();
  });
});

describe('quest language', () => {
  const english = withEnglishTwins(readQuestSources('src/test/quests'));
  const russian = english['sample_bowl.ink'].replace('Hattie sets her bucket down by the well.', 'Хэтти ставит ведро у колодца.').replace('[Heard any rumors?]', '[Что слышно?]');
  const bundle = compileBundle({ ...english, 'ru/sample_bowl.ink': russian });
  const inRussian = <T>(run: () => T): T => {
    setQuestLanguage('ru');
    try {
      return run();
    } finally {
      setQuestLanguage('en');
    }
  };

  it('plays the twin of the language in force and marks the live state with it', () => {
    const w = inRussian(() => startQuest(world(), bundle, 'sample_bowl', 'start'));
    expect(questView(w, bundle).lines[0].text).toBe('Хэтти ставит ведро у колодца.');
    expect(questView(w, bundle).choices).toEqual(['Что слышно?', LEAVE]);
    expect(w.player.quests.live?.lang).toBe('ru');
  });

  it('refuses a pick on a quest live in another language', () => {
    const w = startQuest(world(), bundle, 'sample_bowl', 'start');
    expect(() => inRussian(() => chooseQuestOption(w, bundle, 0))).toThrow('is live in en, not ru');
  });

  it('reopens a live quest at its checkpoint in the new language, keeping its variables', () => {
    const w = chooseQuestOption(startQuest(world(), bundle, 'sample_bowl', 'start'), bundle, 0);
    const switched = inRussian(() => relanguageQuest(w, bundle));
    expect(switched.player.quests.live?.lang).toBe('ru');
    expect(switched.player.quests.world).toEqual(w.player.quests.world);
    expect(switched.player.quests.local).toEqual(w.player.quests.local);
    expect(questView(switched, bundle).choices).toEqual(questView(w, bundle).choices);
    expect(inRussian(() => relanguageQuest(switched, bundle))).toBe(switched);
  });

  it('keeps the lines of an ended quest when the language changes', () => {
    const ended = play(world(), 'sample_bowl', 'start', [LEAVE]);
    expect(ended.player.quests.session).toBeNull();
    expect(inRussian(() => relanguageQuest(ended, bundle))).toBe(ended);
    expect(ended.player.quests.live).not.toBeNull();
  });
});

describe('leaveQuest', () => {
  it('refuses to leave a quest that has not ended', () => {
    expect(() => leaveQuest(play(world(), 'sample_bowl', 'start', [RUMORS]))).toThrow('a quest can be left only once it ends');
  });

  it('clears the last lines of an ended quest', () => {
    expect(leaveQuest(play(world(), 'sample_bowl', 'start', [LEAVE])).player.quests.live).toBeNull();
  });

  it('refuses when no quest is on view', () => {
    expect(() => leaveQuest(world())).toThrow('No quest is on view');
  });
});

describe('questProblems', () => {
  it('lists stored names the bundle does not declare', () => {
    const w = world();
    w.player.quests = { world: { gone: 1 }, local: { sample_bowl: { trust: 'x' }, lost: {} }, session: { quest: 'sample_bowl', checkpoint: 'nowhere', seed: 1 }, live: null };
    expect(questProblems(w.player.quests, QUESTS).map((e) => e.message)).toEqual([
      'World variable gone is not declared',
      'Variable trust of quest sample_bowl holds a string, not a number',
      'Quest lost does not exist',
      'Quest sample_bowl has no checkpoint nowhere',
    ]);
  });

  it('finds nothing in a new game', () => {
    expect(questProblems(world().player.quests, QUESTS)).toEqual([]);
  });
});

describe('skill query', () => {
  it('reads the player skill level and throws on an unknown skill', () => {
    const w = world();
    w.player.ranks.machining = 3;
    expect(QUEST_QUERIES.skill(w, ['machining'])).toBe(3);
    expect(QUEST_QUERIES.skill(w, ['social'])).toBe(w.player.ranks.social);
    expect(() => QUEST_QUERIES.skill(w, ['charm'])).toThrow(/no skill charm/);
  });
});

const SIM_SOURCE = new URL('.', import.meta.url).pathname;
const QUEST_EFFECT_NOTE = "noteArg('note'";

function simCalls(call: string): { file: string; target: string }[] {
  const pattern = new RegExp(`\\b${call}\\(\\w+,\\s*([^,)]+)`, 'g');
  return readdirSync(SIM_SOURCE, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .flatMap((file) => [...readFileSync(join(SIM_SOURCE, file), 'utf8').matchAll(pattern)].map((m) => ({ file, target: m[1].trim() })))
    .filter(({ target }) => !target.includes(':'));
}

function namedValue(target: string): unknown {
  const literal = target.match(/^'([^']*)'$/)?.[1];
  if (literal !== undefined) return literal;
  const note = target.match(/^GAME_NOTES\.(\w+)$/)?.[1];
  if (note !== undefined) return GAME_NOTES[note as keyof typeof GAME_NOTES];
  return (QUEST_DATA as Record<string, unknown>)[target];
}

describe('state the game writes outside quests', () => {
  it('lists every world variable the sim sets in GAME_WORLD_VARS', () => {
    const targets = [...simCalls('setWorldVar').map(({ target }) => namedValue(target)), ...(simCalls('setIntroStep').length > 0 ? [QUEST_DATA.INTRO_STEP] : [])];
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((name) => typeof name !== 'string' || !(name in QUEST_DATA.GAME_WORLD_VARS))).toEqual([]);
  });

  it('lists every note the sim gives outside a quest effect in GAME_NOTES', () => {
    const gameNotes: readonly unknown[] = Object.values(GAME_NOTES);
    const notes = simCalls('learnNote').filter(({ target }) => target !== QUEST_EFFECT_NOTE);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.filter(({ target }) => !gameNotes.includes(namedValue(target)))).toEqual([]);
  });
});
