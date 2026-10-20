import { describe, expect, it } from 'vitest';
import { FURY_ROAD } from '../data/modes';
import { BASIC_IDS } from '../data/skills';
import { hasBasic } from './progress';
import { PARTS, partDef } from '../data/parts';
import { GARAGE_STOCK } from '../data/market';
import { RU } from '../text/ru';
import { haulerOf, ownedTruck, playerTrucks, playerVehicle } from './damage';
import { HAULER_KIT, startKit } from '../data/start';
import { chassisDef } from '../data/chassis';
import { getResources } from './resources';
import { fuelCap, vehicleStats } from './stats';
import { mountedParts } from './grid';
import { NPCS } from '../data/npcs';
import { betweenLevels, canDriveOn, furyRoadReadout, outpostFactsAt, reachedOutpostAt, spawnGroup, driveOn, waveGear, waveOf } from './fury-road';
import { planHaulerOrder } from './hauler';
import { endTurn } from './world';
import { cardsOf } from './fury-road-director';
import { generateNpcLoadout } from './npc-loadout';
import { rollPartStockPerKind } from './market';
import { alongOf, toRoad } from './highway';
import { furyRoadStart, furyRoadWorld } from './testkit';
import { RULES } from '../data/rules';
import { sideReach } from './rig';
import { yardSpots } from './outpost-gates';
import { dist } from './vec';
import type { Vehicle } from './types';

function partsOf(w: ReturnType<typeof furyRoadWorld>) {
  return playerVehicle(w).items.flatMap((it) => (it.kind === 'part' ? [it] : []));
}

describe('Fury Road starter kit', () => {
  it('starts every skill at rank 1, so every basic is open', () => {
    const w = furyRoadStart(3);
    expect(Object.values(w.player.ranks)).toEqual([1, 1, 1, 1, 1]);
    expect(BASIC_IDS.every((basic) => hasBasic(w, basic))).toBe(true);
  });

  it('is a scout with one machine gun, no armor and the start money on every seed', () => {
    for (const seed of [1, 3, 99]) {
      const w = furyRoadStart(seed);
      expect(playerVehicle(w).chassisId).toBe('scout');
      const parts = partsOf(w).filter((it) => partDef(it.part.defId).kind !== 'core');
      expect(parts.map((it) => it.part.defId).sort()).toEqual(['mg', 'stockEngine']);
      expect(w.player.money).toBe(startKit('furyRoad').money);
    }
  });
});

describe('Fury Road start outpost', () => {
  it('starts both trucks parked on the paid pad of outpost 0, where the player can shop and wait for the road', () => {
    for (const seed of [1, 3, 99]) {
      const w = furyRoadStart(seed);
      expect(outpostFactsAt(w, 0).paid).toBe(true);
      expect(reachedOutpostAt(w)?.id).toBe('outpost-0');
      expect(reachedOutpostAt(w, haulerOf(w))?.id).toBe('outpost-0');
      expect(betweenLevels(w)).toBe(true);
      expect(canDriveOn(w)).toBe(true);
    }
  });

  it('spawns no group before the road opens', () => {
    let w = furyRoadStart(3);
    for (let i = 0; i < 40; i++) w = endTurn(w, () => {});
    expect(w.furyRoad!.groups.some((g) => g.spawned)).toBe(false);
    expect(haulerOf(w).speed).toBe(0);
  });

  it('opens stretch 1 on the same window at the wait, with the hauler setting off for outpost 1', () => {
    const w = driveOn(furyRoadStart(3));
    expect(w.furyRoad!.window).toBe(0);
    expect(w.furyRoad!.waitingAt).toBeNull();
    expect(w.events).toContainEqual({ t: 'roadOpened', stretch: 1 });
    expect(furyRoadReadout(w)?.stretch).toBe(1);
    planHaulerOrder(w);
    expect(haulerOf(w).order?.kind).toBe('through');
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

  it('starts the trucks side by side at their yard spots, clear of each other', () => {
    for (const seed of [1, 3, 99]) {
      const w = furyRoadStart(seed);
      const hauler = haulerOf(w);
      const me = playerVehicle(w);
      expect(hauler.pos).toEqual(yardSpots(w, 0).hauler);
      expect(me.pos).toEqual(yardSpots(w, 0).truck);
      expect(dist(hauler.pos, me.pos) - sideReach(hauler.chassisId) - sideReach(me.chassisId)).toBeGreaterThan(RULES.yieldDistance / 2);
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

  it('holds five guns, six armor parts, three of most other types and every store and scanner part, never two of the same part', () => {
    const wanted: Record<string, number> = { weapon: 5, armor: 6, engine: 3, cargo: 3, utility: 3, store: 2, scanner: 1 };
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
    expect(loaded.furyRoad.outposts[1].stock).toEqual(before);
  });
});

describe('Fury Road first enemy', () => {
  function spawnedTrucks(seed: number, stretch: number, template: string, elite = false) {
    const w = furyRoadWorld(seed);
    const run = w.furyRoad!;
    const group = { ...run.groups[0], stretch, from: 'ahead' as const, templates: [template], level: waveOf(stretch).level, money: FURY_ROAD.cards[template].floor * (elite ? FURY_ROAD.director.elite.money : 1), elite };
    run.groups = [group];
    spawnGroup(w, run, group, alongOf(w.seed, toRoad(w.seed, 0, playerVehicle(w).pos)));
    return group.vehicles.map((id) => w.vehicles.find((v) => v.id === id)!);
  }

  const armorOf = (v: Vehicle) => v.items.filter((it) => it.kind === 'part' && partDef(it.part.defId).kind === 'armor');
  const firstTemplates = cardsOf(1).map(([template]) => template);

  it('carries no armor, mounted or spare, on any seed or template', () => {
    for (const seed of [1, 3, 99]) {
      for (const template of firstTemplates) {
        const trucks = spawnedTrucks(seed, 1, template);
        expect(trucks).toHaveLength(1);
        expect(armorOf(trucks[0])).toEqual([]);
      }
    }
  });

  it('carries a gun on any seed or template', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 99]) {
      for (const template of firstTemplates) {
        const guns = spawnedTrucks(seed, 1, template)[0].items.filter((it) => it.kind === 'part' && partDef(it.part.defId).kind === 'weapon');
        expect(guns.length, `seed ${seed} ${template}`).toBeGreaterThan(0);
      }
    }
  });

  it('carries no gun above the tier of its stretch, mounted or spare', () => {
    const w = furyRoadWorld(3);
    for (const stretch of [1, 3]) {
      for (const [template, card] of cardsOf(stretch)) {
        const gear = waveGear(template, stretch, card.floor, false);
        for (const seed of [1, 2, 3]) {
          const loadout = generateNpcLoadout({ ...w, rngState: seed }, NPCS[template], null, waveOf(stretch).level, gear);
          const guns = [...loadout.parts, ...loadout.spares].map((p) => partDef(p.defId)).filter((d) => d.kind === 'weapon');
          expect(guns.filter((d) => d.tier > gear.gunTier).map((d) => d.id), `stretch ${stretch} ${template} seed ${seed}`).toEqual([]);
        }
      }
    }
  });

  it('puts armor only on the trucks of an elite group', () => {
    const elite = [1, 3, 99].flatMap((seed) => firstTemplates.flatMap((template) => spawnedTrucks(seed, 3, template, true)));
    const plain = [1, 3, 99].flatMap((seed) => firstTemplates.flatMap((template) => spawnedTrucks(seed, 3, template, false)));

    expect(elite.filter((v) => armorOf(v).length > 0).length).toBeGreaterThan(0);
    expect(plain.filter((v) => armorOf(v).length > 0)).toEqual([]);
  });
});
