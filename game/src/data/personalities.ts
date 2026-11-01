import { DETECT } from './detect';
import { SUNWARD_TRAIT_TALK } from './sunward';
import type { LineId, Topic, TopicId } from './dialogue';
import type { TraitId } from './npcs';
import type { CrimeOffense } from '../sim/types';

export const PERSONALITY_IDS = ['talkative', 'tightLipped', 'gossip', 'braggart', 'suspicious', 'kind', 'grim', 'pious'] as const;
export type PersonalityId = (typeof PERSONALITY_IDS)[number];

export type Gate = 'open' | 'price' | 'help' | 'closed';

export type Personality = { gates: Partial<Record<TopicId, Gate>> };

export const TALK_PRICE = 10;

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
  directions: 'service', trade: 'service', marketNews: 'service', rumor: 'service', armyWagon: 'service', tips: 'service', sunwardTalk: 'service', askHelp: 'service',
  tow: 'rescue', towFree: 'rescue', askTow: 'rescue', patch: 'rescue', askAid: 'rescue', aidOffer: 'rescue', patchRequest: 'rescue',
  offerTow: 'rescue', offerPatch: 'rescue', offerPatchWorn: 'rescue', offerAid: 'rescue', releaseTow: 'rescue',
};

export const COLD_LINES = { known: 'iKnowWhatYouDid', kind: 'notYourKind' } as const satisfies Record<string, LineId>;

const TALES: TopicId[] = ['tale'];
const CHALLENGE: TopicId[] = ['challenge'];
const HELP: TopicId[] = ['askHelp'];
const MOMENT_TALK: TopicId[] = ['fromTheWest', 'eightToNine', 'crucible'];
const COURIER_STORY: TopicId[] = ['courierShort', 'courierThanks', 'courierSquare', 'courierCold', 'courierGrudge', 'courierFavor'];

const PARLEY: TopicId[] = ['spillClaim', 'surrender', 'giveUp', 'claim', 'truce', 'mercy', 'yieldDemand', 'buyTruce', 'rob', 'robCut', 'lootWarning', 'lookWarning', 'warnOff', 'truceOffer', 'mercyPlea', 'offerTow', 'releaseTow', 'offerPatch', 'offerPatchWorn', 'offerAid'];

export const TRAIT_TALK: Record<TraitId, TraitTalk> = { ...SUNWARD_TRAIT_TALK,
  marshal: { voice: { greeting: 'marshalGreeting', repeatLine: 'marshalRepeat', refusal: 'marshalRefusal', warnOff: 'marshalWarnOff', honksBack: true }, topics: ['bountyDemand', 'payBounty', 'directions', 'lastSeen', 'roadLesson', 'tow', 'towFree', ...PARLEY] },
  trader: { voice: { greeting: 'goAhead', repeatLine: 'weAlreadyTalkedAbout', refusal: 'nothingToSayTo', warnOff: 'thisOneIsSpokenFor', honksBack: true }, topics: [...HELP, 'directions', 'lastSeen', 'parcel', 'roadLesson', 'marketNews', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'patch', 'patchRequest', 'trade', 'escortHold', 'escortGo', ...TALES, ...CHALLENGE, ...MOMENT_TALK, ...PARLEY] },
  scavenger: { voice: { greeting: 'yeahMakeItQuick', repeatLine: 'iToldYouAlready', refusal: 'getOffMyChannel', warnOff: 'thatsMyPick', honksBack: true }, topics: [...HELP, 'directions', 'lastSeen', 'parcel', 'roadLesson', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'patch', 'patchRequest', 'trade', ...TALES, 'salvageTip', ...CHALLENGE, ...MOMENT_TALK, ...PARLEY] },
  raider: { voice: { greeting: 'getLost', repeatLine: 'getLost', refusal: 'hehNo', warnOff: 'offMyLootNow', honksBack: false }, topics: [...HELP, 'demand', 'demandCut', ...CHALLENGE, ...PARLEY] },
  scumbag: { voice: null, topics: [...HELP, 'demand', 'demandCut', ...CHALLENGE, ...PARLEY] },
  coward: { voice: null, topics: [...HELP, ...PARLEY] },
  brave: { voice: null, topics: [...HELP, ...CHALLENGE, ...PARLEY] },
  lawman: { voice: { greeting: 'speakUp', repeatLine: 'heardYouTheFirst', refusal: 'clearTheChannel', warnOff: 'leaveThatSalvageBe', honksBack: true }, topics: [...HELP, 'directions', 'lastSeen', 'parcel', 'roadLesson', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', ...PARLEY] },
  courier: { voice: { greeting: 'makeItShort', repeatLine: 'saidThatAlready', refusal: 'noTimeOut', warnOff: 'imTakingThatOne', honksBack: true }, topics: [...HELP, 'directions', 'lastSeen', 'parcel', 'roadLesson', 'marketNews', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'trade', ...TALES, ...CHALLENGE, ...COURIER_STORY, ...MOMENT_TALK, ...PARLEY] },
  roamer: { voice: { greeting: 'whatDoYouWant', repeatLine: 'oldNewsFriend', refusal: 'notTalking', warnOff: 'sawThisOneFirst', honksBack: true }, topics: [...HELP, 'directions', 'lastSeen', 'parcel', 'roadLesson', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'patch', 'patchRequest', 'trade', ...TALES, 'salvageTip', ...CHALLENGE, ...MOMENT_TALK, ...PARLEY] },
  vulture: { voice: { greeting: 'keepItShort', repeatLine: 'alreadySaid', refusal: 'nothingForYou', warnOff: 'mineGoPickAnother', honksBack: false }, topics: [...HELP, 'directions', 'lastSeen', 'parcel', 'roadLesson', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'patchRequest', 'trade', 'salvageTip', ...CHALLENGE, ...MOMENT_TALK, ...PARLEY] },
  supplier: { voice: { greeting: 'listening', repeatLine: 'weCoveredThat', refusal: 'keepOffThisChannel', warnOff: 'weAreTakingThisOne', honksBack: true }, topics: [...HELP, 'directions', 'lastSeen', 'parcel', 'roadLesson', 'marketNews', 'rumor', 'sunwardTalk', 'armyWagon', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'trade', ...TALES, ...PARLEY] },
  guard: { voice: { greeting: 'stateYourBusiness', repeatLine: 'heardYou', refusal: 'moveAlong', warnOff: 'backAwayFromThat', honksBack: false }, topics: [...HELP, 'directions', 'lastSeen', 'parcel', 'roadLesson', ...PARLEY] },
  merc: { voice: { greeting: 'talk', repeatLine: 'youSaidThat', refusal: 'notInterested', warnOff: 'thatsMineWalkAway', honksBack: false }, topics: ['directions', 'lastSeen', 'parcel', 'roadLesson', 'hireGuard', 'dismissGuard', ...CHALLENGE, ...PARLEY] },
};

export const MARSHAL_LINES = [
  'marshalGreeting', 'marshalRepeat', 'marshalRefusal', 'marshalWarnOff',
  'bountyDemand', 'offenseAttacked', 'offenseRobbed', 'offenseKilled', 'offenseEmbezzled', 'payTheBook', 'notPaying', 'bookClosed', 'thenICollect',
  'whatDoIOwe', 'bountyTerms', 'marshalBackWithCompany',
] as const;
export type MarshalLineId = (typeof MARSHAL_LINES)[number];
export type MarshalTopicId = 'bountyDemand' | 'payBounty';
export type MarshalConditionId = 'bountyDemandOpen' | 'huntsPlayer' | 'callsPartner' | 'trucesForGood';
export type MarshalEffectId = 'payBounty' | 'refuseBounty' | 'payBountyHail';
export type MarshalPrepareId = 'bountyOwed';

export const OFFENSE_LINES: Record<CrimeOffense, MarshalLineId> = { attacked: 'offenseAttacked', robbed: 'offenseRobbed', killed: 'offenseKilled', embezzled: 'offenseEmbezzled' };

const MARSHAL_END = 'end';
const MARSHAL_HUB = 'hub';

export const MARSHAL_TOPICS: Record<MarshalTopicId, Topic> = {
  bountyDemand: {
    id: 'bountyDemand',
    once: false,
    ask: null,
    raise: { when: ['bountyDemandOpen'], priority: 8, duringFeud: false, duringCombat: true },
    prepare: 'bountyOwed',
    hangUp: ['refuseBounty'],
    start: 'demand',
    nodes: {
      demand: {
        line: 'bountyDemand',
        options: [
          { say: 'payTheBook', when: [], effects: ['payBounty'], go: 'paid' },
          { say: 'notPaying', when: [], effects: ['refuseBounty'], go: 'refused' },
        ],
      },
      paid: { line: 'bookClosed', options: [{ say: 'overAndOut', when: [], effects: [], go: MARSHAL_END }] },
      refused: { line: 'thenICollect', options: [] },
    },
  },
  payBounty: {
    id: 'payBounty',
    once: false,
    ask: { say: 'whatDoIOwe', when: ['huntsPlayer'], duringFeud: true },
    raise: null,
    prepare: 'bountyOwed',
    hangUp: [],
    start: 'terms',
    nodes: {
      terms: {
        line: 'bountyTerms',
        options: [
          { say: 'payTheBook', when: [], effects: ['payBountyHail'], go: 'paid' },
          { say: 'tooMuch', when: [], effects: [], go: MARSHAL_HUB },
        ],
      },
      paid: { line: 'bookClosed', options: [{ say: 'overAndOut', when: [], effects: [], go: MARSHAL_END }] },
    },
  },
};

export const TREE_LINES = ['backToTopics', 'aboutRoadNews', 'aboutTheRoad', 'aboutTheNews', 'aboutHelpTrade', 'aboutTrade', 'aboutAskingHelp', 'aboutOfferingHelp', 'aboutEscortTow', 'aboutDemands', 'aboutPeace'] as const;

export const BACK_LINE: LineId = 'backToTopics';

export type GroupId = 'roadNews' | 'theRoad' | 'news' | 'helpTrade' | 'tradeTalk' | 'askForHelp' | 'offerHelp' | 'escortTow' | 'threats' | 'makePeace';
export type TopicChild = TopicId | GroupId;
export type TopicGroup = { say: LineId; children: readonly TopicChild[] };

export const TOPIC_ROOT: readonly TopicChild[] = ['roadNews', 'helpTrade', 'threats', 'makePeace'];
export const TOPIC_GROUPS: Record<GroupId, TopicGroup> = {
  roadNews: { say: 'aboutRoadNews', children: ['theRoad', 'news', 'claimWreck'] },
  theRoad: { say: 'aboutTheRoad', children: ['directions', 'lastSeen', 'roadLesson', 'tips'] },
  news: { say: 'aboutTheNews', children: ['marketNews', 'rumor', 'sunwardTalk', 'armyWagon'] },
  helpTrade: { say: 'aboutHelpTrade', children: ['tradeTalk', 'askForHelp', 'offerHelp', 'escortTow'] },
  tradeTalk: { say: 'aboutTrade', children: ['trade', 'parcel', 'hireGuard', 'dismissGuard'] },
  askForHelp: { say: 'aboutAskingHelp', children: ['askTow', 'askAid', 'patch', 'askHelp'] },
  offerHelp: { say: 'aboutOfferingHelp', children: ['offerTow', 'offerPatch', 'offerPatchWorn', 'offerAid'] },
  escortTow: { say: 'aboutEscortTow', children: ['escortHold', 'escortGo', 'releaseTow'] },
  threats: { say: 'aboutDemands', children: ['rob', 'robCut', 'warnOff', 'yieldDemand'] },
  makePeace: { say: 'aboutPeace', children: ['truce', 'mercy', 'buyTruce', 'payBounty'] },
};

export function isGroup(child: TopicChild): child is GroupId {
  return Object.hasOwn(TOPIC_GROUPS, child);
}
