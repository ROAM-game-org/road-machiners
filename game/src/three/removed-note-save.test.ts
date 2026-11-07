import { describe, expect, it } from 'vitest';
import { NOTE_IDS } from '../data/locals';
import { REGION } from '../data/region';
import { QUESTS, startQuest } from '../sim/quests';
import { sitePads } from '../sim/sites';
import { emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { flatChoices } from '../test/quest-testkit';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS } from './save-migrations';

const REMOVED_NOTES = [
  'roadhouseRaiders', 'roadhouseBook', 'roadhouseBuyOff', 'talkGranaryGate', 'talkSeepPipe', 'talkCraneBook', 'talkPierceGuns', 'talkGlassLean',
  'talkSunwardTake', 'sunwardLamps', 'sunwardDragged', 'talkKilnFight', 'talkArmyStarved', 'talkCommitteeRent', 'glassTank', 'talkBrakeRod', 'burntConvoy',
];
const SEFA_CONVOY = 'Is the Burnt Convoy picked clean?';

const note = (id: string, turn: number) => ({ id, turn }) as unknown as World['player']['notes'][number];

function atSalvageYard(): World {
  const yard = REGION.locations.find((s) => s.id === 'salvage-yard')!;
  return emptyWorld(sitePads(yard)[0]);
}

function reload(w: World, minor?: number): World {
  const envelope = JSON.parse(JSON.stringify(saveOf(w)));
  const stepped = minor === undefined ? envelope : { ...envelope, format: { ...envelope.format, minor }, steps: { ...envelope.steps, names: envelope.steps.names.slice(0, minor - TINY_FROM) } };
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...stepped, savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('journal notes the game no longer gives', () => {
  it('drops every removed note on load, keeps the kept ones and awards nothing', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    w.player.notes = [...REMOVED_NOTES, ...NOTE_IDS].map((id, i) => note(id, i + 1));

    const loaded = reload(w);

    expect(loaded.player.notes.map((n) => n.id)).toEqual([...NOTE_IDS]);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual(w.events);
  });

  it('keeps Sefa\'s convoy question for a save from before the step that held Ibo\'s rumor note', () => {
    const w = atSalvageYard();
    w.player.notes = [note('burntConvoy', 5)];
    w.player.quests.local.nose_ibo = { heard_convoy: true };
    const stepAt = TINY_FROM + TINY_STEPS.findIndex((s) => s.name === 'withConvoyRumor');

    const loaded = reload(w, stepAt);

    expect(loaded.player.notes).toEqual([]);
    expect(loaded.player.quests.world.convoy_rumor).toBe(true);
    expect(flatChoices(startQuest(loaded, QUESTS, 'yard_sefa', 'start'))).toContain(SEFA_CONVOY);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.events).toEqual([]);
  });

  it('gives a fresh save at the salvage yard no convoy question', () => {
    expect(flatChoices(startQuest(atSalvageYard(), QUESTS, 'yard_sefa', 'start'))).not.toContain(SEFA_CONVOY);
  });
});
