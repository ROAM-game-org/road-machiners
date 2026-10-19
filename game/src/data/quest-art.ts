import type { TownSection } from './quests';
import { publicUrl } from '../public-url';

export type QuestArt = { file: string; focusX: number; focusY: number };

export const QUEST_ART: Record<string, QuestArt> = {
  arrival_dream: { file: 'arrival_dream.webp', focusX: 50, focusY: 50 },
  arrival_rim: { file: 'arrival_rim.webp', focusX: 30, focusY: 50 },
  arrival_house: { file: 'arrival_house.webp', focusX: 50, focusY: 50 },
  arrival_pickup: { file: 'arrival_pickup.webp', focusX: 35, focusY: 50 },
  cab_link: { file: 'cab_link.webp', focusX: 62, focusY: 50 },
  fall_cab: { file: 'fall_cab.webp', focusX: 60, focusY: 50 },
  bowl_yard: { file: 'bowl_yard.webp', focusX: 60, focusY: 50 },
  road_bar: { file: 'road_bar.webp', focusX: 55, focusY: 50 },
  road_ala: { file: 'road_ala.webp', focusX: 55, focusY: 50 },
  road_geezer: { file: 'road_geezer.webp', focusX: 30, focusY: 50 },
  road_hauler: { file: 'road_hauler.webp', focusX: 40, focusY: 50 },
  road_gate: { file: 'road_gate.webp', focusX: 20, focusY: 50 },
  road_tankline: { file: 'road_tankline.webp', focusX: 20, focusY: 50 },
  road_walkers: { file: 'road_walkers.webp', focusX: 47, focusY: 50 },
  bowl_scale: { file: 'bowl_scale.webp', focusX: 45, focusY: 50 },
  town_bowl: { file: 'town_bowl.webp', focusX: 50, focusY: 48 },
  town_nose: { file: 'town_nose.webp', focusX: 55, focusY: 42 },
  town_salvage_yard: { file: 'town_salvage_yard.webp', focusX: 50, focusY: 50 },
  town_granary: { file: 'town_granary.webp', focusX: 50, focusY: 50 },
  town_pump_station: { file: 'town_pump_station.webp', focusX: 50, focusY: 52 },
  town_dustwell: { file: 'town_dustwell.webp', focusX: 50, focusY: 50 },
  town_green_pit: { file: 'town_green_pit.webp', focusX: 50, focusY: 55 },
};

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
  bowl: { band: 'town_bowl', sections: { market: 'bowl_scale', people: 'bowl_yard' } },
  nose: { band: 'town_nose', sections: {} },
  'salvage-yard': { band: 'town_salvage_yard', sections: {} },
  granary: { band: 'town_granary', sections: {} },
  'pump-station': { band: 'town_pump_station', sections: {} },
  dustwell: { band: 'town_dustwell', sections: {} },
  'green-pit': { band: 'town_green_pit', sections: {} },
};
