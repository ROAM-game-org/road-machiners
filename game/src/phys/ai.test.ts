
import { beforeAll, describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { RULES } from '../data/rules';
import { NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { addGoods } from '../sim/inventory';
import { canUseSite } from '../sim/sites';
import { vehicleStats } from '../sim/stats';
import { addVehicle, emptyWorld, npcBrain } from '../sim/testkit';
import type { Vehicle, World } from '../sim/types';
import { loadWorld, writeSave } from '../three/save';
import { memoryBackend, SaveSlots } from '../three/save-db';
import { angleDiff, dist } from '../sim/vec';
import { endTurn, newWorld, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';
import { TEST_MAP } from '../test/map';
import { budget } from '../test/budget';
import { defaultSetup } from '../sim/settings';
import { reusedWorld } from '../test/world-cache';

function standardWorld(): World {
  return reusedWorld('standard', () => newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming')));
}

beforeAll(async () => {
  await initPhysics();
});

function turn(w: World, d: Drive): { w: World; d: Drive } {
  let next: Drive | null = null;
  w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
  freeDrive(d);
  return { w, d: next! };
}

function dropClaims(w: World): void {
  for (const shop of Object.values(w.shops)) shop.contracts = shop.contracts.filter((c) => c.kind !== 'claim');
}

function backedTiles(before: Vehicle, after: Vehicle): number {
  const along = (after.pos.x - before.pos.x) * Math.cos(after.heading) + (after.pos.y - before.pos.y) * Math.sin(after.heading);
  return Math.max(0, -along);
}

function recoveringHauler(offTail: number, spotDistance = 5): { w: World; id: string } {
  const w = emptyWorld({ x: 60, y: 40 });
  const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 60, y: 30 });
  npc.brain = npcBrain('trader', npc.pos, ['trader']);
  npc.brain.goals = [{ kind: 'explore', targetId: null, destination: { x: 200, y: 30 }, reason: 'explore', phase: 'travel' }];
  npc.brain.recovery = RULES.unstick.driveTurns;
  const angle = npc.heading + Math.PI + (offTail * Math.PI) / 180;
  npc.brain.recoveryGoal = { x: npc.pos.x + Math.cos(angle) * spotDistance, y: npc.pos.y + Math.sin(angle) * spotDistance };
  return { w, id: npc.id };
}

function playTurns(w: World, id: string, turns: number): { w: World; backed: number; start: Vehicle } {
  const start = structuredClone(w.vehicles.find((v) => v.id === id)!);
  let d = buildDrive(w);
  let backed = 0;
  for (let i = 0; i < turns; i++) {
    const before = structuredClone(w.vehicles.find((v) => v.id === id)!);
    ({ w, d } = turn(w, d));
    backed += backedTiles(before, w.vehicles.find((v) => v.id === id)!);
  }
  freeDrive(d);
  return { w, backed, start };
}

describe('NPC driving', () => {
  it('backs off a rock in its path and drives around it', () => {
    let w = emptyWorld({ x: 40, y: 5 });
    const npc = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 30 });
    npc.brain = npcBrain('buggy', npc.pos, ['raider']);
    npc.brain.goals = [{ kind: 'raid', targetId: null, destination: { x: 300, y: 30 }, reason: 'raid', phase: 'travel' }];
    w.obstacles = [{ id: 'rock', pos: { x: 31.4, y: 30 }, r: 0.8, kind: 'rock' }];
    const startX = npc.pos.x;
    const xs: number[] = [];
    let d = buildDrive(w);
    for (let i = 0; i < RULES.npcStuckTurns + 20; i++) {
      ({ w, d } = turn(w, d));
      xs.push(w.vehicles.find((v) => v.id === npc.id)!.pos.x);
    }
    expect(Math.min(...xs)).toBeLessThan(startX);
    expect(xs.at(-1)).toBeGreaterThan(31.4);
    freeDrive(d);
  });

  it('an NPC whose recovery ended turns around nose first toward a goal behind it', () => {
    let w = emptyWorld({ x: 60, y: 40 });
    const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 60, y: 30 });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    npc.brain.goals = [{ kind: 'explore', targetId: null, destination: { x: 5, y: 30 }, reason: 'explore', phase: 'travel' }];
    npc.brain.recovery = 2;
    npc.brain.recoveryGoal = { x: 56, y: 30 };
    let d = buildDrive(w);
    for (let i = 0; i < 10; i++) ({ w, d } = turn(w, d));
    const after = w.vehicles.find((v) => v.id === npc.id)!;
    expect(after.brain!.recovery).toBe(0);
    expect(Math.abs(angleDiff(after.heading, Math.PI))).toBeLessThan(Math.PI / 4);
    expect(after.pos.x).toBeLessThan(56);
    freeDrive(d);
  });

  it.each([60, 90])('an NPC sent to an unstick spot %s degrees off its tail turns nose first instead of reversing there', (offTail) => {
    const { w, id } = recoveringHauler(offTail);
    const spot = w.vehicles.find((v) => v.id === id)!.brain!.recoveryGoal!;
    const run = playTurns(w, id, RULES.unstick.driveTurns);
    const end = run.w.vehicles.find((v) => v.id === id)!;
    expect(run.backed).toBeLessThanOrEqual(RULES.reverse.distance + 0.5);
    expect(dist(end.pos, spot)).toBeLessThan(dist(run.start.pos, spot));
  });

  it('a stalled NPC still backs straight out', () => {
    const { w, id } = recoveringHauler(0, RULES.reverse.distance + RULES.minAimDistance);
    w.vehicles.find((v) => v.id === id)!.brain!.recovery = RULES.npcRecoveryTurns;
    const run = playTurns(w, id, RULES.npcRecoveryTurns);
    const end = run.w.vehicles.find((v) => v.id === id)!;
    expect(run.backed).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(angleDiff(end.heading, run.start.heading))).toBeLessThan((RULES.reverse.cone * Math.PI) / 180);
  });

  it.each([{ x: 100, y: 30 }, { x: 60, y: 70 }])('an NPC driving a route to %j never moves backward', (destination) => {
    const { w, id } = recoveringHauler(0);
    const npc = w.vehicles.find((v) => v.id === id)!;
    npc.brain!.recovery = 0;
    npc.brain!.recoveryGoal = undefined;
    npc.brain!.goals = [{ kind: 'explore', targetId: null, destination, reason: 'explore', phase: 'travel' }];
    let state = w;
    let d = buildDrive(state);
    for (let i = 0; i < 10; i++) {
      const before = structuredClone(state.vehicles.find((v) => v.id === id)!);
      ({ w: state, d } = turn(state, d));
      expect(backedTiles(before, state.vehicles.find((v) => v.id === id)!)).toBeLessThan(0.1);
    }
    freeDrive(d);
  });

  it('a recovering NPC keeps turning nose first after a save and load', () => {
    const { w, id } = recoveringHauler(60);
    const first = playTurns(w, id, 1);
    const slots = new SaveSlots(memoryBackend(), new Map());
    writeSave(slots, 'auto', first.w, 'run', 1);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('The save did not load');
    const saved = first.w.vehicles.find((v) => v.id === id)!;
    const back = loaded.vehicles.find((v) => v.id === id)!;
    expect(back.brain!.recovery).toBe(saved.brain!.recovery);
    expect(back.brain!.recoveryGoal).toEqual(saved.brain!.recoveryGoal);
    expect(back.pos.x).toBeCloseTo(saved.pos.x, 3);
    expect(back.pos.y).toBeCloseTo(saved.pos.y, 3);
    expect(back.heading).toBeCloseTo(saved.heading, 3);
    expect(loaded.events).toEqual([]);
    expect(loaded.player.money).toBe(first.w.player.money);
    const rest = playTurns(loaded, id, RULES.unstick.driveTurns - 1);
    expect(rest.backed + backedTiles(first.start, saved)).toBeLessThanOrEqual(RULES.reverse.distance + 0.5);
  });

  it('travels between towns without entering either site', () => {
    let w = standardWorld();
    w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
    for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
    const bowl = REGION.towns[0];
    const nose = REGION.towns[1];
    const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: bowl.pos.x + bowl.radius + 2, y: bowl.pos.y });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    addGoods(w, npc, 'scrap', 1);
    npc.brain.goals = [{ kind: 'sell', targetId: nose.id, destination: { ...nose.pos }, phase: 'travel', reason: 'deliverCargo' }];
    let arrived = false;
    dropClaims(w);
    let d = buildDrive(w);
    for (let i = 0; i < w.size && !arrived; i++) {
      ({ w, d } = turn(w, d));
      dropClaims(w);
      w.vehicles = w.vehicles.filter((v) => v.faction === 'player' || v.id === npc.id);
      const actor = w.vehicles.find((v) => v.id === npc.id)!;
      arrived = canUseSite(actor.pos, nose);
      expect(dist(actor.pos, nose.pos)).toBeGreaterThanOrEqual(nose.radius + 0.8 - 0.5);
    }
    freeDrive(d);
    expect(arrived).toBe(true);
  }, budget(120_000));

  it('passes the oncoming player without stopping or touching it', () => {
    let w = standardWorld();
    w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
    for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
    const bowl = REGION.towns[0];
    const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: bowl.pos.x + bowl.radius + 2, y: bowl.pos.y });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    const nose = REGION.towns[1];
    addGoods(w, npc, 'scrap', 1);
    npc.brain.goals = [{ kind: 'sell', targetId: nose.id, destination: { ...nose.pos }, phase: 'travel', reason: 'deliverCargo' }];
    let d = buildDrive(w);
    const trader = () => w.vehicles.find((v) => v.id === npc.id)!;
    for (let i = 0; i < 30 && trader().speed < 3; i++) ({ w, d } = turn(w, d));
    expect(trader().speed).toBeGreaterThanOrEqual(3);
    const t = trader();
    const me = w.vehicles.find((v) => v.faction === 'player')!;
    me.pos = { x: t.pos.x + Math.cos(t.heading) * 25, y: t.pos.y + Math.sin(t.heading) * 25 };
    me.heading = t.heading + Math.PI;
    freeDrive(d);
    d = buildDrive(w);
    w = setMoveOrder(w, { kind: 'through', dest: { x: t.pos.x - Math.cos(t.heading) * 20, y: t.pos.y - Math.sin(t.heading) * 20 } });
    const gap = vehicleStats(w, me).radius + vehicleStats(w, t).radius;
    let slowest = Infinity;
    let closest = Infinity;
    for (let i = 0; i < 6; i++) {
      ({ w, d } = turn(w, d));
      const player = w.vehicles.find((v) => v.faction === 'player')!;
      slowest = Math.min(slowest, trader().speed);
      closest = Math.min(closest, dist(trader().pos, player.pos));
    }
    freeDrive(d);
    expect(slowest).toBeGreaterThan(RULES.parkedSpeed);
    expect(closest).toBeGreaterThan(gap);
  }, budget(60_000));

  it.each([-3, -1.5].flatMap((dx) => [-3, -1.5, 0, 1.5, 3].map((dy) => [dx, dy])))(
    'two NPCs closing head-on never touch: second goal offset %s,%s',
    (dx, dy) => {
      let w = standardWorld();
      w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
      for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
      w.vehicles[0].pos = { x: 300, y: 200 };
      const a = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 264.24, y: 165.07 }, (-48 * Math.PI) / 180);
      const b = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 283.01, y: 143.29 }, (129 * Math.PI) / 180);
      a.id = 'v1062';
      b.id = 'v1081';
      a.speed = 6.46;
      b.speed = 4.08;
      a.brain = npcBrain('scavenger', a.pos, ['scavenger']);
      b.brain = npcBrain('roamer', b.pos, ['roamer']);
      a.brain.goals = [{ kind: 'explore', targetId: null, destination: { x: 317, y: 102.75 }, phase: 'travel', reason: 'tripToSite' }];
      b.brain.goals = [{ kind: 'explore', targetId: null, destination: { x: 276.07 + dx, y: 157.15 + dy }, phase: 'travel', reason: 'tripToSite' }];
      a.brain.noticed[`preySeen:${b.id}`] = w.turn;
      b.brain.noticed[`preySeen:${a.id}`] = w.turn;
      let d = buildDrive(w);
      let touches = 0;
      for (let i = 0; i < 10; i++) {
        ({ w, d } = turn(w, d));
        touches += w.events.filter((e) => e.t === 'collision' && [e.a, e.b].includes(a.id) && [e.a, e.b].includes(b.id)).length;
      }
      freeDrive(d);
      expect(touches).toBe(0);
    },
    120_000,
  );
});
