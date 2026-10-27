
import type { Vec } from "../sim/vec";

declare const __MAP_DRAFT__: string;

export type DraftData = {
  mapHash: string;
  oldSpots: { mapHash: string; picks: unknown[] };
  surveySites: { mapHash: string; sites: unknown[] };
  claimClues: { mapHash: string; wrecks: Record<string, unknown> };
  hollow: { pos: Vec; gateBearing: number } | null;
  startDistance: number | null;
};

function draftScale(raw: string): number | null {
  if (raw === '') return null;
  const scale = Number(raw);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`MAP_DRAFT must be a map scale above 0, got ${raw}`);
  return scale;
}

function draftSetting(): string {
  if (typeof __MAP_DRAFT__ === 'string') return __MAP_DRAFT__;
  return (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MAP_DRAFT ?? '';
}

export const MAP_DRAFT = draftScale(draftSetting());

const DRAFT_FILES = import.meta.glob<DraftData>('./drafts/*.json', { eager: true, import: 'default' });

export function draftName(scale: number): string {
  return `draft-${scale}`;
}

function draftFile(scale: number): DraftData {
  const data = DRAFT_FILES[`./drafts/${draftName(scale)}.json`];
  if (!data) throw new Error(`Draft map ${scale} has no data file. Run MAP_DRAFT=${scale} npm run map:draft.`);
  return data;
}

export const DRAFT: DraftData | null = MAP_DRAFT === null ? null : draftFile(MAP_DRAFT);

export type TownDef = { id: string; pos: Vec; radius: number };
export type SiteLocationDef = {
  id: string;
  kind: "oasis" | "convoy" | "landmark" | "camp";
  pos: Vec;
  radius: number;
  edge?: SiteEdge;
  look?: string;
  turn?: number;
  gates?: readonly Vec[];
};
export type TerritoryDef = { id: string; kind: "territory"; pos: Vec; radius: number; outline: Vec[] | null; groundFrom?: Vec; groundOutline?: Vec[] };
export type LocationDef = SiteLocationDef | TerritoryDef;
export type SiteEdge = "fence" | "wrecks";
export const MAP_SCALE = MAP_DRAFT ?? 20.8;
const BASE_MAP_SCALE = 6.5;
export const MAP_SPREAD = MAP_SCALE / BASE_MAP_SCALE;
export const MAP_AREA_SPREAD = MAP_SPREAD * MAP_SPREAD;
export const MAP_GRID = { squares: 8 };

export function scalePoint(p: Vec): Vec {
  return { x: p.x * MAP_SCALE, y: p.y * MAP_SCALE };
}

const BEND = {
  step: 6,
  amplitude: 0.07,
  maxSway: 4,
  wavelength: 45,
};

const OLD_ORCHARD_AT: Vec = { x: 114, y: 284 };

function besideOrchard(x: number, y: number): Vec {
  return { x: ORCHARD_POS.x + x * 5 - OLD_ORCHARD_AT.x + 0.4, y: ORCHARD_POS.y + y * 5 - OLD_ORCHARD_AT.y };
}

const PINNED = new WeakMap<Vec, Vec>();

function pinnedTo(layout: Vec, at: Vec): Vec {
  PINNED.set(layout, at);
  return layout;
}

function scaleRoad(points: Vec[], straight: number[] = []): Vec[] {
  const scaled = points.map((p) => PINNED.get(p) ?? scalePoint(p));
  const out: Vec[] = [scaled[0]];
  for (let i = 1; i < scaled.length; i++) out.push(...(straight.includes(i - 1) ? [scaled[i]] : bend(scaled[i - 1], scaled[i])));
  return out;
}

function bend(a: Vec, b: Vec): Vec[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const count = Math.max(1, Math.round(length / BEND.step));
  const sway = Math.min(BEND.maxSway, length * BEND.amplitude);
  const waves = Math.max(1, Math.round(length / BEND.wavelength));
  const phase = (a.x * 12.9898 + a.y * 78.233 + b.x * 37.719 + b.y * 4.581) % (2 * Math.PI);
  const nx = -(b.y - a.y) / length;
  const ny = (b.x - a.x) / length;
  const points: Vec[] = [];
  for (let k = 1; k <= count; k++) {
    const t = k / count;
    const side = sway * Math.sin(Math.PI * t) * Math.sin(Math.PI * waves * t + phase);
    points.push({ x: a.x + (b.x - a.x) * t + nx * side, y: a.y + (b.y - a.y) * t + ny * side });
  }
  return points;
}

export const FALLEN_SUN_POS = onTile(scalePoint({ x: 64, y: 54 }));
const FALLEN_SUN_OUTLINE: Vec[] = [
  { x: -45.0, y: 0.0 },
  { x: -41.3, y: -15.0 },
  { x: -31.0, y: -26.0 },
  { x: -20.9, y: -33.5 },
  { x: -11.4, y: -39.9 },
  { x: -6.3, y: -44.6 },
  { x: 1.6, y: -45.0 },
  { x: 7.2, y: -40.9 },
  { x: 15.3, y: -47.1 },
  { x: 27.8, y: -44.5 },
  { x: 37.8, y: -37.8 },
  { x: 45.9, y: -26.5 },
  { x: 50.2, y: -8.9 },
  { x: 50.2, y: 8.9 },
  { x: 45.3, y: 21.1 },
  { x: 39.8, y: 33.4 },
  { x: 25.5, y: 44.2 },
  { x: 8.2, y: 46.3 },
  { x: -2.4, y: 55.3 },
  { x: -8.6, y: 78.4 },
  { x: -13.6, y: 101.9 },
  { x: -22.6, y: 115.1 },
  { x: -30.8, y: 114.9 },
  { x: -38.8, y: 110.9 },
  { x: -38.8, y: 95.4 },
  { x: -31.8, y: 72.2 },
  { x: -25.6, y: 49.1 },
  { x: -23.5, y: 40.7 },
  { x: -37.7, y: 26.4 },
  { x: -43.5, y: 11.6 },
];
const ORCHARD_POS = onTile(scalePoint({ x: 22.8, y: 56.8 }));

function onTile(p: Vec): Vec {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}
const ORCHARD_SCREEN_ANGLE = (25 * Math.PI) / 180;
const ORCHARD_SIN_ELEVATION = 0.5;
export const ORCHARD_HEADING = Math.atan2(
  -Math.cos(ORCHARD_SCREEN_ANGLE) - Math.sin(ORCHARD_SCREEN_ANGLE) / ORCHARD_SIN_ELEVATION,
  Math.cos(ORCHARD_SCREEN_ANGLE) - Math.sin(ORCHARD_SCREEN_ANGLE) / ORCHARD_SIN_ELEVATION,
);

export function onOrchardRoad(s: number, c: number): Vec {
  const [cos, sin] = [Math.cos(ORCHARD_HEADING), Math.sin(ORCHARD_HEADING)];
  return { x: s * cos + c * sin, y: s * sin - c * cos };
}

const ORCHARD_SOUTH_EDGE: [number, number][] = [
  [-35, 22],
  [-36, 2],
  [-28, -3],
  [-28, -14],
  [-26, -24],
  [-20, -28],
  [0, -31],
  [20, -35.5],
  [40, -39],
  [50, -42],
  [56, -40],
  [58, -12],
  [59, 3],
  [72, 6],
];
const ORCHARD_OLD_NORTH_EDGE: [number, number][] = [
  [72, 42],
  [54, 40],
  [46, 37],
  [40, 34],
  [-30, 34],
];
const ORCHARD_NORTH_EDGE: [number, number][] = [
  [86, 10],
  [104, 26],
  [122, 38],
  [130, 58],
  [128, 84],
  [114, 102],
  [88, 108],
  [62, 100],
  [46, 76],
  [30, 68],
  [8, 66],
  [-14, 64],
  [-30, 58],
  [-30, 34],
];
export const ORCHARD_FRAME_OUTLINE: Vec[] = [...ORCHARD_SOUTH_EDGE, ...ORCHARD_NORTH_EDGE].map(([s, c]) => ({ x: s, y: c }));
const ORCHARD_OUTLINE: Vec[] = ORCHARD_FRAME_OUTLINE.map(({ x, y }) => onOrchardRoad(x, y));
const ORCHARD_GROUND_OUTLINE: Vec[] = [...ORCHARD_SOUTH_EDGE, ...ORCHARD_OLD_NORTH_EDGE].map(([s, c]) => onOrchardRoad(s, c));

function boundingRadius(outline: readonly Vec[]): number {
  return Math.max(...outline.map((p) => Math.hypot(p.x, p.y)));
}

const ORCHARD_SOUTH = onOrchardRoad(-32, 0);

const RIM_REACH = 0.05;
function edgePoint(from: Vec, to: Vec, centre: Vec, outline: readonly Vec[]): Vec {
  const poly = outline.map((p) => ({ x: centre.x + p.x, y: centre.y + p.y }));
  const d = { x: to.x - from.x, y: to.y - from.y };
  const length = Math.hypot(d.x, d.y);
  const ts = poly.flatMap((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const e = { x: b.x - a.x, y: b.y - a.y };
    const den = d.x * e.y - d.y * e.x;
    if (den === 0) return [];
    const t = ((a.x - from.x) * e.y - (a.y - from.y) * e.x) / den;
    const u = ((a.x - from.x) * d.y - (a.y - from.y) * d.x) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t] : [];
  });
  if (ts.length === 0) throw new Error("The spur road never reaches the outline");
  const t = Math.min(...ts) + RIM_REACH / length;
  return { x: from.x + d.x * t, y: from.y + d.y * t };
}

export const GLASS_FLATS_POS = onTile(scalePoint({ x: 81, y: 75.6 }));
const GLASS_FLATS_OUTLINE: Vec[] = [
  [0, 71],
  [11.25, 61],
  [22.5, 56],
  [33.75, 51],
  [45, 47],
  [56.25, 48],
  [67.5, 49],
  [78.75, 55],
  [90, 67],
  [101.25, 76],
  [112.5, 78],
  [123.75, 66],
  [135, 78],
  [146.25, 90],
  [157.5, 80],
  [168.75, 68],
  [180, 60],
  [-168.75, 58],
  [-157.5, 59],
  [-146.25, 60],
  [-135, 58],
  [-123.75, 62],
  [-112.5, 74],
  [-101.25, 86],
  [-90, 95],
  [-78.75, 95],
  [-67.5, 95],
  [-56.25, 95],
  [-45, 95],
  [-33.75, 95],
  [-22.5, 95],
  [-11.25, 83],
].map(([deg, r]) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) }));
const GLASS_FLATS_S1 = scalePoint({ x: 88, y: 84 });
const GLASS_FLATS_S2 = scalePoint({ x: 97, y: 62 });
const GLASS_FLATS_APPROACHES: Vec[][] = [GLASS_FLATS_S1, GLASS_FLATS_S2].map((from) => [from, edgePoint(from, GLASS_FLATS_POS, GLASS_FLATS_POS, GLASS_FLATS_OUTLINE)]);
export const GLASS_FLATS_ENDS: Vec[] = GLASS_FLATS_APPROACHES.map(([, end]) => ({ x: end.x - GLASS_FLATS_POS.x, y: end.y - GLASS_FLATS_POS.y }));

function fromFallenSun(x: number, y: number): Vec {
  return { x: FALLEN_SUN_POS.x + x, y: FALLEN_SUN_POS.y + y };
}

const ROADHOUSE_JUNCTION = scalePoint({ x: 82, y: 33 });
const ROADHOUSE_FROM_JUNCTION = { x: 16, y: 0 };
const MARSHAL_POST_AT = { x: ROADHOUSE_JUNCTION.x + ROADHOUSE_FROM_JUNCTION.x, y: ROADHOUSE_JUNCTION.y + ROADHOUSE_FROM_JUNCTION.y };

export const BROKEN_WING = {
  road: scalePoint({ x: 70, y: 33 }),
  yaw: 0,
  deckHalf: 19.5,
  mound: { gap: 4.5, flat: 2, bank: 14, height: 1.8 },
  hoopAt: -44,
  trench: { side: -22, half: 30, width: 3, bank: 6, depth: 2 },
};

export function BROKEN_WING_POINT(along: number, across: number): Vec {
  const c = Math.cos(BROKEN_WING.yaw);
  const s = Math.sin(BROKEN_WING.yaw);
  return { x: BROKEN_WING.road.x + c * along - s * across, y: BROKEN_WING.road.y + s * along + c * across };
}

export const RETIRED_SITES: readonly string[] = ['burnt-convoy', 'podfield', 'ridge-wrecks', 'canyon-bridge', 'south-lock', 'broken-wing'];

export const REGION = {
  name: "Icarus",
  size: 120 * MAP_SCALE,
  danger: 1,
  navigation: {
    heuristicWeight: 1.2,
    offRoadCost: 1.75,
    taste: { scale: 40, strength: 0.6 },
    lookahead: 48,
    farWindow: 120,
    slopeCost: 1,
    straighten: 0.05,
    roadShyCost: 6,
    roadShyBand: 10,
    overClimbCost: 40,
    climbStep: 0.05,
    reachClimb: 0.2,
  },
  towns: [
    { id: "bowl", pos: scalePoint({ x: 16, y: 94 }), radius: 28 },
    { id: "nose", pos: scalePoint({ x: 102, y: 35 }), radius: 32 },
  ] as TownDef[],
  locations: [
    { id: "orchard", kind: "territory", pos: ORCHARD_POS, radius: boundingRadius(ORCHARD_OUTLINE), outline: ORCHARD_OUTLINE, groundFrom: { x: 114, y: 284 }, groundOutline: ORCHARD_GROUND_OUTLINE },
    {
      id: "dustwell",
      kind: "oasis",
      pos: scalePoint({ x: 33.8, y: 32 }),
      radius: 6,
    },
    {
      id: "granary",
      kind: "landmark",
      pos: scalePoint({ x: 50, y: 32.8 }),
      radius: 6,
    },
    {
      id: "glass-flats",
      kind: "territory",
      pos: GLASS_FLATS_POS,
      radius: boundingRadius(GLASS_FLATS_OUTLINE),
      outline: GLASS_FLATS_OUTLINE,
      groundFrom: { x: 405, y: 378 },
    },
    {
      id: "green-pit",
      kind: "oasis",
      pos: scalePoint({ x: 71.8, y: 89 }),
      radius: 6,
    },
    {
      id: "pump-station",
      kind: "landmark",
      pos: scalePoint({ x: 40.7, y: 51.7 }),
      radius: 6,
    },
    {
      id: "fallen-sun",
      kind: "territory",
      pos: FALLEN_SUN_POS,
      radius: boundingRadius(FALLEN_SUN_OUTLINE),
      outline: FALLEN_SUN_OUTLINE,
      groundFrom: { x: 320, y: 270 },
    },
    {
      id: "salvage-yard",
      kind: "convoy",
      pos: scalePoint({ x: 82, y: 52.2 }),
      radius: 6,
    },
    {
      id: "scrapjaw",
      kind: "camp",
      pos: scalePoint({ x: 22, y: 14 }),
      radius: 6,
    },
    {
      id: "kiln",
      kind: "camp",
      pos: scalePoint({ x: 66, y: 76 }),
      radius: 6,
    },
    {
      id: "marshal-post",
      kind: "landmark",
      pos: MARSHAL_POST_AT,
      radius: 6,
    },
  ] as LocationDef[],
  roads: [
    scaleRoad([
      { x: 16, y: 94 },
      { x: 20.36277, y: 84.67443 },
      { x: 25, y: 73 },
      pinnedTo({ x: 28, y: 64 }, besideOrchard(28, 64)),
      pinnedTo({ x: 31, y: 54 }, besideOrchard(31, 54)),
      { x: 37, y: 32 },
      { x: 43, y: 30 },
      { x: 50, y: 36 },
      { x: 55, y: 31 },
      { x: 63, y: 20 },
      { x: 70, y: 18 },
      { x: 77, y: 24 },
      { x: 89, y: 26 },
      { x: 96.04384, y: 30.93501 },
      { x: 94.7, y: 35.7 },
      { x: 97.81, y: 40.36 },
      { x: 102, y: 35 },
    ], [0, 3, 15]),
    scaleRoad([
      { x: 16, y: 94 },
      { x: 23.79885, y: 90.5103 },
      { x: 41, y: 87 },
      { x: 50, y: 91 },
      { x: 58, y: 91 },
      { x: 66, y: 96 },
      { x: 73, y: 92 },
      { x: 81, y: 92 },
      { x: 88, y: 84 },
      { x: 95, y: 78 },
      { x: 103, y: 70 },
      { x: 104.88672, y: 58.01449 },
      { x: 105.18, y: 40.98 },
      { x: 102, y: 35 },
    ], [0, 9, 12]),
    scaleRoad([
      pinnedTo({ x: 28, y: 64 }, besideOrchard(28, 64)),
      { x: 36, y: 61 },
      { x: 43, y: 54 },
      { x: 50, y: 49 },
      { x: 51, y: 38 },
      { x: 60, y: 33 },
      { x: 70, y: 33 },
      { x: 82, y: 33 },
    ], [5, 6]),
    scaleRoad([
      { x: 82, y: 33 },
      { x: 77, y: 24 },
    ]),
    scaleRoad([
      { x: 82, y: 33 },
      { x: 82, y: 49 },
    ]),
    scaleRoad([
      { x: 50, y: 36 },
      { x: 47, y: 44 },
      { x: 43, y: 54 },
    ]),
    scaleRoad([
      { x: 58, y: 91 },
      { x: 55, y: 80 },
      { x: 52, y: 71 },
      { x: 48, y: 61 },
      { x: 43, y: 54 },
    ]),
    scaleRoad([
      { x: 82, y: 49 },
      { x: 90, y: 56 },
      { x: 97, y: 62 },
      { x: 103, y: 70 },
    ]),
    [besideOrchard(28, 64), edgePoint(besideOrchard(28, 64), { x: ORCHARD_POS.x + ORCHARD_SOUTH.x, y: ORCHARD_POS.y + ORCHARD_SOUTH.y }, ORCHARD_POS, ORCHARD_OUTLINE)],
    scaleRoad([{ x: 37, y: 32 }, { x: 33.8, y: 32 }], [0]),
    scaleRoad([{ x: 50, y: 36 }, { x: 50, y: 32.8 }], [0]),
    scaleRoad([{ x: 73, y: 92 }, { x: 71.8, y: 89 }], [0]),
    scaleRoad([{ x: 43, y: 54 }, { x: 40.7, y: 51.7 }], [0]),
    scaleRoad([{ x: 82, y: 49 }, { x: 82, y: 52.2 }], [0]),
    ...GLASS_FLATS_APPROACHES,
    scaleRoad([
      { x: 37, y: 32 },
      { x: 29.27781, y: 22.66219 },
      { x: 22, y: 14 },
    ], [1]),
    scaleRoad([
      { x: 55, y: 80 },
      { x: 61.70017, y: 79.93846 },
      { x: 66, y: 76 },
    ], [1]),
    [
      ...scaleRoad([
        { x: 43, y: 54 },
        { x: 50, y: 55 },
        { x: 54, y: 57 },
      ]),
      fromFallenSun(-39.71, 9.9),
    ],
    [
      scalePoint({ x: 82, y: 49 }),
      fromFallenSun(95, -36),
      fromFallenSun(75, -37),
      fromFallenSun(58, -34),
      fromFallenSun(43.01, -21.92),
    ],
    [
      ...scaleRoad([
        { x: 66, y: 76 },
        { x: 73, y: 64 },
      ]),
      fromFallenSun(37.75, 28.44),
    ],
    [ROADHOUSE_JUNCTION, MARSHAL_POST_AT],
  ] as Vec[][],
  roadWidth: 6,
  obstacles: {
    roadWrecks: 39,
    roadWreckShoulder: [0.5, 0.85] as [number, number],
    roadClearance: 1.6,
    siteClearance: 8,
    edgeMargin: 8,
    gap: 0.45,
    maxTries: 20000,
  },
  sites: {
    convoyWrecks: [
      { x: -2.6, y: 0.6 },
      { x: 0.8, y: -2.6 },
      { x: 2.4, y: 2.2 },
      { x: -0.8, y: 2.8 },
    ] as Vec[],
    pondRadius: 2.2,
    pad: { length: 5, width: 7 },
    gateSpacing: 7,
    multiGateRadius: 12,
  },
  settlement: {
    gateWidth: 5,
    fenceHeight: 0.8,
    fenceThickness: 0.15,
    fenceSegment: 1.5,
    wreckHeight: 0.9,
    wreckThickness: 1,
    wreckSegment: 1.1,
    gatePoleHeight: 5.5,
  },
  playerStart: { road: 0, distance: DRAFT?.startDistance ?? 24 * MAP_SCALE, sightMargin: 5, wreck: { ahead: 6, side: 5 } },
};
