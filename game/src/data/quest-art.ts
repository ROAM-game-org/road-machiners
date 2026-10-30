import type { TownSection } from './quests';
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

export type TownArt = { band: string; sections: Partial<Record<TownSection, string>> };
export const TOWN_ART: Record<string, TownArt> = {
  bowl: { band: 'town_bowl', sections: { market: 'bowl_scale' } },
  nose: { band: 'town_nose', sections: {} },
  'salvage-yard': { band: 'town_salvage_yard', sections: {} },
  granary: { band: 'town_granary', sections: {} },
  'pump-station': { band: 'town_pump_station', sections: {} },
  dustwell: { band: 'town_dustwell', sections: {} },
  'green-pit': { band: 'town_green_pit', sections: {} },
};
