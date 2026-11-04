import { isArchetype, type Archetype } from '../sim/progression/bot';
import { liveFlights, restoreFlights, type Flight } from '../sim/progression/flee-memory';
import type { BakedMap } from '../sim/terrain';
import type { World } from '../sim/types';
import { loadWorld, parseSaveFile, savedMisfit, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import type { SlotId } from './save-slots';

const SLOT: SlotId = 'auto';

export type Checkpoint = ReturnType<typeof saveOf> & { archetype: Archetype; seed: number; turn: number; flights: [string, Flight][] };
export type Resumed = { world: World; archetype: Archetype; seed: number };

export function checkpointOf(world: World, archetype: Archetype): Checkpoint {
  if (world.player.state === 'dead') throw new Error('A run whose player is dead has no checkpoint');
  const saved = saveOf(world);
  const misfit = savedMisfit(saved.world);
  if (misfit) throw misfit;
  return { ...saved, archetype, seed: world.seed, turn: world.turn, flights: liveFlights() };
}

export async function resumeCheckpoint(text: string, map: BakedMap): Promise<Resumed> {
  const envelope = parseSaveFile(text) as Partial<Checkpoint> & { savedAt?: number; runId?: string };
  const { archetype, seed, flights } = envelope;
  if (typeof archetype !== 'string' || !isArchetype(archetype)) throw new Error('The checkpoint names no archetype');
  if (typeof seed !== 'number') throw new Error('The checkpoint names no seed');
  if (!Array.isArray(flights)) throw new Error('The checkpoint has no flights');
  const slots = await SaveSlots.open(memoryBackend(), null, `checkpoint-${seed}`, [SLOT]);
  slots.put(SLOT, { ...envelope, savedAt: 0, runId: `playthrough-${seed}` });
  const world = loadWorld(slots, SLOT, map);
  if (!world) throw new Error('The checkpoint holds no world');
  restoreFlights(flights);
  return { world, archetype, seed };
}

export function checkResume(resumed: Resumed, seed: number, archetype: Archetype): void {
  if (resumed.seed !== seed) throw new Error(`The checkpoint is seed ${resumed.seed}, not --seed ${seed}`);
  if (resumed.archetype !== archetype) throw new Error(`The checkpoint is archetype ${resumed.archetype}, not --archetype ${archetype}`);
}
