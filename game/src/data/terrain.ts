
import { PHYSICS } from "./physics";
import { BROKEN_WING, BROKEN_WING_POINT, draftName, FALLEN_SUN_POS, GLASS_FLATS_POS, MAP_AREA_SPREAD, MAP_DRAFT, MAP_SCALE, MAP_SPREAD, REGION, scalePoint } from "./region";
import { FALLEN_SUN_DECKS } from "./territory";
import type { PropKind } from "../sim/terrain";
import type { Vec } from "../sim/vec";

export type TerrainTypeId =
  | "road"
  | "hardpan"
  | "sand"
  | "scrub"
  | "scree"
  | "mud"
  | "gravel"
  | "saltCrust"
  | "asphalt"
  | "ash"
  | "field"
  | "dirtyWater"
  | "toxic"
  | "track"
  | "canal"
  | "concrete"
  | "glass"
  | "blackMud";

export type TerrainType = {
  id: TerrainTypeId;
  speed: number;
  wear: number;
  dust: number;
  grip: number;
  sideGrip: number;
  color: number;
  craters: boolean;
  rut: number;
  paved: boolean;
};

export const TERRAIN_TYPES: Record<TerrainTypeId, TerrainType> = {
  road: { id: "road", speed: 1, wear: 0.5, dust: 0.3, grip: 1, sideGrip: 1, color: 0xa8865a, craters: true, rut: 0, paved: true },
  hardpan: { id: "hardpan", speed: 0.9, wear: 1, dust: 1, grip: 1, sideGrip: 1, color: 0xc8a676, craters: true, rut: 0.5, paved: false },
  sand: { id: "sand", speed: 0.7, wear: 1.2, dust: 1.3, grip: 1, sideGrip: 1, color: 0xdcc08c, craters: true, rut: 0.8, paved: false },
  scrub: { id: "scrub", speed: 0.8, wear: 1.3, dust: 0.7, grip: 1, sideGrip: 1, color: 0xa89a66, craters: true, rut: 0.6, paved: false },
  scree: { id: "scree", speed: 0.55, wear: 2, dust: 0.5, grip: 1, sideGrip: 1, color: 0x9a8a78, craters: true, rut: 0.2, paved: false },
  mud: { id: "mud", speed: 0.45, wear: 1.5, dust: 0.1, grip: 1, sideGrip: 0.5, color: 0x665044, craters: true, rut: 1, paved: false },
  gravel: { id: "gravel", speed: 0.85, wear: 1.4, dust: 0.8, grip: 1, sideGrip: 1, color: 0x9e9489, craters: true, rut: 0.3, paved: false },
  saltCrust: { id: "saltCrust", speed: 0.95, wear: 0.8, dust: 1.2, grip: 1, sideGrip: 1, color: 0xe0d8ba, craters: true, rut: 0.5, paved: false },
  asphalt: { id: "asphalt", speed: 0.98, wear: 0.6, dust: 0.3, grip: 1, sideGrip: 1, color: 0x55565b, craters: true, rut: 0, paved: true },
  ash: { id: "ash", speed: 0.6, wear: 1, dust: 1.6, grip: 1, sideGrip: 1, color: 0x77737a, craters: true, rut: 0.8, paved: false },
  field: { id: "field", speed: 0.8, wear: 1.1, dust: 1.4, grip: 1, sideGrip: 1, color: 0x8e6e4a, craters: true, rut: 0.8, paved: false },
  dirtyWater: { id: "dirtyWater", speed: 0.45, wear: 1.5, dust: 0.1, grip: 1, sideGrip: 0.5, color: 0x55583a, craters: false, rut: 0, paved: false },
  toxic: { id: "toxic", speed: 0.45, wear: 1.8, dust: 0.1, grip: 1, sideGrip: 0.5, color: 0x9aa83c, craters: false, rut: 0, paved: false },
  track: { id: "track", speed: 0.9, wear: 1, dust: 1, grip: 1, sideGrip: 1, color: 0xa88458, craters: true, rut: 0, paved: true },
  canal: { id: "canal", speed: 0.45, wear: 1.5, dust: 0.1, grip: 1, sideGrip: 1, color: 0x5f6f7a, craters: false, rut: 0, paved: false },
  concrete: { id: "concrete", speed: 0.98, wear: 0.6, dust: 0.3, grip: 1, sideGrip: 1, color: 0xa39e94, craters: true, rut: 0, paved: true },
  glass: { id: "glass", speed: 0.95, wear: 0.8, dust: 0.3, grip: 0.2, sideGrip: 0.15, color: 0x86ada3, craters: true, rut: 0.1, paved: false },
  blackMud: { id: "blackMud", speed: 0.4, wear: 1.6, dust: 0.05, grip: 1, sideGrip: 0.45, color: 0x2f2a25, craters: true, rut: 1, paved: false },
};

export type DeckStation = { at: Vec; rise: number };

export type DeckSpec = {
  id: string;
  line: DeckStation[];
  width: number;
  cut: { abutment: number; ramp: number } | null;
  skirt: boolean;
  look?: DeckLook;
};

export type DeckLook = 'ship_flap' | 'ship_wing_deck';

const CANYON_BRIDGE_CENTER = onTileMiddle(scalePoint({ x: 99.7, y: 73.3 }));

function onTileMiddle(p: Vec): Vec {
  return { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 };
}

function offsetFrom(origin: Vec, dx: number, dy: number): Vec {
  return { x: origin.x + dx, y: origin.y + dy };
}

export const CANYON_BRIDGE_GROUND = { id: 'canyon-bridge', pos: CANYON_BRIDGE_CENTER, from: { x: 498.5, y: 366.5 } as Vec, radius: 45 };

const CANYON_BRIDGE: DeckSpec = {
  id: "canyon-bridge",
  line: [
    { at: offsetFrom(CANYON_BRIDGE_CENTER, -1.8 * 5, 1.8 * 5), rise: 0 },
    { at: offsetFrom(CANYON_BRIDGE_CENTER, 1.8 * 5, -1.8 * 5), rise: 0 },
  ],
  width: 8,
  cut: { abutment: 1, ramp: 1.5 },
  skirt: false,
};

const WING_DECK: DeckSpec = {
  id: "broken-wing",
  line: [
    { at: BROKEN_WING_POINT(-BROKEN_WING.deckHalf, 0), rise: 0 },
    { at: BROKEN_WING_POINT(BROKEN_WING.deckHalf, 0), rise: 0 },
  ],
  width: REGION.roadWidth,
  cut: null,
  skirt: true,
};

export type Mound = { center: Vec; radius: number; bank: number; height: number };

const WING_MOUNDS: Mound[] = [-1, 1].map((end) => ({
  center: BROKEN_WING_POINT(end * (BROKEN_WING.deckHalf + BROKEN_WING.mound.gap), 0),
  radius: BROKEN_WING.mound.flat,
  bank: BROKEN_WING.mound.bank,
  height: BROKEN_WING.mound.height,
}));

const TRENCH = BROKEN_WING.trench;

export type Basin = {
  center: Vec;
  floor: Vec[];
  bank: number[];
  rim: number[];
  depth: number;
  floorRelief: { frequency: number; amplitude: number };
  reliefFrom: Vec;
};

const FALLEN_SUN_BASIN: Basin = {
  center: FALLEN_SUN_POS,
  floor: [
    { x: -45.0, y: 0.0 },
    { x: -41.3, y: -15.0 },
    { x: -32.2, y: -27.0 },
    { x: -21.7, y: -34.8 },
    { x: -11.9, y: -41.3 },
    { x: -6.3, y: -44.6 },
    { x: 1.6, y: -45.0 },
    { x: 7.5, y: -42.3 },
    { x: 15.8, y: -48.5 },
    { x: 28.6, y: -45.8 },
    { x: 38.9, y: -38.9 },
    { x: 45.9, y: -26.5 },
    { x: 50.2, y: -8.9 },
    { x: 50.2, y: 8.9 },
    { x: 45.3, y: 21.1 },
    { x: 39.8, y: 33.4 },
    { x: 25.5, y: 44.2 },
    { x: 8.2, y: 46.3 },
    { x: -8.3, y: 47.3 },
    { x: -23.5, y: 40.7 },
    { x: -37.7, y: 26.4 },
    { x: -43.5, y: 11.6 },
  ],
  bank: [12, 10, 4, 3.5, 3.5, 30, 30, 3.5, 3.5, 4, 4, 52, 16, 16, 30, 40, 36, 28, 26, 26, 22, 30],
  rim: [1.0, 1.5, 5.0, 5.5, 5.5, 0, 0, 5.5, 5.5, 5.0, 4.5, 0, 2.0, 2.0, 0.5, 0, 0, 0, 0, 0, 0.5, 0],
  depth: -1.06,
  floorRelief: { frequency: 1 / 16, amplitude: 0.45 },
  reliefFrom: { x: 320, y: 270 },
};

function fromFallenSun(p: Vec): Vec {
  return { x: FALLEN_SUN_POS.x + p.x, y: FALLEN_SUN_POS.y + p.y };
}

export const TERRAIN = {
  octaves: [
    { freq: 1 / (32 * 5), amp: 1.0, seedOffset: 0 },
    { freq: 1 / (14 * 5), amp: 0.7, seedOffset: 1000 },
    { freq: 1 / (5 * 5), amp: 0.38, seedOffset: 2000 },
    { freq: 1 / 7, amp: 0.14, seedOffset: 3000 },
  ],
  flattenMargin: 15,
  roadGrade: 0.12,
  bankGrade: 0.3,
  farmGradeMargin: 4,
  levelMargin: 4,
  height: { hill: 2.1, mountainFrom: 0.32, mountain: 11 },
  relief: { broadFrequency: 1 / 65, broadAmplitude: 2.4, ridgeFrequency: 1 / 18, ridgeAmplitude: 1.2 },
  features: {
    canyon: {
      path: [
        scalePoint({ x: 88, y: 5 }),
        scalePoint({ x: 86, y: 23 }),
        scalePoint({ x: 92, y: 49 }),
        scalePoint({ x: 99, y: 69 }),
        scalePoint({ x: 101.5, y: 88 }),
      ] as Vec[],
      width: 7,
      bank: 18,
      depth: 2.9,
    },
    trench: {
      path: [BROKEN_WING_POINT(-TRENCH.half, TRENCH.side), BROKEN_WING_POINT(TRENCH.half, TRENCH.side)] as Vec[],
      width: TRENCH.width,
      bank: TRENCH.bank,
      depth: TRENCH.depth,
    },
    furrow: {
      path: [{ x: -15.0, y: 56.0 }, { x: -20.7, y: 77.3 }, { x: -26.4, y: 98.5 }].map(fromFallenSun),
      width: 12,
      bank: 12,
      depth: 0.5,
    },
    decks: [CANYON_BRIDGE, WING_DECK, ...FALLEN_SUN_DECKS] as readonly DeckSpec[],
    wing: {
      pos: BROKEN_WING_POINT(BROKEN_WING.hoopAt, 0),
      r: 26.5 / PHYSICS.metersPerTile,
      yaw: BROKEN_WING.yaw,
    },
    dryRiver: {
      path: [
        scalePoint({ x: 7, y: 75 }),
        scalePoint({ x: 28, y: 80 }),
        scalePoint({ x: 48, y: 87 }),
        scalePoint({ x: 58, y: 91 }),
        scalePoint({ x: 70, y: 98 }),
        scalePoint({ x: 80, y: 111 }),
      ] as Vec[],
      width: 5,
      bank: 20,
      depth: 1.3,
    },
    craters: [
      {
        center: scalePoint({ x: 16, y: 94 }),
        radius: 34,
        bank: 24,
        depth: 1.4,
      },
    ] as { center: Vec; radius: number; bank: number; depth: number }[],
    basins: [FALLEN_SUN_BASIN] as Basin[],
    mounds: WING_MOUNDS,
  },
  reliefPx: 45,
  types: {
    screeSlope: 0.35,
    siteMargin: 1,
  },
  drive: {
    maxSlope: 0.6,
    unpavedTopSpeed: 0.9,
  },
  light: { x: -0.6, y: -0.8 },
  slopeShade: 0.9,
  vision: {
    radius: 25,
    farFactor: 1.5,
    eyeHeight: 0.6,
    samplesPerTile: 3,
    raysPerRimTile: 2,
    closeRadius: 3,
    lingerTurns: 2,
    grayFactor: 4,
  },
  fog: {
    seen: { grey: 0.85, bright: 0.9 },
    unseen: { grey: 1, bright: 0.55 },
  },
} as const;

export type RainRules = {
  steps: number;
  rainPerStep: number;
  focusSquarings: number;
  evaporation: number;
  capacity: number;
  minSlope: number;
  pickupRate: number;
  dropRate: number;
  maxDig: number;
  spreadPasses: number;
  spreadRate: number;
};

export type SlumpRules = {
  steps: number;
  restSlope: number;
  slideShare: number;
};

export type WindRules = {
  direction: number;
  slab: number;
  hop: number;
  depositOnSand: number;
  depositOnBare: number;
  shadowSlope: number;
  shadowReach: number;
  sandSlope: number;
  stepsPerCell: number;
};

export type DuneRules = {
  minSand: number;
  fullSand: number;
  maxSlope: number;
  height: number;
  wavelength: number;
  leeShare: number;
  bend: number;
  bendFrequency: number;
  bendSeedOffset: number;
};

export type SandStart = {
  below: number;
  fade: number;
  depth: number;
};

export type GroundRules = {
  washFlow: number;
  gravelSlope: number;
  lakeDepth: number;
  saltDepth: number;
  mudDepth: number;
  looseSand: number;
};

export type BoulderRules = {
  cliffBase: number;
  ridgeTop: number;
  ridgeCurvature: number;
  radius: [number, number];
  crag: { above: number; radius: [number, number] };
};

export const GEOLOGY: { rain: RainRules; slump: SlumpRules; wind: WindRules; dunes: DuneRules; sandStart: SandStart; ground: GroundRules; boulders: BoulderRules } = {
  rain: {
    steps: 160,
    rainPerStep: 0.01,
    focusSquarings: 3,
    evaporation: 0.04,
    capacity: 4,
    minSlope: 0.02,
    pickupRate: 0.05,
    dropRate: 0.3,
    maxDig: 0.5,
    spreadPasses: 2,
    spreadRate: 0.2,
  },
  slump: {
    steps: 40,
    restSlope: 0.9,
    slideShare: 0.5,
  },
  wind: {
    direction: 30,
    slab: 0.06,
    hop: 5,
    depositOnSand: 0.6,
    depositOnBare: 0.4,
    shadowSlope: 0.03,
    shadowReach: 16,
    sandSlope: 0.2,
    stepsPerCell: 120,
  },
  dunes: {
    minSand: 0.15,
    fullSand: 0.5,
    maxSlope: 0.15,
    height: 0.8,
    wavelength: 14,
    leeShare: 0.25,
    bend: 6,
    bendFrequency: 1 / 40,
    bendSeedOffset: 6007,
  },
  sandStart: {
    below: -1.5,
    fade: 1,
    depth: 0.5,
  },
  ground: {
    washFlow: 40,
    gravelSlope: 0.08,
    lakeDepth: 0.4,
    saltDepth: 0.03,
    mudDepth: 0.25,
    looseSand: 0.1,
  },
  boulders: {
    cliffBase: 0.3,
    ridgeTop: 0.05,
    ridgeCurvature: 0.08,
    radius: [0.6, 1.6],
    crag: {
      above: 12.5,
      radius: [1.6, 2.6],
    },
  },
};

export type SettlementRules = {
  seedOffset: number;
  candidateStep: number;
  count: number;
  spacing: number;
  anchorGap: [number, number];
  jitter: number;
  radius: number;
  roadGap: number;
  flatSlope: number;
  houses: [number, number];
  houseRadius: [number, number];
  intactShare: number;
  farmShare: number;
  towerShare: number;
  towerRadius: number;
  placeTries: number;
};

export type OverlookRules = {
  seedOffset: number;
  step: number;
  reach: number;
  drop: number;
  rise: number;
  directions: number;
  flatSlope: number;
  count: number;
  spacing: number;
  roadGap: number;
  radius: [number, number];
  intactShare: number;
};

export type BendRules = {
  seedOffset: number;
  sample: number;
  reach: number;
  angle: number;
  spacing: number;
  chance: number;
  gap: number;
  radius: [number, number];
  gasShare: number;
};

export type HighwayRules = {
  count: number;
  spacing: number;
  maxLength: number;
  bridgeCost: number;
  maxBridge: number;
};

export type OldRoadRules = {
  cell: number;
  maxLink: number;
  maxSlope: number;
  slopeCost: number;
  washCost: number;
  smoothEvery: number;
  sample: number;
  width: number;
  spanRadius: number;
  spanRoadGap: number;
  spanBack: number;
  minBridge: number;
  minDrop: number;
  minGapRatio: number;
  spanGap: number;
  maxBridge: number;
  bridgeCost: number;
  bankBack: number;
};

export type PowerLineRules = {
  seedOffset: number;
  roadShare: number;
  minLength: number;
  spacing: number;
  gap: number;
  radius: number;
  missingShare: number;
};

export type BillboardRules = {
  seedOffset: number;
  approach: number[];
  straightStep: number;
  straightReach: number;
  straightness: number;
  straightChance: number;
  spacing: number;
  gap: number;
  radius: number;
};

export type TankRules = {
  seedOffset: number;
  chance: number;
  along: [number, number];
  group: [number, number];
  spread: number;
  gap: number;
  radius: number;
  placeTries: number;
};

export type DebrisLook = { look: PropKind; weight: number; radius: [number, number]; aligned: boolean };

export type ShipDebrisRules = {
  seedOffset: number;
  trail: Vec[];
  clusterStep: number;
  sideSpread: number;
  spreadFrom: number;
  clusterReach: number;
  pieces: [number, number];
  yawJitter: number;
  uprangeLooks: DebrisLook[];
  trailLooks: DebrisLook[];
  podField: { count: number; along: number; spread: number; look: DebrisLook };
  strays: { count: number; looks: DebrisLook[] };
  placeTries: number;
};

export type FieldRules = {
  seedOffset: number;
  perFarm: [number, number];
  side: [number, number];
  gap: number;
  reach: number;
  flatSlope: number;
  lowRise: number;
  minShare: number;
  tries: number;
};

const layoutPoints = (points: [number, number][]): Vec[] => points.map(([x, y]) => scalePoint({ x, y }));

const FURROW_TAIL = TERRAIN.features.furrow.path[TERRAIN.features.furrow.path.length - 1];

export const DESCENT_PATH: Vec[] = [
  GLASS_FLATS_POS,
  ...layoutPoints([
    [94, 107.5],
    [80, 104],
    [68, 96],
    [61, 84],
    [59.5, 72],
  ]),
  FURROW_TAIL,
  ...[...TERRAIN.features.furrow.path].reverse().slice(1),
  FALLEN_SUN_POS,
];

export const OLD_WORLD: {
  settlements: SettlementRules;
  overlooks: OverlookRules;
  bends: BendRules;
  oldRoads: OldRoadRules;
  highway: HighwayRules;
  powerLines: PowerLineRules;
  billboards: BillboardRules;
  tanks: TankRules;
  fields: FieldRules;
  shipDebris: ShipDebrisRules;
} = {
  settlements: {
    seedOffset: 7001,
    candidateStep: 4,
    count: Math.round(24 * MAP_AREA_SPREAD),
    spacing: 45,
    anchorGap: [12, 80],
    jitter: 0.5,
    radius: 5,
    roadGap: 3,
    flatSlope: 0.12,
    houses: [3, 7],
    houseRadius: [0.9, 1.3],
    intactShare: 0.25,
    farmShare: 0.4,
    towerShare: 0.5,
    towerRadius: 1.2,
    placeTries: 12,
  },
  overlooks: {
    seedOffset: 7002,
    step: 3,
    reach: 10,
    drop: 2,
    rise: 0.5,
    directions: 3,
    flatSlope: 0.15,
    count: Math.round(17 * MAP_AREA_SPREAD),
    spacing: 60,
    roadGap: 3,
    radius: [1, 1.4],
    intactShare: 0.4,
  },
  bends: {
    seedOffset: 7003,
    sample: 2,
    reach: 8,
    angle: 35,
    spacing: 40,
    chance: 0.6,
    gap: 2,
    radius: [1, 1.4],
    gasShare: 0.4,
  },
  oldRoads: {
    cell: 4,
    maxLink: 120,
    maxSlope: 0.35,
    slopeCost: 6,
    washCost: 4,
    smoothEvery: 3,
    sample: 0.5,
    width: 5,
    spanRadius: 1.5,
    spanRoadGap: 1,
    spanBack: 12,
    minBridge: 6,
    minDrop: 1,
    minGapRatio: 0.05,
    spanGap: 1.5,
    maxBridge: 40,
    bridgeCost: 1.5,
    bankBack: 3,
  },
  highway: {
    count: Math.round(5 * MAP_AREA_SPREAD),
    spacing: 80,
    maxLength: 400,
    bridgeCost: 1.2,
    maxBridge: 80,
  },
  powerLines: {
    seedOffset: 7005,
    roadShare: 0.6,
    minLength: 60,
    spacing: 14,
    gap: 1,
    radius: 0.3,
    missingShare: 0.15,
  },
  billboards: {
    seedOffset: 7006,
    approach: [25, 50],
    straightStep: 20,
    straightReach: 30,
    straightness: 0.985,
    straightChance: 0.3,
    spacing: 70,
    gap: 1.5,
    radius: 1.6,
  },
  tanks: {
    seedOffset: 7007,
    chance: 0.5,
    along: [10, 30],
    group: [2, 4],
    spread: 4,
    gap: 1,
    radius: 1.5,
    placeTries: 6,
  },
  shipDebris: {
    seedOffset: 7009,
    trail: DESCENT_PATH,
    clusterStep: 28,
    sideSpread: 22,
    spreadFrom: 0.3,
    clusterReach: 6,
    pieces: [4, 7],
    yawJitter: 0.5,
    uprangeLooks: [
      { look: 'escapePod', weight: 5, radius: [0.6, 0.6], aligned: false },
      { look: 'wingShard', weight: 3, radius: [1.75, 1.75], aligned: true },
      { look: 'hullChunk', weight: 2, radius: [0.8, 1.1], aligned: true },
    ],
    trailLooks: [
      { look: 'hullChunk', weight: 4, radius: [0.8, 1.5], aligned: true },
      { look: 'wingShard', weight: 1, radius: [1.75, 1.75], aligned: true },
      { look: 'escapePod', weight: 1, radius: [0.6, 0.6], aligned: false },
      { look: 'habitat', weight: 1, radius: [2, 2], aligned: true },
      { look: 'powerCell', weight: 2, radius: [0.4, 0.4], aligned: false },
    ],
    podField: { count: 60, along: 0.3, spread: 70, look: { look: 'escapePod', weight: 1, radius: [0.6, 0.6], aligned: false } },
    strays: {
      count: 30,
      looks: [
        { look: 'escapePod', weight: 5, radius: [0.6, 0.6], aligned: false },
        { look: 'hullChunk', weight: 3, radius: [0.8, 1.5], aligned: false },
        { look: 'powerCell', weight: 1, radius: [0.4, 0.4], aligned: false },
      ],
    },
    placeTries: 24,
  },
  fields: {
    seedOffset: 7008,
    perFarm: [2, 4],
    side: [6, 14],
    gap: 2,
    reach: 12,
    flatSlope: 0.1,
    lowRise: 0.5,
    minShare: 0.6,
    tries: 8,
  },
};

export type MapSpot = { name: string; center: Vec; side: number };

const SITE_SURROUND = 20;

export const MAPGEN = {
  seed: 1337,
  groundHold: 40,
  groundFeather: 40,
  file: MAP_DRAFT === null ? 'maps/icarus.bin' : `drafts/${draftName(MAP_DRAFT)}.bin`,
  heightScale: 300,
  overviewPxPerTile: 2,
  closeUpPxPerTile: 8,
  closeUps: [
    ...[...REGION.towns, ...REGION.locations].map((site) => ({ name: site.id, center: site.pos, side: 2 * (site.radius + SITE_SURROUND) })),
    { name: 'bridge', center: { x: (CANYON_BRIDGE.line[0].at.x + CANYON_BRIDGE.line[1].at.x) / 2, y: (CANYON_BRIDGE.line[0].at.y + CANYON_BRIDGE.line[1].at.y) / 2 }, side: 60 },
    { name: 'wing', center: BROKEN_WING_POINT(0, -2), side: 120 },
    { name: 'dry-river', center: scalePoint({ x: 48, y: 87 }), side: 120 },
    { name: 'canyon', center: scalePoint({ x: 94, y: 48 }), side: 100 },
    { name: 'sand', center: scalePoint({ x: 78, y: 70 }), side: 100 },
  ] as MapSpot[],
};

export type PoolRules = {
  minDepth: number;
  maxTiles: number;
  toxicReach: number;
};

export type ScrubRules = {
  seedOffset: number;
  seedFlow: number;
  seedChance: number;
  poolReach: number;
  oasisReach: number;
  steps: number;
  spread: number;
  dryShare: number;
};

export type CampRules = {
  seedOffset: number;
  radius: number;
  siteGap: number;
  roadGap: number;
  flatSlope: number;
  spacing: number;
  tries: number;
  siteChance: number;
  ruinChance: number;
  junctionChance: number;
  junctionReach: number;
  clusterReach: number;
  clusterMin: number;
  shacks: [number, number];
  shackRadius: [number, number];
  junk: [number, number];
  junkRadius: [number, number];
  innerGap: number;
  placeTries: number;
  fenceArc: [number, number];
  fenceMissing: number;
  fenceRoadGap: number;
};

export type FieldFenceRules = {
  seedOffset: number;
  minTiles: number;
  angleStep: number;
  edgeChance: number;
  missingShare: number;
  roadGap: number;
};

export type CarWreckRules = {
  seedOffset: number;
  radius: number;
  roadStep: number;
  roadChance: number;
  shoulder: [number, number];
  skew: number;
  oldRoadChance: number;
  oldRoadGap: number;
  campChance: number;
  campGroup: [number, number];
  campSpread: number;
  washChance: number;
  placeTries: number;
};

export const NEW_WORLD: {
  fenceLength: number;
  pools: PoolRules;
  scrub: ScrubRules;
  camps: CampRules;
  fieldFences: FieldFenceRules;
  carWrecks: CarWreckRules;
} = {
  fenceLength: 1,
  pools: {
    minDepth: 0.05,
    maxTiles: 40,
    toxicReach: 20,
  },
  scrub: {
    seedOffset: 8002,
    seedFlow: 0.4,
    seedChance: 0.5,
    poolReach: 2,
    oasisReach: 12,
    steps: 6,
    spread: 0.35,
    dryShare: 0.15,
  },
  camps: {
    seedOffset: 8003,
    radius: 5,
    siteGap: 2,
    roadGap: 2,
    flatSlope: 0.15,
    spacing: 30,
    tries: 16,
    siteChance: 0.7,
    ruinChance: 0.5,
    junctionChance: 0.5,
    junctionReach: 15,
    clusterReach: 8,
    clusterMin: 3,
    shacks: [2, 5],
    shackRadius: [0.6, 0.9],
    junk: [1, 3],
    junkRadius: [0.35, 0.6],
    innerGap: 1.5,
    placeTries: 12,
    fenceArc: [0.3, 0.65],
    fenceMissing: 0.1,
    fenceRoadGap: 1,
  },
  fieldFences: {
    seedOffset: 8004,
    minTiles: 12,
    angleStep: 2,
    edgeChance: 0.5,
    missingShare: 0.15,
    roadGap: 1,
  },
  carWrecks: {
    seedOffset: 8005,
    radius: 0.6,
    roadStep: 25,
    roadChance: 0.25,
    shoulder: [0.5, 2],
    skew: 30,
    oldRoadChance: 0.005,
    oldRoadGap: 1,
    campChance: 0.6,
    campGroup: [1, 3],
    campSpread: 4,
    washChance: 0.003,
    placeTries: 8,
  },
};

export const ROCK_LOOKS = [
  { model: 'rock', weight: 0.5 },
  { model: 'rock_slab', weight: 0.3 },
  { model: 'rock_split', weight: 0.2 },
] as const;

export type RoadsideBand = readonly [number, number];

function spreadBand(band: RoadsideBand, factor: number): RoadsideBand {
  return [Math.round(band[0] * factor), Math.round(band[1] * factor)];
}

export const ROADSIDE = {
  seedOffset: 7401,
  slopeShare: 0.6,
  edgeGap: 0.6,
  propGapSlack: 0.0001,
  rowGuard: { turn: 0.05, line: 0.15 },
  groundTypes: ['hardpan', 'sand', 'scrub', 'gravel', 'ash', 'saltCrust'] as readonly TerrainTypeId[],
  signs: {
    radius: 0.25,
    step: 10,
    chance: 0.75,
    spacing: 16,
    gap: 0.5,
    spread: 1.2,
    yawJitter: 0.5,
    oldRoadChance: 0.02,
    oldRoadSpacing: 22,
    band: spreadBand([104, 208], MAP_SPREAD),
  },
  boards: {
    radius: 0.55,
    along: [11, 22] as readonly [number, number],
    chance: 0.5,
    step: 40,
    stepChance: 0.6,
    gap: 1.2,
    spread: 0.8,
    yawJitter: 0.2,
    band: spreadBand([20, 52], MAP_SPREAD),
  },
  barrels: {
    radius: 0.15,
    wreckChance: 0.3,
    houseChance: 0.4,
    houseLooks: ['ruin', 'shack', 'house'] as readonly string[],
    reach: [0.4, 1.4] as readonly [number, number],
    band: spreadBand([104, 260], MAP_AREA_SPREAD),
  },
  heaps: {
    radius: 0.44,
    tries: 4,
    campChance: 0.6,
    tankChance: 0.5,
    junkChance: 0.5,
    reach: [0.6, 1.6] as readonly [number, number],
    band: spreadBand([20, 52], MAP_SPREAD),
  },
  trees: {
    radius: 0.3,
    washBank: 0.5,
    washChance: 0.004,
    yardChance: 0.5,
    yardLooks: ['ruin', 'house'] as readonly string[],
    yardReach: [1, 2.2] as readonly [number, number],
    fieldChance: 0.006,
    group: [1, 3] as readonly [number, number],
    groupSpread: 1.4,
    band: spreadBand([186, 374], MAP_AREA_SPREAD),
  },
};

export type BoatKind = { kind: 'fishingBoat' | 'riverBarge' | 'skiff'; radius: number; weight: number };

export const BOATS = {
  seedOffset: 7601,
  kinds: [
    { kind: 'fishingBoat', radius: 1.4, weight: 3 },
    { kind: 'riverBarge', radius: 1.9, weight: 1 },
    { kind: 'skiff', radius: 0.7, weight: 4 },
  ] as readonly BoatKind[],
  group: [1, 3] as readonly [number, number],
  maxBarges: 1,
  groupReach: 4,
  groupGap: 30,
  passLane: 3,
  roadGap: 4,
  relief: 0.9,
  placeTries: 14,
  groundTypes: ['hardpan', 'sand', 'scrub', 'gravel', 'ash', 'saltCrust'] as readonly TerrainTypeId[],
  river: { step: 70, jitter: 15, chance: 0.7, bankShare: [0.55, 0.85] as readonly [number, number], band: spreadBand([4, 7], MAP_SPREAD) },
  wash: { reach: 70, minFlow: 0.5, groups: 2, band: [1, 2] as RoadsideBand },
  boatBand: spreadBand([8, 20], MAP_SPREAD),
};

export type ZoneKind = 'mountains' | 'desert' | 'swamp' | 'farmBelt' | 'crash';
export type ZoneShape = { polygon: Vec[] } | { path: Vec[]; width: number };
export type Zone = { kind: ZoneKind; shape: ZoneShape };
export type ZoneRules = { roughness: number; uplift: number };

export const ZONES: readonly Zone[] = [
  { kind: 'mountains', shape: { polygon: layoutPoints([[84, -4], [124, -4], [124, 74], [110, 70], [104, 52], [96, 46], [89, 32], [85, 14]]) } },
  { kind: 'desert', shape: { polygon: layoutPoints([[76, 60], [98, 56], [124, 64], [124, 124], [66, 124], [62, 102], [70, 80]]) } },
  { kind: 'swamp', shape: { polygon: layoutPoints([[-4, 16], [18, 15], [28, 25], [27, 40], [14, 46], [-4, 42]]) } },
  { kind: 'farmBelt', shape: { polygon: layoutPoints([[-4, 48], [32, 46], [42, 62], [50, 80], [54, 97], [32, 106], [10, 124], [-4, 124]]) } },
  { kind: 'crash', shape: { path: DESCENT_PATH, width: 5 * MAP_SCALE } },
];

export const ZONE_RULES: Record<ZoneKind, ZoneRules> = {
  mountains: { roughness: 0.5, uplift: 1 },
  desert: { roughness: 0.25, uplift: 0.15 },
  swamp: { roughness: 0.3, uplift: 0 },
  farmBelt: { roughness: 0.3, uplift: 0.1 },
  crash: { roughness: 0.55, uplift: 0.3 },
};

export const ZONE_FIELD = {
  cell: 8,
  band: 9 * MAP_SCALE,
  warp: { frequency: 1 / (14 * MAP_SCALE), reach: 4 * MAP_SCALE, seedOffset: 8800 },
  plainRoughness: 0.4,
};

export const UPLIFT = {
  floor: 0.12,
  rim: { width: 16 * MAP_SCALE, rate: 0.05, flatUnder: { desert: 0.85, swamp: 0.95 }, gaps: [{ at: scalePoint({ x: -2, y: 75 }), width: 9 * MAP_SCALE }, { at: scalePoint({ x: 82, y: 122 }), width: 9 * MAP_SCALE }] },
  range: { spine: layoutPoints([[94, -4], [103, 12], [112, 24], [113, 40], [117, 58]]), width: 14 * MAP_SCALE, rate: 0.28, crestNoise: 0.45, crestFrequency: 1 / (9 * MAP_SCALE) },
  seedOffset: 8900,
};

export const RELIEF_SOLVE = {
  cell: 4,
  steps: 300,
  dt: 3,
  jitter: 0.3,
  jitterSeed: 8950,
  erosion: 0.05,
  areaExponent: 0.5,
  diffusion: 0.04,
  baseLevel: 0,
  hold: { margin: 40 },
  roadBed: { width: 70, passes: 3 },
};

export const DESERT = {
  seedOffset: 9400,
  wavelength: 42,
  height: [1.5, 3] as [number, number],
  cover: [0.5, 0.85] as [number, number],
  leeShare: 0.12,
  warp: { frequency: 1 / 90, reach: 14 },
  breaks: { length: 30, from: 0.3, to: 0.5 },
  pondless: 0.1,
  mantle: 0.35,
  keepOff: 40,
  star: { at: scalePoint({ x: 113, y: 84 }), radius: 48, height: 6, arms: 3 },
};

export const FARM_BELT = {
  seedOffset: 9600,
  headgates: [
    { at: scalePoint({ x: 9, y: 72.5 }), bank: -1 },
    { at: scalePoint({ x: 9, y: 77.5 }), bank: 1 },
  ],
  canal: { step: 4, fall: 0.0015, cutDepths: 3, turns: [-60, -30, -15, 0, 15, 30, 60], turnCost: 0.004, maxLength: 1500, width: 1.6, depth: 0.9, bank: 0.3, bankWidth: 3.5, wetReach: 380, lateralWidth: 1.1, lateralDepth: 0.6, lateralLength: 420 },
  cell: 178,
  plots: 3,
  plotInset: 2,
  command: 0.25,
  weight: 0.35,
  shares: { field: 0.55, grove: 0.14 },
  grove: { row: 3.2, step: 2.6, missing: 0.4, radius: [0.55, 0.75] as [number, number] },
  track: { width: 1.5, breakLength: 40, intactFrom: 0.75, intactTo: 0.3, reach: 2200 },
  farmstead: { share: 0.5, spread: 9, houses: [1, 3] as [number, number], houseRadius: [0.9, 1.3] as [number, number], barnRadius: 3.7, siloRadius: 1.2, barnShare: 0.6, tries: 12 },
  keepOff: 25,
};

export const CRASH = {
  seedOffset: 9500,
  glassTrail: { share: 0.4, width: [95, 14] as [number, number], cover: 0.55, cell: 6, stretch: 5 },
  apron: { tries: 2600, rim: 55, reach: 260, falloff: 3, downrange: 0.85, bareBelow: -0.35, radius: [0.7, 1.6] as [number, number], shards: 0.25 },
};

export const SWAMP = {
  seedOffset: 9300,
  outflow: Math.PI * 0.62,
  table: { core: 0, edge: -1.2 },
  water: 0.45,
  mud: -0.25,
  scrubShare: 0.55,
  scrubGrain: 7,
  slough: { width: 9, length: 80, depth: 0.55, from: 0.58 },
  trees: { tries: 900, radius: [0.5, 0.8] as [number, number] },
  wrecks: { tries: 40, radius: 0.6 },
  channel: { path: layoutPoints([[9, 44], [10.5, 48], [8, 52], [7.5, 56], [9.5, 60], [6.5, 64], [5.5, 68], [8, 72], [7, 75]]), width: 2.5, depth: 0.5 },
};
