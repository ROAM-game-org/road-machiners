import type { Topic, TraitTalk } from './dialogue';

const CAVALCADE_CARS = 8;

export const SUNWARD = {
  cavalcade: CAVALCADE_CARS,
  hunters: 3,
  collapseAt: Math.ceil((CAVALCADE_CARS * 2) / 3),
  startStanding: -20,
  calls: 3,
  callGap: 6,
  offerMargin: 3,
  dragTurns: 120,
  huntChance: 0.45,
  huntCooldownNights: 1,
  huntReach: 70,
  huntBreaks: 2,
  huntSalt: 0x68756e74,
  driveTurns: 45,
  returnMarginTurns: 30,
  avoidMargin: 12,
  avoidCost: 6,
  dropGap: 1.5,
  dropLanes: [-Math.PI / 2, 1.95] as readonly number[],
  approachGap: 3,
  straightReach: 4,
  vigilInset: 3,
  watchers: 2,
};

export type HollowPiece = { look: 'shack' | 'scrapWall' | 'hullChunk' | 'drums' | 'woodpile'; at: { x: number; y: number }; r: number; yaw: number };
export type HollowBay = { x: number; y: number; heading: number };
export type HollowLamp = { x: number; y: number; height: number };

const FACING_SHRINE = -Math.PI / 2;

export const HOLLOW = {
  id: 'sunward-hollow',
  pos: { x: 276, y: 225 },
  radius: 11,
  sightReach: 9,
  pieces: [
    { look: 'hullChunk', at: { x: 0, y: -6 }, r: 1.5, yaw: 0.1 },
    { look: 'shack', at: { x: -4.5, y: -9.5 }, r: 1.4, yaw: 0.35 },
    { look: 'shack', at: { x: 4.5, y: -9.5 }, r: 1.4, yaw: -0.3 },
    { look: 'shack', at: { x: 9.5, y: -5.5 }, r: 1, yaw: -1.1 },
    { look: 'scrapWall', at: { x: -8, y: -3.5 }, r: 0.95, yaw: 1.25 },
    { look: 'scrapWall', at: { x: 8, y: -3.5 }, r: 0.95, yaw: -1.25 },
    { look: 'scrapWall', at: { x: -10.5, y: 2.5 }, r: 0.95, yaw: 1.6 },
    { look: 'scrapWall', at: { x: 2, y: 8.5 }, r: 0.95, yaw: 0.1 },
    { look: 'drums', at: { x: -2.8, y: -5.2 }, r: 0.44, yaw: 0.4 },
    { look: 'drums', at: { x: 2.8, y: -5.2 }, r: 0.44, yaw: -0.2 },
    { look: 'drums', at: { x: -4, y: 8.5 }, r: 0.44, yaw: 1 },
    { look: 'woodpile', at: { x: -10.5, y: 6.5 }, r: 0.63, yaw: 0.8 },
  ] as HollowPiece[],
  bays: [
    { x: -8, y: 0, heading: FACING_SHRINE },
    { x: -4.8, y: 0, heading: FACING_SHRINE },
    { x: -1.6, y: 0, heading: FACING_SHRINE },
    { x: 1.6, y: 0, heading: FACING_SHRINE },
    { x: 4.8, y: 0, heading: FACING_SHRINE },
    { x: 8, y: 0, heading: FACING_SHRINE },
    { x: -6.4, y: 4.5, heading: FACING_SHRINE },
    { x: -3.2, y: 4.5, heading: FACING_SHRINE },
    { x: 0, y: 4.5, heading: FACING_SHRINE },
    { x: 3.2, y: 4.5, heading: FACING_SHRINE },
    { x: 6.4, y: 4.5, heading: FACING_SHRINE },
  ] as HollowBay[],
  lamps: [
    { x: 0, y: -4.4, height: 1.6 },
    { x: -4.5, y: -7.6, height: 2.2 },
    { x: 4.5, y: -7.6, height: 2.2 },
    { x: 0, y: 2.3, height: 0.4 },
  ] as HollowLamp[],
};

export type SunwardTopicId = 'vigilCall1' | 'vigilCall2' | 'vigilCall3' | 'sunwardTalk';
export type SunwardConditionId = 'firstVigilCall' | 'secondVigilCall' | 'lastVigilCall';
export type SunwardEffectId = 'acceptOffering' | 'refuseVigil';
export type SunwardPrepareId = 'vigilCall' | 'craterNews';
export const SUNWARD_LINES = [
  'vigilCall1', 'vigilCall2', 'vigilCall3', 'comeAndWatch', 'notGoing', 'driveIntoTheLight', 'givenBySky',
  'askAboutTheCrater', 'craterNews', 'carsDraggedIntoTheDark', 'crowdAtTheCraterAgain',
] as const;
export type SunwardLineId = (typeof SUNWARD_LINES)[number];

const SUNWARD_END = 'end';
const SUNWARD_HUB = 'hub';

function vigilCall(id: 'vigilCall1' | 'vigilCall2' | 'vigilCall3', when: SunwardConditionId, refusal: SunwardEffectId[]): Topic {
  return {
    id,
    once: false,
    ask: null,
    raise: { when: [when], priority: 9, duringFeud: false, duringCombat: false },
    prepare: 'vigilCall',
    hangUp: refusal,
    start: 'call',
    nodes: {
      call: {
        line: id,
        options: [
          { say: 'comeAndWatch', when: [], effects: ['acceptOffering'], go: 'told' },
          { say: 'notGoing', when: [], effects: refusal, go: SUNWARD_END },
        ],
      },
      told: { line: 'driveIntoTheLight', options: [] },
    },
  };
}

export const SUNWARD_TOPICS: Record<SunwardTopicId, Topic> = {
  vigilCall1: vigilCall('vigilCall1', 'firstVigilCall', []),
  vigilCall2: vigilCall('vigilCall2', 'secondVigilCall', []),
  vigilCall3: vigilCall('vigilCall3', 'lastVigilCall', ['refuseVigil']),
  sunwardTalk: {
    id: 'sunwardTalk',
    once: false,
    ask: { say: 'askAboutTheCrater', when: [], duringFeud: false },
    raise: null,
    prepare: 'craterNews',
    hangUp: [],
    start: 'answer',
    nodes: {
      answer: {
        line: 'craterNews',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: [], go: SUNWARD_HUB },
          { say: 'thanksOverAndOut', when: [], effects: [], go: SUNWARD_END },
        ],
      },
    },
  },
};

export const SUNWARD_TRAIT_TALK: Record<'cultist', TraitTalk> = {
  cultist: { voice: { greeting: 'silent', repeatLine: 'silent', refusal: 'silent', warnOff: 'silent', honksBack: false }, topics: ['vigilCall1', 'vigilCall2', 'vigilCall3'] },
};
