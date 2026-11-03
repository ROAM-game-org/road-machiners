import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { newWorld } from '../sim/world';
import { comparableWorld } from '../sim/testkit';
import { defaultSetup } from '../sim/settings';
import { TEST_MAP } from '../test/map';
import { reusedWorld } from '../test/world-cache';
import { t } from '../text/msg';
import { loadWorld, saveImporter, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { manualSlots } from './save-slots';
import OLD_EXPORT from './save-fixtures/anchors/2-61-roaming.json';

const COUNT = 3;

function exportedText(turn: number): string {
  const world = { ...reusedWorld('standard', () => newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'))), turn };
  return JSON.stringify({ ...saveOf(world), savedAt: 5000, runId: 'run-export' });
}

describe('import save', () => {
  it('loads the same world as the browser loads from the same export, and awards nothing', async () => {
    const text = exportedText(7);
    const browser = new SaveSlots(memoryBackend(), new Map());
    browser.put('auto', JSON.parse(text));
    const slots = new SaveSlots(memoryBackend(), new Map());

    const result = await saveImporter(slots, TEST_MAP, COUNT)(text);

    expect(result).toEqual({ slot: 'slot1' });
    const imported = loadWorld(slots, 'slot1', TEST_MAP)!;
    expect(comparableWorld(imported)).toEqual(comparableWorld(loadWorld(browser, 'auto', TEST_MAP)!));
    expect(imported.events).toEqual([]);
    const direct = loadWorld(browser, 'auto', TEST_MAP)!;
    expect(imported.player.xp).toEqual(direct.player.xp);
    expect(imported.player.money).toEqual(direct.player.money);
  });

  it('stores the envelope unchanged and writes it through the backend', async () => {
    const text = exportedText(9);
    const backend = memoryBackend();
    const slots = new SaveSlots(backend, new Map());

    await saveImporter(slots, TEST_MAP, COUNT)(text);

    expect(slots.get('slot1')).toEqual(JSON.parse(text));
    expect((await backend.readAll()).get('slot1')).toEqual(JSON.parse(text));
  });

  it('takes the first free manual slot', async () => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    const importer = saveImporter(slots, TEST_MAP, COUNT);

    await importer(exportedText(1));
    const second = await importer(exportedText(2));

    expect(second).toEqual({ slot: 'slot2' });
  });

  it('refuses a file that is not JSON and stores nothing', async () => {
    const slots = new SaveSlots(memoryBackend(), new Map());

    const result = await saveImporter(slots, TEST_MAP, COUNT)('not a save');

    expect(result).toEqual({ refusal: t('save.importUnreadable') });
    expect(manualSlots(COUNT).some((slot) => slots.has(slot))).toBe(false);
  });

  it('refuses JSON that is not a save for this version and stores nothing', async () => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    const broken = JSON.parse(exportedText(3)) as { world: Record<string, unknown> };
    delete broken.world.crimes;

    const result = await saveImporter(slots, TEST_MAP, COUNT)(JSON.stringify(broken));

    expect(result).toEqual({ refusal: t('save.doesNotFit') });
    expect(manualSlots(COUNT).some((slot) => slots.has(slot))).toBe(false);
  });

  it('refuses when every manual slot holds a save, and keeps them', async () => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    for (const slot of manualSlots(COUNT)) slots.put(slot, { kept: slot });

    const result = await saveImporter(slots, TEST_MAP, COUNT)(exportedText(4));

    expect(result).toEqual({ refusal: t('save.importNoSlot') });
    expect(slots.get('slot2')).toEqual({ kept: 'slot2' });
  });
});

describe('import save of a save made on another map', () => {
  it('accepts it, since boot carries it later', async () => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    const other = JSON.parse(exportedText(5)) as { world: { mapHash: string } };
    other.world.mapHash = 'another-map';

    const result = await saveImporter(slots, TEST_MAP, COUNT)(JSON.stringify(other));

    expect(result).toEqual({ slot: 'slot1' });
  });
});

describe('import save of an older export', () => {
  const OLD = JSON.stringify(OLD_EXPORT);

  it('stores the file as it was and loads the same world as the browser', async () => {
    const browser = new SaveSlots(memoryBackend(), new Map());
    browser.put('auto', JSON.parse(OLD));
    const slots = new SaveSlots(memoryBackend(), new Map());

    const result = await saveImporter(slots, TEST_MAP, COUNT)(OLD);

    expect(result).toEqual({ slot: 'slot1' });
    expect(slots.get('slot1')).toEqual(JSON.parse(OLD));
    const imported = loadWorld(slots, 'slot1', TEST_MAP)!;
    expect(comparableWorld(imported)).toEqual(comparableWorld(loadWorld(browser, 'auto', TEST_MAP)!));
    expect(imported.events).toEqual([]);
  });
});
