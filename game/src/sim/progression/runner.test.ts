import { describe, expect, it } from 'vitest';
import { dist } from '../vec';
import { haulerOf, playerVehicle } from '../damage';
import { corePart, goodsCount, mountedParts } from '../grid';
import { partDef } from '../../data/parts';
import { inYard, yardSpots } from '../outpost-gates';
import { furyRoadWorld, parkInYard } from '../testkit';
import type { World } from '../types';
import { maxHp } from '../wear';
import { endTurn } from '../world';
import { botOrders } from './bot';

function atFirstOutpost(): World {
  const w = furyRoadWorld();
  parkInYard(w, 1);
  return endTurn(w, () => {});
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
    expect(dist(hop!, haulerOf(turn.world).pos)).toBeLessThan(6);
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

  it('parks to patch a holed tank before the fuel is gone, out of combat with parts to patch with', () => {
    const w = furyRoadWorld();
    const me = playerVehicle(w);
    corePart(me, 'tank').hp = 0;
    me.speed = 0;
    me.order = { kind: 'stopAt', dest: yardSpots(w, 1).truck };

    const turn = botOrders(w, 'escort');

    expect(turn.world.player.state).toBe('active');
    expect(playerVehicle(turn.world).order).toEqual({ kind: 'brake' });
  });

  it('ends the run when stranded with no way to patch', () => {
    const w = furyRoadWorld();
    w.player.fuel = 0;

    const turn = botOrders(w, 'escort');

    expect(turn.world.player.state).toBe('dead');
    expect(turn.events).toContainEqual({ t: 'runLost', stretch: 1, cause: 'abandoned' });
  });

  it('buys armor for the hauler from its share of the money, and never a gun', () => {
    const w = atFirstOutpost();
    w.player.money = 2_000_000;
    const before = mountedParts(haulerOf(w), 'armor').length;

    const turn = botOrders(w, 'escort');

    const hauler = haulerOf(turn.world);
    expect(mountedParts(hauler, 'armor').length).toBeGreaterThanOrEqual(before);
    expect(mountedParts(hauler, 'weapon')).toEqual([]);
    expect(mountedParts(hauler).every((p) => ['core', 'engine', 'armor', 'cargo'].includes(partDef(p.defId).kind))).toBe(true);
  });

  it('turns on auto fire for the escort and drives to the foe near the hauler', () => {
    const w = furyRoadWorld();
    w.furyRoad!.groups = [];
    const turn = botOrders(w, 'escort');
    expect(turn.world.player.autoFire).toBe(true);
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
