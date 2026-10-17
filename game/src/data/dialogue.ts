
import { DETECT } from './detect';
import { SUNWARD_LINES, SUNWARD_TOPICS, SUNWARD_TRAIT_TALK, type SunwardConditionId, type SunwardEffectId, type SunwardPrepareId, type SunwardTopicId } from './sunward';
import type { TraitId } from './npcs';

export type TopicId = 'directions' | 'tow' | 'towFree' | 'askTow' | 'patch' | 'patchRequest' | 'demand' | 'surrender' | 'giveUp' | 'claim' | 'trade' | 'truce' | 'mercy' | 'rob' | 'warnOff' | 'truceOffer' | 'mercyPlea' | 'offerTow' | 'releaseTow' | 'offerPatch' | 'offerPatchWorn' | 'marketNews' | 'rumor' | 'tips' | 'buyTruce' | 'offerAid' | 'askAid' | 'aidOffer' | 'yieldDemand' | 'spillClaim' | 'lootWarning' | 'armyWagon' | 'escortHold' | 'escortGo'
  | 'tale' | 'salvageTip' | 'challenge' | 'courierShort' | 'courierThanks' | 'courierSquare' | 'courierCold' | 'courierGrudge' | 'courierFavor' | 'lastSeen' | 'parcel' | 'claimWreck' | 'hireGuard' | 'dismissGuard' | SunwardTopicId;
export type ConditionId =
  | 'knowsTown' | 'offersPaidTow' | 'offersFreeTow' | 'canTowPlayer' | 'playerNeedsPatch' | 'npcNeedsPatch' | 'npcWorn' | 'npcOffRope' | 'hasDeal' | 'noDeal' | 'demandsCargo' | 'demandsSurrender' | 'demandsGiveUp' | 'guardsClaim'
  | 'atOdds' | 'atPeace' | 'noPlayerPlea' | 'demandsToll' | 'npcHasCargo' | 'offersTruce' | 'begsMercy'
  | 'accepts' | 'refuses' | 'complies' | 'resists' | 'runs' | 'claimsPlayerLoot' | 'holdsOn' | 'canTowNpc' | 'towedByPlayer' | 'noTrade' | 'npcCalm'
  | 'knowsLastTown' | 'hearsRumor' | 'rumorOfSite' | 'rumorOfWreck' | 'canPayTruce'
  | 'npcLow' | 'playerLow' | 'noAid' | 'aidHolds' | 'aidGiven' | 'aidRefused' | 'offersAid' | 'npcBeaten' | 'notOfferedYield' | 'claimsSpill' | 'heardWagonNearby' | 'nearClaimWreck' | 'rivalAsked' | 'noRivalAsked'
  | 'escortFollowed' | 'escortHeld' | 'warnsPlayerOff' | 'yieldsLoot' | 'fightsForLoot' | 'hasHaul' | 'noHaul' | 'canPayTalk'
  | 'offersTale' | 'offersTip' | 'callsOut' | 'newsOfSite' | 'newsOfWreck' | 'newsOfTip' | 'seeksSomeone' | 'sawSought' | 'missedSought' | 'hasParcelFor' | 'noHandover'
  | 'mercForHire' | 'takesGuard' | 'refusesGuard' | 'canPayGuard' | 'guardOfMine'
  | 'asksCourierAid' | 'courierThanksDue' | 'courierSquareDue' | 'courierColdDue' | 'courierGrudgeDue' | 'courierFavorDue' | SunwardConditionId;
export type EffectId =
  | 'revealTown' | 'settleDone' | 'settleRefused' | 'acceptTow' | 'refuseTow' | 'askTow' | 'agreePatch' | 'handOver' | 'surrender' | 'giveUp' | 'backOffClaim' | 'defyClaim'
  | 'acceptPlea' | 'refusePlea' | 'settlePlea' | 'payToll' | 'refuseToll' | 'withdrawPlea' | 'settleThreat' | 'settleWarning' | 'hitchNpc' | 'hitchNpcFree' | 'releaseNpc' | 'startTrade'
  | 'revealRumor' | 'payTruce' | 'giveAidPaid' | 'giveAidFree' | 'takeAid' | 'acceptAidOffer' | 'refuseAidOffer' | 'yieldToPlayer' | 'askStandDown' | 'standDownPlea' | 'abandonSpill' | 'noteWagonRoad' | 'noteClaimLead'
  | 'leaveLootWarning' | 'refuseLootWarning' | 'fightLootWarning' | 'hangUpLootWarning' | 'payTalk' | 'holdEscort' | 'releaseHold'
  | 'tellTale' | 'buyTip' | 'declineEncounter' | 'endEncounter' | 'backDown' | 'answerChallenge' | 'acceptChallenge'
  | 'courierFree' | 'courierPaid' | 'courierRefuse' | 'courierThank' | 'courierSquareUp' | 'courierColdShoulder' | 'courierCallEven' | 'courierFight' | 'courierEnd' | 'courierPayFavor' | 'noteLead' | 'startHandover' | 'noteClaimLead' | 'hireGuard' | 'dismissGuard' | SunwardEffectId;
export type PrepareId = 'nearestTown' | 'towOffer' | 'patchTerms' | 'truceAnswer' | 'mercyAnswer' | 'threatAnswer' | 'warnAnswer' | 'npcTowTerms' | 'lastTownPrices' | 'nearestRumor' | 'tradeTip' | 'trucePrice' | 'aidWanted' | 'aidAnswer' | 'aidOffered' | 'yieldAnswer' | 'lootWarningTerms' | 'demandHaul' | 'surrenderHaul'
  | 'taleNews' | 'tipTerms' | 'courierNeed' | 'courierNews' | 'courierFavorTerms' | 'lastSighting' | 'guardOffer' | 'claimWreckBearing' | SunwardPrepareId;

export type DialogueOption = { say: LineId; when: ConditionId[]; effects: EffectId[]; go: string };
export type DialogueNode = { line: LineId; options: DialogueOption[] };

export type Topic = {
  id: TopicId;
  once: boolean;
  ask: { say: LineId; when: ConditionId[]; duringFeud: boolean } | null;
  raise: { when: ConditionId[]; priority: number; duringFeud: boolean; duringCombat: boolean } | null;
  prepare: PrepareId | null;
  hangUp: EffectId[];
  start: string;
  nodes: Record<string, DialogueNode>;
};

export const LINE_IDS = [
  'armyWagonTold', 'seenADeadArmy', 'seenThatWreck', 'claimWreckTold', 'anyoneElseAsking', 'crewAskedTheSame', 'nobodyElseAsked', 'whatElseDidYouSee', 'agreedGunsDown', 'allRightIAm', 'allRightItIs', 'alreadySaid', 'anythingInteresting',
  'busy', 'canYouDoAnything', 'clearTheChannel', 'comeAndGetIt', 'comeAndTakeIt', 'dealHitchMeUp', 'dealHitchUp',
  'dealIWillStay', 'dealPlain', 'dealPullOverAnd', 'dealSendingIt', 'dealStayWhereYou', 'dealTerms', 'demandCargo',
  'dropYourCargoOr', 'dumpAndDrive', 'enoughOfThisWe', 'enoughShootingCanWe', 'findYourOwnWreck', 'findersKeepers',
  'fineItsYours', 'fineKeepYourGuns', 'fineTakeIt', 'fineThanksForThe', 'getLost', 'getOffMyChannel', 'giveUpOffer',
  'goAhead', 'going', 'good', 'hangUp', 'haveItYourWay', 'heardYou', 'heardYouTheFirst', 'hehNo', 'holdOnIAm',
  'howArePricesIn', 'iAmLettingYou', 'iAmListening', 'iAmRunningDry', 'iAmStrandedCan', 'iCanSpareAid',
  'iCannotHelpSorry', 'iCouldUseAid', 'iGiveUpLet', 'iToldYouAlready', 'itIsYours', 'keepItShort', 'keepOffThisChannel',
  'lastIWasIn', 'leaveItOnThe', 'letMeCheckMy', 'letMeHearWhat', 'listening', 'makeItShort', 'maybeIPassedSomething',
  'moneyIsInGuns', 'moveAlong', 'myTruckIsBroken', 'myTruckIsDead', 'needATowTo', 'neverMind', 'noCharge',
  'noChargeHitchUp', 'noDeals', 'noFreeRideDump', 'noMercy', 'noThanks', 'noTimeOut', 'noWeFinishThis',
  'notInterested', 'notNowSomethingElse', 'notTalking', 'notToday', 'notTodayRun', 'notWhileICan', 'notWithWhatI',
  'nothingForYou', 'nothingToSayTo', 'oldNewsFriend', 'onSecondThoughtI', 'overAndOut', 'overMyDeadBody', 'overMyWreck', 'pullFree',
  'pullPaid', 'pullingOver', 'rollingOn', 'runThen', 'runningLowICan', 'saidThatAlready', 'sayThatAgain', 'saysWho',
  'seenAnythingWorthA', 'sitTight', 'smartChoice', 'sorryCannotSpareAny', 'spare', 'speakUp',
  'standDownAndLet', 'standingDown', 'stateYourBusiness', 'stopShootingIGive', 'surePullOverAnd', 'surrenderOffer',
  'takeMeToSite', 'takeWhatICarry', 'talk', 'talkFast', 'thanksIWillWait', 'thanksOverAndOut', 'thanksSomethingElse',
  'thenComeAndGet', 'thenWeFinishThis', 'thisIsMine', 'thisWreckIsMine', 'tipTold', 'tooLateForTalk', 'tooMuch', 'thatCostsYou', 'helpMeFirst', 'iKnowWhatYouDid', 'notYourKind',
  'truceCost', 'understood', 'wantToTrade', 'weAlreadyTalkedAbout', 'weBothDriveAway',
  'weCoveredThat', 'weWillSee', 'whatAreYouOffering', 'whatCanYouOffer', 'whatDoYouWant', 'whatWouldItCost',
  'whatWouldItTake', 'whateverYouCanSpare', 'where', 'whereIsTheNearest', 'townWay', 'siteWay', 'wreckWay', 'yeahMakeItQuick', 'youHeardMeCargo',
  'youHeardMeLeave', 'youKnowHowThen', 'youLookDryI', 'youSaidThat', 'youWantToPick', 'yourCallLastChance',
  'yourEngineSoundsRough', 'yourFuneral', 'yourLoadIsInThe', 'yourTruckIsFinished', 'yourTruckLooksDead',
  'warnTerms', 'thisOneIsSpokenFor', 'thatsMyPick', 'offMyLootNow', 'leaveThatSalvageBe', 'imTakingThatOne', 'sawThisOneFirst', 'mineGoPickAnother', 'weAreTakingThisOne', 'backAwayFromThat', 'thatsMineWalkAway', 'findYourOwn', 'makeMe', 'keepYourScrapsThen', 'thoughtSo', 'thenWeSettleIt', 'bringIt', 'nothingHereICanCarry', 'waitHereForMe', 'waitingHere', 'letsMove', 'movingOutNow',
  'gotAStoryFrom', 'goOnThen', 'notNow', 'iKnowAWreck', 'niceRigLetsSee', 'notLookingForTrouble', 'lookAtMyGunsAgain', 'letsGo',
  'lookingForSomebody', 'sightingTold', 'gotParcelForYou', 'parcelPullOver', 'courierShortOfFuel', 'atTheTownPrice', 'youKeptMeRolling', 'courierSquareTip', 'youLeftMeDry', 'youShotMeUp', 'letsCallItEven', 'toldYouIOweYou', 'rideGuardForMe', 'dependsWhoAsks', 'whatsYourRate', 'guardDayRate', 'onYourTailNow', 'notRidingForYou', 'thatsAllRideOff', 'moneyStaysWithMe', 'silent', ...SUNWARD_LINES,
] as const;
export type LineId = (typeof LINE_IDS)[number];

export const HUB = 'hub';
export const END = 'end';
export const REFUSED = 'callRefused';
export const TOLL = 'toll';

function ackTopic(id: TopicId, ask: { say: LineId; when: ConditionId[] }, ack: { line: LineId; say: LineId; effect: EffectId }): Topic {
  const options = [{ say: ack.say, when: [], effects: [ack.effect], go: END }];
  return { id, once: false, ask: { ...ask, duringFeud: false }, raise: null, prepare: null, hangUp: [], start: 'ack', nodes: { ack: { line: ack.line, options } } };
}

function tollNode(go: string): DialogueNode {
  return {
    line: 'thatCostsYou',
    options: [
      { say: 'dealSendingIt', when: ['canPayTalk'], effects: ['payTalk'], go },
      { say: 'tooMuch', when: [], effects: [], go: HUB },
    ],
  };
}
export const BUSY_LINE: LineId = 'busy';
export const SPARE_LINE: LineId = 'spare';
export const HANG_UP_LINE: LineId = 'hangUp';
export const QUEST_GO = 'quest:';

export function questGo(quest: string): string {
  return `${QUEST_GO}${quest}`;
}

export function handoffQuest(go: string): string | null {
  return go.startsWith(QUEST_GO) ? go.slice(QUEST_GO.length) : null;
}

export const TOPICS: Record<TopicId, Topic> = { ...SUNWARD_TOPICS,
  directions: {
    id: 'directions',
    once: false,
    ask: { say: 'whereIsTheNearest', when: ['knowsTown'], duringFeud: false },
    raise: null,
    prepare: 'nearestTown',
    hangUp: [],
    start: 'answer',
    nodes: {
      [TOLL]: tollNode('answer'),
      answer: {
        line: 'townWay',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: ['revealTown'], go: HUB },
          { say: 'thanksOverAndOut', when: [], effects: ['revealTown'], go: END },
        ],
      },
    },
  },
  tow: {
    id: 'tow',
    once: false,
    ask: null,
    raise: { when: ['offersPaidTow'], priority: 2, duringFeud: false, duringCombat: false },
    prepare: 'towOffer',
    hangUp: ['refuseTow'],
    start: 'offer',
    nodes: {
      offer: {
        line: 'pullPaid',
        options: [
          { say: 'dealHitchMeUp', when: [], effects: ['acceptTow'], go: END },
          { say: 'noThanks', when: [], effects: ['refuseTow'], go: END },
        ],
      },
    },
  },
  towFree: {
    id: 'towFree',
    once: false,
    ask: null,
    raise: { when: ['offersFreeTow'], priority: 2, duringFeud: false, duringCombat: false },
    prepare: 'towOffer',
    hangUp: ['refuseTow'],
    start: 'offer',
    nodes: {
      offer: {
        line: 'pullFree',
        options: [
          { say: 'dealHitchMeUp', when: [], effects: ['acceptTow'], go: END },
          { say: 'noThanks', when: [], effects: ['refuseTow'], go: END },
        ],
      },
    },
  },
  escortHold: ackTopic('escortHold', { say: 'waitHereForMe', when: ['escortFollowed'] }, { line: 'waitingHere', say: 'thanksOverAndOut', effect: 'holdEscort' }),
  escortGo: ackTopic('escortGo', { say: 'letsMove', when: ['escortHeld'] }, { line: 'movingOutNow', say: 'thanksOverAndOut', effect: 'releaseHold' }),
  hireGuard: {
    id: 'hireGuard',
    once: false,
    ask: { say: 'rideGuardForMe', when: ['mercForHire', 'atPeace', 'npcCalm'], duringFeud: false },
    raise: null,
    prepare: 'guardOffer',
    hangUp: [],
    start: 'check',
    nodes: {
      check: {
        line: 'dependsWhoAsks',
        options: [
          { say: 'whatsYourRate', when: ['takesGuard'], effects: [], go: 'terms' },
          { say: 'whatsYourRate', when: ['refusesGuard'], effects: ['settleRefused'], go: 'refuse' },
        ],
      },
      terms: {
        line: 'guardDayRate',
        options: [
          { say: 'dealSendingIt', when: ['canPayGuard'], effects: ['hireGuard'], go: 'hired' },
          { say: 'tooMuch', when: [], effects: [], go: HUB },
        ],
      },
      hired: { line: 'onYourTailNow', options: [{ say: 'overAndOut', when: [], effects: [], go: END }] },
      refuse: { line: 'notRidingForYou', options: [{ say: 'understood', when: [], effects: [], go: HUB }] },
    },
  },
  dismissGuard: ackTopic('dismissGuard', { say: 'thatsAllRideOff', when: ['guardOfMine'] }, { line: 'moneyStaysWithMe', say: 'overAndOut', effect: 'dismissGuard' }),
  askTow: {
    id: 'askTow',
    once: false,
    ask: { say: 'iAmStrandedCan', when: ['canTowPlayer', 'npcCalm'], duringFeud: false },
    raise: null,
    prepare: null,
    hangUp: [],
    start: 'coming',
    nodes: {
      coming: {
        line: 'holdOnIAm',
        options: [{ say: 'thanksIWillWait', when: [], effects: ['askTow'], go: END }],
      },
    },
  },
  patch: {
    id: 'patch',
    once: false,
    ask: { say: 'myTruckIsBroken', when: ['playerNeedsPatch', 'npcCalm', 'atPeace'], duringFeud: false },
    raise: null,
    prepare: 'patchTerms',
    hangUp: [],
    start: 'look',
    nodes: {
      look: {
        line: 'letMeHearWhat',
        options: [
          { say: 'whatWouldItTake', when: ['hasDeal'], effects: [], go: 'terms' },
          { say: 'canYouDoAnything', when: ['noDeal'], effects: [], go: 'cannot' },
        ],
      },
      terms: {
        line: 'dealTerms',
        options: [
          { say: 'dealIWillStay', when: [], effects: ['agreePatch'], go: END },
          { say: 'notNowSomethingElse', when: [], effects: [], go: HUB },
        ],
      },
      cannot: {
        line: 'notWithWhatI',
        options: [{ say: 'understood', when: [], effects: [], go: HUB }],
      },
    },
  },
  patchRequest: {
    id: 'patchRequest',
    once: true,
    ask: null,
    raise: { when: ['npcNeedsPatch', 'npcOffRope', 'npcCalm', 'atPeace'], priority: 1, duringFeud: false, duringCombat: false },
    prepare: 'patchTerms',
    hangUp: ['settleRefused'],
    start: 'ask',
    nodes: {
      ask: {
        line: 'myTruckIsDead',
        options: [
          { say: 'whatAreYouOffering', when: ['hasDeal'], effects: [], go: 'terms' },
          { say: 'iCannotHelpSorry', when: ['noDeal'], effects: ['settleRefused'], go: END },
        ],
      },
      terms: {
        line: 'dealTerms',
        options: [
          { say: 'dealStayWhereYou', when: [], effects: ['agreePatch'], go: END },
          { say: 'notToday', when: [], effects: ['settleRefused'], go: END },
        ],
      },
    },
  },
  demand: {
    id: 'demand',
    once: true,
    ask: null,
    raise: { when: ['demandsCargo'], priority: 3, duringFeud: true, duringCombat: true },
    prepare: 'demandHaul',
    hangUp: ['settleRefused'],
    start: 'demand',
    nodes: {
      demand: {
        line: 'demandCargo',
        options: [
          { say: 'fineTakeIt', when: [], effects: ['handOver'], go: END },
          { say: 'comeAndGetIt', when: [], effects: ['settleRefused'], go: END },
        ],
      },
    },
  },
  spillClaim: {
    id: 'spillClaim',
    once: true,
    ask: null,
    raise: { when: ['claimsSpill'], priority: 4, duringFeud: true, duringCombat: true },
    prepare: null,
    hangUp: ['settleRefused'],
    start: 'claim',
    nodes: {
      claim: {
        line: 'yourLoadIsInThe',
        options: [
          { say: 'itIsYours', when: [], effects: ['abandonSpill'], go: END },
          { say: 'overMyWreck', when: [], effects: ['settleRefused'], go: END },
        ],
      },
    },
  },
  surrender: {
    id: 'surrender',
    once: true,
    ask: null,
    raise: { when: ['demandsSurrender'], priority: 5, duringFeud: true, duringCombat: true },
    prepare: 'surrenderHaul',
    hangUp: ['settleRefused'],
    start: 'offer',
    nodes: {
      offer: {
        line: 'surrenderOffer',
        options: [
          { say: 'fineTakeIt', when: [], effects: ['surrender'], go: END },
          { say: 'comeAndGetIt', when: [], effects: ['settleRefused'], go: END },
        ],
      },
    },
  },
  giveUp: {
    id: 'giveUp',
    once: true,
    ask: null,
    raise: { when: ['demandsGiveUp'], priority: 5, duringFeud: true, duringCombat: true },
    prepare: 'surrenderHaul',
    hangUp: ['settleRefused'],
    start: 'offer',
    nodes: {
      offer: {
        line: 'giveUpOffer',
        options: [
          { say: 'standingDown', when: [], effects: ['giveUp'], go: END },
          { say: 'comeAndGetIt', when: [], effects: ['settleRefused'], go: END },
        ],
      },
    },
  },
  claim: {
    id: 'claim',
    once: false,
    ask: null,
    raise: { when: ['guardsClaim'], priority: 4, duringFeud: false, duringCombat: false },
    prepare: null,
    hangUp: ['backOffClaim'],
    start: 'warn',
    nodes: {
      warn: {
        line: 'thisIsMine',
        options: [
          { say: 'rollingOn', when: [], effects: ['backOffClaim'], go: END },
          { say: 'findersKeepers', when: [], effects: ['defyClaim'], go: END },
        ],
      },
    },
  },
  trade: {
    id: 'trade',
    once: false,
    ask: { say: 'wantToTrade', when: ['noTrade', 'npcCalm'], duringFeud: false },
    raise: null,
    prepare: null,
    hangUp: [],
    start: 'offer',
    nodes: {
      offer: {
        line: 'surePullOverAnd',
        options: [
          { say: 'pullingOver', when: [], effects: ['startTrade'], go: END },
          { say: 'neverMind', when: [], effects: [], go: HUB },
        ],
      },
    },
  },
  truce: {
    id: 'truce',
    once: false,
    ask: { say: 'enoughShootingCanWe', when: ['atOdds', 'noPlayerPlea'], duringFeud: true },
    raise: null,
    prepare: 'truceAnswer',
    hangUp: ['withdrawPlea'],
    start: 'listen',
    nodes: {
      listen: {
        line: 'iAmListening',
        options: [
          { say: 'weBothDriveAway', when: ['accepts'], effects: ['settlePlea'], go: 'agreed' },
          { say: 'weBothDriveAway', when: ['refuses'], effects: ['settlePlea'], go: 'refused' },
          { say: 'weBothDriveAway', when: ['demandsToll'], effects: [], go: 'demanded' },
        ],
      },
      demanded: {
        line: 'noFreeRideDump',
        options: [
          { say: 'fineTakeIt', when: [], effects: ['payToll'], go: END },
          { say: 'comeAndGetIt', when: [], effects: ['refuseToll'], go: END },
        ],
      },
      agreed: { line: 'fineKeepYourGuns', options: [{ say: 'overAndOut', when: [], effects: [], go: END }] },
      refused: { line: 'tooLateForTalk', options: [{ say: 'thenWeFinishThis', when: [], effects: [], go: END }] },
    },
  },
  mercy: {
    id: 'mercy',
    once: false,
    ask: { say: 'iGiveUpLet', when: ['atOdds', 'noPlayerPlea'], duringFeud: true },
    raise: null,
    prepare: 'mercyAnswer',
    hangUp: ['withdrawPlea'],
    start: 'listen',
    nodes: {
      listen: {
        line: 'talkFast',
        options: [
          { say: 'takeWhatICarry', when: ['accepts', 'hasHaul'], effects: ['settlePlea'], go: 'spared' },
          { say: 'takeWhatICarry', when: ['accepts', 'noHaul'], effects: ['settlePlea'], go: 'sparedFree' },
          { say: 'takeWhatICarry', when: ['refuses'], effects: ['settlePlea'], go: 'refused' },
        ],
      },
      spared: { line: 'leaveItOnThe', options: [{ say: 'going', when: [], effects: [], go: END }] },
      sparedFree: { line: 'nothingHereICanCarry', options: [{ say: 'going', when: [], effects: [], go: END }] },
      refused: { line: 'noDeals', options: [{ say: 'thenComeAndGet', when: [], effects: [], go: END }] },
    },
  },
  yieldDemand: {
    id: 'yieldDemand',
    once: false,
    ask: { say: 'yourTruckIsFinished', when: ['atOdds', 'npcBeaten', 'notOfferedYield'], duringFeud: true },
    raise: null,
    prepare: 'yieldAnswer',
    hangUp: [],
    start: 'hear',
    nodes: {
      hear: {
        line: 'youWantToPick',
        options: [
          { say: 'yourCallLastChance', when: ['accepts'], effects: [], go: 'agreed' },
          { say: 'yourCallLastChance', when: ['refuses'], effects: [], go: 'refused' },
        ],
      },
      agreed: { line: 'allRightIAm', options: [{ say: 'sitTight', when: [], effects: ['yieldToPlayer'], go: END }] },
      refused: { line: 'notWhileICan', options: [{ say: 'thenWeFinishThis', when: [], effects: ['settleRefused'], go: END }] },
    },
  },
  rob: {
    id: 'rob',
    once: true,
    ask: { say: 'dropYourCargoOr', when: ['atPeace', 'npcHasCargo'], duringFeud: false },
    raise: null,
    prepare: 'threatAnswer',
    hangUp: ['settleRefused'],
    start: 'hear',
    nodes: {
      hear: {
        line: 'sayThatAgain',
        options: [
          { say: 'youHeardMeCargo', when: ['complies'], effects: ['settleThreat'], go: 'comply' },
          { say: 'youHeardMeCargo', when: ['resists'], effects: ['settleThreat'], go: 'fightBack' },
          { say: 'youHeardMeCargo', when: ['runs'], effects: ['settleThreat'], go: 'flee' },
        ],
      },
      comply: { line: 'allRightItIs', options: [{ say: 'smartChoice', when: [], effects: [], go: END }] },
      fightBack: { line: 'comeAndTakeIt', options: [{ say: 'yourFuneral', when: [], effects: [], go: END }] },
      flee: { line: 'notTodayRun', options: [{ say: 'runThen', when: [], effects: [], go: END }] },
    },
  },
  warnOff: {
    id: 'warnOff',
    once: true,
    ask: { say: 'thisWreckIsMine', when: ['atPeace', 'claimsPlayerLoot'], duringFeud: false },
    raise: null,
    prepare: 'warnAnswer',
    hangUp: ['settleRefused'],
    start: 'hear',
    nodes: {
      hear: {
        line: 'saysWho',
        options: [
          { say: 'youHeardMeLeave', when: ['complies'], effects: ['settleWarning'], go: 'comply' },
          { say: 'youHeardMeLeave', when: ['holdsOn'], effects: ['settleWarning'], go: 'refuse' },
          { say: 'youHeardMeLeave', when: ['resists'], effects: ['settleWarning'], go: 'fightBack' },
        ],
      },
      comply: { line: 'fineItsYours', options: [{ say: 'good', when: [], effects: [], go: END }] },
      refuse: { line: 'findYourOwnWreck', options: [{ say: 'weWillSee', when: [], effects: [], go: END }] },
      fightBack: { line: 'overMyDeadBody', options: [{ say: 'haveItYourWay', when: [], effects: [], go: END }] },
    },
  },
  lootWarning: {
    id: 'lootWarning',
    once: false,
    ask: null,
    raise: { when: ['warnsPlayerOff'], priority: 4, duringFeud: false, duringCombat: false },
    prepare: 'lootWarningTerms',
    hangUp: ['hangUpLootWarning'],
    start: 'warn',
    nodes: {
      warn: {
        line: 'warnTerms',
        options: [
          { say: 'rollingOn', when: [], effects: ['leaveLootWarning'], go: END },
          { say: 'findYourOwn', when: ['yieldsLoot'], effects: ['refuseLootWarning'], go: 'backsOff' },
          { say: 'findYourOwn', when: ['fightsForLoot'], effects: ['refuseLootWarning'], go: 'fights' },
          { say: 'makeMe', when: [], effects: ['fightLootWarning'], go: 'fights' },
        ],
      },
      backsOff: { line: 'keepYourScrapsThen', options: [{ say: 'thoughtSo', when: [], effects: [], go: END }] },
      fights: { line: 'thenWeSettleIt', options: [{ say: 'bringIt', when: [], effects: [], go: END }] },
    },
  },
  truceOffer: {
    id: 'truceOffer',
    once: false,
    ask: null,
    raise: { when: ['offersTruce'], priority: 4, duringFeud: true, duringCombat: true },
    prepare: null,
    hangUp: ['refusePlea'],
    start: 'offer',
    nodes: {
      offer: {
        line: 'enoughOfThisWe',
        options: [
          { say: 'agreedGunsDown', when: [], effects: ['acceptPlea'], go: END },
          { say: 'noWeFinishThis', when: [], effects: ['refusePlea'], go: END },
        ],
      },
    },
  },
  mercyPlea: {
    id: 'mercyPlea',
    once: false,
    ask: null,
    raise: { when: ['begsMercy'], priority: 4, duringFeud: true, duringCombat: true },
    prepare: null,
    hangUp: ['refusePlea'],
    start: 'beg',
    nodes: {
      beg: {
        line: 'stopShootingIGive',
        options: [
          { say: 'dumpAndDrive', when: [], effects: ['acceptPlea'], go: END },
          { say: 'standDownAndLet', when: ['notOfferedYield'], effects: ['askStandDown'], go: 'strip' },
          { say: 'noMercy', when: [], effects: ['refusePlea'], go: END },
        ],
      },
      strip: {
        line: 'youWantToPick',
        options: [
          { say: 'yourCallLastChance', when: ['accepts'], effects: [], go: 'stripAgreed' },
          { say: 'yourCallLastChance', when: ['refuses'], effects: [], go: 'stripRefused' },
        ],
      },
      stripAgreed: {
        line: 'allRightIAm',
        options: [{ say: 'sitTight', when: [], effects: ['standDownPlea'], go: END }],
      },
      stripRefused: {
        line: 'notWhileICan',
        options: [{ say: 'thenWeFinishThis', when: [], effects: ['refusePlea'], go: END }],
      },
    },
  },
  offerTow: {
    id: 'offerTow',
    once: false,
    ask: { say: 'needATowTo', when: ['canTowNpc'], duringFeud: false },
    raise: null,
    prepare: 'npcTowTerms',
    hangUp: [],
    start: 'terms',
    nodes: {
      terms: {
        line: 'takeMeToSite',
        options: [
          { say: 'dealHitchUp', when: [], effects: ['hitchNpc'], go: END },
          { say: 'noChargeHitchUp', when: [], effects: ['hitchNpcFree'], go: END },
          { say: 'notNowSomethingElse', when: [], effects: [], go: HUB },
        ],
      },
    },
  },
  releaseTow: {
    id: 'releaseTow',
    once: false,
    ask: { say: 'iAmLettingYou', when: ['towedByPlayer'], duringFeud: false },
    raise: null,
    prepare: null,
    hangUp: ['releaseNpc'],
    start: 'released',
    nodes: {
      released: { line: 'fineThanksForThe', options: [{ say: 'overAndOut', when: [], effects: ['releaseNpc'], go: END }] },
    },
  },
  offerPatch: {
    id: 'offerPatch',
    once: false,
    ask: { say: 'yourTruckLooksDead', when: ['npcNeedsPatch', 'npcOffRope', 'atPeace'], duringFeud: false },
    raise: null,
    prepare: 'patchTerms',
    hangUp: [],
    start: 'ask',
    nodes: {
      ask: {
        line: 'youKnowHowThen',
        options: [
          { say: 'whatCanYouOffer', when: ['hasDeal'], effects: [], go: 'terms' },
          { say: 'onSecondThoughtI', when: ['noDeal'], effects: [], go: HUB },
        ],
      },
      terms: {
        line: 'dealTerms',
        options: [
          { say: 'dealStayWhereYou', when: [], effects: ['agreePatch'], go: END },
          { say: 'notNowSomethingElse', when: [], effects: [], go: HUB },
        ],
      },
    },
  },
  offerPatchWorn: {
    id: 'offerPatchWorn',
    once: false,
    ask: { say: 'yourEngineSoundsRough', when: ['npcWorn', 'npcOffRope', 'npcCalm', 'atPeace'], duringFeud: false },
    raise: null,
    prepare: 'patchTerms',
    hangUp: [],
    start: 'ask',
    nodes: {
      ask: {
        line: 'youKnowHowThen',
        options: [
          { say: 'whatCanYouOffer', when: ['hasDeal'], effects: [], go: 'terms' },
          { say: 'onSecondThoughtI', when: ['noDeal'], effects: [], go: HUB },
        ],
      },
      terms: {
        line: 'dealTerms',
        options: [
          { say: 'dealPullOverAnd', when: [], effects: ['agreePatch'], go: END },
          { say: 'notNowSomethingElse', when: [], effects: [], go: HUB },
        ],
      },
    },
  },
  marketNews: {
    id: 'marketNews',
    once: false,
    ask: { say: 'howArePricesIn', when: ['knowsLastTown'], duringFeud: false },
    raise: null,
    prepare: 'lastTownPrices',
    hangUp: [],
    start: 'prices',
    nodes: {
      [TOLL]: tollNode('prices'),
      prices: {
        line: 'lastIWasIn',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: [], go: HUB },
          { say: 'thanksOverAndOut', when: [], effects: [], go: END },
        ],
      },
    },
  },
  rumor: {
    id: 'rumor',
    once: true,
    ask: { say: 'seenAnythingWorthA', when: ['hearsRumor'], duringFeud: false },
    raise: null,
    prepare: 'nearestRumor',
    hangUp: [],
    start: 'tell',
    nodes: {
      [TOLL]: tollNode('tell'),
      tell: {
        line: 'maybeIPassedSomething',
        options: [
          { say: 'where', when: ['rumorOfSite'], effects: [], go: 'site' },
          { say: 'where', when: ['rumorOfWreck'], effects: [], go: 'wreck' },
        ],
      },
      site: {
        line: 'siteWay',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: ['revealRumor', 'settleDone'], go: HUB },
          { say: 'thanksOverAndOut', when: [], effects: ['revealRumor', 'settleDone'], go: END },
        ],
      },
      wreck: {
        line: 'wreckWay',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: ['revealRumor', 'settleDone'], go: HUB },
          { say: 'thanksOverAndOut', when: [], effects: ['revealRumor', 'settleDone'], go: END },
        ],
      },
    },
  },
  armyWagon: {
    id: 'armyWagon',
    once: true,
    ask: { say: 'seenADeadArmy', when: ['heardWagonNearby'], duringFeud: false },
    raise: null,
    prepare: null,
    hangUp: [],
    start: 'tell',
    nodes: {
      tell: {
        line: 'armyWagonTold',
        options: [
          { say: 'whatElseDidYouSee', when: [], effects: ['noteWagonRoad', 'settleDone'], go: questGo('radio_wagon_driver') },
          { say: 'thanksSomethingElse', when: [], effects: ['noteWagonRoad', 'settleDone'], go: HUB },
          { say: 'thanksOverAndOut', when: [], effects: ['noteWagonRoad', 'settleDone'], go: END },
        ],
      },
    },
  },
  lastSeen: {
    id: 'lastSeen',
    once: false,
    ask: { say: 'lookingForSomebody', when: ['seeksSomeone'], duringFeud: false },
    raise: null,
    prepare: 'lastSighting',
    hangUp: [],
    start: 'tell',
    nodes: {
      [TOLL]: tollNode('tell'),
      tell: {
        line: 'sightingTold',
        options: [
          { say: 'thanksSomethingElse', when: ['sawSought'], effects: ['noteLead'], go: HUB },
          { say: 'thanksOverAndOut', when: ['sawSought'], effects: ['noteLead'], go: END },
          { say: 'thanksSomethingElse', when: ['missedSought'], effects: [], go: HUB },
          { say: 'thanksOverAndOut', when: ['missedSought'], effects: [], go: END },
        ],
      },
    },
  },
  parcel: {
    id: 'parcel',
    once: false,
    ask: { say: 'gotParcelForYou', when: ['hasParcelFor', 'noHandover', 'npcCalm'], duringFeud: false },
    raise: null,
    prepare: null,
    hangUp: [],
    start: 'offer',
    nodes: {
      offer: {
        line: 'parcelPullOver',
        options: [
          { say: 'pullingOver', when: [], effects: ['startHandover'], go: END },
          { say: 'neverMind', when: [], effects: [], go: HUB },
        ],
      },
    },
  },
  claimWreck: {
    id: 'claimWreck',
    once: true,
    ask: { say: 'seenThatWreck', when: ['nearClaimWreck'], duringFeud: false },
    raise: null,
    prepare: 'claimWreckBearing',
    hangUp: [],
    start: 'tell',
    nodes: {
      [TOLL]: tollNode('tell'),
      tell: {
        line: 'claimWreckTold',
        options: [
          { say: 'anyoneElseAsking', when: ['rivalAsked'], effects: ['noteClaimLead'], go: 'rival' },
          { say: 'anyoneElseAsking', when: ['noRivalAsked'], effects: ['noteClaimLead'], go: 'alone' },
          { say: 'thanksSomethingElse', when: [], effects: ['noteClaimLead', 'settleDone'], go: HUB },
          { say: 'thanksOverAndOut', when: [], effects: ['noteClaimLead', 'settleDone'], go: END },
        ],
      },
      rival: {
        line: 'crewAskedTheSame',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: ['settleDone'], go: HUB },
          { say: 'thanksOverAndOut', when: [], effects: ['settleDone'], go: END },
        ],
      },
      alone: {
        line: 'nobodyElseAsked',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: ['settleDone'], go: HUB },
          { say: 'thanksOverAndOut', when: [], effects: ['settleDone'], go: END },
        ],
      },
    },
  },
  tips: {
    id: 'tips',
    once: false,
    ask: { say: 'anythingInteresting', when: [], duringFeud: false },
    raise: null,
    prepare: 'tradeTip',
    hangUp: [],
    start: 'tell',
    nodes: {
      [TOLL]: tollNode('tell'),
      tell: {
        line: 'tipTold',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: [], go: HUB },
          { say: 'overAndOut', when: [], effects: [], go: END },
        ],
      },
    },
  },
  buyTruce: {
    id: 'buyTruce',
    once: false,
    ask: { say: 'whatWouldItCost', when: ['atOdds', 'canPayTruce'], duringFeud: true },
    raise: null,
    prepare: 'trucePrice',
    hangUp: [],
    start: 'price',
    nodes: {
      price: {
        line: 'truceCost',
        options: [
          { say: 'dealSendingIt', when: [], effects: ['payTruce'], go: 'paid' },
          { say: 'tooMuch', when: [], effects: [], go: HUB },
        ],
      },
      paid: { line: 'moneyIsInGuns', options: [{ say: 'overAndOut', when: [], effects: [], go: END }] },
    },
  },
  offerAid: {
    id: 'offerAid',
    once: false,
    ask: { say: 'runningLowICan', when: ['noAid', 'atPeace', 'aidHolds', 'npcLow', 'npcOffRope'], duringFeud: false },
    raise: null,
    prepare: 'aidWanted',
    hangUp: [],
    start: 'terms',
    nodes: {
      terms: {
        line: 'iCouldUseAid',
        options: [
          { say: 'dealPlain', when: [], effects: ['giveAidPaid'], go: END },
          { say: 'noCharge', when: [], effects: ['giveAidFree'], go: END },
          { say: 'notNowSomethingElse', when: [], effects: [], go: HUB },
        ],
      },
    },
  },
  askAid: {
    id: 'askAid',
    once: true,
    ask: { say: 'iAmRunningDry', when: ['noAid', 'atPeace', 'aidHolds', 'playerLow'], duringFeud: false },
    raise: null,
    prepare: 'aidAnswer',
    hangUp: ['settleRefused'],
    start: 'check',
    nodes: {
      check: {
        line: 'letMeCheckMy',
        options: [
          { say: 'whateverYouCanSpare', when: ['aidGiven'], effects: [], go: 'give' },
          { say: 'whateverYouCanSpare', when: ['aidRefused'], effects: ['settleRefused'], go: 'refuse' },
        ],
      },
      give: {
        line: 'iCanSpareAid',
        options: [{ say: 'thanksIWillWait', when: [], effects: ['takeAid', 'settleDone'], go: END }],
      },
      refuse: { line: 'sorryCannotSpareAny', options: [{ say: 'understood', when: [], effects: [], go: HUB }] },
    },
  },
  aidOffer: {
    id: 'aidOffer',
    once: false,
    ask: null,
    raise: { when: ['offersAid'], priority: 1, duringFeud: false, duringCombat: false },
    prepare: 'aidOffered',
    hangUp: ['refuseAidOffer'],
    start: 'offer',
    nodes: {
      offer: {
        line: 'youLookDryI',
        options: [
          { say: 'thanksIWillWait', when: [], effects: ['acceptAidOffer'], go: END },
          { say: 'noThanks', when: [], effects: ['refuseAidOffer'], go: END },
        ],
      },
    },
  },
  tale: {
    id: 'tale',
    once: true,
    ask: null,
    raise: { when: ['offersTale'], priority: 1, duringFeud: false, duringCombat: false },
    prepare: 'taleNews',
    hangUp: ['declineEncounter'],
    start: 'offer',
    nodes: {
      offer: {
        line: 'gotAStoryFrom',
        options: [
          { say: 'goOnThen', when: ['newsOfSite'], effects: ['tellTale'], go: 'site' },
          { say: 'goOnThen', when: ['newsOfTip'], effects: ['tellTale'], go: 'tip' },
          { say: 'notNow', when: [], effects: ['declineEncounter'], go: END },
        ],
      },
      site: { line: 'siteWay', options: [{ say: 'thanksOverAndOut', when: [], effects: ['endEncounter'], go: END }] },
      tip: { line: 'tipTold', options: [{ say: 'thanksOverAndOut', when: [], effects: ['endEncounter'], go: END }] },
    },
  },
  salvageTip: {
    id: 'salvageTip',
    once: true,
    ask: null,
    raise: { when: ['offersTip'], priority: 1, duringFeud: false, duringCombat: false },
    prepare: 'tipTerms',
    hangUp: ['declineEncounter'],
    start: 'offer',
    nodes: {
      offer: {
        line: 'iKnowAWreck',
        options: [
          { say: 'dealPlain', when: ['canPayTalk'], effects: ['buyTip'], go: 'told' },
          { say: 'noThanks', when: [], effects: ['declineEncounter'], go: END },
        ],
      },
      told: { line: 'wreckWay', options: [{ say: 'thanksOverAndOut', when: [], effects: ['endEncounter'], go: END }] },
    },
  },
  challenge: {
    id: 'challenge',
    once: true,
    ask: null,
    raise: { when: ['callsOut'], priority: 1, duringFeud: false, duringCombat: false },
    prepare: 'threatAnswer',
    hangUp: ['declineEncounter'],
    start: 'call',
    nodes: {
      call: {
        line: 'niceRigLetsSee',
        options: [
          { say: 'notLookingForTrouble', when: [], effects: ['backDown'], go: END },
          { say: 'lookAtMyGunsAgain', when: ['complies'], effects: ['answerChallenge'], go: 'comply' },
          { say: 'lookAtMyGunsAgain', when: ['resists'], effects: ['answerChallenge'], go: 'fightBack' },
          { say: 'lookAtMyGunsAgain', when: ['runs'], effects: ['answerChallenge'], go: 'flee' },
          { say: 'letsGo', when: [], effects: ['acceptChallenge'], go: END },
        ],
      },
      comply: { line: 'fineKeepYourGuns', options: [{ say: 'understood', when: [], effects: ['endEncounter'], go: END }] },
      fightBack: { line: 'thenWeSettleIt', options: [{ say: 'bringIt', when: [], effects: ['endEncounter'], go: END }] },
      flee: { line: 'notTodayRun', options: [{ say: 'runThen', when: [], effects: ['endEncounter'], go: END }] },
    },
  },
  courierShort: {
    id: 'courierShort',
    once: true,
    ask: null,
    raise: { when: ['asksCourierAid'], priority: 2, duringFeud: false, duringCombat: false },
    prepare: 'courierNeed',
    hangUp: ['courierRefuse'],
    start: 'terms',
    nodes: {
      terms: {
        line: 'courierShortOfFuel',
        options: [
          { say: 'noCharge', when: [], effects: ['courierFree'], go: END },
          { say: 'atTheTownPrice', when: [], effects: ['courierPaid'], go: END },
          { say: 'iCannotHelpSorry', when: [], effects: ['courierRefuse'], go: END },
        ],
      },
    },
  },
  courierThanks: {
    id: 'courierThanks',
    once: true,
    ask: null,
    raise: { when: ['courierThanksDue'], priority: 2, duringFeud: false, duringCombat: false },
    prepare: 'courierNews',
    hangUp: ['courierThank'],
    start: 'owe',
    nodes: {
      owe: {
        line: 'youKeptMeRolling',
        options: [
          { say: 'goOnThen', when: ['newsOfSite'], effects: [], go: 'site' },
          { say: 'goOnThen', when: ['newsOfWreck'], effects: [], go: 'wreck' },
          { say: 'goOnThen', when: ['newsOfTip'], effects: [], go: 'tip' },
        ],
      },
      site: { line: 'siteWay', options: [{ say: 'thanksOverAndOut', when: [], effects: ['courierThank'], go: END }] },
      wreck: { line: 'wreckWay', options: [{ say: 'thanksOverAndOut', when: [], effects: ['courierThank'], go: END }] },
      tip: { line: 'tipTold', options: [{ say: 'thanksOverAndOut', when: [], effects: ['courierThank'], go: END }] },
    },
  },
  courierSquare: {
    id: 'courierSquare',
    once: true,
    ask: null,
    raise: { when: ['courierSquareDue'], priority: 2, duringFeud: false, duringCombat: false },
    prepare: 'tradeTip',
    hangUp: ['courierSquareUp'],
    start: 'tell',
    nodes: {
      tell: { line: 'courierSquareTip', options: [{ say: 'thanksOverAndOut', when: [], effects: ['courierSquareUp'], go: END }] },
    },
  },
  courierCold: {
    id: 'courierCold',
    once: true,
    ask: null,
    raise: { when: ['courierColdDue'], priority: 2, duringFeud: false, duringCombat: false },
    prepare: null,
    hangUp: ['courierColdShoulder'],
    start: 'cold',
    nodes: {
      cold: { line: 'youLeftMeDry', options: [{ say: 'understood', when: [], effects: ['courierColdShoulder'], go: END }] },
    },
  },
  courierGrudge: {
    id: 'courierGrudge',
    once: true,
    ask: null,
    raise: { when: ['courierGrudgeDue'], priority: 3, duringFeud: true, duringCombat: false },
    prepare: 'truceAnswer',
    hangUp: ['courierEnd'],
    start: 'grudge',
    nodes: {
      grudge: {
        line: 'youShotMeUp',
        options: [
          { say: 'letsCallItEven', when: ['accepts'], effects: ['courierCallEven'], go: 'agreed' },
          { say: 'letsCallItEven', when: ['refuses'], effects: ['courierCallEven'], go: 'refused' },
          { say: 'letsCallItEven', when: ['demandsToll'], effects: ['courierCallEven'], go: 'refused' },
          { say: 'bringIt', when: [], effects: ['courierFight', 'courierEnd'], go: END },
        ],
      },
      agreed: { line: 'fineKeepYourGuns', options: [{ say: 'overAndOut', when: [], effects: ['courierEnd'], go: END }] },
      refused: { line: 'tooLateForTalk', options: [{ say: 'thenWeFinishThis', when: [], effects: ['courierEnd'], go: END }] },
    },
  },
  courierFavor: {
    id: 'courierFavor',
    once: true,
    ask: null,
    raise: { when: ['courierFavorDue'], priority: 2, duringFeud: false, duringCombat: false },
    prepare: 'courierFavorTerms',
    hangUp: ['courierPayFavor'],
    start: 'favor',
    nodes: {
      favor: { line: 'toldYouIOweYou', options: [{ say: 'thanksOverAndOut', when: [], effects: ['courierPayFavor'], go: END }] },
    },
  },
};

export type Voice = {
  greeting: LineId;
  repeatLine: LineId;
  refusal: LineId;
  warnOff: LineId;
  honksBack: boolean;
};

export type TraitTalk = { voice: Voice | null; topics: TopicId[] };

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

const PARLEY: TopicId[] = ['spillClaim', 'surrender', 'giveUp', 'claim', 'truce', 'mercy', 'yieldDemand', 'buyTruce', 'rob', 'lootWarning', 'warnOff', 'truceOffer', 'mercyPlea', 'offerTow', 'releaseTow', 'offerPatch', 'offerPatchWorn', 'offerAid'];

export const TRAIT_TALK: Record<TraitId, TraitTalk> = { ...SUNWARD_TRAIT_TALK,
  trader: { voice: { greeting: 'goAhead', repeatLine: 'weAlreadyTalkedAbout', refusal: 'nothingToSayTo', warnOff: 'thisOneIsSpokenFor', honksBack: true }, topics: ['directions', 'lastSeen', 'parcel', 'marketNews', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'patch', 'patchRequest', 'trade', 'escortHold', 'escortGo', ...TALES, ...CHALLENGE, ...PARLEY] },
  scavenger: { voice: { greeting: 'yeahMakeItQuick', repeatLine: 'iToldYouAlready', refusal: 'getOffMyChannel', warnOff: 'thatsMyPick', honksBack: true }, topics: ['directions', 'lastSeen', 'parcel', 'rumor', 'sunwardTalk', 'armyWagon', 'claimWreck', 'tips', 'tow', 'towFree', 'askTow', 'askAid', 'aidOffer', 'patch', 'patchRequest', 'trade', ...TALES, 'salvageTip', ...CHALLENGE, ...PARLEY] },
  raider: { voice: { greeting: 'getLost', repeatLine: 'getLost', refusal: 'hehNo', warnOff: 'offMyLootNow', honksBack: false }, topics: ['demand', ...CHALLENGE, ...PARLEY] },
  scumbag: { voice: null, topics: ['demand', ...CHALLENGE, ...PARLEY] },
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
