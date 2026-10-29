
export type FortressShape = 'circle' | 'square' | 'bastioned';
export type FortressStyle = 'pumpworks' | 'cistern' | 'shipMetal' | 'scrap' | 'patchwork' | 'compound' | 'ring' | 'yard' | 'outpost';
export type FortressKind = 'wall' | 'tower' | 'gate' | 'inner';
export type FortressBastions = { capitals: readonly number[]; curtain: number; salient: number; gorge: number; flank: number };
export type FortressPit = { margin: number; terraceWidth: number; stepHeight: number; terraces: number };
export type FortressRock = { from: number; to: number };
export type FortressSite = { shape: FortressShape; turn: number; style: FortressStyle; bastions?: FortressBastions; roadFort?: boolean; towers?: boolean; towerEvery?: number; pit?: FortressPit; rock?: readonly FortressRock[] };

export type FortressGate = { width: number; depth: number; height: number };
export type FortressStyleDef = { flush: boolean; gate: FortressGate; gateFlare: number; pieces: readonly FortressKind[] };

export const FORTRESS_SITES: Record<string, FortressSite> = {
  bowl: {
    shape: 'bastioned',
    turn: 0,
    style: 'patchwork',
    bastions: { capitals: [-85.34, -44.52, -3.7, 60, 128, 198], curtain: 21.5, salient: 26.75, gorge: 2.5, flank: 2.5 },
    pit: { margin: 1, terraceWidth: 1.8, stepHeight: 0.5, terraces: 4 },
  },
  nose: { shape: 'circle', turn: 8, style: 'shipMetal', towerEvery: 3, rock: [{ from: 228, to: 352 }] },
  dustwell: { shape: 'square', turn: 45, style: 'compound' },
  'green-pit': { shape: 'circle', turn: 8, style: 'cistern' },
  'pump-station': { shape: 'square', turn: 0, style: 'pumpworks' },
  granary: { shape: 'circle', turn: 36, style: 'ring', towers: false },
  'salvage-yard': { shape: 'square', turn: 45, style: 'yard' },
  outpost: { shape: 'square', turn: 0, style: 'outpost', roadFort: true },
  scrapjaw: { shape: 'circle', turn: -10, style: 'scrap' },
  kiln: { shape: 'square', turn: 93, style: 'scrap' },
  'marshal-post': { shape: 'square', turn: 0, style: 'compound' },
  'sunward-hollow': { shape: 'circle', turn: 0, style: 'scrap' },
};

export const NOSE_FRONT = 82.85;

export const NOSE_ROCK = { seed: 4111, front: 2.5, jag: 2, jagCell: 4, run: 26, inner: 8, blend: 10, rough: 2.5, roughCell: 9, clear: 4, ramp: 6, ship: { from: -38, to: 3, axis: 10, half: 5, fade: 4 } };

export const FORTRESS = {
  inset: 1.25,
  wallLength: 2,
  wallDepth: 0.75,
  stretch: [0.6, 1.6] as [number, number],
  towerSize: 1.5,
  gate: { width: 5, depth: 2.5, height: 4 } as FortressGate,
  innerWidth: 3,
  circleTowerEvery: 5,
  flankMin: 2,
  gateClearance: 1,
};

const DEEP_GATE = { flush: false, gate: FORTRESS.gate, gateFlare: 0.08 };
const DEEP_PIECES = ['wall', 'tower', 'gate', 'inner'] as const;

export const FORTRESS_STYLES: Record<FortressStyle, FortressStyleDef> = {
  pumpworks: { ...DEEP_GATE, pieces: DEEP_PIECES },
  cistern: { ...DEEP_GATE, pieces: DEEP_PIECES },
  scrap: { ...DEEP_GATE, pieces: DEEP_PIECES },
  patchwork: { flush: true, gate: { width: 3, depth: 1.25, height: 3 }, gateFlare: 0, pieces: ['wall', 'tower', 'gate'] },
  compound: { flush: true, gate: { width: 2, depth: 1, height: 3 }, gateFlare: 0, pieces: ['wall', 'tower', 'gate'] },
  ring: { flush: true, gate: { width: 2, depth: 1, height: 3 }, gateFlare: 0, pieces: ['wall', 'gate'] },
  yard: { flush: true, gate: { width: 2.5, depth: 1, height: 3 }, gateFlare: 0, pieces: ['wall', 'tower', 'gate'] },
  shipMetal: { flush: true, gate: { width: 6, depth: 1.5, height: 4.5 }, gateFlare: 0, pieces: ['wall', 'tower', 'gate'] },
  outpost: { flush: true, gate: { width: 6, depth: 0.75, height: 4 }, gateFlare: 0, pieces: ['wall', 'tower', 'gate'] },
};

export type FortressLampPiece = 'wall' | 'tower' | 'gate';
export type FortressLampMount = { face: number; height: number };

export const FORTRESS_LAMPS: Record<FortressStyle, Partial<Record<FortressLampPiece, FortressLampMount>>> = {
  pumpworks: { wall: { face: 0.24, height: 2.3 }, tower: { face: 0.63, height: 2.3 }, gate: { face: 0.23, height: 1.6 } },
  cistern: { wall: { face: 0.16, height: 2.3 }, tower: { face: 0.65, height: 2.9 }, gate: { face: 0.09, height: 1 } },
  shipMetal: { wall: { face: 0.32, height: 2.3 }, tower: { face: 0.65, height: 2.3 }, gate: { face: 0.08, height: 1.6 } },
  scrap: { wall: { face: 0.34, height: 2.3 }, tower: { face: 0.61, height: 2.3 }, gate: { face: 0.35, height: 1.6 } },
  patchwork: { wall: { face: 0.35, height: 2.3 }, tower: { face: 0.71, height: 2.3 }, gate: { face: 0.15, height: 1.6 } },
  compound: { wall: { face: 0.34, height: 2.3 }, tower: { face: 0.65, height: 2.3 }, gate: { face: 0.13, height: 2.4 } },
  ring: { wall: { face: 0.34, height: 2.3 }, gate: { face: 0.02, height: 2 } },
  yard: { wall: { face: 0.27, height: 2.3 }, tower: { face: 0.65, height: 2.3 }, gate: { face: 0.18, height: 1.6 } },
  outpost: { wall: { face: 0.26, height: 2.3 }, tower: { face: 0.62, height: 2.3 }, gate: { face: 0, height: 3.2 } },
};
