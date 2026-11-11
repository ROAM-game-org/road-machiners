import { describe, expect, it } from 'vitest';
import OLD_LEAVES from './save-fixtures/leave-cue-old.json';
import { TINY_STEPS, type SavedJson } from './save-migrations';
import { directionsText } from '../ui/directions-text';
import { resolve } from '../text/resolve';
import type { DirectionStep, World } from '../sim/types';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { defaultSetup } from '../sim/settings';
import { addVehicle } from '../sim/testkit';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

const withSeenLeaveCues = TINY_STEPS.find((s) => s.name === 'withSeenLeaveCues')!;

type Steps = { steps: SavedJson[] };
type Saved = { player: { call: { vars: { way: Steps }; line: { vars: { way: Steps } } } | null } };

const oldSave = () => structuredClone(OLD_LEAVES) as unknown as Saved;
const migrated = (saved: Saved): Saved => withSeenLeaveCues.step(structuredClone(saved) as unknown as SavedJson) as unknown as Saved;
const speak = (steps: unknown) => resolve(directionsText(steps as DirectionStep[]), 'en');

describe('save migration withSeenLeaveCues, an old leave step asks again', () => {
  it('replaces a leave at no cue and what follows it, keeping the steps before it', () => {
    const before = oldSave().player.call!;
    const after = migrated(oldSave()).player.call!;
    expect(after.vars.way.steps).toEqual([before.vars.way.steps[0], { do: 'askAgain' }]);
  });

  it('replaces a leave at a fork count in the call line as well', () => {
    const before = oldSave().player.call!;
    const after = migrated(oldSave()).player.call!;
    expect(after.line.vars.way.steps).toEqual([before.line.vars.way.steps[0], { do: 'askAgain' }]);
  });

  it('reads Ask again on the way where the old cue was, and never the old words', () => {
    const after = migrated(oldSave()).player.call!;
    for (const steps of [after.vars.way.steps, after.line.vars.way.steps]) expect(speak(steps)).toMatch(/Ask again on the way\.$/);
    expect(speak(after.vars.way.steps)).not.toMatch(/runs closest/);
  });

  it('keeps a leave at a landmark or a square', () => {
    const saved = oldSave();
    const kept = [{ do: 'leave', at: { kind: 'square', column: 2, row: 3 }, octant: 'east', lean: null, span: 'near' }, { do: 'leave', at: { kind: 'site', id: 'bowl' }, octant: 'east', lean: null, span: 'near' }];
    saved.player.call!.vars.way.steps = structuredClone(kept);
    expect(migrated(saved).player.call!.vars.way.steps).toEqual(kept);
  });

  it('changes nothing else in the call or the world', () => {
    const before = oldSave();
    const after = migrated(before);
    expect({ ...after.player.call, vars: undefined, line: undefined }).toEqual({ ...before.player.call, vars: undefined, line: undefined });
    expect(after.player.call!.vars.way.steps).not.toEqual(before.player.call!.vars.way.steps);
  });

  it('changes nothing in a save with no call', () => {
    const saved = { player: { call: null } } as unknown as Saved;
    expect(migrated(saved)).toEqual(saved);
  });
});

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('a told square across a save', () => {
  it('load keeps an open call that leaves at a square entry, and awards nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const me = playerVehicle(w);
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: me.pos.x + 4, y: me.pos.y });
    const way = { kind: 'directions' as const, steps: [{ do: 'leave' as const, at: { kind: 'square' as const, column: 2, row: 3 }, octant: 'east' as const, lean: null, span: 'near' as const }] };
    w.player.call = { with: npc.id, topic: 'rumor', node: 'wreck', vars: { way }, line: { line: 'wreckWay', vars: { way } }, group: null, asked: [] };
    w.events = [];
    const loaded = reload(w);
    expect(loaded.player.call).toEqual(w.player.call);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
