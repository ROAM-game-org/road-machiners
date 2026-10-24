import type { Locale } from '../text/msg';

const STOCK_PHRASES = [
  'a testament to',
  'tapestry',
  'delve',
  'in the heart of',
  'palpable',
  'nestled',
  'whispers? of',
  'echoes of',
  'a sense of',
  'game-changing',
  'cutting-edge',
  'seamless(ly)?',
  'holistic',
  'pivotal',
  'moreover',
  'furthermore',
  'additionally',
  'in conclusion',
  'it(\'s| is) important to note',
  'unlock the potential',
  'take it to the next level',
  'dive into',
];

export const STOCK_PHRASE = new RegExp(`\\b(${STOCK_PHRASES.join('|')})\\b`, 'i');

export const PROSE_TELLS: Record<Locale, RegExp> = {
  en: new RegExp(`;|—|–|\\S\\s-\\s\\S|${STOCK_PHRASE.source}`, 'i'),
  ru: /;/,
};

export const SEMICOLON = /;/;
