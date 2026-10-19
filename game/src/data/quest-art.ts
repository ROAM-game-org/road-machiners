import { publicUrl } from '../public-url';
import ENTRIES from './quest-art.json';

export type QuestArt = { file: string; focusX: number; focusY: number };

export const QUEST_ART: Record<string, QuestArt> = structuredClone(ENTRIES);

export function questArt(key: string): QuestArt {
  const art = QUEST_ART[key];
  if (art === undefined) throw new Error(`No quest art ${key}. Known: ${Object.keys(QUEST_ART).join(', ') || 'none yet'}`);
  return art;
}

export function questArtUrl(key: string): string {
  return publicUrl(`quest-art/${questArt(key).file}`);
}
