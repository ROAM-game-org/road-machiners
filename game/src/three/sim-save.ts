import { emptyLedger, LEDGER_KEYS, type Ledger } from '../sim/progression/orders';
import type { Sample } from '../sim/progression/sim-mode';
import type { BakedMap } from '../sim/terrain';
import type { World } from '../sim/types';
import { clearSlot, loadWorld, saveKey, savedMisfit, saveOf } from './save';
import type { SaveSlots } from './save-db';
import type { SlotId } from './save-slots';

export const SIM_SAVES = saveKey('sim');
export const SIM_SLOT: SlotId = 'auto';

export type SimEnvelope = ReturnType<typeof saveOf> & { savedAt: number; runId: string; ledger: Ledger; history: Sample[] };
export type SimStart = { world: World; ledger: Ledger; history: Sample[] };

export function simEnvelope(run: SimStart, savedAt: number): SimEnvelope {
  if (run.world.player.state === 'dead') throw new Error('A run whose player is dead has no save');
  const envelope = { ...saveOf(run.world), savedAt, runId: `sim-${run.world.seed}`, ledger: { ...run.ledger }, history: [...run.history] };
  const misfit = savedMisfit(envelope.world);
  if (misfit) throw misfit;
  return envelope;
}

export type Resumed = { kind: 'none' } | { kind: 'outdated' } | ({ kind: 'resumed' } & SimStart);

export function resumedRun(slots: SaveSlots, map: BakedMap): Resumed {
  const envelope = slots.get(SIM_SLOT);
  if (envelope === null) return { kind: 'none' };
  const history = historyOf(envelope);
  if (history === null) {
    clearSlot(slots, SIM_SLOT);
    return { kind: 'outdated' };
  }
  const world = loadWorld(slots, SIM_SLOT, map);
  if (!world) throw new Error('The sim save vanished while it loaded');
  return { kind: 'resumed', world, ledger: ledgerOf(envelope), history };
}

function ledgerOf(envelope: unknown): Ledger {
  const saved = (envelope as { ledger?: Partial<Ledger> }).ledger;
  if (!saved) throw new Error('The sim save has no ledger');
  const ledger = emptyLedger();
  for (const key of LEDGER_KEYS) ledger[key] = saved[key] ?? 0;
  return ledger;
}

const SAMPLE_KEYS = ['turn', 'money', 'worth', 'xp'] as const;

function historyOf(envelope: unknown): Sample[] | null {
  const saved = (envelope as { history?: unknown }).history;
  if (saved === undefined) return null;
  if (!Array.isArray(saved) || saved.length === 0 || !saved.every(isSample)) throw new Error('The sim save has a broken money history');
  return saved;
}

function isSample(value: unknown): value is Sample {
  return typeof value === 'object' && value !== null && SAMPLE_KEYS.every((key) => typeof (value as Record<string, unknown>)[key] === 'number');
}
