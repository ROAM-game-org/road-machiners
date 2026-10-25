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
];

export const STOCK_PHRASE = new RegExp(`\\b(${STOCK_PHRASES.join('|')})\\b`, 'i');

export const PROSE_TELLS: Record<Locale, RegExp> = {
  en: new RegExp(`;|—|–|\\S\\s-\\s\\S|${STOCK_PHRASE.source}`, 'i'),
  ru: /;/,
};

export const SEMICOLON = /;/;
