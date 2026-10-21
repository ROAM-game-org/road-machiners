import { describe, expect, it, vi } from 'vitest';
import { startKit } from '../data/start';
import { chooseQuestOption, QUESTS, startQuest } from '../sim/quests';
import * as quests from '../sim/quests';
import * as repair from '../sim/save-repair';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { reusedWorld } from '../test/world-cache';
import { loadWorld, SaveError, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

vi.mock('../sim/quests', async (original) => ({ ...(await original<typeof quests>()), restoreQuest: vi.fn() }));
vi.mock('../sim/save-repair', async (original) => ({ ...(await original<typeof repair>()) }));

function openQuestSave(): SaveSlots {
  const start = reusedWorld('standard', () => newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming')));
  const mid = chooseQuestOption(startQuest(start, QUESTS, 'bowl_hattie', 'start'), QUESTS, 0);
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', mid, 'run', 1);
  return slots;
}

describe('a load that hits drift no repair knows', () => {
  it('resets an open quest whose checkpoint no longer loads', () => {
    vi.mocked(quests.restoreQuest).mockImplementationOnce(() => {
      throw new Error('Loading checkpoint start changed its variables');
    });

    const loaded = loadWorld(openQuestSave(), 'auto', TEST_MAP)!;

    expect(loaded.player.quests.session).toBeNull();
    expect(loaded.player.quests.local.bowl_hattie).toBeUndefined();
  });

  it('turns any other throw into a save error, so the boot shows the rescue and not a crash', () => {
    vi.spyOn(repair, 'repairContent').mockImplementationOnce(() => {
      throw new TypeError('x is undefined');
    });

    expect(() => loadWorld(openQuestSave(), 'auto', TEST_MAP)).toThrow(SaveError);
  });
});
