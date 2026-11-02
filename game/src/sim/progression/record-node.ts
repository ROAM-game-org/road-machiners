import type { GameModeId, World } from '../types';
import { TEST_MAP } from '../../test/map';
import type { Archetype, BotOptions } from './bot';
import { archetypeWorldOn, FAR_MOVER, recordFrom, startWorldOn, stepsFrom, type Mover, type RecordStep, type Recording } from './record';

export function startWorld(seed: number, kit = 'standard', rank = 0, settings?: Record<string, number>, mode?: GameModeId): World {
  return startWorldOn(TEST_MAP, seed, kit, rank, settings, mode);
}

export function record(seed: number, archetype: Archetype, turns: number, options: BotOptions = {}): Recording {
  return recordFrom(archetypeWorldOn(TEST_MAP, seed, archetype, options), `seed ${seed} ${archetype}`, archetype, turns, options);
}

export function recordTurns(seed: number, archetype: Archetype, turns: number, options: BotOptions = {}, mover: Mover = FAR_MOVER): Generator<RecordStep> {
  return stepsFrom(archetypeWorldOn(TEST_MAP, seed, archetype, options), `seed ${seed} ${archetype}`, archetype, turns, options, mover);
}
