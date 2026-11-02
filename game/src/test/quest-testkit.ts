import { chooseQuestOption, QUESTS, questView } from '../sim/quests';
import type { World } from '../sim/types';

const BACK = 'Back.';

const isTopic = (text: string): boolean => text.endsWith('…');

export function pickText(w: World, text: string): World {
  const shown = questView(w, QUESTS).choices;
  if (shown.includes(text)) return chooseQuestOption(w, QUESTS, shown.indexOf(text));
  for (const topic of shown.filter(isTopic)) {
    const inside = chooseQuestOption(w, QUESTS, shown.indexOf(topic));
    if (questView(inside, QUESTS).choices.includes(text)) return pickText(inside, text);
  }
  const back = shown.indexOf(BACK);
  if (back >= 0) return pickText(chooseQuestOption(w, QUESTS, back), text);
  throw new Error(`No choice ${text} in ${shown.join(', ')}`);
}

export function flatChoices(at: World): string[] {
  const back = questView(at, QUESTS).choices.indexOf(BACK);
  const w = back >= 0 ? chooseQuestOption(at, QUESTS, back) : at;
  const shown = questView(w, QUESTS).choices;
  const inside = shown.filter(isTopic).flatMap((topic) => questView(chooseQuestOption(w, QUESTS, shown.indexOf(topic)), QUESTS).choices.filter((c) => c !== BACK));
  return [...shown.filter((c) => !isTopic(c)), ...inside];
}
