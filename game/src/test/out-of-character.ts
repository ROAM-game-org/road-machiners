import type { Locale } from '../text/msg';

export const OUT_OF_CHARACTER: Record<Locale, RegExp> = {
  en: /\b(quests?|xp|experience points|level(s|ed|ing)? up|hp|hit points|click\w*|the players?|the game|save (the|your) game|save files?|press (the )?\w+ key|keyboard|(your|next|end of|end the|per|each) turns?|turns? (left|remaining)|tiles? away|waypoints?|map markers?|on the map)\b/i,
  ru: /(?<!\p{L})(квест\p{L}*|очк\p{L}* опыта|хп|клик\p{L}*|нажмите|клавиш\p{L}*|игрок\p{L}*|в игре|сохран\p{L}* игр\p{L}*|(ваш|твой|следующ\p{L}*|конец|конца) ход\p{L}*|за ход|клетк\p{L}* карты|на карте)(?!\p{L})/iu,
};
