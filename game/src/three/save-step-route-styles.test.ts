import { describe, expect, it } from 'vitest';
import FORMAT_2_124 from './save-fixtures/format-2-124.json';
import { START_KITS } from '../data/start';
import { defaultSetup } from '../sim/settings';
import { addVehicle, npcBrain } from '../sim/testkit';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

const step = TINY_STEPS.find((s) => s.name === 'withRouteStyles')!;
const dest = { x: 10, y: 10 };

function npc(id: string, farRoute?: Record<string, unknown>): SavedJson {
  return { id, brain: { goals: [], ...(farRoute ? { farRoute } : {}) } };
}

function farRouteOf(world: SavedJson, id: string): SavedJson | undefined {
  const vehicle = (world.vehicles as SavedJson[]).find((v) => v.id === id)!;
  return (vehicle.brain as SavedJson).farRoute as SavedJson | undefined;
}

describe('save migration 124 to 125, far routes keep a route style', () => {
  const saved = {
    ...structuredClone(FORMAT_2_124),
    vehicles: [
      npc('hidden', { dest, points: [dest], offRoad: true }),
      npc('road', { dest, points: [dest], offRoad: false, night: true }),
      npc('idle'),
      { id: 'player', brain: null },
    ],
  } as unknown as SavedJson;

  it('sits after the whole money step', () => {
    expect(TINY_STEPS[124 - TINY_FROM]).toBe(step);
  });

  it('turns the off-road flag into hidden or road and leaves no flag behind', () => {
    const next = step.step(structuredClone(saved));
    expect(farRouteOf(next, 'hidden')).toEqual({ dest, points: [dest], style: 'hidden' });
    expect(farRouteOf(next, 'road')).toEqual({ dest, points: [dest], style: 'road', night: true });
  });

  it('leaves trucks without a far route, and the player, as they were', () => {
    const next = step.step(structuredClone(saved));
    expect((next.vehicles as SavedJson[]).slice(2)).toEqual((saved.vehicles as SavedJson[]).slice(2));
    expect(next.player).toEqual(saved.player);
  });
});

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('far routes across a save', () => {
  it('load gives back a scavenger mid cut route and awards nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const scavenger = addVehicle(w, 'independent', 'buggy', ['mg', 'stockEngine'], { x: w.vehicles[0].pos.x + 40, y: w.vehicles[0].pos.y });
    scavenger.brain = npcBrain('scavenger', scavenger.pos, ['scavenger']);
    scavenger.brain.farRoute = { dest, points: [{ x: 50, y: 50 }, dest], style: 'cut' };
    const loaded = reload(w);
    expect(loaded.vehicles.find((v) => v.id === scavenger.id)!.brain!.farRoute).toEqual(scavenger.brain.farRoute);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
