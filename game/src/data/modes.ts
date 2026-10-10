
import type { GameModeId, WorldSettings } from '../sim/types';

export type GameMode = Record<never, never>;

export const GAME_MODES: Record<GameModeId, GameMode> = {
  roaming: {},
};

export type WorldSettingDef = { default: number; min: number; max: number; step: number };

export const WORLD_SETTINGS: Record<keyof WorldSettings, WorldSettingDef> = {
  damage: { default: 1, min: 0.5, max: 2, step: 0.25 },
  fuelUse: { default: 1, min: 0.5, max: 2, step: 0.25 },
  supplyUse: { default: 1, min: 0.5, max: 2, step: 0.25 },
};
