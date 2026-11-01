import type { Topic } from './dialogue';
import { TIME } from './time';

export const ENCOUNTERS = {
  gapTurns: TIME.workDayTurns / 3,
  pendingTurns: 10,
  storyGapTurns: TIME.workDayTurns * 2,
  wrongedTurns: TIME.workDayTurns * 6,
  tip: { valueShare: 0.1 },
  favorShare: 2,
  favorReserve: 5,
};

export type CourierTopicId = 'courierShort' | 'courierThanks' | 'courierSquare' | 'courierCold' | 'courierGrudge' | 'courierFavor';

const COURIER_END = 'end';

export const COURIER_TOPICS: Record<CourierTopicId, Topic> = {
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
          { say: 'noCharge', when: [], effects: ['courierFree'], go: COURIER_END },
          { say: 'atTheTownPrice', when: [], effects: ['courierPaid'], go: COURIER_END },
          { say: 'iCannotHelpSorry', when: [], effects: ['courierRefuse'], go: COURIER_END },
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
      site: { line: 'siteWay', options: [{ say: 'thanksOverAndOut', when: [], effects: ['courierThank'], go: COURIER_END }] },
      wreck: { line: 'wreckWay', options: [{ say: 'thanksOverAndOut', when: [], effects: ['courierThank'], go: COURIER_END }] },
      tip: { line: 'tipTold', options: [{ say: 'thanksOverAndOut', when: [], effects: ['courierThank'], go: COURIER_END }] },
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
      tell: { line: 'courierSquareTip', options: [{ say: 'thanksOverAndOut', when: [], effects: ['courierSquareUp'], go: COURIER_END }] },
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
      cold: { line: 'youLeftMeDry', options: [{ say: 'understood', when: [], effects: ['courierColdShoulder'], go: COURIER_END }] },
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
          { say: 'bringIt', when: [], effects: ['courierFight', 'courierEnd'], go: COURIER_END },
        ],
      },
      agreed: { line: 'fineKeepYourGuns', options: [{ say: 'overAndOut', when: [], effects: ['courierEnd'], go: COURIER_END }] },
      refused: { line: 'tooLateForTalk', options: [{ say: 'thenWeFinishThis', when: [], effects: ['courierEnd'], go: COURIER_END }] },
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
      favor: { line: 'toldYouIOweYou', options: [{ say: 'thanksOverAndOut', when: [], effects: ['courierPayFavor'], go: COURIER_END }] },
    },
  },
};
