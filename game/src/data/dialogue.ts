
import { LESSON_LINE_IDS } from './lessons';
import { MARSHAL_LINES, MARSHAL_TOPICS, TREE_LINES, type MarshalConditionId, type MarshalEffectId, type MarshalPrepareId, type MarshalTopicId } from './personalities';
import { COURIER_TOPICS, type CourierTopicId } from './encounters';
import { MOMENT_LINES, MOMENT_TOPICS, type MomentConditionId, type MomentEffectId, type MomentId } from './moments';
import { SUNWARD_LINES, SUNWARD_TOPICS, type SunwardConditionId, type SunwardEffectId, type SunwardPrepareId, type SunwardTopicId } from './sunward';

export type TopicId = 'directions' | 'tow' | 'towFree' | 'askTow' | 'patch' | 'patchRequest' | 'demand' | 'demandCut' | 'surrender' | 'giveUp' | 'claim' | 'trade' | 'truce' | 'mercy' | 'rob' | 'robCut' | 'warnOff' | 'truceOffer' | 'mercyPlea' | 'offerTow' | 'releaseTow' | 'offerPatch' | 'offerPatchWorn' | 'marketNews' | 'rumor' | 'tips' | 'roadLesson' | 'buyTruce' | 'offerAid' | 'askAid' | 'aidOffer' | 'yieldDemand' | 'spillClaim' | 'lootWarning' | 'armyWagon' | 'escortHold' | 'escortGo' | 'lookWarning'
  | 'tale' | 'salvageTip' | 'challenge' | 'lastSeen' | 'parcel' | 'claimWreck' | 'hireGuard' | 'dismissGuard' | 'askHelp' | SunwardTopicId | MarshalTopicId | CourierTopicId | MomentId;
export type ConditionId =
  | 'knowsTown' | 'offersPaidTow' | 'offersFreeTow' | 'canTowPlayer' | 'playerNeedsPatch' | 'npcNeedsPatch' | 'npcWorn' | 'npcOffRope' | 'playerPatches' | 'lookWarned' | 'hasDeal' | 'noDeal' | 'demandsCargo' | 'demandsCut' | 'namesPrice' | 'noPrice' | 'canPayPrice' | 'noCargoRob' | 'noCutRob' | 'demandsSurrender' | 'demandsGiveUp' | 'guardsClaim'
  | 'atOdds' | 'atPeace' | 'noPlayerPlea' | 'demandsToll' | 'npcHasCargo' | 'offersTruce' | 'begsMercy'
  | 'accepts' | 'refuses' | 'complies' | 'resists' | 'runs' | 'claimsPlayerLoot' | 'holdsOn' | 'canTowNpc' | 'towedByPlayer' | 'noTrade' | 'npcCalm'
  | 'knowsLastTown' | 'hearsRumor' | 'rumorOfSite' | 'rumorOfWreck' | 'canPayTruce'
  | 'npcLow' | 'playerLow' | 'noAid' | 'aidHolds' | 'aidGiven' | 'aidRefused' | 'offersAid' | 'npcBeaten' | 'notOfferedYield' | 'claimsSpill' | 'heardWagonNearby' | 'nearClaimWreck' | 'rivalAsked' | 'noRivalAsked'
  | 'escortFollowed' | 'escortHeld' | 'warnsPlayerOff' | 'yieldsLoot' | 'fightsForLoot' | 'hasHaul' | 'noHaul' | 'canPayTalk'
  | 'offersTale' | 'offersTip' | 'callsOut' | 'newsOfSite' | 'newsOfWreck' | 'newsOfTip' | 'seeksSomeone' | 'sawSought' | 'missedSought' | 'hasParcelFor' | 'noHandover'
  | 'helpAskable' | 'helpComes' | 'helpRefuses' | 'helpOutgunned' | 'mercForHire' | 'takesGuard' | 'refusesGuard' | 'canPayGuard' | 'guardOfMine'
  | 'asksCourierAid' | 'courierThanksDue' | 'courierSquareDue' | 'courierColdDue' | 'courierGrudgeDue' | 'courierFavorDue' | SunwardConditionId | MarshalConditionId | MomentConditionId;
export type EffectId =
  | 'revealTown' | 'settleDone' | 'settleRefused' | 'acceptTow' | 'refuseTow' | 'askTow' | 'agreePatch' | 'handOver' | 'surrender' | 'giveUp' | 'backOffClaim' | 'defyClaim'
  | 'endLookWarning' | 'answerLoadThreat'
  | 'acceptPlea' | 'refusePlea' | 'settlePlea' | 'payToll' | 'payDemand' | 'payTollMoney' | 'paySpared' | 'settleRobCut' | 'settleDemandRefused' | 'refuseToll' | 'withdrawPlea' | 'settleThreat' | 'settleWarning' | 'hitchNpc' | 'hitchNpcFree' | 'releaseNpc' | 'startTrade'
  | 'revealRumor' | 'payTruce' | 'giveAidPaid' | 'giveAidFree' | 'takeAid' | 'acceptAidOffer' | 'refuseAidOffer' | 'yieldToPlayer' | 'askStandDown' | 'standDownPlea' | 'abandonSpill' | 'noteWagonRoad' | 'noteClaimLead'
  | 'leaveLootWarning' | 'refuseLootWarning' | 'fightLootWarning' | 'hangUpLootWarning' | 'payTalk' | 'holdEscort' | 'releaseHold'
  | 'tellTale' | 'buyTip' | 'declineEncounter' | 'endEncounter' | 'backDown' | 'answerChallenge' | 'acceptChallenge'
  | 'courierFree' | 'courierPaid' | 'courierRefuse' | 'courierThank' | 'courierSquareUp' | 'courierColdShoulder' | 'courierCallEven' | 'courierFight' | 'courierEnd' | 'courierPayFavor' | 'noteLead' | 'startHandover' | 'noteClaimLead' | 'hireGuard' | 'dismissGuard' | 'joinFight' | 'turnDownCall' | SunwardEffectId | MarshalEffectId | MomentEffectId;
export type PrepareId = 'nearestTown' | 'towOffer' | 'patchTerms' | 'truceAnswer' | 'mercyAnswer' | 'threatAnswer' | 'warnAnswer' | 'npcTowTerms' | 'lastTownPrices' | 'nearestRumor' | 'tradeTip' | 'trucePrice' | 'aidWanted' | 'aidAnswer' | 'aidOffered' | 'yieldAnswer' | 'lootWarningTerms' | 'demandHaul' | 'demandCut' | 'robCutAnswer'
  | 'taleNews' | 'tipTerms' | 'courierNeed' | 'courierNews' | 'courierFavorTerms' | 'lastSighting' | 'guardOffer' | 'helpAnswer' | 'claimWreckBearing' | 'roadLesson' | SunwardPrepareId | MarshalPrepareId;

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
  'whatAreYouLookingAt', 'nothingMovingOn', 'yourLoad',
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
  'lookingForSomebody', 'sightingTold', 'gotParcelForYou', 'parcelPullOver',
  'courierShortOfFuel', 'atTheTownPrice', 'youKeptMeRolling', 'courierSquareTip', 'youLeftMeDry', 'youShotMeUp', 'letsCallItEven', 'toldYouIOweYou',
  'rideGuardForMe', 'dependsWhoAsks', 'whatsYourRate', 'guardDayRate', 'onYourTailNow', 'notRidingForYou', 'thatsAllRideOff', 'moneyStaysWithMe',
  'anyTipsForTheRoad', 'lessonTold', ...LESSON_LINE_IDS,
  'demandCargoOrPay', 'demandCutLine', 'noFreeRidePay', 'noFreeRideCut', 'leaveItOrPay', 'payAndGo', 'hereIsYourMoney', 'yourMoneyOr', 'youHeardMeMoney', 'allRightPaid', 'pocketsEmpty',
  'needAHandHere', 'whosOnYou', 'thatOneOnMyTail', 'onMyWay', 'notMyFight', 'tooHotForMe',
  'silent', ...SUNWARD_LINES, ...MARSHAL_LINES, ...TREE_LINES, ...MOMENT_LINES,
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

function strandedOffer(id: TopicId, when: ConditionId, line: LineId, accept: LineId, effect: EffectId): Topic {
  const options: DialogueOption[] = [{ say: accept, when: [], effects: [effect], go: END }, { say: 'comeAndGetIt', when: [], effects: ['settleRefused'], go: END }];
  return { id, once: true, ask: null, raise: { when: [when], priority: 5, duringFeud: true, duringCombat: true }, prepare: null, hangUp: ['settleRefused'], start: 'offer', nodes: { offer: { line, options } } };
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

function withTolls(topics: Record<TopicId, Topic>): Record<TopicId, Topic> {
  const own = Object.values(topics).find((topic) => topic.ask && TOLL in topic.nodes);
  if (own) throw new Error(`Topic ${own.id} writes its own toll, which withTolls builds`);
  return Object.fromEntries(Object.entries(topics).map(([id, topic]) => [id, topic.ask ? { ...topic, nodes: { [TOLL]: tollNode(topic.start), ...topic.nodes } } : topic])) as Record<TopicId, Topic>;
}

export const TOPICS: Record<TopicId, Topic> = withTolls({ ...SUNWARD_TOPICS, ...MARSHAL_TOPICS,
  directions: {
    id: 'directions',
    once: false,
    ask: { say: 'whereIsTheNearest', when: ['knowsTown'], duringFeud: false },
    raise: null,
    prepare: 'nearestTown',
    hangUp: [],
    start: 'answer',
    nodes: {
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
  askHelp: {
    id: 'askHelp',
    once: false,
    ask: { say: 'needAHandHere', when: ['helpAskable'], duringFeud: false },
    raise: null,
    prepare: 'helpAnswer',
    hangUp: [],
    start: 'check',
    nodes: {
      check: {
        line: 'whosOnYou',
        options: [
          { say: 'thatOneOnMyTail', when: ['helpComes'], effects: ['joinFight'], go: 'coming' },
          { say: 'thatOneOnMyTail', when: ['helpRefuses'], effects: ['turnDownCall'], go: 'refused' },
          { say: 'thatOneOnMyTail', when: ['helpOutgunned'], effects: ['turnDownCall'], go: 'outgunned' },
        ],
      },
      coming: { line: 'onMyWay', options: [{ say: 'overAndOut', when: [], effects: [], go: END }] },
      refused: { line: 'notMyFight', options: [{ say: 'understood', when: [], effects: [], go: HUB }] },
      outgunned: { line: 'tooHotForMe', options: [{ say: 'understood', when: [], effects: [], go: HUB }] },
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
    raise: { when: ['playerPatches', 'npcNeedsPatch', 'npcOffRope', 'npcCalm', 'atPeace'], priority: 1, duringFeud: false, duringCombat: false },
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
        line: 'demandCargoOrPay',
        options: [
          { say: 'fineTakeIt', when: [], effects: ['handOver'], go: END },
          { say: 'hereIsYourMoney', when: ['canPayPrice'], effects: ['payDemand'], go: END },
          { say: 'comeAndGetIt', when: [], effects: ['settleRefused'], go: END },
        ],
      },
    },
  },
  demandCut: {
    id: 'demandCut',
    once: true,
    ask: null,
    raise: { when: ['demandsCut'], priority: 3, duringFeud: true, duringCombat: true },
    prepare: 'demandCut',
    hangUp: ['settleDemandRefused'],
    start: 'demand',
    nodes: {
      demand: {
        line: 'demandCutLine',
        options: [
          { say: 'hereIsYourMoney', when: ['canPayPrice'], effects: ['payDemand'], go: END },
          { say: 'comeAndGetIt', when: [], effects: ['settleDemandRefused'], go: END },
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
  surrender: strandedOffer('surrender', 'demandsSurrender', 'surrenderOffer', 'fineTakeIt', 'surrender'),
  giveUp: strandedOffer('giveUp', 'demandsGiveUp', 'giveUpOffer', 'standingDown', 'giveUp'),
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
          { say: 'weBothDriveAway', when: ['accepts', 'trucesForGood'], effects: ['settlePlea'], go: 'agreed' },
          { say: 'weBothDriveAway', when: ['accepts', 'callsPartner'], effects: ['settlePlea'], go: 'agreedForNow' },
          { say: 'weBothDriveAway', when: ['refuses'], effects: ['settlePlea'], go: 'refused' },
          { say: 'weBothDriveAway', when: ['demandsToll', 'noPrice'], effects: [], go: 'demanded' },
          { say: 'weBothDriveAway', when: ['demandsToll', 'namesPrice', 'hasHaul'], effects: [], go: 'tollCargo' },
          { say: 'weBothDriveAway', when: ['demandsToll', 'namesPrice', 'noHaul'], effects: [], go: 'tollCut' },
        ],
      },
      demanded: {
        line: 'noFreeRideDump',
        options: [
          { say: 'fineTakeIt', when: [], effects: ['payToll'], go: END },
          { say: 'comeAndGetIt', when: [], effects: ['refuseToll'], go: END },
        ],
      },
      tollCargo: {
        line: 'noFreeRidePay',
        options: [
          { say: 'fineTakeIt', when: [], effects: ['payToll'], go: END },
          { say: 'hereIsYourMoney', when: ['canPayPrice'], effects: ['payTollMoney'], go: END },
          { say: 'comeAndGetIt', when: [], effects: ['refuseToll'], go: END },
        ],
      },
      tollCut: {
        line: 'noFreeRideCut',
        options: [
          { say: 'hereIsYourMoney', when: ['canPayPrice'], effects: ['payTollMoney'], go: END },
          { say: 'comeAndGetIt', when: [], effects: ['refuseToll'], go: END },
        ],
      },
      agreed: { line: 'fineKeepYourGuns', options: [{ say: 'overAndOut', when: [], effects: [], go: END }] },
      agreedForNow: { line: 'marshalBackWithCompany', options: [{ say: 'overAndOut', when: [], effects: [], go: END }] },
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
          { say: 'takeWhatICarry', when: ['accepts', 'noPrice', 'hasHaul'], effects: ['settlePlea'], go: 'spared' },
          { say: 'takeWhatICarry', when: ['accepts', 'namesPrice', 'hasHaul'], effects: [], go: 'sparedPrice' },
          { say: 'takeWhatICarry', when: ['accepts', 'namesPrice', 'noHaul'], effects: [], go: 'sparedCut' },
          { say: 'takeWhatICarry', when: ['accepts', 'noPrice', 'noHaul'], effects: ['settlePlea'], go: 'sparedFree' },
          { say: 'takeWhatICarry', when: ['refuses'], effects: ['settlePlea'], go: 'refused' },
        ],
      },
      spared: { line: 'leaveItOnThe', options: [{ say: 'going', when: [], effects: [], go: END }] },
      sparedPrice: {
        line: 'leaveItOrPay',
        options: [
          { say: 'fineTakeIt', when: [], effects: ['settlePlea'], go: END },
          { say: 'hereIsYourMoney', when: ['canPayPrice'], effects: ['paySpared'], go: END },
        ],
      },
      sparedCut: {
        line: 'payAndGo',
        options: [{ say: 'hereIsYourMoney', when: ['canPayPrice'], effects: ['paySpared'], go: END }],
      },
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
    ask: { say: 'dropYourCargoOr', when: ['atPeace', 'npcHasCargo', 'noCutRob'], duringFeud: false },
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
  robCut: {
    id: 'robCut',
    once: true,
    ask: { say: 'yourMoneyOr', when: ['atPeace', 'noCargoRob'], duringFeud: false },
    raise: null,
    prepare: 'robCutAnswer',
    hangUp: ['settleRefused'],
    start: 'hear',
    nodes: {
      hear: {
        line: 'sayThatAgain',
        options: [
          { say: 'youHeardMeMoney', when: ['complies', 'namesPrice'], effects: ['settleRobCut'], go: 'comply' },
          { say: 'youHeardMeMoney', when: ['complies', 'noPrice'], effects: ['settleRobCut'], go: 'empty' },
          { say: 'youHeardMeMoney', when: ['resists'], effects: ['settleRobCut'], go: 'fightBack' },
          { say: 'youHeardMeMoney', when: ['runs'], effects: ['settleRobCut'], go: 'flee' },
        ],
      },
      comply: { line: 'allRightPaid', options: [{ say: 'smartChoice', when: [], effects: [], go: END }] },
      empty: { line: 'pocketsEmpty', options: [{ say: 'smartChoice', when: [], effects: [], go: END }] },
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
  lookWarning: {
    id: 'lookWarning',
    once: false,
    ask: null,
    raise: { when: ['lookWarned', 'atPeace', 'npcCalm'], priority: 2, duringFeud: false, duringCombat: false },
    prepare: 'threatAnswer',
    hangUp: ['endLookWarning'],
    start: 'warn',
    nodes: {
      warn: {
        line: 'whatAreYouLookingAt',
        options: [
          { say: 'nothingMovingOn', when: [], effects: ['endLookWarning'], go: END },
          { say: 'yourLoad', when: ['npcHasCargo', 'noCargoRob', 'complies'], effects: ['endLookWarning', 'answerLoadThreat'], go: 'comply' },
          { say: 'yourLoad', when: ['npcHasCargo', 'noCargoRob', 'resists'], effects: ['endLookWarning', 'answerLoadThreat'], go: 'fightBack' },
          { say: 'yourLoad', when: ['npcHasCargo', 'noCargoRob', 'runs'], effects: ['endLookWarning', 'answerLoadThreat'], go: 'flee' },
        ],
      },
      comply: { line: 'allRightItIs', options: [{ say: 'smartChoice', when: [], effects: [], go: END }] },
      fightBack: { line: 'comeAndTakeIt', options: [{ say: 'yourFuneral', when: [], effects: [], go: END }] },
      flee: { line: 'notTodayRun', options: [{ say: 'runThen', when: [], effects: [], go: END }] },
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
    ask: { say: 'yourTruckLooksDead', when: ['playerPatches', 'npcNeedsPatch', 'npcOffRope', 'atPeace'], duringFeud: false },
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
    ask: { say: 'yourEngineSoundsRough', when: ['playerPatches', 'npcWorn', 'npcOffRope', 'npcCalm', 'atPeace'], duringFeud: false },
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
      tell: {
        line: 'maybeIPassedSomething',
        options: [
          { say: 'where', when: ['rumorOfSite'], effects: ['revealRumor', 'settleDone'], go: 'site' },
          { say: 'where', when: ['rumorOfWreck'], effects: ['revealRumor', 'settleDone'], go: 'wreck' },
        ],
      },
      site: {
        line: 'siteWay',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: [], go: HUB },
          { say: 'thanksOverAndOut', when: [], effects: [], go: END },
        ],
      },
      wreck: {
        line: 'wreckWay',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: [], go: HUB },
          { say: 'thanksOverAndOut', when: [], effects: [], go: END },
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
      tell: {
        line: 'tipTold',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: [], go: HUB },
          { say: 'overAndOut', when: [], effects: [], go: END },
        ],
      },
    },
  },
  roadLesson: {
    id: 'roadLesson',
    once: true,
    ask: { say: 'anyTipsForTheRoad', when: ['atPeace'], duringFeud: false },
    raise: null,
    prepare: 'roadLesson',
    hangUp: ['settleDone'],
    start: 'tell',
    nodes: {
      tell: {
        line: 'lessonTold',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: ['settleDone'], go: HUB },
          { say: 'overAndOut', when: [], effects: ['settleDone'], go: END },
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
  ...COURIER_TOPICS,
  ...MOMENT_TOPICS,
});

export { COLD_LINES, HONK_RANGE, TOPIC_GATES, TRAIT_TALK, type TalkGate, type TraitTalk, type Voice } from './personalities';
