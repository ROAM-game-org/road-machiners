import { DETECT } from './detect';
import { SUNWARD_TRAIT_TALK } from './sunward';
import type { LineId, TopicId } from './dialogue';
import type { TraitId } from './npcs';

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

export type Voice = {
  greeting: LineId;
  repeatLine: LineId;
  refusal: LineId;
  warnOff: LineId;
  honksBack: boolean;
};

export type TraitTalk = { voice: Voice | null; topics: TopicId[]; only?: true };

export const HONK_RANGE = DETECT.sound.limp;

export type TalkGate = 'service' | 'rescue';

export const TOPIC_GATES: Partial<Record<TopicId, TalkGate>> = {
  directions: 'service', trade: 'service', marketNews: 'service', rumor: 'service', armyWagon: 'service', tips: 'service', sunwardTalk: 'service',
  tow: 'rescue', towFree: 'rescue', askTow: 'rescue', patch: 'rescue', askAid: 'rescue', aidOffer: 'rescue', patchRequest: 'rescue',
  offerTow: 'rescue', offerPatch: 'rescue', offerPatchWorn: 'rescue', offerAid: 'rescue', releaseTow: 'rescue',
};

export const COLD_LINES = { known: 'iKnowWhatYouDid', kind: 'notYourKind' } as const satisfies Record<string, LineId>;

const TALES: TopicId[] = ['tale'];
const CHALLENGE: TopicId[] = ['challenge'];
const COURIER_STORY: TopicId[] = ['courierShort', 'courierThanks', 'courierSquare', 'courierCold', 'courierGrudge', 'courierFavor'];

const PARLEY: TopicId[] = ['spillClaim', 'surrender', 'giveUp', 'claim', 'truce', 'mercy', 'yieldDemand', 'buyTruce', 'rob', 'robCut', 'lootWarning', 'lookWarning', 'warnOff', 'truceOffer', 'mercyPlea', 'offerTow', 'releaseTow', 'offerPatch', 'offerPatchWorn', 'offerAid'];

export const TRAIT_TALK: Record<TraitId, TraitTalk> = { ...SUNWARD_TRAIT_TALK,
  trader: { voice: { greeting: 'goAhead', repeatLine: 'weAlreadyTalkedAbout', refusal: 'nothingToSayTo', warnOff: 'thisOneIsSpokenFor', honksBack: true }, topics: ['directions', 'lastSeen', 'parcel', 'marketNews', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'patch', 'patchRequest', 'trade', 'escortHold', 'escortGo', ...TALES, ...CHALLENGE, ...PARLEY] },
  scavenger: { voice: { greeting: 'yeahMakeItQuick', repeatLine: 'iToldYouAlready', refusal: 'getOffMyChannel', warnOff: 'thatsMyPick', honksBack: true }, topics: ['directions', 'lastSeen', 'parcel', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'patch', 'patchRequest', 'trade', ...TALES, 'salvageTip', ...CHALLENGE, ...PARLEY] },
  raider: { voice: { greeting: 'getLost', repeatLine: 'getLost', refusal: 'hehNo', warnOff: 'offMyLootNow', honksBack: false }, topics: ['demand', 'demandCut', ...CHALLENGE, ...PARLEY] },
  scumbag: { voice: null, topics: ['demand', 'demandCut', ...CHALLENGE, ...PARLEY] },
  coward: { voice: null, topics: PARLEY },
  brave: { voice: null, topics: [...CHALLENGE, ...PARLEY] },
  lawman: { voice: { greeting: 'speakUp', repeatLine: 'heardYouTheFirst', refusal: 'clearTheChannel', warnOff: 'leaveThatSalvageBe', honksBack: true }, topics: ['directions', 'lastSeen', 'parcel', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', ...PARLEY] },
  courier: { voice: { greeting: 'makeItShort', repeatLine: 'saidThatAlready', refusal: 'noTimeOut', warnOff: 'imTakingThatOne', honksBack: true }, topics: ['directions', 'lastSeen', 'parcel', 'marketNews', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'trade', ...TALES, ...CHALLENGE, ...COURIER_STORY, ...PARLEY] },
  roamer: { voice: { greeting: 'whatDoYouWant', repeatLine: 'oldNewsFriend', refusal: 'notTalking', warnOff: 'sawThisOneFirst', honksBack: true }, topics: ['directions', 'lastSeen', 'parcel', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'patch', 'patchRequest', 'trade', ...TALES, 'salvageTip', ...CHALLENGE, ...PARLEY] },
  vulture: { voice: { greeting: 'keepItShort', repeatLine: 'alreadySaid', refusal: 'nothingForYou', warnOff: 'mineGoPickAnother', honksBack: false }, topics: ['directions', 'lastSeen', 'parcel', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'patchRequest', 'trade', 'salvageTip', ...CHALLENGE, ...PARLEY] },
  supplier: { voice: { greeting: 'listening', repeatLine: 'weCoveredThat', refusal: 'keepOffThisChannel', warnOff: 'weAreTakingThisOne', honksBack: true }, topics: ['directions', 'lastSeen', 'parcel', 'marketNews', 'rumor', 'sunwardTalk', 'armyWagon', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'trade', ...TALES, ...PARLEY] },
  guard: { voice: { greeting: 'stateYourBusiness', repeatLine: 'heardYou', refusal: 'moveAlong', warnOff: 'backAwayFromThat', honksBack: false }, topics: ['directions', 'lastSeen', 'parcel', ...PARLEY] },
  merc: { voice: { greeting: 'talk', repeatLine: 'youSaidThat', refusal: 'notInterested', warnOff: 'thatsMineWalkAway', honksBack: false }, topics: ['directions', 'lastSeen', 'parcel', 'hireGuard', 'dismissGuard', ...CHALLENGE, ...PARLEY] },
};
