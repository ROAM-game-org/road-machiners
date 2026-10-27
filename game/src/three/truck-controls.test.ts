import { describe, expect, it } from 'vitest';
import { playerVehicle } from '../sim/damage';
import { maxHealthOf } from '../sim/health';
import { mountedParts } from '../sim/grid';
import { aidData, addState } from '../sim/states';
import { playerAid } from '../sim/aid';
import { addVehicle, emptyWorld, npcBrain } from '../sim/testkit';
import type { World } from '../sim/types';
import { TruckContext, TruckControls, type ContextHost } from './truck-controls';

function scene(aidX: number) {
  const w = emptyWorld({ x: 30, y: 30 });
  const a = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: aidX, y: 30 });
  const b = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 34, y: 30 });
  for (const v of [a, b]) v.brain = npcBrain('trader', v.pos, ['trader']);
  addState(w, 'aid', a.id, w.player.vehicleId, { kind: 'aid', giver: 'player', fuel: 5, supplies: 0, price: 0, free: true, agreed: true, started: false, work: 1, workLeft: 1 });
  return { w, a, b };
}

function host(w: World) {
  const calls = { applied: [] as World[], trades: [] as string[] };
  const h = {
    world: () => w,
    playing: () => false,
    apply: (next: World) => { calls.applied.push(next); },
    pushEvents: () => undefined,
    note: () => undefined,
    openTrade: (id: string) => { calls.trades.push(id); },
    openTown: () => undefined,
    openOutpost: () => undefined,
    openDowned: () => undefined,
    openLoot: () => undefined,
  } satisfies ContextHost;
  return { h, calls };
}

describe('the E key on a deal', () => {
  it('does nothing beside another driver while the agreed one is away', () => {
    const { w } = scene(90);
    const { h, calls } = host(w);
    new TruckContext(h).use();
    expect(calls.applied).toEqual([]);
  });

  it('starts the handover with the agreed driver when another is also in reach', () => {
    const { w, a } = scene(26);
    const { h, calls } = host(w);
    new TruckContext(h).use();
    expect(calls.applied).toHaveLength(1);
    const next = calls.applied[0];
    expect(playerAid(next)).toMatchObject({ holder: a.id });
    expect(aidData(playerAid(next)!).started).toBe(true);
  });

  it('opens the trade for the shown driver only', () => {
    const { w, b } = scene(90);
    addState(w, 'trade', b.id, w.player.vehicleId, { kind: 'none' });
    const { h, calls } = host(w);
    new TruckContext(h).use();
    expect(calls.trades).toEqual([b.id]);
  });
});

function controlsOf(world: World) {
  const host = { world, revs: 0, applied: 0, notes: [] as unknown[] };
  const c = new TruckControls({
    world: () => host.world,
    apply: (next) => { host.world = next; host.applied++; },
    commit: (next) => { host.world = next; },
    refreshPlan: () => {},
    doused: () => {},
    note: (text) => { host.notes.push(text); },
    revved: () => { host.revs++; },
  });
  return { c, host };
}

describe('the overdrive key', () => {
  it('switches overdrive on with a rev, and off again', () => {
    const w = emptyWorld();
    w.player.ranks.driving = 1;
    const { c, host } = controlsOf(w);
    c.toggleOverdrive();
    expect(host.world.player.overdrive).toBe(true);
    expect(host.revs).toBe(1);
    c.toggleOverdrive();
    expect(host.world.player.overdrive).toBe(false);
    expect(host.revs).toBe(1);
  });

  it('does nothing while the engine is too worn', () => {
    const w = emptyWorld();
    mountedParts(playerVehicle(w), 'engine')[0].hp = 1;
    const { c, host } = controlsOf(w);
    c.toggleOverdrive();
    expect(host.world.player.overdrive).toBe(false);
    expect(host.applied).toBe(0);
    expect(host.revs).toBe(0);
  });

  it('does nothing at Driving 0', () => {
    const { c, host } = controlsOf(emptyWorld());
    c.toggleOverdrive();
    expect(host.world.player.overdrive).toBe(false);
    expect(host.applied).toBe(0);
  });
});

describe('the first aid key', () => {
  function hurtWorld(): World {
    const w = emptyWorld({ x: 30, y: 30 });
    w.player.ranks.toughness = 1;
    Object.assign(w.player, { health: 30, supplies: 10 });
    w.vehicles[0].speed = 0;
    return w;
  }

  it('starts first aid when parked and hurt', () => {
    const { c, host } = controlsOf(hurtWorld());
    c.firstAid();
    expect(playerVehicle(host.world).job?.kind).toBe('firstAid');
  });

  it('notes why when it is refused', () => {
    const w = hurtWorld();
    w.player.health = maxHealthOf(w);
    const { c, host } = controlsOf(w);
    c.firstAid();
    expect(playerVehicle(host.world).job).toBeNull();
    expect(host.notes).toHaveLength(1);
  });

  it('does nothing without the basic', () => {
    const w = hurtWorld();
    w.player.ranks.toughness = 0;
    const { c, host } = controlsOf(w);
    c.firstAid();
    expect(host.applied).toBe(0);
  });
});

describe('the route speed step', () => {
  function controls(start: World) {
    let w = start;
    const c = new TruckControls({
      world: () => w,
      apply: (next) => { w = next; },
      commit: (next) => { w = next; },
      refreshPlan: () => undefined,
      doused: () => undefined,
      note: () => undefined,
      revved: () => undefined,
    });
    return { c, world: () => w };
  }
  const player = (w: World) => playerVehicle(w);
  const far = { kind: 'through', dest: { x: 80, y: 30 } } as const;

  it('puts the held step on every order the player gives', () => {
    const { c, world } = controls(emptyWorld({ x: 90, y: 60 }));
    c.cyclePace();
    c.order(far);
    expect(c.pace).toBe('half');
    expect(player(world()).order).toMatchObject({ kind: 'through', pace: expect.any(Number) });
    c.order({ kind: 'stopAt', dest: { x: 70, y: 30 } });
    expect(player(world()).order).toMatchObject({ kind: 'stopAt', pace: expect.any(Number) });
  });

  it('goes Full, Half, Crawl and back, and re-paces the current order each time', () => {
    const { c, world } = controls(emptyWorld({ x: 90, y: 60 }));
    c.order(far);
    expect(player(world()).order).toEqual(far);
    const paces = [1, 2, 3].map(() => {
      c.cyclePace();
      const order = player(world()).order;
      return order && order.kind !== 'brake' ? order.pace : undefined;
    });
    expect(c.pace).toBe('full');
    expect(paces[0]).toBeGreaterThan(1);
    expect(paces[1]).toBe(1);
    expect(paces[2]).toBeUndefined();
  });

  it('drops the pace in manual driving and puts it back on return to route', () => {
    const { c, world } = controls(emptyWorld({ x: 90, y: 60 }));
    c.cyclePace();
    c.cyclePace();
    c.order(far);
    c.toggleManual();
    expect(player(world()).order).toEqual(far);
    c.order(far);
    expect(player(world()).order).toEqual(far);
    c.cyclePace();
    expect(c.pace).toBe('crawl');
    c.toggleManual();
    expect(player(world()).order).toMatchObject({ pace: 1 });
  });

  it('reads the step back from a loaded paced order', () => {
    const first = controls(emptyWorld({ x: 90, y: 60 }));
    first.c.cyclePace();
    first.c.cyclePace();
    first.c.order(far);
    const loaded = controls(first.world());
    expect(loaded.c.pace).toBe('full');
    loaded.c.syncPace(loaded.world());
    expect(loaded.c.pace).toBe('crawl');
  });
});
