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
  driveTurns: 90,
  returnMarginTurns: 45,
  avoidMargin: 12,
  avoidCost: 6,
  dropGap: 1.5,
  dropLanes: [-Math.PI / 2, 1.95] as readonly number[],
  approachGap: 3,
  straightReach: 4,
  vigilInset: 3,
  fileGap: 4,
  apronGap: 4,
  meetTurns: 12,
  talkReach: 150,
  postGap: 3,
  postSamples: 96,
  postClearance: 1.6,
  postSpacing: 3.5,
  watchers: 2,
  gate: { reach: 6, nearby: 40, halfSpan: 1.83 },
  memberRadius: 0.8,
  bayGap: 0.2,
};

export const HOLLOW_GATE_ID = 'hollow-gate';

export type HollowPiece = { look: 'shack' | 'hullChunk' | 'drums' | 'woodpile'; at: { x: number; y: number }; r: number; yaw: number };
export type HollowBay = { x: number; y: number; heading: number };
export type HollowSpot = { x: number; y: number };

const HOLLOW_POS = { x: 276, y: 244 };
const HOLLOW_RADIUS = 9;
const HOLLOW_BAKE_CLEARING = 14;
const GATE_BEARING = 0.47;
const BAY_ROW = 2.6;
const BAY_STEP = 2.3;
const BAY_FRONT = 4.6;
const BACK_BAY = -5.6;
const GATE_BETWEEN_TOWERS = 36;

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

const BAY_SPOTS: readonly [number, number][] = [0, 1, 2, 3, 4].flatMap((k): [number, number][] => [[BAY_FRONT - k * BAY_STEP, -BAY_ROW], [BAY_FRONT - k * BAY_STEP, BAY_ROW]]);

export const HOLLOW = {
  id: 'sunward-hollow',
  pos: HOLLOW_POS,
  radius: HOLLOW_RADIUS,
  bakeClearing: HOLLOW_BAKE_CLEARING,
  sightReach: HOLLOW_RADIUS + 2,
  site: {
    id: 'sunward-hollow',
    kind: 'camp' as const,
    pos: HOLLOW_POS,
    radius: HOLLOW_RADIUS,
    turn: hollowTurn(GATE_BEARING),
    gates: [{ x: HOLLOW_POS.x + Math.cos(GATE_BEARING) * HOLLOW_RADIUS, y: HOLLOW_POS.y + Math.sin(GATE_BEARING) * HOLLOW_RADIUS }],
  },
  pieces: [
    piece('hullChunk', -4, -5.2, 0.8, 0.1),
    piece('shack', 3, -5.4, 1.4, Math.PI / 2),
    piece('shack', -1.5, -5.4, 1.4, Math.PI / 2 + 0.2),
    piece('shack', 0.5, 5.4, 1.4, -Math.PI / 2),
    piece('drums', 0.8, -4.6, 0.44, 0.4),
    piece('drums', -2.5, 4.9, 0.44, 1),
    piece('woodpile', -3.6, 5, 0.63, 0.8),
  ] as HollowPiece[],
  bays: [...BAY_SPOTS.map(([along, across]) => bay(along, across)), bay(BACK_BAY, 0)] as HollowBay[],
  lanterns: [inGateFrame(-5, -4.2)] as HollowSpot[],
  fire: inGateFrame(-5.6, 3.7),
};

export type SunwardTopicId = 'vigilCall1' | 'vigilCall2' | 'vigilCall3' | 'sunwardTalk';
export type SunwardConditionId = 'firstVigilCall' | 'secondVigilCall' | 'lastVigilCall' | 'knowsTheCrater';
export type SunwardEffectId = 'acceptOffering' | 'refuseVigil';
export type SunwardPrepareId = 'vigilCall' | 'craterNews';
export const SUNWARD_LINES = [
  'vigilCall1', 'vigilCall2', 'vigilCall3', 'comeAndWatch', 'notGoing', 'driveIntoTheLight', 'givenBySky',
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
