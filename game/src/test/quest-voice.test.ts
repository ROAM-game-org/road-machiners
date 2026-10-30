import { describe, expect, it } from 'vitest';
import { handoffQuest, TOPICS } from '../data/dialogue';
import { LOCALS, NOTE_IDS, type NoteId } from '../data/locals';
import { GAME_OPENED_QUESTS } from '../data/quests';
import type { Locale } from '../text/msg';
import { entryText } from '../text/resolve';
import { QUESTS } from '../sim/quests';
import { readQuestSources } from './quest-compile';
import { OUT_OF_CHARACTER } from './out-of-character';
import { PROSE_TELLS } from './prose-tells';

const LOGIC = /^(INCLUDE|EXTERNAL|VAR|CONST|~|->|=|#|\{|\}|-\s)/;
const CHOICE = /^[+*]+\s*(?:\{[^}]*\}\s*)?\[([^\]]*)\]/;
const DOCUMENT = /#\s*(row|head)\s*$/;

const SOURCES = Object.entries(readQuestSources('src/data/quests'));

function spoken(line: string): string | null {
  const text = line.trim();
  const choice = CHOICE.exec(text);
  if (choice) return choice[1].replace(/#.*$/, '');
  if (text === '' || LOGIC.test(text) || DOCUMENT.test(text)) return null;
  const words = text.replace(/\{[^{}]*?:([^{}]*)\}/g, (_, options: string) => options.replace(/\|/g, ' ')).replace(/\{[^{}]*\}/g, '');
  return words.replace(/#.*$/, '').replace(/->.*$/, '').replace(/<[^>]*>/g, '').trim();
}

function lines(): { where: string; text: string; lang: Locale }[] {
  return [
    ...SOURCES.flatMap(([file, source]) => source.split('\n').flatMap((line, k) => {
      const text = spoken(line);
      return text ? [{ where: `${file}:${k + 1}`, text, lang: file.startsWith('ru/') ? 'ru' as const : 'en' as const }] : [];
    })),
    ...Object.entries(QUESTS.quests).flatMap(([id, q]) => [...q.text.en.facts.map((f) => f.text), ...q.text.en.stats.flatMap((s) => [s.label, ...(s.words ?? [])])].map((text) => ({ where: `${id} header`, text, lang: 'en' as const }))),
    ...NOTE_IDS.flatMap((id) => ['title', 'from', 'text'].map((part) => ({ where: `note ${id}`, text: entryText('en', `journalNote.${id}.${part}`), lang: 'en' as const }))),
    ...Object.values(TOPICS.armyWagon.nodes).map((n) => ({ where: 'radio armyWagon', text: entryText('en', `line.${n.line}`), lang: 'en' as const })),
  ];
}

describe('settlement talk content', () => {
  it('keeps every line in character', () => {
    const found = lines();
    expect(found.length).toBeGreaterThan(50);
    for (const { where, text } of found) expect(text, where).not.toMatch(OUT_OF_CHARACTER.en);
  });

  it('keeps every line free of prose tells', () => {
    for (const { where, text, lang } of lines()) expect(text, where).not.toMatch(PROSE_TELLS[lang]);
  });

  it('starts every quest from a local, a radio handoff or another quest', () => {
    const fromLocals = Object.values(LOCALS).map((l) => l.quest);
    const fromRadio = Object.values(TOPICS).flatMap((t) => Object.values(t.nodes).flatMap((n) => n.options.flatMap((o) => handoffQuest(o.go) ?? [])));
    const fromQuests = SOURCES.flatMap(([, source]) => [...source.matchAll(/~\s*begin\("([a-z_]+)"\)/g)].map((m) => m[1]));
    const fromGame = Object.values(GAME_OPENED_QUESTS);
    const started = new Set([...fromLocals, ...fromRadio, ...fromQuests, ...fromGame]);
    expect(started).toEqual(new Set(Object.keys(QUESTS.quests)));
  });

  it('can teach every note from some local or the radio', () => {
    const taught = new Set<NoteId>(['wagonRoad']);
    for (const [, source] of SOURCES) for (const match of source.matchAll(/~\s*note\("([a-zA-Z]+)"\)/g)) taught.add(match[1] as NoteId);

    expect(taught).toEqual(new Set(NOTE_IDS));
  });
});
