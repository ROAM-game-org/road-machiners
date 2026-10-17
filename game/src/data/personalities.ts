import type { TopicId } from './dialogue';

export const PERSONALITY_IDS = ['talkative', 'tightLipped', 'gossip', 'braggart', 'suspicious', 'kind', 'grim', 'pious'] as const;
export type PersonalityId = (typeof PERSONALITY_IDS)[number];

export type Gate = 'open' | 'price' | 'help' | 'closed';

export type Personality = { gates: Partial<Record<TopicId, Gate>> };

export const TALK_PRICE = 1000;

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  talkative: { gates: {} },
  tightLipped: { gates: { tale: 'closed', marketNews: 'help', sunwardTalk: 'help', rumor: 'price', tips: 'closed', claimWreck: 'price' } },
  gossip: { gates: {} },
  braggart: { gates: { marketNews: 'closed' } },
  suspicious: { gates: { tale: 'closed', directions: 'price', lastSeen: 'closed', marketNews: 'closed', sunwardTalk: 'closed', rumor: 'help', tips: 'closed', claimWreck: 'help' } },
  kind: { gates: {} },
  grim: { gates: { tale: 'closed', marketNews: 'price', sunwardTalk: 'price', rumor: 'help', tips: 'closed', claimWreck: 'closed' } },
  pious: { gates: { marketNews: 'closed', tips: 'closed' } },
};
