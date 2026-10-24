import type { GearLevel, TraitId } from './npcs';

export const AMBUSH = {
  template: 'buggy',
  chassis: 'niva',
  gear: 'light' as GearLevel,
  addedTraits: ['brave'] as TraitId[],
  sightMin: 1.2,
  sightMax: 2,
  huntSight: 2.5,
  sightTarget: 1.5,
  aheadCos: 0.7,
  spotStep: 2,
  parkingRings: 6,
  parkingAngles: 8,
};

export const GREEN_PIT = 'green-pit';
export const WAKE_TOWN = 'bowl';
export const SALVAGE_GOODS: readonly string[] = ['scrap', 'parts'];
