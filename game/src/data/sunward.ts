import type { Topic, TraitTalk } from './dialogue';

const CAVALCADE_CARS = 8;
const HOLLOW_POS = { x: 1312, y: 1288 };

export const SUNWARD = {
  cavalcade: CAVALCADE_CARS,
  hunters: 3,
  collapseAt: Math.ceil((CAVALCADE_CARS * 2) / 3),
  startStanding: -20,
  calls: 3,
  callGap: 6,
  offerMargin: 12,
  wordGrace: 1,
  dragTurns: 120,
  huntChance: 0.45,
  huntCooldownNights: 1,
  huntReach: 70,
  huntBreaks: 2,
  huntSalt: 0x68756e74,
  rideLeadTurns: 101,
  driveTurns: 140,
  returnMarginTurns: 19,
  avoidMargin: 12,
  avoidCost: 6,
  dropGap: 1.5,
  dropLanes: [-Math.PI / 2, 1.95] as readonly number[],
  approachGap: 3,
  straightReach: 4,
  vigilInset: 3,
  fileGap: 4,
  memberRadius: 0.8,
  sightMargin: 2,
  meetTurns: 12,
  talkReach: 150,
  postGap: 3,
  postSamples: 96,
  postClearance: 1.6,
  postSpacing: 3.5,
  watchers: 2,
};

export type HollowPiece = { look: 'shack' | 'hullChunk' | 'drums' | 'woodpile'; at: { x: number; y: number }; r: number; yaw: number };
export type HollowBay = { x: number; y: number; heading: number };
export type HollowSpot = { x: number; y: number };

const HOLLOW_RADIUS = 5;
const GATE_BEARING = -1.37;
const BAY_ROW = 2.6;
const BAY_STEP = 2.2;
const BAY_FRONT = 6.3;
const BAYS_IN_FIRST_ROW = 6;
const BAYS_IN_SECOND_ROW = 5;
const GATE_BETWEEN_TOWERS = 20;

export function hollowTurn(gateBearing: number): number {
  return (gateBearing * 180) / Math.PI + GATE_BETWEEN_TOWERS;
}

function inGateFrame(along: number, across: number): HollowSpot {
  const a = { x: Math.cos(GATE_BEARING), y: Math.sin(GATE_BEARING) };
  return { x: a.x * along - a.y * across, y: a.y * along + a.x * across };
}

function bay(along: number, across: number): HollowBay {
  return { ...inGateFrame(along, across), heading: GATE_BEARING - Math.sign(across) * (Math.PI / 4) };
}

function piece(look: HollowPiece['look'], along: number, across: number, r: number, yaw: number): HollowPiece {
  return { look, at: inGateFrame(along, across), r, yaw: GATE_BEARING + yaw };
}

const alongOf = (k: number): number => BAY_FRONT + k * BAY_STEP;
const SECOND_ROW_BAYS = Array.from({ length: BAYS_IN_SECOND_ROW }, (_, k) => BAYS_IN_SECOND_ROW - 1 - k);
const BAY_SPOTS: readonly [number, number][] = [
  [alongOf(BAYS_IN_FIRST_ROW - 1), -BAY_ROW],
  ...SECOND_ROW_BAYS.flatMap((k): [number, number][] => [[alongOf(k), -BAY_ROW], [alongOf(k), BAY_ROW]]),
];

export const HOLLOW = {
  id: 'sunward-hollow',
  pos: HOLLOW_POS,
  radius: HOLLOW_RADIUS,
  bayGap: 0.4,
  maxReach: 19,
  site: {
    id: 'sunward-hollow',
    kind: 'camp' as const,
    pos: HOLLOW_POS,
    radius: HOLLOW_RADIUS,
    turn: hollowTurn(GATE_BEARING),
    gates: [{ x: HOLLOW_POS.x + Math.cos(GATE_BEARING) * HOLLOW_RADIUS, y: HOLLOW_POS.y + Math.sin(GATE_BEARING) * HOLLOW_RADIUS }],
  },
  pieces: [
    piece('hullChunk', -1.6, 0.5, 1.2, 0.1),
    piece('shack', 0.8, 1.5, 1.4, -Math.PI / 2),
    piece('drums', 4.7, 3.9, 0.44, 0.4),
    piece('woodpile', 4.6, -3.9, 0.63, 0.8),
  ] as HollowPiece[],
  bays: BAY_SPOTS.map(([along, across]) => bay(along, across)) as HollowBay[],
  lanterns: [inGateFrame(-1.6, -1)] as HollowSpot[],
  fire: inGateFrame(0.4, -1.6),
};

export type SunwardTopicId = 'vigilCall1' | 'vigilCall2' | 'vigilCall3' | 'sunwardTalk';
export type SunwardConditionId = 'firstVigilCall' | 'secondVigilCall' | 'lastVigilCall' | 'knowsTheCrater';
export type SunwardEffectId = 'acceptOffering' | 'refuseVigil';
export type SunwardPrepareId = 'vigilCall' | 'craterNews';
export const SUNWARD_LINES = [
  'vigilCall1', 'vigilCall2', 'vigilCall3', 'comeAndWatch', 'notGoing', 'driveIntoTheLight', 'givenBySky', 'wordBroken',
  'askAboutTheCrater', 'craterNews', 'carsDraggedIntoTheDark', 'crowdAtTheCraterAgain',
  'craterLamps', 'craterSilentRadio', 'craterFurrows', 'craterDarkBeacons', 'craterDayTrade', 'craterGivenHearsay', 'craterNoLooting',
  'craterLampsStopped', 'craterFortEmpty', 'craterBackAtNight',
] as const;
export type SunwardLineId = (typeof SUNWARD_LINES)[number];

export const CRATER_ACCOUNTS: { standing: readonly SunwardLineId[]; fallen: readonly SunwardLineId[] } = {
  standing: ['craterLamps', 'craterSilentRadio', 'craterFurrows', 'craterDarkBeacons', 'craterDayTrade', 'craterGivenHearsay', 'craterNoLooting', 'carsDraggedIntoTheDark'],
  fallen: ['crowdAtTheCraterAgain', 'craterLampsStopped', 'craterFortEmpty', 'craterBackAtNight'],
};

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
    once: true,
    ask: { say: 'askAboutTheCrater', when: ['knowsTheCrater'], duringFeud: false },
    raise: null,
    prepare: 'craterNews',
    hangUp: ['settleDone'],
    start: 'answer',
    nodes: {
      answer: {
        line: 'craterNews',
        options: [
          { say: 'thanksSomethingElse', when: [], effects: ['settleDone'], go: SUNWARD_HUB },
          { say: 'thanksOverAndOut', when: [], effects: ['settleDone'], go: SUNWARD_END },
        ],
      },
    },
  },
};

export const SUNWARD_TRAIT_TALK: Record<'cultist', TraitTalk> = {
  cultist: { voice: { greeting: 'silent', repeatLine: 'silent', refusal: 'silent', warnOff: 'silent', honksBack: false }, topics: ['vigilCall1', 'vigilCall2', 'vigilCall3'], only: true },
};
