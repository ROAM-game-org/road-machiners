import { describe, expect, it } from 'vitest';
import { FURY_ROAD } from '../data/modes';
import { MIN_NPC_SPEED } from '../data/npcs';
import { isHostile } from './combat';
import { haulerOf, playerVehicle } from './damage';
import { advanceFuryRoad, hurtShare, planStretch, spawnGroup, waveGear, waveOf } from './fury-road';
import { alongOf, milestoneAt, toRoad } from './highway';
import { OPEN_GEAR } from './npc-loadout';
import { toughness } from './fury-road-director';
import { mountedParts } from './grid';
import { vehicleStats } from './stats';
import { damagePart, maxHp } from './wear';
import { basicsRepairCost, repairCost } from './economy';
import { furyRoadWorld } from './testkit';
import type { Vehicle, World } from './types';

const CHASERS = Object.entries(FURY_ROAD.cards).filter(([, card]) => card.chase).map(([id]) => id);
const BLOCKERS = Object.entries(FURY_ROAD.cards).filter(([, card]) => !card.chase).map(([id]) => id);

function spawned(w: World, templates: string[], stretch: number): Vehicle[] {
  const run = w.furyRoad!;
  const group = { ...run.groups[0], stretch, from: 'ahead' as const, templates, level: waveOf(stretch).level, money: FURY_ROAD.cards[templates[0]].floor, elite: false };
  run.groups = [group];
  spawnGroup(w, run, group, alongOf(w.seed, toRoad(0, playerVehicle(w).pos)));
  return group.vehicles.map((id) => w.vehicles.find((v) => v.id === id)!);
}

describe('Chaos Highway waves', () => {
  it('keeps the roaming speed floor for every truck built outside a run', () => {
    expect(OPEN_GEAR.minSpeed).toBe(MIN_NPC_SPEED);
  });

  it('builds every chasing card at least as fast as the chase speed, and lets blockers be slow', () => {
    for (const template of CHASERS) {
      const stretch = FURY_ROAD.cards[template].from;
      expect(waveGear(template, stretch, FURY_ROAD.cards[template].floor, false).minSpeed).toBe(FURY_ROAD.chaseSpeed);
      for (const seed of [1, 2, 3]) {
        const [truck] = spawned(furyRoadWorld(seed), [template], stretch);
        expect(vehicleStats(furyRoadWorld(seed), truck).maxSpeed, `${template} seed ${seed}`).toBeGreaterThanOrEqual(FURY_ROAD.chaseSpeed);
      }
    }
    for (const template of BLOCKERS) expect(waveGear(template, FURY_ROAD.cards[template].from, FURY_ROAD.cards[template].floor, false).minSpeed).toBe(MIN_NPC_SPEED);
  });

  it('sends a blocker card only from ahead and a chasing card from any side', () => {
    const blocker = BLOCKERS[0];
    const chaser = CHASERS[0];
    const wave = (template: string, i: number) => ({ at: milestoneAt(5) + 40 * (i + 1), template, size: 2, money: 45000, elite: false });
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(planStretch(seed, 6, [0, 1, 2, 3].map((i) => wave(blocker, i))).every((g) => g.from === 'ahead'), `seed ${seed}`).toBe(true);
    }
    const sides = new Set([1, 2, 3, 4, 5].flatMap((seed) => planStretch(seed, 6, [0, 1, 2, 3].map((i) => wave(chaser, i))).map((g) => g.from)));
    expect(sides.size).toBeGreaterThan(1);
  });

  it('spawns plain wave trucks battered by the toughness of their stretch, and elite ones whole', () => {
    for (const stretch of [1, 4, 30]) {
      const w = furyRoadWorld(2);
      const [plain] = spawned(w, ['buggy'], stretch);
      for (const part of mountedParts(plain, 'core')) expect(part.hp, `stretch ${stretch} ${part.defId}`).toBe(Math.round(maxHp(part) * toughness(stretch)));
      const run = w.furyRoad!;
      const elite = { ...run.groups[0], id: 'g-elite', templates: ['buggy'], vehicles: [], spawned: false, elite: true, money: 40000 };
      run.groups.push(elite);
      spawnGroup(w, run, elite, alongOf(w.seed, toRoad(0, playerVehicle(w).pos)));
      const tough = w.vehicles.find((v) => v.id === elite.vehicles[0])!;
      for (const part of mountedParts(tough, 'core')) expect(part.hp).toBe(maxHp(part));
    }
    expect(toughness(1)).toBeLessThan(1);
    expect(toughness(40)).toBe(1);
  });

  it('never makes two wave trucks hostile to each other, even from rival factions, and keeps them hostile to the player', () => {
    const w = furyRoadWorld(4);
    const [raider] = spawned(w, ['buggy'], 1);
    const run = w.furyRoad!;
    const rivalGroup = { ...run.groups[0], id: 'g1-rival', templates: ['courier'], vehicles: [], spawned: false };
    run.groups.push(rivalGroup);
    spawnGroup(w, run, rivalGroup, alongOf(w.seed, toRoad(0, playerVehicle(w).pos)));
    const rival = w.vehicles.find((v) => v.id === rivalGroup.vehicles[0])!;
    expect(raider.faction).not.toBe(rival.faction);
    expect(isHostile(w, raider, rival)).toBe(false);
    expect(isHostile(w, rival, raider)).toBe(false);
    expect(isHostile(w, raider, playerVehicle(w))).toBe(true);
  });
});

describe('Chaos Highway nerve', () => {
  function hurt(v: Vehicle, share: number): void {
    for (const part of mountedParts(v)) damagePart(part, part.hp * share, 0);
  }

  it('knocks out a wave truck once it has lost the nerve share of the HP it spawned with, and counts it beaten', () => {
    const w = furyRoadWorld(5);
    const [truck] = spawned(w, ['buggy'], 2);
    const group = w.furyRoad!.groups[0];
    hurt(truck, FURY_ROAD.nerve - 0.1);
    expect(hurtShare(truck, group)).toBeLessThan(FURY_ROAD.nerve);
    advanceFuryRoad(w);
    expect(truck.defeat ?? null).toBeNull();
    hurt(truck, 0.2);
    expect(hurtShare(truck, group)).toBeGreaterThanOrEqual(FURY_ROAD.nerve);
    advanceFuryRoad(w);
    expect(truck.defeat?.phase).toBe('out');
    expect(group.counted).toEqual([truck.id]);
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'npcKnockout', vehicle: truck.id }));
  });

  it('measures an elite truck against its whole HP, so the same hits leave it in the fight longer', () => {
    const w = furyRoadWorld(5);
    const [truck] = spawned(w, ['buggy'], 4);
    const plain = w.furyRoad!.groups[0];
    expect(hurtShare(truck, plain)).toBeCloseTo(0, 5);
    expect(hurtShare(truck, { ...plain, elite: true })).toBeGreaterThan(0);
  });
});

describe('Chaos Highway repairs', () => {
  function beaten(w: World, truck: Vehicle): void {
    for (const part of mountedParts(truck, 'core')) damagePart(part, maxHp(part) / 2, 1);
  }

  it('prices the hauler repair at the hauler markup and the gun truck repair as anywhere else', () => {
    const w = furyRoadWorld(3);
    const hauler = haulerOf(w);
    const me = playerVehicle(w);
    beaten(w, hauler);
    beaten(w, me);
    const plain = { ...w, furyRoad: null };

    expect(repairCost(w, hauler)).toBeCloseTo(repairCost(plain, hauler) * FURY_ROAD.hauler.repairMarkup);
    expect(basicsRepairCost(w, hauler)).toBeCloseTo(basicsRepairCost(plain, hauler) * FURY_ROAD.hauler.repairMarkup);
    expect(repairCost(w, me)).toBe(repairCost(plain, me));
    expect(repairCost(w, hauler)).toBeGreaterThan(0);
  });
});
