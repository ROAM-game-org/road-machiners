import type { TraitId } from './npcs';

export type StoryTrade = 'hauler' | 'salvager' | 'courier';

export const STORY_SALT = 'story';

export const STORY_LINE_IDS = [
  'storyHaulerGoats', 'storyHaulerHoney', 'storyHaulerKettle', 'storyHaulerWedding', 'storyHaulerStorm', 'storyHaulerBoy', 'storyHaulerCrater', 'storyHaulerTable',
  'storySalvagerPicture', 'storySalvagerVending', 'storySalvagerStripped', 'storySalvagerGrave', 'storySalvagerDog', 'storySalvagerSign', 'storySalvagerEdge', 'storySalvagerWing',
  'storyCourierLetter', 'storyCourierDustRace', 'storyCourierWidow', 'storyCourierClock', 'storyCourierHitchhiker', 'storyCourierRing', 'storyCourierMirage', 'storyCourierChicken',
] as const;
export type StoryLineId = (typeof STORY_LINE_IDS)[number];

export const STORY_TRADES: Partial<Record<TraitId, StoryTrade>> = {
  trader: 'hauler', supplier: 'hauler',
  scavenger: 'salvager', roamer: 'salvager',
  courier: 'courier',
};

export const ROAD_STORIES: Record<StoryTrade, readonly StoryLineId[]> = {
  hauler: ['storyHaulerGoats', 'storyHaulerHoney', 'storyHaulerKettle', 'storyHaulerWedding', 'storyHaulerStorm', 'storyHaulerBoy', 'storyHaulerCrater', 'storyHaulerTable'],
  salvager: ['storySalvagerPicture', 'storySalvagerVending', 'storySalvagerStripped', 'storySalvagerGrave', 'storySalvagerDog', 'storySalvagerSign', 'storySalvagerEdge', 'storySalvagerWing'],
  courier: ['storyCourierLetter', 'storyCourierDustRace', 'storyCourierWidow', 'storyCourierClock', 'storyCourierHitchhiker', 'storyCourierRing', 'storyCourierMirage', 'storyCourierChicken'],
};
