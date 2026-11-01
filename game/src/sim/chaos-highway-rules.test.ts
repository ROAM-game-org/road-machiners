import { describe, expect, it } from 'vitest';
import { CHAOS_HIGHWAY } from '../data/modes';
import { MIN_NPC_SPEED, NPCS, RAIDER_CHASE_SPEED } from '../data/npcs';
import { TERRAIN } from '../data/terrain';
import { autoOrders, groupPrey, isHostile, targetBlock } from './combat';
import { type Vec, DEG, bearing, dist } from './vec';
import { refreshVision } from './vision';
import { topGoal } from './npc-activities';
import { haulerOf, playerVehicle } from './damage';
import { advanceChaosHighway, hurtShare, planStretch, spawnGroup, waveGear, waveOf } from './chaos-highway';
import { alongOf, milestoneAt, roadHeading, roadPoint, toRoad } from './highway';
import { rollingOrder } from './hunters';
import { generateNpcLoadout, openGear } from './npc-loadout';
import { mountedParts } from './grid';
import { vehicleStats } from './stats';
import { damagePart, maxHp } from './wear';
import { chaosHighwayWorld } from './testkit';
import type { Vehicle, World } from './types';
import { reusedWorld } from '../test/world-cache';

function startWorld(seed = 3): World {
  return reusedWorld(`chaos highway ${seed}`, () => chaosHighwayWorld(seed));
}

const CHASERS = Object.entries(CHAOS_HIGHWAY.cards).filter(([, card]) => card.chase).map(([id]) => id);
const BLOCKERS = Object.entries(CHAOS_HIGHWAY.cards).filter(([, card]) => !card.chase).map(([id]) => id);

function spawned(w: World, templates: string[], stretch: number): Vehicle[] {
  const run = w.chaosHighway!;
  const group = { ...run.groups[0], stretch, from: 'ahead' as const, templates, level: waveOf(stretch).level, money: CHAOS_HIGHWAY.cards[templates[0]].floor, elite: false };
  run.groups = [group];
  spawnGroup(w, run, group, alongOf(w.seed, toRoad(w.seed, 0, playerVehicle(w).pos)));
  return group.vehicles.map((id) => w.vehicles.find((v) => v.id === id)!);
}

describe('Chaos Highway waves', () => {
  it('keeps the roaming speed floor for every truck built outside a run', () => {
    expect(openGear(NPCS.trader.loadout).minSpeed).toBe(MIN_NPC_SPEED);
    expect(openGear(NPCS.gunwagon.loadout).minSpeed).toBe(RAIDER_CHASE_SPEED);
  });

  it('builds every chasing card at least as fast as the chase speed, and lets blockers be slow', () => {
    for (const template of CHASERS) {
      const stretch = CHAOS_HIGHWAY.cards[template].from;
      expect(waveGear(template, stretch, CHAOS_HIGHWAY.cards[template].floor, false).minSpeed).toBe(CHAOS_HIGHWAY.chaseSpeed);
      for (const seed of [1, 2, 3]) {
        const [truck] = spawned(startWorld(seed), [template], stretch);
        expect(vehicleStats(startWorld(seed), truck).maxSpeed, `${template} seed ${seed}`).toBeGreaterThanOrEqual(CHAOS_HIGHWAY.chaseSpeed);
      }
    }
    for (const template of BLOCKERS) expect(waveGear(template, CHAOS_HIGHWAY.cards[template].from, CHAOS_HIGHWAY.cards[template].floor, false).minSpeed).toBe(MIN_NPC_SPEED);
    for (const template of Object.keys(CHAOS_HIGHWAY.cards)) {
      const gear = waveGear(template, CHAOS_HIGHWAY.cards[template].from, CHAOS_HIGHWAY.cards[template].floor, false);
      expect(gear.chassisFloor).toBe(gear.minSpeed);
    }
  });

  it('builds every card, plain and elite, from its floor money to four times it, without running out of room', () => {
    const w = startWorld(1);
    for (const [template, card] of Object.entries(CHAOS_HIGHWAY.cards)) {
      for (const elite of [false, true]) {
        for (const times of [1, 4]) {
          for (const seed of [1, 4, 9]) {
            const money = card.floor * times * (elite ? CHAOS_HIGHWAY.director.elite.money : 1);
            expect(() => generateNpcLoadout({ ...w, rngState: seed }, NPCS[template], null, 'light', waveGear(template, card.from, money, elite)), `${template} ${money} ${seed}`).not.toThrow();
          }
        }
      }
    }
  });

  it('sends a blocker card only from ahead and a chasing card from any side', () => {
    const blocker = BLOCKERS[0];
    const chaser = CHASERS[0];
    const waves = (seed: number, template: string) => [0, 1, 2, 3].map((i) => ({ at: milestoneAt(seed, 5) + 40 * (i + 1), template, size: 2, money: 45000, elite: false }));
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(planStretch(seed, 6, waves(seed, blocker)).every((g) => g.from === 'ahead'), `seed ${seed}`).toBe(true);
    }
    const sides = new Set([1, 2, 3, 4, 5].flatMap((seed) => planStretch(seed, 6, waves(seed, chaser)).map((g) => g.from)));
    expect(sides.size).toBeGreaterThan(1);
  });

  it('spawns wave trucks with every part at full HP', () => {
    for (const stretch of [1, 4, 30]) {
      const [truck] = spawned(startWorld(2), ['buggy'], stretch);
      for (const part of mountedParts(truck)) expect(part.hp, `stretch ${stretch} ${part.defId}`).toBe(maxHp(part));
    }
  });

  it('never makes two wave trucks hostile to each other, even from rival factions, and keeps them hostile to the player', () => {
    const w = startWorld(4);
    const [raider] = spawned(w, ['buggy'], 1);
    const run = w.chaosHighway!;
    const rivalGroup = { ...run.groups[0], id: 'g1-rival', templates: ['courier'], vehicles: [], spawned: false };
    run.groups.push(rivalGroup);
    spawnGroup(w, run, rivalGroup, alongOf(w.seed, toRoad(w.seed, 0, playerVehicle(w).pos)));
    const rival = w.vehicles.find((v) => v.id === rivalGroup.vehicles[0])!;
    expect(raider.faction).not.toBe(rival.faction);
    expect(isHostile(w, raider, rival)).toBe(false);
    expect(isHostile(w, rival, raider)).toBe(false);
    expect(isHostile(w, raider, playerVehicle(w))).toBe(true);
  });
});

describe('Chaos Highway fire', () => {
  it('has a wave truck shoot the gun truck in reach, even with the hauler nearer', () => {
    const w = startWorld(2);
    const [truck] = spawned(w, ['buggy'], 1);
    const hauler = haulerOf(w);
    const me = playerVehicle(w);
    truck.pos = { x: hauler.pos.x + 4, y: hauler.pos.y };
    me.pos = { x: hauler.pos.x + 1, y: hauler.pos.y + 4 };
    const gun = vehicleStats(w, truck).weapons[0];
    truck.heading = bearing(truck.pos, me.pos) - gun.facing * DEG;
    refreshVision(w);
    autoOrders(w, truck);
    const targets = Object.values(truck.weaponOrders).map((o) => o.targetId);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((id) => id === me.id)).toBe(true);
  });

});

describe('Chaos Highway rolling start', () => {
  it('waits far ahead of its moving prey, rolls north faster as the prey closes but slower than the prey, and leaves the fight AI in charge in gun reach', () => {
    const w = startWorld(2);
    const [truck] = spawned(w, ['buggy'], 1);
    const prey = haulerOf(w);
    const window = w.chaosHighway!.window;
    playerVehicle(w).pos = roadPoint(w.seed, window, alongOf(w.seed, toRoad(w.seed, window, prey.pos)) - 60, 0);
    const reach = Math.max(...vehicleStats(w, truck).weapons.map((mw) => mw.def.range));
    const at = (gap: number) => {
      truck.pos = roadPoint(w.seed, window, alongOf(w.seed, toRoad(w.seed, window, prey.pos)) + gap, 0);
      return rollingOrder(w, truck);
    };
    const paceAt = (gap: number) => {
      const order = at(gap);
      if (order?.kind === 'brake') return 0;
      if (order?.kind !== 'through') throw new Error('expected rolling orders');
      return order.pace!;
    };
    const { near, ramp, close } = CHAOS_HIGHWAY.rolling;
    const release = Math.max(near, reach);
    for (const speed of [2, 4.5, 8.9]) {
      prey.speed = speed;
      expect(at(near + ramp + 5)).toEqual({ kind: 'brake' });
      let last = 0;
      for (let gap = near + ramp; gap > release + 0.5; gap -= 2) {
        const pace = paceAt(gap);
        expect(pace).toBeLessThanOrEqual((1 - close) * speed + 1e-9);
        expect(pace).toBeGreaterThanOrEqual(last);
        last = pace;
      }
      expect(last).toBeGreaterThan(0);
      expect(at(reach - 1)).toBeNull();
      expect(at(near - 1)).toBeNull();
    }
    const dest = (at(release + 5) as { dest: Vec }).dest;
    expect(alongOf(w.seed, toRoad(w.seed, window, dest))).toBeGreaterThan(alongOf(w.seed, toRoad(w.seed, window, truck.pos)));
    prey.speed = 0;
    expect(at(near + ramp * 0.5)).toBeNull();
  });

  it('hands a hunter that its prey has hit to the fight drive at any gap', () => {
    const w = startWorld(2);
    const [truck] = spawned(w, ['buggy'], 1);
    const prey = groupPrey(w, truck);
    prey.speed = 4;
    const window = w.chaosHighway!.window;
    const { near, ramp } = CHAOS_HIGHWAY.rolling;
    truck.pos = roadPoint(w.seed, window, alongOf(w.seed, toRoad(w.seed, window, prey.pos)) + near + ramp * 0.5, 0);
    expect(rollingOrder(w, truck)).not.toBeNull();
    truck.brain!.attackers[prey.id] = true;
    expect(rollingOrder(w, truck)).toBeNull();
  });

  it('runs at full speed for a point ahead of a prey that is out of its gun reach ahead, and leaves a prey in reach to the fight AI', () => {
    const w = startWorld(2);
    const [truck] = spawned(w, ['buggy'], 1);
    const prey = groupPrey(w, truck);
    prey.speed = 4;
    const window = w.chaosHighway!.window;
    const preyAlong = alongOf(w.seed, toRoad(w.seed, window,prey.pos));
    const reach = Math.max(...vehicleStats(w, truck).weapons.map((mw) => mw.def.range));
    truck.pos = roadPoint(w.seed, window, preyAlong - reach - 10, 0);
    const order = rollingOrder(w, truck);
    if (order?.kind !== 'through') throw new Error('expected a catch-up order');
    expect(order.pace).toBe(vehicleStats(w, truck).maxSpeed);
    expect(alongOf(w.seed, toRoad(w.seed, window,order.dest))).toBeGreaterThan(preyAlong);
    truck.pos = roadPoint(w.seed, window, preyAlong - reach + 2, 0);
    expect(rollingOrder(w, truck)).toBeNull();
  });

  it('spawns group trucks parked out of the hauler sight, heading north along the road', () => {
    const w = startWorld(3);
    const trucks = spawned(w, ['buggy', 'courier'], 1);
    for (const truck of trucks) {
      expect(truck.speed).toBe(0);
      expect(truck.heading).toBeCloseTo(roadHeading(w.seed, alongOf(w.seed, toRoad(w.seed, w.chaosHighway!.window, truck.pos))));
      expect(dist(truck.pos, haulerOf(w).pos)).toBeGreaterThan(TERRAIN.vision.radius);
    }
  });
});

describe('Chaos Highway prey', () => {
  function apart(w: World, truck: Vehicle, haulerGap: number, playerGap: number): void {
    const hauler = haulerOf(w);
    truck.pos = { x: hauler.pos.x + haulerGap, y: hauler.pos.y };
    playerVehicle(w).pos = { x: truck.pos.x, y: truck.pos.y + playerGap };
  }

  function unarmed(me: Vehicle): void {
    for (const part of mountedParts(me, 'weapon')) part.hp = 0;
  }

  it('goes for the gun truck in a tie and while the hauler is nearer by less than the margin', () => {
    const w = startWorld(2);
    const [truck] = spawned(w, ['buggy'], 1);
    unarmed(playerVehicle(w));
    apart(w, truck, 10, 10);
    expect(groupPrey(w, truck).id).toBe(w.player.vehicleId);
    apart(w, truck, 10, 10 + CHAOS_HIGHWAY.playerMargin - 1);
    expect(groupPrey(w, truck).id).toBe(w.player.vehicleId);
  });

  it('goes for the hauler once it is nearer by more than the margin, and hunts and shoots it', () => {
    const w = startWorld(2);
    const [truck] = spawned(w, ['buggy'], 1);
    unarmed(playerVehicle(w));
    apart(w, truck, 4, 4 + CHAOS_HIGHWAY.playerMargin + 2);
    truck.heading = Math.PI;
    expect(groupPrey(w, truck).id).toBe(haulerOf(w).id);
    refreshVision(w);
    advanceChaosHighway(w);
    expect(topGoal(truck)).toMatchObject({ kind: 'fight', targetId: haulerOf(w).id });
  });

  it('goes for the gun truck that hit it, however near the hauler is', () => {
    const w = startWorld(2);
    const [truck] = spawned(w, ['buggy'], 1);
    unarmed(playerVehicle(w));
    apart(w, truck, 3, 30);
    truck.brain!.attackers[w.player.vehicleId] = true;
    expect(groupPrey(w, truck).id).toBe(w.player.vehicleId);
  });

  it('goes for the gun truck whose gun can hit it, however near the hauler is', () => {
    const w = startWorld(2);
    const [truck] = spawned(w, ['buggy'], 1);
    const me = playerVehicle(w);
    const [mw] = vehicleStats(w, me).weapons;
    const aim = me.heading + (mw.facing * Math.PI) / 180;
    const reach = Math.min(mw.def.range * 0.6, 12);
    truck.pos = { x: me.pos.x + Math.cos(aim) * reach, y: me.pos.y + Math.sin(aim) * reach };
    haulerOf(w).pos = { x: truck.pos.x + Math.cos(aim) * 3, y: truck.pos.y + Math.sin(aim) * 3 };
    refreshVision(w);
    expect(targetBlock(w, me, mw, truck)).toBeNull();
    const margin = CHAOS_HIGHWAY.playerMargin;
    CHAOS_HIGHWAY.playerMargin = 0;
    try {
      expect(dist(truck.pos, haulerOf(w).pos)).toBeLessThan(dist(truck.pos, me.pos));
      expect(groupPrey(w, truck).id).toBe(me.id);
      unarmed(me);
      expect(groupPrey(w, truck).id).toBe(haulerOf(w).id);
    } finally {
      CHAOS_HIGHWAY.playerMargin = margin;
    }
  });
  it('goes for the hauler while it is far from the hauler, even when the gun truck hit it', () => {
    const w = startWorld(2);
    const [truck] = spawned(w, ['buggy'], 1);
    const me = playerVehicle(w);
    const hauler = haulerOf(w);
    truck.brain!.attackers[me.id] = true;
    apart(w, truck, CHAOS_HIGHWAY.haulerNear + 5, 3);
    expect(groupPrey(w, truck).id).toBe(hauler.id);
    apart(w, truck, CHAOS_HIGHWAY.haulerNear - 5, 3);
    expect(groupPrey(w, truck).id).toBe(me.id);
  });
});

describe('Chaos Highway nerve', () => {
  function hurt(v: Vehicle, share: number): void {
    for (const part of mountedParts(v)) damagePart(part, part.hp * share, 0);
  }

  it('knocks out a wave truck once it has lost the nerve share of its HP, and counts it beaten', () => {
    const w = startWorld(5);
    const [truck] = spawned(w, ['buggy'], 2);
    const group = w.chaosHighway!.groups[0];
    hurt(truck, CHAOS_HIGHWAY.nerve - 0.1);
    expect(hurtShare(truck)).toBeLessThan(CHAOS_HIGHWAY.nerve);
    advanceChaosHighway(w);
    expect(truck.defeat ?? null).toBeNull();
    hurt(truck, 0.2);
    expect(hurtShare(truck)).toBeGreaterThanOrEqual(CHAOS_HIGHWAY.nerve);
    advanceChaosHighway(w);
    expect(truck.defeat?.phase).toBe('out');
    expect(group.counted).toEqual([truck.id]);
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'npcKnockout', vehicle: truck.id }));
  });
});
