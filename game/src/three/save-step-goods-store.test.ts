import { describe, expect, it } from 'vitest';
import FORMAT_2_124 from './save-fixtures/format-2-124.json';
import { START_KITS } from '../data/start';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

const goodsStoreStep = TINY_STEPS.find((s) => s.name === 'goodsStore')!;
const stepFormat = TINY_FROM + TINY_STEPS.indexOf(goodsStoreStep);

describe('save migration goodsStore, the player gets an empty crate store per shop', () => {
  it('runs after the work day XP step', () => {
    expect(TINY_STEPS.findIndex((s) => s.name === 'xpByWorkDay')).toBeLessThan(TINY_STEPS.indexOf(goodsStoreStep));
  });

  it('adds only an empty store to the player', () => {
    const before = structuredClone(FORMAT_2_124) as unknown as SavedJson;
    const next = goodsStoreStep.step(structuredClone(before));
    expect(next).toEqual({ ...before, player: { ...(before.player as SavedJson), storedGoods: {} } });
  });

  it('loads a save from the format before it with an empty store', () => {
    const world = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const envelope = JSON.parse(JSON.stringify(saveOf(world)));
    delete envelope.world.player.storedGoods;
    const names = envelope.steps.names.filter((name: string) => name !== 'goodsStore');
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...envelope, format: { ...envelope.format, minor: stepFormat }, steps: { ...envelope.steps, names }, savedAt: 1, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded.player.storedGoods).toEqual({});
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.events).toEqual([]);
  });
});
