
import type { Weighted } from './npcs';

const LAW_UTILITY: Weighted<string | null>[] = [
  { value: null, weight: 1.5 },
  { value: 'flareCannon', weight: 3 },
  { value: 'harpoon', weight: 3 },
];

export const NPC_UTILITY_PARTS: Record<string, Weighted<string | null>[]> = {
  buggy: [{ value: null, weight: 1.5 }, { value: 'caltrops', weight: 3 }, { value: 'oilSpiller', weight: 1 }, { value: 'harpoon', weight: 1 }],
  gunwagon: [{ value: null, weight: 1.5 }, { value: 'harpoon', weight: 2 }, { value: 'caltrops', weight: 2 }],
  trader: [{ value: null, weight: 1.5 }, { value: 'sprout', weight: 2 }, { value: 'oilSpiller', weight: 2 }],
  scavenger: [{ value: null, weight: 1.5 }, { value: 'patcherCrane', weight: 4 }, { value: 'scrapersKnife', weight: 2 }],
  bowlFarmer: LAW_UTILITY,
  noseArmy: LAW_UTILITY,
  courier: [{ value: null, weight: 1.5 }, { value: 'oilSpiller', weight: 3 }, { value: 'sprout', weight: 2 }],
  roamer: [{ value: null, weight: 1.5 }, { value: 'patcherCrane', weight: 3 }, { value: 'sprout', weight: 1 }],
  vulture: [{ value: null, weight: 1.5 }, { value: 'harpoon', weight: 2 }, { value: 'caltrops', weight: 3 }, { value: 'scrapersKnife', weight: 1 }],
  convoy: [{ value: null, weight: 1.5 }, { value: 'patcherCrane', weight: 3 }, { value: 'sprout', weight: 1 }],
  convoyGuard: [{ value: null, weight: 1.5 }, { value: 'smokeMortar', weight: 2 }, { value: 'flareCannon', weight: 2 }, { value: 'sprout', weight: 1 }],
  cavalcade: [{ value: null, weight: 0.5 }, { value: 'harpoon', weight: 8 }],
  hunter: [{ value: 'harpoon', weight: 1 }],
  merc: [
    { value: null, weight: 1.5 },
    { value: 'harpoon', weight: 2 },
    { value: 'smokeMortar', weight: 2 },
    { value: 'emitter', weight: 6 },
  ],
};
