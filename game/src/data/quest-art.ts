import { publicUrl } from '../public-url';

export type QuestArt = { file: string; focusX: number };

export const QUEST_ART: Record<string, QuestArt> = {
  arrival_rim: { file: 'arrival_rim.webp', focusX: 30 },
  arrival_house: { file: 'arrival_house.webp', focusX: 50 },
  arrival_pickup: { file: 'arrival_pickup.webp', focusX: 35 },
  cab_link: { file: 'cab_link.webp', focusX: 62 },
  fall_cab: { file: 'fall_cab.webp', focusX: 60 },
  bowl_yard: { file: 'bowl_yard.webp', focusX: 60 },
  bowl_scale: { file: 'bowl_scale.webp', focusX: 45 },
};

export function questArt(key: string): QuestArt {
  const art = QUEST_ART[key];
  if (art === undefined) throw new Error(`No quest art ${key}. Known: ${Object.keys(QUEST_ART).join(', ') || 'none yet'}`);
  return art;
}

export function questArtUrl(key: string): string {
  return publicUrl(`quest-art/${questArt(key).file}`);
}
