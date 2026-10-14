import { describe, expect, it } from 'vitest';
import { dist } from '../vec';
import { haulerOf, playerVehicle } from '../damage';
import { corePart, goodsCount, mountedParts } from '../grid';
import { partDef } from '../../data/parts';
import { onOutpostPad, outpostPad } from '../fury-road';
import { outpostFort } from '../highway';
import { addVehicle, furyRoadWorld, npcBrain } from '../testkit';
import type { World } from '../types';
import { maxHp } from '../wear';
import { endTurn } from '../world';
import { botOrders } from './bot';

function atFirstOutpost(): World {
  const w = furyRoadWorld();
  const pad = outpostPad(w, 1);
  const me = playerVehicle(w);
  me.pos = { ...pad };
  me.speed = 0;
  const hauler = haulerOf(w);
  hauler.pos = { x: pad.x + 2, y: pad.y };
  hauler.speed = 0;
  return endTurn(w, () => {});
}

describe('the Fury Road escort bot', () => {
  it('repairs both trucks, restocks patch parts, waits for the road and keeps beside the hauler', () => {
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

  it('parks on the side of the pad away from the hauler, so a hauler stopped off center never blocks it', () => {
    const w = atFirstOutpost();
    const pad = outpostPad(w, 1);
    const site = outpostFort(w.seed, w.furyRoad!.window, 1);
    const angle = Math.atan2(pad.y - site.pos.y, pad.x - site.pos.x);
    for (const side of [1, -1]) {
      const world = structuredClone(w);
      const hauler = haulerOf(world);
      hauler.pos = { x: pad.x - side * Math.sin(angle) * 2, y: pad.y + side * Math.cos(angle) * 2 };
      playerVehicle(world).pos = { x: pad.x + 12, y: pad.y + 12 };

      const after = playerVehicle(botOrders(world, 'escort').world);
      const spot = after.order?.kind === 'stopAt' ? after.order.dest : null;

      expect(spot).not.toBeNull();
      expect(onOutpostPad(world, spot!, 1)).toBe(true);
      expect(dist(spot!, hauler.pos)).toBeGreaterThan(3);
    }
  });

  it('parks to patch when stranded out of combat with parts to patch with', () => {
    const w = furyRoadWorld();
    const me = playerVehicle(w);
    mountedParts(me, 'engine')[0].hp = 0;
    me.speed = 0;
    me.order = { kind: 'stopAt', dest: outpostPad(w, 1) };

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
    me.order = { kind: 'stopAt', dest: outpostPad(w, 1) };

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

  it('follows the hauler with its guns quiet until a truck attacks it', () => {
    const w = furyRoadWorld();
    w.player.autoFire = true;
    const quiet = botOrders(w, 'escort');
    expect(quiet.world.player.autoFire).toBe(false);

    const foe = addVehicle(w, 'raiders', 'buggy', ['mg'], { x: playerVehicle(w).pos.x + 6, y: playerVehicle(w).pos.y });
    foe.brain = npcBrain('merc', foe.pos, []);
    foe.brain.attackers[playerVehicle(w).id] = true;
    const attacked = botOrders(w, 'escort');

    expect(attacked.world.player.autoFire).toBe(true);
  });

  it('drives on toward the next pad when a truck attacks it, and follows the hauler again when none does', () => {
    const w = furyRoadWorld();
    const me = playerVehicle(w);
    const foe = addVehicle(w, 'raiders', 'buggy', ['mg'], { x: me.pos.x + 6, y: me.pos.y });
    foe.brain = npcBrain('merc', foe.pos, []);
    foe.brain.attackers[me.id] = true;

    const fleeing = playerVehicle(botOrders(w, 'escort').world).order;
    foe.brain.attackers = {};
    const following = playerVehicle(botOrders(w, 'escort').world).order;

    expect(fleeing).toMatchObject({ kind: 'stopAt' });
    expect(following).toMatchObject({ kind: 'stopAt' });
    expect(fleeing).not.toEqual(following);
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
