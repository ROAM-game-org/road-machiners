export type QuestArt = { file: string; focusX: number };

export const QUEST_ART: Record<string, QuestArt> = {
  arrival_rim: { file: 'arrival_rim.webp', focusX: 30 },
  arrival_pickup: { file: 'arrival_pickup.webp', focusX: 55 },
};

export function questArt(key: string): QuestArt {
  const art = QUEST_ART[key];
  if (art === undefined) throw new Error(`No quest art ${key}. Known: ${Object.keys(QUEST_ART).join(', ') || 'none yet'}`);
  return art;
}

export function questArtUrl(key: string): string {
  return `${import.meta.env.BASE_URL}quest-art/${questArt(key).file}`;
}
