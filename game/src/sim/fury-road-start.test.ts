import { describe, expect, it } from 'vitest';
import { FURY_ROAD } from '../data/modes';
import { PARTS, partDef } from '../data/parts';
import { GARAGE_STOCK } from '../data/market';
import { RU } from '../text/ru';
import { haulerOf, ownedTruck, playerTrucks, playerVehicle } from './damage';
import { HAULER_KIT } from '../data/start';
import { chassisDef } from '../data/chassis';
import { getResources } from './resources';
import { fuelCap, vehicleStats } from './stats';
import { mountedParts } from './grid';
import { NPCS } from '../data/npcs';
import { outpostFactsAt, spawnGroup, waveOf } from './fury-road';
import { gearMoneyOf } from './fury-road-danger';
import { generateNpcLoadout } from './npc-loadout';
import { rollPartStockPerKind } from './market';
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

describe('Fury Road hauler', () => {
  it('starts every run with the player truck and a hauler of the hauler kit, with a full tank and no brain', () => {
    for (const seed of [1, 3, 99]) {
      const w = furyRoadWorld(seed);
      const hauler = haulerOf(w);
      expect(playerTrucks(w).map((v) => v.id)).toEqual([w.player.vehicleId, hauler.id]);
      expect(hauler.chassisId).toBe(HAULER_KIT.chassis);
      expect(hauler.faction).toBe('player');
      expect(hauler.brain).toBeNull();
      expect(getResources(w, hauler)).toMatchObject({ fuel: fuelCap(hauler), supplies: HAULER_KIT.supplies, health: 100 });
      expect(w.furyRoad!.hauler).toEqual({ id: hauler.id, alarmUntil: null });
      const kinds = mountedParts(hauler).map((p) => partDef(p.defId).kind);
      expect(kinds.filter((k) => k === 'weapon')).toEqual([]);
      expect(kinds).toContain('engine');
    }
  });

  it('keeps the hauler own resources apart from the player', () => {
    const w = furyRoadWorld(3);
    expect(getResources(w, haulerOf(w))).not.toBe(w.player);
  });

  it('drives at a speed that is a real top speed for a heavy truck', () => {
    const w = furyRoadWorld(3);
    const speed = vehicleStats(w, haulerOf(w)).maxSpeed;
    expect(speed).toBeGreaterThan(FURY_ROAD.hauler.cruise);
    expect(speed).toBeLessThanOrEqual(chassisDef('semi').maxSpeed * 1.1);
  });

  it('names an owned truck and refuses any other', () => {
    const w = furyRoadWorld(3);
    expect(ownedTruck(w, haulerOf(w).id)).toBe(haulerOf(w));
    expect(() => ownedTruck(w, 'nobody')).toThrow(/does not own/);
  });
});

describe('Slug cannon name', () => {
  it('reads as a cannon in Russian, not the old coinage', () => {
    expect(JSON.stringify(RU["part.slugCannon"])).not.toMatch(/жаканом[её]т/i);
  });
});

describe('Fury Road outpost stock', () => {
  const kinds = [...new Set(GARAGE_STOCK.parts.map((p) => PARTS[p.value].kind))];

  it('holds four guns, four armor parts, three of most other types and every store and scanner part, never two of the same part', () => {
    const wanted: Record<string, number> = { weapon: 4, armor: 4, engine: 3, cargo: 3, utility: 3, store: 2, scanner: 1 };
    expect(kinds.sort()).toEqual(Object.keys(wanted).sort());
    for (const seed of [1, 3, 99]) {
      const stock = outpostFactsAt(furyRoadWorld(seed), 1).stock;
      for (const kind of kinds) expect(stock.filter((p) => partDef(p.defId).kind === kind), `seed ${seed} ${kind}`).toHaveLength(wanted[kind]);
      expect(new Set(stock.map((p) => p.defId)).size).toBe(stock.length);
    }
  });

  it('refuses a count above the different parts a type has', () => {
    const w = furyRoadWorld(1);
    expect(() => rollPartStockPerKind(w, { rngState: 1 }, GARAGE_STOCK, { ...FURY_ROAD.stockPerKind, scanner: 2 }, 'test')).toThrow(/only 1/);
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

  it('carries a gun on any seed or template', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 99]) {
      for (const template of Object.keys(FURY_ROAD.pool[0].weights)) {
        const guns = spawnedTrucks(seed, 1, template)[0].items.filter((it) => it.kind === 'part' && partDef(it.part.defId).kind === 'weapon');
        expect(guns.length, `seed ${seed} ${template}`).toBeGreaterThan(0);
      }
    }
  });

  it('carries no gun above the tier of its stretch, mounted or spare', () => {
    const w = furyRoadWorld(3);
    const templates = Object.keys(NPCS).filter((id) => FURY_ROAD.pool.some((tier) => id in tier.weights));
    for (const stretch of [1, 3]) {
      const gear = { ...waveOf(stretch).gear, money: gearMoneyOf(w, stretch) };
      for (const template of templates) {
        for (const seed of [1, 2, 3]) {
          const loadout = generateNpcLoadout({ ...w, rngState: seed }, NPCS[template], null, waveOf(stretch).level, gear);
          const guns = [...loadout.parts, ...loadout.spares].map((p) => partDef(p.defId)).filter((d) => d.kind === 'weapon');
          expect(guns.filter((d) => d.tier > gear.gunTier).map((d) => d.id), `stretch ${stretch} ${template} seed ${seed}`).toEqual([]);
        }
      }
    }
  });

  it('leaves armor on the trucks of the next stretch', () => {
    const armored = [1, 3, 99].flatMap((seed) => Object.keys(FURY_ROAD.pool[0].weights).flatMap((template) => spawnedTrucks(seed, 2, template))).filter((v) => armorOf(v).length > 0);
    expect(armored.length).toBeGreaterThan(0);
  });
});
