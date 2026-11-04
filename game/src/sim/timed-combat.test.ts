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
  world.player.vehicleId = a.id;
  declareFeud(world, b, a.id); refreshVision(world);
  const gun = mountedParts(a, 'weapon')[0];
  a.weaponOrders[gun.id] = { targetId: b.id, aim: 'body' };
  return { world, a, b, gun, state: newTimedCombat() };
}

it('carries a real round over the turn boundary and lands it once', () => {
  const f = fight();
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
  flight.shot.rolls[0] = { hit: true, error: 0, crit: false };
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
