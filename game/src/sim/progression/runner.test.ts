import { describe, expect, it } from 'vitest';
import { haulerOf, playerVehicle } from '../damage';
import { corePart, goodsCount, mountedParts } from '../grid';
import { partDef } from '../../data/parts';
import { inYard, yardSpots } from '../outpost-gates';
import { addVehicle, furyRoadWorld, npcBrain, parkInYard } from '../testkit';
import type { Vehicle, World } from '../types';
import { followSpot } from '../tow';
import { dist, type Vec } from '../vec';
import { maxHp } from '../wear';
import { refreshVision } from '../vision';
import { endTurn } from '../world';
import { botOrders } from './bot';
import { fightMove } from './escort-brain';

function atFirstOutpost(): World {
  const w = furyRoadWorld();
  parkInYard(w, 1);
  return endTurn(w, () => {});
}

function hostileNear(w: World): Vehicle {
  const me = playerVehicle(w);
  const foe = addVehicle(w, 'scrapjaw', 'buggy', ['mg'], { x: me.pos.x + 6, y: me.pos.y });
  foe.brain = npcBrain('merc', foe.pos, ['raider']);
  return foe;
}

function escortSpotOf(w: World): Vec {
  return followSpot(w, playerVehicle(w), haulerOf(w), 0);
}

describe('the Fury Road escort bot', () => {
  it('repairs both trucks, restocks patch parts, drives on and keeps beside the hauler', () => {
    const w = atFirstOutpost();
    for (const truck of [playerVehicle(w), haulerOf(w)]) for (const part of mountedParts(truck)) part.hp = Math.ceil(maxHp(part) * 0.6);
    const me = playerVehicle(w);
    me.items = me.items.filter((it) => !(it.kind === 'good' && it.good === 'parts'));
    w.player.money = 100_000;

    const turn = botOrders(w, 'escort');
    const after = playerVehicle(turn.world);

    expect(mountedParts(after).every((p) => p.hp === maxHp(p))).toBe(true);
    expect(mountedParts(haulerOf(turn.world)).every((p) => p.hp === maxHp(p))).toBe(true);
    expect(goodsCount(after).parts).toBe(4);
    expect(turn.events).toContainEqual({ t: 'roadOpened', stretch: 2 });
    expect(turn.world.furyRoad?.window).toBe(1);
    const hop = after.order?.kind === 'stopAt' ? after.order.dest : null;
    expect(hop).not.toBeNull();
    expect(dist(hop!, haulerOf(turn.world).pos)).toBeLessThan(12);
    expect(turn.ledger.repairs).toBeLessThan(0);
  });

  it('parks on its own yard spot whatever the hauler does, so a hauler stopped off its spot never blocks it', () => {
    const w = atFirstOutpost();
    const spots = yardSpots(w, 1);
    for (const side of [1, -1]) {
      const world = structuredClone(w);
      const hauler = haulerOf(world);
      hauler.pos = { x: spots.hauler.x + side * 2, y: spots.hauler.y };
      playerVehicle(world).pos = { x: spots.truck.x, y: spots.truck.y + 14 };

      const after = playerVehicle(botOrders(world, 'escort').world);
      const spot = after.order?.kind === 'stopAt' ? after.order.dest : null;

      expect(spot).toEqual(spots.truck);
      expect(inYard(world, spot!, 1)).toBe(true);
    }
  });

  it('parks to patch when stranded out of combat with parts to patch with', () => {
    const w = furyRoadWorld();
    const me = playerVehicle(w);
    mountedParts(me, 'engine')[0].hp = 0;
    me.speed = 0;
    me.order = { kind: 'stopAt', dest: yardSpots(w, 1).truck };

    const turn = botOrders(w, 'escort');
    const next = endTurn(turn.world, () => {});

    expect(turn.world.player.state).toBe('active');
    expect(playerVehicle(turn.world).order).toEqual({ kind: 'brake' });
    expect(playerVehicle(next).job?.kind).toBe('repair');
  });

  it('parks and patches a holed tank first, out of combat with parts to patch with', () => {
    const w = furyRoadWorld();
    const me = playerVehicle(w);
    const tank = corePart(me, 'tank');
    tank.hp = 0;
    me.speed = 0;
    me.order = { kind: 'stopAt', dest: yardSpots(w, 1).truck };

    const turn = botOrders(w, 'escort');

    expect(turn.world.player.state).toBe('active');
    expect(playerVehicle(turn.world).job).toMatchObject({ kind: 'repair', partId: tank.id });
  });

  it('ends the run when stranded with no way to patch', () => {
    const w = furyRoadWorld();
    w.player.fuel = 0;

    const turn = botOrders(w, 'escort');

    expect(turn.world.player.state).toBe('dead');
    expect(turn.events).toContainEqual({ t: 'runLost', stretch: 1, cause: 'abandoned' });
  });

  it('refits its own truck by the merc loadout, then armors the hauler when the hauler took the damage, and never gives it a gun', () => {
    const w = atFirstOutpost();
    w.player.money = 2_000_000;
    for (const part of mountedParts(haulerOf(w), 'core')) part.hp = maxHp(part) / 2;
    const armor = mountedParts(haulerOf(w), 'armor').length;
    const mine = mountedParts(playerVehicle(w)).map((p) => p.id);

    const turn = botOrders(w, 'escort');

    const hauler = haulerOf(turn.world);
    expect(mountedParts(playerVehicle(turn.world)).some((p) => !mine.includes(p.id))).toBe(true);
    expect(mountedParts(hauler, 'armor').length).toBeGreaterThan(armor);
    expect(mountedParts(hauler, 'weapon')).toEqual([]);
  });

  it('buys no hauler armor when only its own truck took damage', () => {
    const w = atFirstOutpost();
    w.player.money = 2_000_000;
    for (const part of mountedParts(playerVehicle(w), 'core')) part.hp = maxHp(part) / 2;
    const armor = mountedParts(haulerOf(w), 'armor').length;

    const turn = botOrders(w, 'escort');

    expect(mountedParts(haulerOf(turn.world), 'armor').length).toBe(armor);
  });

  it('keeps auto fire on and rides behind the hauler while no hostile is in sight', () => {
    const w = furyRoadWorld();
    w.player.autoFire = false;

    const turn = botOrders(w, 'escort');
    const order = playerVehicle(turn.world).order;

    expect(turn.world.player.autoFire).toBe(true);
    expect(order).toMatchObject({ kind: 'stopAt' });
    expect(dist((order as { dest: Vec }).dest, escortSpotOf(w))).toBeLessThan(1);
  });

  it('fights a hostile truck in sight the way an NPC merc would', () => {
    const w = furyRoadWorld();
    const foe = hostileNear(w);
    refreshVision(w);

    const turn = botOrders(w, 'escort');

    expect(playerVehicle(turn.world).order).toEqual(fightMove(w, playerVehicle(w), foe));
    expect(dist((playerVehicle(turn.world).order as { dest: Vec }).dest, foe.pos)).toBeLessThan(12);
  });

  it('turns auto repair off while the tank is holed, so the tank is patched before anything else', () => {
    const w = furyRoadWorld();
    corePart(playerVehicle(w), 'tank').hp = 0;

    expect(botOrders(w, 'escort').world.player.autoRepair).toBe(false);
    expect(botOrders(furyRoadWorld(), 'escort').world.player.autoRepair).toBe(true);
  });

  it('parks to patch a broken wheel out of combat with parts to patch with', () => {
    const w = furyRoadWorld();
    const me = playerVehicle(w);
    mountedParts(me, 'core').find((p) => partDef(p.defId).id === 'wheel')!.hp = 0;
    me.speed = 0;
    me.order = { kind: 'stopAt', dest: yardSpots(w, 1).truck };

    expect(playerVehicle(botOrders(w, 'escort').world).order).toEqual({ kind: 'brake' });
  });

  it('douses a hot engine', () => {
    const w = furyRoadWorld();
    w.player.engineHeat = 0.9;
    w.player.supplies = 5;

    expect(botOrders(w, 'escort').world.player.engineHeat).toBeLessThan(0.9);
  });
});

describe('the Fury Road sprinter bot', () => {
  it('turns auto fire off and drives ahead for the next pad, whatever follows it', () => {
    const w = furyRoadWorld();
    w.player.autoFire = true;

    const turn = botOrders(w, 'sprinter');

    expect(turn.world.player.autoFire).toBe(false);
    expect(playerVehicle(turn.world).order).toMatchObject({ kind: 'stopAt' });
    expect(Object.keys(playerVehicle(turn.world).weaponOrders)).toEqual([]);
  });
});
