import { addGoods } from '../inventory';
import { describe, expect, it } from 'vitest';
import { haulerOf, playerVehicle } from '../damage';
import { corePart, goodsCount, mountedParts } from '../grid';
import { partDef } from '../../data/parts';
import { inYard, yardSpots } from '../outpost-gates';
import { addVehicle, chaosHighwayWorld, npcBrain, parkInYard } from '../testkit';
import type { Vehicle, World } from '../types';
import { followSpot } from '../tow';
import { dist, type Vec } from '../vec';
import { maxHp } from '../wear';
import { vehicleStats } from '../stats';
import { CHAOS_HIGHWAY } from '../../data/modes';
import { chassisDef } from '../../data/chassis';
import { nextOutpost, outpostTrucks, reachedOutpostAt } from '../chaos-highway';
import { outpostBuyChassis } from '../outposts';
import { refreshVision } from '../vision';
import { endTurn } from '../world';
import { botOrders } from './bot';
import { fightMove } from './escort-brain';

function atFirstOutpost(): World {
  const w = chaosHighwayWorld();
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

describe('the Chaos Highway escort bot', () => {
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
    expect(turn.world.chaosHighway?.window).toBe(1);
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
    const w = chaosHighwayWorld();
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
    const w = chaosHighwayWorld();
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
    const w = chaosHighwayWorld();
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
    const w = chaosHighwayWorld();
    w.player.autoFire = false;

    const turn = botOrders(w, 'escort');
    const order = playerVehicle(turn.world).order;

    expect(turn.world.player.autoFire).toBe(true);
    expect(order).toMatchObject({ kind: 'stopAt' });
    expect(dist((order as { dest: Vec }).dest, escortSpotOf(w))).toBeLessThan(1);
  });

  it('fights a hostile truck in sight the way an NPC merc would', () => {
    const w = chaosHighwayWorld();
    const foe = hostileNear(w);
    refreshVision(w);

    const turn = botOrders(w, 'escort');

    expect(playerVehicle(turn.world).order).toEqual(fightMove(w, playerVehicle(w), foe));
    expect(dist((playerVehicle(turn.world).order as { dest: Vec }).dest, foe.pos)).toBeLessThan(12);
  });

  it('turns auto repair off while the tank is holed, so the tank is patched before anything else', () => {
    const w = chaosHighwayWorld();
    corePart(playerVehicle(w), 'tank').hp = 0;

    expect(botOrders(w, 'escort').world.player.autoRepair).toBe(false);
    expect(botOrders(chaosHighwayWorld(), 'escort').world.player.autoRepair).toBe(true);
  });

  it('parks to patch a broken wheel out of combat with parts to patch with', () => {
    const w = chaosHighwayWorld();
    const me = playerVehicle(w);
    mountedParts(me, 'core').find((p) => partDef(p.defId).id === 'wheel')!.hp = 0;
    me.speed = 0;
    me.order = { kind: 'stopAt', dest: yardSpots(w, 1).truck };

    expect(playerVehicle(botOrders(w, 'escort').world).order).toEqual({ kind: 'brake' });
  });

  it('douses a hot engine', () => {
    const w = chaosHighwayWorld();
    w.player.engineHeat = 0.9;
    w.player.supplies = 5;

    expect(botOrders(w, 'escort').world.player.engineHeat).toBeLessThan(0.9);
  });
});

describe('the Chaos Highway sprinter bot', () => {
  it('turns auto fire off and drives through its hops toward the next pad without braking, whatever follows it', () => {
    const w = chaosHighwayWorld();
    w.player.autoFire = true;

    const turn = botOrders(w, 'sprinter');

    expect(turn.world.player.autoFire).toBe(false);
    expect(playerVehicle(turn.world).order).toMatchObject({ kind: 'through' });
    expect(Object.keys(playerVehicle(turn.world).weaponOrders)).toEqual([]);
  });

  it('stops at the next pad once the pad is within a hop', () => {
    const w = chaosHighwayWorld();
    const pad = nextOutpost(w)!.spots.truck;
    playerVehicle(w).pos = { x: pad.x, y: pad.y + 8 };

    const turn = botOrders(w, 'sprinter');

    expect(playerVehicle(turn.world).order).toEqual({ kind: 'stopAt', dest: pad });
  });

  it('refits its own truck only so far that it stays faster than the hauler, however much money it has', () => {
    const yard = atFirstOutpost();
    yard.player.money = 2_000_000;
    const w = outpostBuyChassis(yard, 'niva');
    addGoods(w, playerVehicle(w), 'scrap', 15);
    const post = reachedOutpostAt(w)!;
    post.trucksSold.push(...outpostTrucks(w, post));

    const turn = botOrders(w, 'sprinter');

    expect(turn.world.player.money).toBeLessThan(w.player.money);
    expect(vehicleStats(turn.world, playerVehicle(turn.world)).maxSpeed).toBeGreaterThan(CHAOS_HIGHWAY.hauler.hurry);
  });

  it('buys only a truck that stays faster than the hauler, so it keeps driving ahead', () => {
    const w = atFirstOutpost();
    w.player.money = 2_000_000;
    const post = reachedOutpostAt(w)!;
    const speedIn = (id: string) => { const after = outpostBuyChassis(w, id); return vehicleStats(after, playerVehicle(after)).maxSpeed; };
    const byValue = (ids: string[]) => [...ids].sort((a, b) => chassisDef(b).value - chassisDef(a).value);
    const fast = byValue(outpostTrucks(w, post)).filter((id) => speedIn(id) > CHAOS_HIGHWAY.hauler.hurry);
    const slow = byValue(outpostTrucks(w, post)).filter((id) => speedIn(id) <= CHAOS_HIGHWAY.hauler.hurry);
    post.trucksSold.push(...fast.filter((id) => chassisDef(id).value > chassisDef(slow[0]).value));
    expect(chassisDef(slow[0]).value).toBeGreaterThan(chassisDef(playerVehicle(w).chassisId).value);
    expect(outpostTrucks(w, post).some((id) => speedIn(id) > CHAOS_HIGHWAY.hauler.hurry)).toBe(true);

    const turn = botOrders(w, 'sprinter');

    expect(vehicleStats(turn.world, playerVehicle(turn.world)).maxSpeed).toBeGreaterThan(CHAOS_HIGHWAY.hauler.hurry);
  });
});
