import { describe, expect, it } from 'vitest';
import { EN } from './en';
import { LOCALES, type EnEntry, type Locale, type Noun } from './msg';
import { entryText, grammarParams, nounOf, parse, placeholders, pluralCategories, schemaOf } from './resolve';
import { RU } from './ru';
import { OUT_OF_CHARACTER } from '../test/out-of-character';
import { SEMICOLON } from '../test/prose-tells';

const CATALOGS: Record<Locale, Readonly<Record<string, EnEntry | Noun>>> = { en: EN, ru: RU };
const KEYS = Object.keys(EN);

const SAME_AS_ENGLISH = new Set(['help.key.shift', 'radio.band', 'radio.frequency', 'clock.day', 'readout.litersShort', 'readout.kgShort', 'language.en', 'language.ru']);
const RU_NOUN = /^(part|chassis|site|terrain|faction)\.[^.]+$|^driver\.(first|last)\.|^npc\.[^.]+\.profession$|^good\.[^.]+(\.lower|\.subject)?$/;
const RU_NOUN_KEYS = new Set(['vehicle.yours', 'job.theTruck', 'job.somePart', 'log.anObstacle', 'log.something', 'log.you']);
const hasWords =(text: string): boolean => /\p{L}{2,}/u.test(text.replace(/\{[^}]*\}/g, ''));


const REJECTED_RU: readonly { text: string; reason: string }[] = [
  { text: 'чинено', reason: 'ungrammatical as a part status; a rebuild after a breakdown is «капремонт»' },
  { text: 'удлинённая платформа', reason: 'the flatbed extension lengthens the bed: «удлинитель кузова»' },
  { text: 'является', reason: 'bureaucratic; use a plain verb or a dash' },
  { text: 'осуществ', reason: 'bureaucratic; say what is done' },
];


const LORE_MAX_LENGTH: Record<Locale, number> = { en: 200, ru: 270 };
const LORE_KEYS = KEYS.filter((key) => key.startsWith('lore.'));
const LORE_NAME_KEY = (key: string): string => (key === 'lore.parcel' ? 'item.parcel' : key.replace(/^lore\./, ''));

describe('item lore', () => {
  it('covers parts, goods and the parcel', () => {
    expect(LORE_KEYS.length).toBeGreaterThan(80);
  });

  it.each(LOCALES)('stays in character, short and digit free in %s', (locale) => {
    for (const key of LORE_KEYS) {
      const text = entryText(locale, key);
      expect(text, key).not.toMatch(/\d/);
      expect(text, key).not.toMatch(OUT_OF_CHARACTER[locale]);
      expect(text.length, key).toBeLessThanOrEqual(LORE_MAX_LENGTH[locale]);
    }
  });

  it.each(LOCALES)('gives no two items the same lore in %s', (locale) => {
    const texts = LORE_KEYS.map((key) => entryText(locale, key));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
  });

  it.each(LOCALES)('never lets lore be only the item name in %s', (locale) => {
    for (const key of LORE_KEYS) {
      expect(entryText(locale, key).toLowerCase(), key).not.toBe(entryText(locale, LORE_NAME_KEY(key)).toLowerCase());
    }
  });
});

describe('the catalog', () => {
  it('describes Fury Road without the wreck tagline', () => {
    for (const locale of LOCALES) {
      const text = entryText(locale, 'mode.furyRoad.description');
      expect(text, locale).not.toMatch(/to the wreck|до обломков/i);
    }
  });

  it('holds no semicolon in any entry, in any language', () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) expect(entryText(locale, key), `${locale} ${key}`).not.toMatch(SEMICOLON);
    }
  });

  it('parses every entry in every language', () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) expect(() => parse(entryText(locale, key)), `${locale} ${key}`).not.toThrow();
    }
  });

  it('has the same keys in every language', () => {
    for (const locale of LOCALES) expect(Object.keys(CATALOGS[locale]).sort(), locale).toEqual([...KEYS].sort());
  });

  it('uses exactly the params the English schema declares, in every language', () => {
    for (const key of KEYS) {
      const declared = Object.keys(schemaOf(key)).sort();
      for (const locale of LOCALES) expect([...placeholders(parse(entryText(locale, key)))].sort(), `${locale} ${key}`).toEqual(declared);
    }
  });

  it('pluralizes only counts, with exactly the plural forms of each language', () => {
    for (const locale of LOCALES) {
      const forms = new Intl.PluralRules(locale === 'en' ? 'en-US' : 'ru-RU').resolvedOptions().pluralCategories;
      for (const key of KEYS) {
        for (const [param, categories] of pluralCategories(parse(entryText(locale, key)))) {
          expect(schemaOf(key)[param], `${locale} ${key} {${param}}`).toBe('count');
          expect([...categories].sort(), `${locale} ${key} {${param}}`).toEqual([...forms].sort());
        }
      }
    }
  });

  it('puts only text params in a case or a gender agreement', () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        for (const param of grammarParams(parse(entryText(locale, key)))) expect(schemaOf(key)[param], `${locale} ${key} {${param}}`).toBe('text');
      }
    }
  });

  it('gives every Russian name its forms in every case and its gender', () => {
    const templates = KEYS.filter((key) => key.endsWith('.profession')).map((key) => key.slice(0, -'.profession'.length));
    const names = KEYS.filter((key) => RU_NOUN.test(key) || RU_NOUN_KEYS.has(key) || templates.includes(key));
    expect(names.length).toBeGreaterThan(150);
    expect(names.filter((key) => nounOf('ru', key) === null)).toEqual([]);
    for (const key of RU_NOUN_KEYS) expect(KEYS).toContain(key);
  });

  it('says where every Russian place is, where to and where from', () => {
    const sites = KEYS.filter((key) => key.startsWith('site.'));
    expect(sites.filter((key) => !nounOf('ru', key)?.place)).toEqual([]);
  });

  it('has Russian words for every entry with words, never the English copied over', () => {
    const copied = KEYS.filter((key) => !SAME_AS_ENGLISH.has(key) && hasWords(entryText('en', key)) && entryText('ru', key) === entryText('en', key));
    expect(copied).toEqual([]);
  });

  it('keeps only real keys in the same-as-English list', () => {
    for (const key of SAME_AS_ENGLISH) expect(KEYS).toContain(key);
  });

  it('keeps radio talk and broadcasts in character in every language', () => {
    const talk = KEYS.filter((key) => key.startsWith('line.') || key.startsWith('radio.') || key.startsWith('deal.') || key.startsWith('tip.'));
    expect(talk.length).toBeGreaterThan(150);
    for (const locale of LOCALES) {
      for (const key of talk) expect(entryText(locale, key), `${locale} ${key}`).not.toMatch(OUT_OF_CHARACTER[locale]);
    }
  });

  it('holds none of the Russian the committee rejected', () => {
    const found = KEYS.flatMap((key) => {
      const entry = CATALOGS.ru[key];
      const texts = typeof entry === 'string' ? [entry] : 'forms' in entry ? Object.values(entry.forms) : [entry.text];
      return REJECTED_RU.filter(({ text }) => texts.some((t) => t.toLowerCase().includes(text))).map(({ text, reason }) => `${key}: «${text}», ${reason}`);
    });
    expect(found).toEqual([]);
  });

  it('the out-of-character check stops game talk and lets everyday words through', () => {
    for (const ok of ['the road turns north', 'water level', 'an old map', 'the truck keys', 'tire pressure', 'save your water', 'an experienced driver', 'a card game'])
      expect(ok).not.toMatch(OUT_OF_CHARACTER.en);
    for (const bad of ['Your turn is up', 'level up', 'XP', 'a quest', 'press the E key', 'on the map', 'save the game'])
      expect(bad).toMatch(OUT_OF_CHARACTER.en);
    for (const ok of ['опытный водитель', 'уровень воды', 'задний ход', 'сохрани воду', 'нажми на газ', 'Проходи мимо'])
      expect(ok).not.toMatch(OUT_OF_CHARACTER.ru);
    for (const bad of ['Твой ход', 'квест', 'очки опыта', 'нажмите E', 'на карте', 'игрок'])
      expect(bad).toMatch(OUT_OF_CHARACTER.ru);
  });

  it('lets a lone driver say I, and keeps we for talk that two sides or a body share', () => {
    const SHARED_WE = new Set([
      'line.thenWeSettleIt', 'line.noFreeRidePay', 'line.noFreeRideCut', 'line.noFreeRideDump', 'line.enoughOfThisWe', 'line.enoughShootingCanWe',
      'line.giveUpOffer', 'line.noWeFinishThis', 'line.thenWeFinishThis', 'line.vigilCall1', 'line.vigilCall3', 'line.driveIntoTheLight',
      'line.carsDraggedIntoTheDark', 'line.pullPaid', 'line.takeMeToSite', 'line.letsMove', 'line.lessonLawGates', 'line.lessonLawFirstShot',
      'line.lessonLawLonely', 'line.truceCost', 'line.weAlreadyTalkedAbout', 'line.weBothDriveAway', 'line.weCoveredThat', 'line.weWillSee',
      'line.niceRigLetsSee', 'line.letsGo', 'line.courierSquareTip', 'line.letsCallItEven', 'line.yourLoadIsInThe', 'line.helpMeFirst',
    ]);
    const plural = /\b(we|us|our|ours)\b|\bwe['’]/i;
    const found = KEYS.filter((key) => key.startsWith('line.') && plural.test(entryText('en', key)) && !SHARED_WE.has(key));
    expect(found).toEqual([]);
  });
});
