import { emptyLedger, LEDGER_KEYS, type Ledger } from '../sim/progression/orders';
import type { BakedMap } from '../sim/terrain';
import type { World } from '../sim/types';
import { loadWorld, saveKey, savedMisfit, saveOf } from './save';
import type { SaveSlots } from './save-db';
import type { SlotId } from './save-slots';

export const SIM_SAVES = saveKey('sim');
export const SIM_SLOT: SlotId = 'auto';

export type SimEnvelope = ReturnType<typeof saveOf> & { savedAt: number; runId: string; ledger: Ledger };

export function simEnvelope(world: World, ledger: Ledger, savedAt: number): SimEnvelope {
  if (world.player.state === 'dead') throw new Error('A run whose player is dead has no save');
  const envelope = { ...saveOf(world), savedAt, runId: `sim-${world.seed}`, ledger: { ...ledger } };
  const misfit = savedMisfit(envelope.world);
  if (misfit) throw misfit;
  return envelope;
}

export function resumedRun(slots: SaveSlots, map: BakedMap): { world: World; ledger: Ledger } | null {
  const world = loadWorld(slots, SIM_SLOT, map);
  if (!world) return null;
  return { world, ledger: ledgerOf(slots.get(SIM_SLOT)) };
}

function ledgerOf(envelope: unknown): Ledger {
  const saved = (envelope as { ledger?: Partial<Ledger> }).ledger;
  if (!saved) throw new Error('The sim save has no ledger');
  const ledger = emptyLedger();
  for (const key of LEDGER_KEYS) ledger[key] = saved[key] ?? 0;
  return ledger;
}
