import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { gridOf, mountedParts } from '../sim/grid';
import { makePart } from '../sim/factory';
import { addGoods, mountPart } from '../sim/inventory';
import { defaultSetup } from '../sim/settings';
import { addVehicle } from '../sim/testkit';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function vanWithFrame(): World {
  const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
  w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  const old = playerVehicle(w);
  const van = addVehicle(w, 'player', 'van', ['stockEngine'], old.pos);
  w.vehicles = w.vehicles.filter((v) => v.id !== old.id);
  w.player.vehicleId = van.id;
  mountPart(w, van, makePart(w, 'lightFrame', 0));
  addGoods(w, van, 'scrap', gridOf(van).cells.flat().filter((c) => c === '.').length);
  w.events = [];
  return w;
}

describe('a cargo bed van across a save', () => {
  it('loads the same world with goods on the sixth frame row and awards nothing', () => {
    const w = vanWithFrame();
    const van = playerVehicle(w);
    const g = gridOf(van);
    expect(g.h - g.chassisH).toBe(6);
    expect(van.items.some((it) => it.kind !== 'part' && it.y === g.h - 1)).toBe(true);

    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    const loadedVan = playerVehicle(loaded);

    expect(gridOf(loadedVan).h).toBe(g.h);
    expect(loadedVan.items).toEqual(van.items);
    expect(mountedParts(loadedVan, 'cargo')).toHaveLength(1);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
