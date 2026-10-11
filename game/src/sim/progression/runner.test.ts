import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../../data/terrain';
import { dist } from '../vec';
import { playerVehicle } from '../damage';
import { goodsCount, mountedParts } from '../grid';
import { outpostPad } from '../fury-road';
import { furyRoadWorld } from '../testkit';
import type { World } from '../types';
import { maxHp } from '../wear';
import { endTurn } from '../world';
import { botOrders } from './bot';

function atFirstOutpost(): World {
  const w = furyRoadWorld();
  const me = playerVehicle(w);
  me.pos = outpostPad(w, 1);
  me.speed = 0;
  return endTurn(w, () => {});
}

describe('the Fury Road runner bot', () => {
  it('repairs, restocks patch parts, waits for the road and drives on to the next outpost', () => {
    const w = atFirstOutpost();
    for (const part of mountedParts(playerVehicle(w))) part.hp = Math.ceil(maxHp(part) * 0.6);
    const me = playerVehicle(w);
    me.items = me.items.filter((it) => !(it.kind === 'good' && it.good === 'parts'));
    w.player.money = 100_000;

    const turn = botOrders(w, 'runner');
    const after = playerVehicle(turn.world);

    expect(mountedParts(after).every((p) => p.hp === maxHp(p))).toBe(true);
    expect(goodsCount(after).parts).toBe(4);
    expect(turn.events).toContainEqual({ t: 'roadOpened', stretch: 2 });
    expect(turn.world.furyRoad?.window).toBe(1);
    const hop = after.order?.kind === 'stopAt' ? after.order.dest : null;
    expect(hop).not.toBeNull();
    const pad = outpostPad(turn.world, 2);
    expect(dist(hop!, after.pos)).toBeLessThan(2 * TERRAIN.vision.radius);
    expect(dist(hop!, after.pos)).toBeLessThan(dist(pad, after.pos));
    expect(dist(hop!, pad)).toBeLessThan(dist(after.pos, pad));
    expect(turn.ledger.repairs).toBeLessThan(0);
  });

  it('parks to patch when stranded out of combat with parts to patch with', () => {
    const w = furyRoadWorld();
    const me = playerVehicle(w);
    mountedParts(me, 'engine')[0].hp = 0;
    me.speed = 0;
    me.order = { kind: 'stopAt', dest: outpostPad(w, 1) };

    const turn = botOrders(w, 'runner');
    const next = endTurn(turn.world, () => {});

    expect(turn.world.player.state).toBe('active');
    expect(playerVehicle(turn.world).order).toEqual({ kind: 'brake' });
    expect(playerVehicle(next).job?.kind).toBe('repair');
  });

  it('ends the run when stranded with no way to patch', () => {
    const w = furyRoadWorld();
    w.player.fuel = 0;

    const turn = botOrders(w, 'runner');

    expect(turn.world.player.state).toBe('dead');
    expect(turn.events).toContainEqual({ t: 'runLost', stretch: 1, cause: 'abandoned' });
  });
});
