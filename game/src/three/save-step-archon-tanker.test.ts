import { describe, expect, it } from 'vitest';
import FORMAT_2_115 from './save-fixtures/format-2-115.json';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { loadWorld, SAVE_FORMAT, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = typeof FORMAT_2_115;

const step = (world: unknown): Saved => TINY_STEPS[115 - TINY_FROM].step(structuredClone(world) as SavedJson) as unknown as Saved;
const fixture = () => structuredClone(FORMAT_2_115);

describe('save migration 115 to 116, the Archon tanker quest is cut', () => {
  it('drops both quests, their open session, their world variables and their notes, keeping the rest', () => {
    const next = step(fixture());
    expect(next.player.quests).toEqual({
      world: { wagon_fate: 'admitted', hattie_met: true },
      local: { bowl_jory: { jory_green: true } },
      session: null,
    });
    expect(next.player.notes).toEqual([{ id: 'talkGranaryGate', turn: 300 }, { id: 'burntConvoy', turn: 1000 }]);
    expect(next.player.money).toBe(1500);
    expect(next.turn).toBe(2400);
  });

  it('keeps a session in another quest', () => {
    const saved = fixture();
    saved.player.quests.session = { quest: 'bowl_jory', checkpoint: 'start.hub', seed: 3 };
    expect(step(saved).player.quests.session).toEqual(saved.player.quests.session);
  });

  it('leaves a save that never met Agnes as it was', () => {
    const saved = fixture();
    const clean = {
      ...saved,
      player: {
        ...saved.player,
        notes: [{ id: 'burntConvoy', turn: 1000 }],
        quests: { world: { hattie_met: true }, local: { bowl_jory: { jory_green: true } }, session: null },
      },
    };
    expect(step(clean)).toEqual(clean);
  });
});

describe('a save from before the cut', () => {
  it('loads with the cut quest gone and everything else kept, awarding nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    w.events = [];
    const envelope = saveOf(w) as unknown as { format: { major: number; minor: number }; steps: { from: number; names: string[] }; world: { player: Record<string, unknown> } };
    const player = envelope.world.player;
    expect(envelope.steps.names.at(-1)).toBe('withoutArchonTanker');
    const old = {
      ...envelope,
      format: { major: SAVE_FORMAT.major, minor: 115 },
      steps: { from: envelope.steps.from, names: envelope.steps.names.slice(0, -1) },
      world: {
        ...envelope.world,
        player: {
          ...player,
          notes: [{ id: 'pipeBook', turn: 5 }, { id: 'burntConvoy', turn: 6 }],
          quests: { ...(player.quests as object), world: { pipe_fate: 'read', marr_regard: 'enemy', wagon_fate: 'logged' }, local: { pump_pipe: { meter_taken: true } }, session: { quest: 'pump_agnes', checkpoint: 'start', seed: 2 } },
        },
      },
    };
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...old, savedAt: 1000, runId: 'run-1' });

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded.player.quests).toEqual({ ...w.player.quests, world: { wagon_fate: 'logged' }, local: {}, session: null });
    expect(loaded.player.notes).toEqual([{ id: 'burntConvoy', turn: 6 }]);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
