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

describe('the colored zones in route mode', () => {
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
  const held = (w: World) => {
    const order = playerVehicle(w).order;
    return order && order.kind !== 'brake' ? order : null;
  };

  it('a red click on a far route holds a crawl, and a far click keeps it', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const me = playerVehicle(w);
    me.speed = 4;
    const { c, world } = controls(w);
    c.order({ x: me.pos.x + 80, y: me.pos.y }, false);
    expect(held(world())?.pace).toBeUndefined();
    c.order({ x: me.pos.x + 1, y: me.pos.y }, false);
    expect(held(world())).toMatchObject({ dest: { x: me.pos.x + 80, y: me.pos.y }, pace: 1 });
    c.order({ x: me.pos.x + 90, y: me.pos.y + 30 }, false);
    expect(held(world())).toMatchObject({ dest: { x: me.pos.x + 90, y: me.pos.y + 30 }, pace: 1 });
  });

  it('manual driving drops the held pace and route mode returns to full', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const me = playerVehicle(w);
    me.speed = 4;
    const { c, world } = controls(w);
    c.order({ x: me.pos.x + 80, y: me.pos.y }, false);
    c.order({ x: me.pos.x + 1, y: me.pos.y }, false);
    c.toggleManual();
    expect(held(world())?.pace).toBeUndefined();
    c.toggleManual();
    expect(held(world())?.pace).toBeUndefined();
  });
});

describe('lights and auto-patch keys while knocked out', () => {
  function controls(w: World) {
    const applied: World[] = [];
    const committed: World[] = [];
    const h = {
      world: () => w,
      apply: (next: World) => { applied.push(next); },
      commit: (next: World) => { committed.push(next); },
      refreshPlan: () => undefined,
    };
    return { controls: new TruckControls(h as never), applied, committed };
  }

  it('leave a knocked out world alone', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.player.state = 'knockedOut';
    const { controls: c, applied, committed } = controls(w);
    c.toggleAutoRepair();
    c.toggleHeadlights();
    expect(applied).toEqual([]);
    expect(committed).toEqual([]);
  });

  it('toggle on an active world', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const { controls: c, applied, committed } = controls(w);
    c.toggleAutoRepair();
    c.toggleHeadlights();
    expect(applied).toHaveLength(1);
    expect(committed).toHaveLength(1);
  });
});
