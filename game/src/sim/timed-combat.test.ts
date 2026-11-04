import { PHYSICS } from '../data/physics';
import { PROJECTILE_FLIGHT } from '../data/weapons';
import { PARTS } from '../data/parts';
import { vehicleStats } from './stats';
import { expect, it } from 'vitest';
import { emptyWorld, addVehicle } from './testkit';
import { mountedParts } from './grid';
import { refreshVision } from './vision';
import { declareFeud } from './states';
import { beginTimedCombat, endTimedCombat, newTimedCombat, stepTimedCombat } from './timed-combat';

function fight() {
  const world = emptyWorld();
  const a = addVehicle(world, 'player', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 30 });
  const b = addVehicle(world, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 35, y: 30 }, Math.PI);
  world.vehicles = [a, b];
  world.player.vehicleId = a.id;
  declareFeud(world, b, a.id); refreshVision(world);
  const gun = mountedParts(a, 'weapon')[0];
  a.weaponOrders[gun.id] = { targetId: b.id, aim: 'body' };
  return { world, a, b, gun, state: newTimedCombat() };
}

it('carries a real round over the turn boundary and lands it once', () => {
  const f = fight();
  f.b.pos.x += 3;
  refreshVision(f.world);
  beginTimedCombat(f.world, f.state, 1000);
  for (let i = 0; i < 60; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
  endTimedCombat(f.world, f.state);
  expect(f.state.flights.length).toBeGreaterThan(0);
  const carried = f.state.flights[0];
  beginTimedCombat(f.world, f.state, 1000);
  for (let i = 0; i < 60; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
  endTimedCombat(f.world, f.state);
  expect(f.state.records.filter(r => r.kind === 'impact' && r.flight === carried)).toHaveLength(1);
});

it('cancels early attempts without packing them into a later valid window', () => {
  const f = fight();
  const facing = vehicleStats(f.world, f.a).weapons.find(w => w.part.id === f.gun.id)!.facing * Math.PI / 180;
  f.a.heading = Math.PI - facing;
  beginTimedCombat(f.world, f.state, 1000);
  for (let i = 0; i < 60; i++) {
    if (i === 48) f.a.heading = -facing;
    stepTimedCombat(f.world, f.state, 1000 / 60);
  }
  endTimedCombat(f.world, f.state);
  expect(f.state.records.filter(r => r.kind === 'cancel')).toHaveLength(5);
  expect(f.state.records.filter(r => r.kind === 'launch')).toHaveLength(1);
  expect(f.state.records.find(r => r.kind === 'launch')!.at).toBeGreaterThan(900);
});

it('cancels later attempts after a gun breaks without canceling its launched round', () => {
  const f = fight(); beginTimedCombat(f.world, f.state, 1000);
  for (let i = 0; i < 7; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
  expect(f.state.records.filter(r => r.kind === 'launch')).toHaveLength(1);
  f.gun.hp = 0;
  for (let i = 7; i < 60; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
  endTimedCombat(f.world, f.state);
  expect(f.state.records.filter(r => r.kind === 'launch')).toHaveLength(1);
  expect(f.state.records.filter(r => r.kind === 'impact')).toHaveLength(1);
  expect(f.state.records.filter(r => r.kind === 'cancel')).toHaveLength(5);
});

it('records destruction on the impact step and cancels later shots at the removed target', () => {
  const f = fight(); beginTimedCombat(f.world, f.state, 1000);
  for (let i = 0; i < 7; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
  const flight = f.state.flights[0];
  expect(flight).toBeDefined();
  flight.impactAt = { ...f.b.pos };
  flight.roll = { hit: true, error: 0, crit: false };
  f.b.resources!.health = 0;
  for (let i = 7; i < 60; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
  endTimedCombat(f.world, f.state);
  const impact = f.state.records.find(r => r.kind === 'impact')!;
  expect(f.state.destroyedAt[f.b.id]).toBe(impact.at);
  expect(f.world.vehicles).not.toContain(f.b);
  expect(f.world.removed).toContain(f.b);
  expect(f.state.records.filter(r => r.kind === 'launch')).toHaveLength(1);
});

it('repeats the same launch and impact results from the same seed', () => {
  const run = () => {
    const f = fight(); beginTimedCombat(f.world, f.state, 1000);
    for (let i = 0; i < 60; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
    endTimedCombat(f.world, f.state);
    return { records: f.state.records, rng: f.world.rngState, hp: f.world.vehicles.map(v => mountedParts(v).map(p => p.hp)) };
  };
  expect(run()).toEqual(run());
});

it('lets a launched round land after its shooter leaves the world', () => {
  const f = fight(); beginTimedCombat(f.world, f.state, 1000);
  for (let i = 0; i < 7; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
  const flight = f.state.flights[0];
  expect(flight).toBeDefined();
  f.world.player.vehicleId = addVehicle(f.world, 'player', 'buggy', ['stockEngine'], { x: 80, y: 80 }).id;
  f.world.vehicles = f.world.vehicles.filter(v => v !== f.a);
  f.world.removed.push(f.a);
  for (let i = 7; i < 60; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
  endTimedCombat(f.world, f.state);
  expect(f.state.records.filter(r => r.kind === 'impact' && r.flight === flight)).toHaveLength(1);
  expect(f.state.records.filter(r => r.kind === 'launch')).toHaveLength(1);
});

it('supports every registered weapon in the game combat schedule', () => {
  const missing = Object.values(PARTS).filter(part => part.kind === 'weapon' && !(part.id in PROJECTILE_FLIGHT)).map(part => part.id);
  expect(missing).toEqual([]);
});

it('continues serialized flight facts with the same impacts and random state', async () => {
  const { cloneWorld } = await import('./world');
  const f = fight(); beginTimedCombat(f.world, f.state, 1000);
  for (let i = 0; i < 7; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
  expect(f.state.flights.length).toBeGreaterThan(0);
  const encoded = JSON.stringify(f.state);
  expect(encoded).not.toContain('chassisId');
  const restored: typeof f.state = JSON.parse(encoded);
  const world = cloneWorld(f.world);
  for (let i = 7; i < 60; i++) {
    stepTimedCombat(f.world, f.state, 1000 / 60);
    stepTimedCombat(world, restored, 1000 / 60);
  }
  endTimedCombat(f.world, f.state);
  endTimedCombat(world, restored);
  expect(restored).toEqual(f.state);
  expect(world.rngState).toBe(f.world.rngState);
  expect(world.events).toEqual(f.world.events);
});

it('moves an in-flight projectile with a highway window without changing its arrival time', async () => {
  const { launchTimedRound, transformedCombat } = await import('./timed-combat');
  const f = fight();
  const flight = launchTimedRound(f.world, f.a, f.gun.id, f.b, 'body', 0, 220, false)!;
  f.state.now = 250;
  f.state.flights.push({ ...flight, landsAt: 500 });
  const moved = transformedCombat(f.state, p => ({ x: p.x + 10, y: p.y - 20 }), 1);
  expect(moved.flights[0].from).toEqual({ x: flight.from.x + 10, y: flight.from.y - 20 });
  expect(moved.flights[0].impactAt).toEqual({ x: flight.impactAt.x + 10, y: flight.impactAt.y - 20 });
  expect(moved.flights[0].landsAt).toBe(500);
  expect(moved.now).toBe(250);
});

it('preserves remaining flight distance when a saved map changes scale', async () => {
  const { launchTimedRound, transformedCombat } = await import('./timed-combat');
  const f = fight();
  const flight = launchTimedRound(f.world, f.a, f.gun.id, f.b, 'body', 0, 220, false)!;
  f.state.now = 250;
  f.state.flights.push({ ...flight, landsAt: 500 });
  const moved = transformedCombat(f.state, p => ({ x: p.x * 2, y: p.y * 2 }), 2);
  expect(moved.flights[0].from).toEqual({ x: flight.from.x + flight.impactAt.x, y: flight.from.y + flight.impactAt.y });
  expect(moved.flights[0].impactAt).toEqual({ x: flight.impactAt.x * 2, y: flight.impactAt.y * 2 });
  expect(moved.flights[0].launchedMs).toBe(250);
  expect(moved.flights[0].landsAt).toBe(750);
  expect(moved.flights[0].speed).toBe(flight.speed);
});

it('uses the timed combat clock for an ordinary stationary turn', async () => {
  const { endTurn } = await import('./world');
  const f = fight(); f.world.vehicles = [f.a, f.b];
  const next = endTurn(f.world, () => {});
  expect(next.combat.now).toBeCloseTo(PHYSICS.turnSeconds * 1000, 8);
  expect(next.combat.records.some(record => record.kind === 'launch')).toBe(true);
});

it('lands on a truck crossed by the projectile before its endpoint', async () => {
  const { launchTimedRound } = await import('./timed-combat');
  const f = fight();
  const flight = launchTimedRound(f.world, f.a, f.gun.id, f.b, 'body', 0, 220, false)!;
  f.state.flights.push({ ...flight, impactAt: { x: 40, y: 30 }, landsAt: 100 });
  const before = mountedParts(f.b).map(p => p.hp);
  for (let i = 0; i < 10; i++) stepTimedCombat(f.world, f.state, 10);
  const impact = f.state.records.find(r => r.kind === 'impact');
  expect(impact?.event?.rounds[0].struck).toBe(f.b.id);
  expect(impact!.at).toBeLessThan(100);
  expect(mountedParts(f.b).map(p => p.hp)).not.toEqual(before);
  expect(f.state.flights).toHaveLength(0);
});

it('lets an intervening truck take the impact and its damage attribution', async () => {
  const { launchTimedRound } = await import('./timed-combat');
  const f = fight();
  const blocker = addVehicle(f.world, 'scrapjaw', 'buggy', ['stockEngine'], { x: 33, y: 30 });
  const flight = launchTimedRound(f.world, f.a, f.gun.id, f.b, 'body', 0, 220, false)!;
  f.state.flights.push({ ...flight, impactAt: { ...f.b.pos }, landsAt: 100 });
  const before = mountedParts(f.b).map(p => p.hp);
  for (let i = 0; i < 10; i++) stepTimedCombat(f.world, f.state, 10);
  const impact = f.state.records.find(r => r.kind === 'impact');
  expect(impact?.event?.rounds[0].struck).toBe(blocker.id);
  expect(blocker.lastHitBy).toBe(f.a.id);
  expect(mountedParts(f.b).map(p => p.hp)).toEqual(before);
});

it('launches and lands every weapon through its damage owner', async () => {
  const { launchTimedRound, landTimedRound } = await import('./timed-combat');
  for (const def of Object.values(PARTS).filter(p => p.kind === 'weapon')) {
    const world = emptyWorld();
    const a = addVehicle(world, 'player', 'hauler', [def.id, 'stockEngine'], { x: 30, y: 30 });
    const b = addVehicle(world, 'scrapjaw', 'hauler', ['stockEngine'], { x: 34, y: 30 }, Math.PI);
    world.vehicles = [a, b];
    world.player.vehicleId = a.id;
    declareFeud(world, b, a.id);
    refreshVision(world);
    const weapon = vehicleStats(world, a).weapons[0];
    a.heading = -weapon.facing * Math.PI / 180;
    const ammo = weapon.part.gun!.ammo;
    const flight = launchTimedRound(world, a, weapon.part.id, b, 'body', 0, PROJECTILE_FLIGHT[def.id].speed, false);
    expect(flight, def.id).not.toBeNull();
    expect(weapon.part.gun!.ammo, def.id).toBe(ammo - 1);
    flight!.impactAt = { ...b.pos };
    const event = landTimedRound(world, flight!, b.id)!;
    expect(event.rounds[0].struck, def.id).toBe(b.id);
    expect([...event.rounds[0].hits, ...event.rounds[0].blast.flatMap(hit => hit.hits)].some(hit => hit.damage > 0), def.id).toBe(true);
  }
});

it('settles player defeat on impact before the next firing attempt', async () => {
  const { settleTimedImpact } = await import('./timed-combat');
  const { corePart } = await import('./grid');
  const f = fight();
  corePart(f.a, 'cab').hp = 0;
  settleTimedImpact(f.world, { t: 'shot', shooter: f.b.id, target: f.a.id, weapon: mountedParts(f.b, 'weapon')[0].id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [] });
  expect(f.world.player.state).toBe('knockedOut');
  beginTimedCombat(f.world, f.state, 1000);
  for (let i = 0; i < 60; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
  endTimedCombat(f.world, f.state);
  expect(f.state.records.some(r => r.kind === 'launch' && r.flight?.shooterId === f.a.id)).toBe(false);
});

it('stops a doomed truck immediately and creates its wreck after movement settles', async () => {
  const { settleTimedImpact } = await import('./timed-combat');
  const f = fight();
  f.b.resources!.health = 0;
  f.world.combat = f.state;
  beginTimedCombat(f.world, f.state, 1000);
  const event = { t: 'shot' as const, shooter: f.a.id, weapon: f.gun.id, target: f.b.id, aim: 'body' as const, chance: 1, damageChance: 1, side: 'front' as const, rounds: [{ hit: true, crit: false, offset: 0, struck: f.b.id, hits: [{ part: mountedParts(f.b, 'engine')[0].id, damage: 1 }], blast: [], burst: null }] };
  f.b.lastHitBy = f.a.id;
  settleTimedImpact(f.world, event, f.state);
  expect(f.world.vehicles).toContain(f.b);
  expect(f.state.destroyedAt[f.b.id]).toBe(0);
  f.b.lastHitBy = null;
  for (let i = 0; i < 60; i++) stepTimedCombat(f.world, f.state, 1000 / 60);
  endTimedCombat(f.world, f.state);
  expect(f.world.vehicles).not.toContain(f.b);
  expect(f.world.removed).toContain(f.b);
  expect(f.world.events.filter(e => e.t === 'destroyed')).toMatchObject([{ by: f.a.id }]);
});

it('keeps fixed firing phases on a long-running combat clock', () => {
  const f = fight();
  const start = 2 ** 31;
  const duration = PHYSICS.turnSeconds * 1000;
  const steps = PHYSICS.turnSeconds * PHYSICS.stepsPerSecond;
  f.state.now = start;
  beginTimedCombat(f.world, f.state, duration);
  for (let i = 0; i < steps; i++) stepTimedCombat(f.world, f.state, duration / steps);
  endTimedCombat(f.world, f.state);
  const launched = f.state.records.filter(r => r.kind === 'launch');
  const rounds = vehicleStats(f.world, f.a).weapons[0].def.rounds;
  expect(launched).toHaveLength(rounds);
  launched.forEach((record, i) => {
    const scheduled = (i + 0.5) / rounds * duration;
    expect(Math.abs(record.at - start - scheduled)).toBeLessThan(duration / steps / 2);
  });
});
