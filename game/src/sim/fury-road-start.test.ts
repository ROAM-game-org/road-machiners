import { describe, expect, it } from 'vitest';
import { FURY_ROAD } from '../data/modes';
import { PARTS, partDef } from '../data/parts';
import { GARAGE_STOCK } from '../data/market';
import { RU } from '../text/ru';
import { playerVehicle } from './damage';
import { outpostFactsAt, spawnGroup, waveOf } from './fury-road';
import { alongOf, toRoad } from './highway';
import { furyRoadWorld } from './testkit';
import type { Vehicle } from './types';

function partsOf(w: ReturnType<typeof furyRoadWorld>) {
  return playerVehicle(w).items.flatMap((it) => (it.kind === 'part' ? [it] : []));
}

describe('Fury Road starter kit', () => {
  it('is a scout with one machine gun and a rebar cage front and back on every seed', () => {
    for (const seed of [1, 3, 99]) {
      const w = furyRoadWorld(seed);
      const truck = playerVehicle(w);
      expect(truck.chassisId).toBe('scout');
      const parts = partsOf(w).filter((it) => partDef(it.part.defId).kind !== 'core');
      expect(parts.filter((it) => partDef(it.part.defId).kind === 'weapon').map((it) => it.part.defId)).toEqual(['mg']);
      const cages = parts.filter((it) => it.part.defId === 'cage');
      expect(cages.map((it) => it.y).sort()).toEqual([0, 7]);
      expect(parts.filter((it) => partDef(it.part.defId).kind === 'armor')).toHaveLength(2);
    }
  });
});

describe('Slug cannon name', () => {
  it('reads as a cannon in Russian, not the old coinage', () => {
    expect(JSON.stringify(RU["part.slugCannon"])).not.toMatch(/жаканом[её]т/i);
  });
});

describe('Fury Road outpost stock', () => {
  const kinds = [...new Set(GARAGE_STOCK.parts.map((p) => PARTS[p.value].kind))];

  it('holds four armor parts and exactly two parts of every other part type', () => {
    for (const seed of [1, 3, 99]) {
      const stock = outpostFactsAt(furyRoadWorld(seed), 1).stock;
      expect(stock).toHaveLength(kinds.length * 2 + 2);
      for (const kind of kinds) expect(stock.filter((p) => partDef(p.defId).kind === kind)).toHaveLength(kind === 'armor' ? 4 : 2);
    }
  });

  it('keeps the same stock through a save and load', () => {
    const w = furyRoadWorld(5);
    const before = outpostFactsAt(w, 1).stock;
    const loaded = JSON.parse(JSON.stringify(w));
    expect(loaded.furyRoad.outposts[0].stock).toEqual(before);
  });
});

describe('Fury Road first enemy', () => {
  function spawnedTrucks(seed: number, stretch: number, template: string) {
    const w = furyRoadWorld(seed);
    const run = w.furyRoad!;
    const group = { ...run.groups[0], stretch, from: 'ahead' as const, templates: [template], level: waveOf(stretch).level };
    run.groups = [group];
    spawnGroup(w, run, group, alongOf(w.seed, toRoad(0, playerVehicle(w).pos)));
    return group.vehicles.map((id) => w.vehicles.find((v) => v.id === id)!);
  }

  const armorOf = (v: Vehicle) => v.items.filter((it) => it.kind === 'part' && partDef(it.part.defId).kind === 'armor');

  it('carries no armor, mounted or spare, on any seed or template', () => {
    for (const seed of [1, 3, 99]) {
      for (const template of Object.keys(FURY_ROAD.pool[0].weights)) {
        const trucks = spawnedTrucks(seed, 1, template);
        expect(trucks).toHaveLength(1);
        expect(armorOf(trucks[0])).toEqual([]);
      }
    }
  });

  it('leaves armor on the trucks of the next stretch', () => {
    const armored = [1, 3, 99].flatMap((seed) => Object.keys(FURY_ROAD.pool[0].weights).flatMap((template) => spawnedTrucks(seed, 2, template))).filter((v) => armorOf(v).length > 0);
    expect(armored.length).toBeGreaterThan(0);
  });
});
