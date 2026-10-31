
import type { GameModeId, MapKind, ModeRules, WorldSettings } from '../sim/types';
import { GAME_OPENED_QUESTS } from './quests';
import { NPC_BEHAVIOR } from './npc-behavior';
import { UNPRICED_WEAPONS } from './weapons';
import type { GearRules } from '../sim/npc-loadout';
import type { GearLevel } from './npcs';
import type { PartKind } from './parts';
import type { PropKind } from '../sim/terrain';
import type { TerrainTypeId } from './terrain';

export type GameMode = { rules: ModeRules; kit: string | null; map: MapKind; opening: string | null };

const OPEN_WORLD: ModeRules = { traffic: true, looting: true, npcKnockouts: true, playerKnockouts: true, yielding: true, radio: true, rescue: true, roadWrecks: true, run: false, standing: true, bounties: true };
const RUN: ModeRules = { traffic: false, looting: false, npcKnockouts: true, playerKnockouts: false, yielding: false, radio: false, rescue: false, roadWrecks: false, run: true, standing: false, bounties: false };

export const GAME_MODES: Record<GameModeId, GameMode> = {
  roaming: { rules: OPEN_WORLD, kit: null, map: 'icarus', opening: null },
  chaosHighway: { rules: RUN, kit: 'chaosHighway', map: 'highway', opening: GAME_OPENED_QUESTS.chaosHighwayIntro },
};

export type WorldSettingDef = { default: number; min: number; max: number; step: number; modes: readonly GameModeId[] };
const EVERY_MODE: readonly GameModeId[] = ['roaming', 'chaosHighway'];

export const WORLD_SETTINGS: Record<keyof WorldSettings, WorldSettingDef> = {
  damage: { default: 1, min: 0.5, max: 2, step: 0.25, modes: EVERY_MODE },
  fuelUse: { default: 1, min: 0.5, max: 2, step: 0.25, modes: EVERY_MODE },
  supplyUse: { default: 1, min: 0.5, max: 2, step: 0.25, modes: EVERY_MODE },
  enemyGearGrowth: { default: 1, min: 0, max: 2, step: 0.25, modes: ['chaosHighway'] },
};

export type WaveGear = Omit<GearRules, 'money' | 'armored' | 'armorFirst' | 'minSpeed' | 'chassisFloor'>;
export type WavePlan = { level: GearLevel; gear: WaveGear };
const EARLY_GEAR: WaveGear = { gunFirst: true, gunTier: 1, paysFuel: false, cargoPart: false };
const MIDDLE_GEAR: WaveGear = { ...EARLY_GEAR, gunTier: 2 };
const LATE_GEAR: WaveGear = { ...EARLY_GEAR, gunTier: 3 };

export type EnemyCard = { weight: number; from: number; floor: number; chase: boolean };
export type Line = { first: number; step: number };

export const CHAOS_HIGHWAY = {
  spawnOffsets: [-3, -1, 1, 3, -9, 9, -13, 13],
  outpost: {
    look: 'outpost',
    radius: 12,
    spots: { hauler: -1.5, truck: 1.5 },
    gateMargin: 1.5,
    leafInset: 0.4,
  },
  waves: [
    { level: 'light', gear: EARLY_GEAR },
    { level: 'light', gear: EARLY_GEAR },
    { level: 'light', gear: MIDDLE_GEAR },
    { level: 'standard', gear: MIDDLE_GEAR },
    { level: 'standard', gear: MIDDLE_GEAR },
    { level: 'standard', gear: MIDDLE_GEAR },
    { level: 'heavy', gear: MIDDLE_GEAR },
    { level: 'loaded', gear: LATE_GEAR },
  ] as WavePlan[],
  director: {
    budget: { first: 2, step: 2 } as Line,
    truckShare: 16,
    gearShare: 0.25,
    elite: { from: 3, cost: 2, money: 2, every: 4 },
    waves: { first: 2, step: 0.25 } as Line,
    wave: { min: 1, size: { first: 1, step: 0.2 } as Line, cap: 5 },
    spacing: 60,
    jitter: 0.15,
  },
  cards: {
    buggy: { weight: 4, from: 1, floor: 100, chase: true },
    courier: { weight: 2, from: 1, floor: 100, chase: true },
    scavenger: { weight: 2, from: 2, floor: 100, chase: true },
    roamer: { weight: 2, from: 1, floor: 100, chase: true },
    trader: { weight: 1, from: 2, floor: 100, chase: true },
    merc: { weight: 3, from: 2, floor: 100, chase: true },
    bowlFarmer: { weight: 1, from: 3, floor: 100, chase: false },
    gunwagon: { weight: 3, from: 6, floor: 150, chase: false },
    vulture: { weight: 2, from: 6, floor: 250, chase: true },
    noseArmy: { weight: 2, from: 6, floor: 150, chase: false },
    convoyGuard: { weight: 2, from: 6, floor: 150, chase: true },
    convoy: { weight: 1, from: 6, floor: 300, chase: false },
  } as Record<string, EnemyCard>,
  chaseSpeed: 5.5,
  nerve: 0.15,
  playerMargin: 8,
  sprintLead: 8,
  sides: { ahead: 45, flank: { along: 36, across: 22, step: 3 } },
  pacing: { near: 30 },
  rolling: { near: 6, ramp: 40, close: 0.4, lead: 12 },
  sightMargin: 6,
  spawnStagger: 3,
  spawnClear: 3,
  maxAlive: 8,
  spawnRetryTurns: 20,
  pay: { base: { first: 250, step: 100 } as Line },
  hauler: { kinds: ['armor', 'engine', 'cargo'] as PartKind[], lookahead: 12, sideReach: 6, cruise: 4.5, hurry: 4.5, crawl: 1.5, alarmTurns: 4, approach: 25, stallTurns: 12, craterDip: 0.1, laneLook: 32, waitGap: Math.max(...Object.values(UNPRICED_WEAPONS).map((w) => w.range)), resumeGap: NPC_BEHAVIOR.escortWaitGap, apartGap: NPC_BEHAVIOR.escortCatchUpGap },
  stockPerKind: { weapon: 5, engine: 3, armor: 6, accessory: 2, cargo: 3, scanner: 1, store: 2, utility: 3 } as Partial<Record<PartKind, number>>,
  stockGrowthStretches: 4,
  trucks: { offers: 3, pool: ['hauler', 'courier', 'van', 'longbed', 'carrier', 'tractor', 'jeep', 'convertible', 'bus', 'loader', 'niva', 'bukhanka', 'lincoln', 'buggy', 'wagon', 'sorokonoga'] },
  goodsMarkup: 1.5,
  maxTries: 400,
};

export type BandRule = { kind: PropKind; count: [number, number]; r: [number, number]; across: [number, number] };
export type GroundBand = { below: number; type: TerrainTypeId };

export const HIGHWAY = {
  version: 6,
  size: 410,
  stretch: { min: 230, max: 310 },
  milestoneInset: 50,
  road: {
    lanes: [-3, -1, 1, 3],
    laneWidth: 2,
    asphalt: 5,
    verge: 18,
    badlands: 26,
    flatTo: 15,
    blend: 7,
    ridge: { rise: 4, run: 1.5 },
    bend: { ends: 40, cell: 40, shift: [4, 7] as [number, number], straightChance: 0.1, maxHeading: 35 },
    profile: { amplitude: 1.5, wavelength: 300, seedOffset: 103 },
    sample: 2,
    paint: { band: 0.3, bandSpread: 0.75, holeInset: 0.75 },
  },
  relief: { amplitude: 2.4, octaves: [{ freq: 1 / 56, amp: 1, seedOffset: 201 }, { freq: 1 / 17, amp: 0.3, seedOffset: 202 }] },
  ground: {
    scale: 1 / 22,
    seedOffset: 301,
    verge: [{ below: 0.32, type: 'sand' }, { below: 1, type: 'hardpan' }] as GroundBand[],
    badlands: [{ below: 0.45, type: 'gravel' }, { below: 0.7, type: 'scrub' }, { below: 1, type: 'scree' }] as GroundBand[],
    ridge: 'scree' as TerrainTypeId,
  },
  chunk: 16,
  chunkEdge: 1.8,
  badlands: [
    { kind: 'rock', count: [3, 6], r: [0.6, 1.5], across: [19.5, 40] },
    { kind: 'crag', count: [0, 2], r: [1.6, 2.4], across: [22, 44] },
    { kind: 'deadTree', count: [0, 2], r: [0.35, 0.35], across: [18.5, 34] },
  ] as BandRule[],
  powerLine: { spacing: 12, across: 14, r: 0.3 },
  billboard: { chance: 0.14, r: 1.6, across: [19.6, 22] as [number, number] },
  ditched: { chance: 0.4, kinds: ['carWreck', 'deadTruck'] as PropKind[], r: [0.6, 0.75] as [number, number], across: [12.8, 16.2] as [number, number], yaw: 25 },
  milestoneClear: { south: 34, north: 24, across: 34 },
  sceneClear: { along: 4, across: 24 },
  propGap: 0.3,
};

export type SceneKind = 'pileup' | 'jackknife' | 'checkpoint' | 'tankline' | 'rockfall' | 'craters' | 'ramp' | 'roadblock';
export type Range = [number, number];
export type SceneWeights = { upTo: number; weights: Record<SceneKind, number> };

export const HAZARDS = {
  arenaMin: 36,
  clearAfterOutpost: 24,
  clearBeforeOutpost: 30,
  scenes: { first: 3, every: 2, max: 4 },
  lanesCovered: { early: 2, late: 3, upTo: 2 },
  tiers: [
    { upTo: 1, weights: { pileup: 4, rockfall: 3, craters: 3, jackknife: 2, ramp: 2, checkpoint: 1, tankline: 1, roadblock: 0 } },
    { upTo: 2, weights: { pileup: 4, rockfall: 3, craters: 3, jackknife: 2, ramp: 2, checkpoint: 1, tankline: 1, roadblock: 2 } },
    { upTo: 5, weights: { pileup: 3, rockfall: 2, craters: 2, jackknife: 2, ramp: 2, checkpoint: 2, tankline: 2, roadblock: 3 } },
    { upTo: Number.MAX_SAFE_INTEGER, weights: { pileup: 2, rockfall: 1, craters: 1, jackknife: 2, ramp: 2, checkpoint: 3, tankline: 3, roadblock: 4 } },
  ] as SceneWeights[],
  pieceR: { carWreck: 0.7, deadTruck: 0.75, drums: 0.44, junk: 0.6, barrier: 0.5, sandbags: 0.6, tankTrap: 0.25, armyTruck: 1.1, tank: 1.2 } as Partial<Record<PropKind, number>>,
  pileup: {
    lanes: [1, 2] as Range,
    vehicles: [3, 6] as Range,
    hulkShare: 0.45,
    hulks: ['bus', 'van', 'courier', 'hauler', 'wagon'],
    cars: ['carWreck', 'deadTruck'] as PropKind[],
    length: [6, 12] as Range,
    yaw: [20, 80] as Range,
    spill: [2, 4] as Range,
    spillKinds: ['drums', 'junk'] as PropKind[],
    spillAhead: [2, 6] as Range,
  },
  jackknife: { lanes: [2, 3] as Range, hulks: ['bus', 'hauler'], yaw: [60, 90] as Range, cars: [1, 2] as Range, carYaw: 15, behind: [2.2, 3.2] as Range },
  checkpoint: { lines: [2, 3] as Range, spacing: 10, inner: 1, barrierStep: 1, lineYaw: 3, sandbags: [1, 2] as Range, behind: 0.9, bagStep: 1.2, traps: [3, 6] as Range, trapFrom: 5.6, trapStep: 0.9, truckAcross: [8.5, 11] as Range, truckYaw: 10 },
  tankline: { lanes: [1, 2] as Range, tankAcross: [8, 12] as Range, tankYaw: 20, traps: [6, 10] as Range, step: [3, 4] as Range },
  rockfall: { crag: { across: [17, 18.5] as Range, r: [1.6, 2.2] as Range }, rocks: [6, 12] as Range, gap: 1.2, reach: 3, r: [0.4, 1.3] as Range, fan: 4 },
  craters: { count: [2, 4] as Range, radius: [1.5, 2.5] as Range, depth: [0.3, 0.5] as Range, spacing: [3.5, 5] as Range, junk: [1, 2] as Range },
  ramp: { width: 3, length: 5, rise: 0.35, craterChance: 0.5, craterGap: 3 },
  roadblock: {
    line: ['barrier', 'barrier', 'barrier', 'sandbags', 'carWreck', 'deadTruck', 'tankTrap', 'armyTruck'] as PropKind[],
    openReach: [2, 5] as Range,
    yaw: 4,
    jitter: 0.3,
    room: 3,
  },
  passage: 3,
  inflate: 0.5,
  onAsphalt: 1,
  pieceGap: 0.05,
  placeTries: 12,
  maxTries: 60,
  closures: {
    line: { rows: 2, rowGap: 1.4, reach: 30, sandbags: 4, nestGap: 2.5, nestStep: 3.5, gap: 0.5 },
    south: { behind: 26, reach: 30, rows: 2, rowGap: 2, yaw: 15, hulkShare: 0.5 },
  },
};
