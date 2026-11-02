import { TOPICS, type LineId } from '../data/dialogue';
import { lineKey } from '../text/names';
import { entryText } from '../text/resolve';
import { askTopic, canAskTopic, chooseOption, currentOptions } from './dialogue';
import type { World } from './types';

export function chooseText(world: World, text: string): World {
  const here = currentOptions(world).findIndex((o) => entryText('en', lineKey(o.line)) === text);
  if (here >= 0) return chooseOption(world, here);
  const topic = Object.values(TOPICS).find((t) => t.ask && entryText('en', lineKey(t.ask.say)) === text);
  if (!topic) throw new Error(`No option or topic "${text}" in ${currentOptions(world).map((o) => entryText('en', lineKey(o.line))).join(' | ')}`);
  return askTopic(world, topic.id);
}

export function askLinesOf(world: World): LineId[] {
  return Object.values(TOPICS)
    .filter((t) => t.ask && canAskTopic(world, t.id))
    .map((t) => t.ask!.say);
}

export function asksOf(world: World): string[] {
  return askLinesOf(world).map((line) => entryText('en', lineKey(line)));
}

export function chooseLine(world: World, line: LineId): World {
  return chooseText(world, entryText('en', lineKey(line)));
}

export function offersLine(world: World, line: LineId): boolean {
  const text = entryText('en', lineKey(line));
  return asksOf(world).includes(text) || currentOptions(world).some((o) => entryText('en', lineKey(o.line)) === text);
}
