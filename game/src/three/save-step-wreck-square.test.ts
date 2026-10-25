import { describe, expect, it } from 'vitest';
import FORMAT_2_109 from './save-fixtures/format-2-109.json';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { gridSquareOf } from '../sim/map-grid';
import { emptyHidden } from '../sim/salvage';
import { defaultSetup } from '../sim/settings';
import { addVehicle } from '../sim/testkit';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { journalEntries } from '../ui/journal';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = typeof FORMAT_2_109;
type SavedCall = Saved['player']['call'];

const step = (world: unknown): Saved => TINY_STEPS[109 - TINY_FROM].step(structuredClone(world) as SavedJson) as unknown as Saved;
const fixture = () => structuredClone(FORMAT_2_109);
const STRAIGHT = { kind: 'directions', steps: [{ do: 'straight', octant: 'east', span: 'near' }] };

function withCall(call: Record<string, unknown>): Saved {
  const saved = fixture();
  return { ...saved, player: { ...saved.player, call: call as unknown as SavedCall } };
}

describe('save migration 109 to 110, a told wreck names its square', () => {
  it('ends an open wreck call that has no square and keeps the told wreck', () => {
    const next = step(fixture());
    expect(next.player.call).toBeNull();
    expect(next.player.rumored).toEqual(['wreck6802']);
    expect(next.player.money).toBe(1200);
  });

  it('ends a salvage tip call whose wreck way was not yet told', () => {
    const tip = withCall({ with: 'v40', topic: 'salvageTip', node: 'offer', vars: { price: { kind: 'money', amount: 90 }, way: STRAIGHT }, line: { line: 'tipOffer', vars: { price: { kind: 'money', amount: 90 } } } });
    expect(step(tip).player.call).toBeNull();
  });

  it('keeps a town way, a site way and a call with no way unchanged', () => {
    const calls = [
      { with: 'v40', topic: 'directions', node: 'way', vars: { town: { kind: 'town', id: 'bowl' }, way: STRAIGHT }, line: { line: 'townWay', vars: { town: { kind: 'town', id: 'bowl' }, way: STRAIGHT } } },
      { with: 'v40', topic: 'rumor', node: 'site', vars: { site: { kind: 'site', id: 'granary' }, way: STRAIGHT }, line: { line: 'siteWay', vars: { site: { kind: 'site', id: 'granary' }, way: STRAIGHT } } },
      { with: 'v40', topic: null, node: 'hub', vars: {}, line: { line: 'talk', vars: {} } },
    ];
    for (const call of calls) {
      const saved = withCall(call);
      expect(step(saved)).toEqual(saved);
    }
  });

  it('keeps a save with no call unchanged', () => {
    const saved = withCall({});
    const none = { ...saved, player: { ...saved.player, call: null } };
    expect(step(none)).toEqual(none);
  });
});

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('told wrecks across a save', () => {
  it('load keeps the open wreck call with its square and the same journal, and awards nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const me = playerVehicle(w);
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: me.pos.x + 4, y: me.pos.y });
    const pos = { x: me.pos.x + 40, y: me.pos.y };
    w.salvage = [{ id: 'wreck77', pos, radius: 0.6, goods: { scrap: 2 }, parts: [], hidden: emptyHidden() }];
    w.player.rumored = ['wreck77'];
    const vars = { way: { kind: 'directions' as const, steps: [] }, square: { kind: 'square' as const, ...gridSquareOf(pos) } };
    w.player.call = { with: npc.id, topic: 'rumor', node: 'wreck', vars, line: { line: 'wreckWay', vars } };
    w.events = [];
    const loaded = reload(w);
    expect(loaded.player.call).toEqual(w.player.call);
    expect(journalEntries(loaded).wrecks).toEqual(journalEntries(w).wrecks);
    expect(journalEntries(loaded).wrecks).toEqual([{ square: gridSquareOf(pos), count: 1 }]);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
