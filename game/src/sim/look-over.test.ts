import { describe, expect, it } from 'vitest';
import { LOOK_OVER } from '../data/npcs';
import { playerVehicle, vehicleById } from './damage';
import { addGoods } from './inventory';
import { canLookOver, knowsCargo, lookOver, lookOverError, perceivedLoad, startLookOver } from './look-over';
import { cargoValue } from './market';
import { settleStates, stateOf, workOf } from './states';
import { addVehicle, emptyWorld, npcBrain, testDrive } from './testkit';
import type { Vehicle, World } from './types';
import { endTurn, Refused } from './world';

function lookerWorld(gap: number): { w: World; target: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  w.player.ranks.perception = 1;
  const target = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 30 + gap, y: 30 });
  addGoods(w, target, 'meds', 3);
  return { w, target };
}

function refusalOf(w: World, target: Vehicle) {
  return canLookOver(w, playerVehicle(w), vehicleById(w, target.id));
}

function moveAway(id: string) {
  return (d: World): void => {
    testDrive(d);
    vehicleById(d, id).pos = { x: 30 + 3 * LOOK_OVER.reach + 20, y: 30 };
  };
}

describe('who can look a truck over', () => {
  it('needs Perception 1 for the player', () => {
    const { w, target } = lookerWorld(5);
    w.player.ranks.perception = 0;
    expect(refusalOf(w, target)).toEqual({ id: 'needsBasic', skill: 'perception' });
  });

  it('needs the truck in sight and within reach', () => {
    expect(refusalOf(lookerWorld(5).w, lookerWorld(5).target)).toBeNull();
    const far = lookerWorld(LOOK_OVER.reach + 3);
    expect(refusalOf(far.w, far.target)).toEqual({ id: 'lookOverFar' });
    const unseen = lookerWorld(3 * LOOK_OVER.reach + 20);
    expect(refusalOf(unseen.w, unseen.target)).toEqual({ id: 'lookOverUnseen' });
  });

  it('refuses a knocked-out truck, a running look-over and a truck already sized up', () => {
    const down = lookerWorld(5);
    down.target.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };
    expect(refusalOf(down.w, down.target)).toEqual({ id: 'lookOverDown' });

    const { w, target } = lookerWorld(5);
    const running = lookOver(w, target.id);
    expect(refusalOf(running, target)).toEqual({ id: 'lookOverRunning' });
    const done = endTurn(running, testDrive);
    expect(refusalOf(done, target)).toEqual({ id: 'lookOverKnown' });
  });

  it('throws the refusal for the player and an error for an NPC', () => {
    const { w, target } = lookerWorld(LOOK_OVER.reach + 3);
    expect(() => lookOver(w, target.id)).toThrow(Refused);
    expect(() => startLookOver(w, target, playerVehicle(w))).toThrow(/lookOverFar/);
  });

  it('refuses a player who cannot act with cannotAct, not a plain error', () => {
    const { w, target } = lookerWorld(5);
    w.player.state = 'knockedOut';
    expect(lookOverError(w, target.id)).toEqual({ id: 'cannotAct' });
    expect(() => lookOver(w, target.id)).toThrow(Refused);
  });

  it('refuses the player without Perception 1, and clears a free player in reach', () => {
    const { w, target } = lookerWorld(5);
    expect(lookOverError(w, target.id)).toBeNull();
    w.player.ranks.perception = 0;
    expect(lookOverError(w, target.id)).toMatchObject({ id: 'needsBasic' });
  });

  it('lets an NPC look a truck over with no ranks', () => {
    const { w, target } = lookerWorld(5);
    w.player.ranks.perception = 0;
    expect(canLookOver(w, target, playerVehicle(w))).toBeNull();
  });
});

describe('a look-over', () => {
  it('takes one turn, then the looker knows the load while the truck stays in sight', () => {
    const { w, target } = lookerWorld(5);
    const started = lookOver(w, target.id);
    expect(knowsCargo(started, playerVehicle(started), vehicleById(started, target.id))).toBe(false);

    const done = endTurn(started, testDrive);

    expect(done.events.filter((e) => e.t === 'lookedOver')).toEqual([{ t: 'lookedOver', by: done.player.vehicleId, target: target.id }]);
    expect(stateOf(done, 'lookOver', done.player.vehicleId, target.id)).toBeNull();
    expect(knowsCargo(done, playerVehicle(done), vehicleById(done, target.id))).toBe(true);
    const kept = endTurn(done, testDrive);
    expect(knowsCargo(kept, playerVehicle(kept), vehicleById(kept, target.id))).toBe(true);
  });

  it('breaks when the truck leaves sight before the turn ends', () => {
    const { w, target } = lookerWorld(5);
    const next = endTurn(lookOver(w, target.id), moveAway(target.id));
    expect(next.events.some((e) => e.t === 'lookedOver')).toBe(false);
    expect(next.events.some((e) => e.t === 'stateEnded' && e.state.kind === 'lookOver' && e.ending === 'broken')).toBe(true);
    expect(knowsCargo(next, playerVehicle(next), vehicleById(next, target.id))).toBe(false);
  });

  it('forgets the load once the truck leaves sight', () => {
    const { w, target } = lookerWorld(5);
    const done = endTurn(lookOver(w, target.id), testDrive);
    const gone = endTurn(done, moveAway(target.id));
    expect(stateOf(gone, 'sizedUp', gone.player.vehicleId, target.id)).toBeNull();
    expect(knowsCargo(gone, playerVehicle(gone), vehicleById(gone, target.id))).toBe(false);
  });

  it('ends the look-over and the sized-up load as broken when a truck leaves the world', () => {
    const { w, target } = lookerWorld(5);
    const looking = lookOver(w, target.id);
    const done = endTurn(looking, testDrive);
    for (const world of [looking, done]) {
      world.vehicles = world.vehicles.filter((v) => v.id !== target.id);
      expect(() => settleStates(world)).not.toThrow();
      expect(world.states.filter((s) => s.other === target.id)).toEqual([]);
    }
  });

  it('shows a progress bar on the looker only', () => {
    const { w, target } = lookerWorld(5);
    const started = lookOver(w, target.id);
    expect(workOf(started, playerVehicle(started))).toMatchObject({ from: 'state', turnsLeft: 1, total: LOOK_OVER.turns });
    expect(workOf(started, vehicleById(started, target.id))).toBeNull();
  });

  it('is no hostile act and moves nothing: no feud, combat, standing, memory, XP or money', () => {
    const { w, target } = lookerWorld(5);
    target.brain = npcBrain('trader', target.pos, ['trader']);
    const before = { player: structuredClone(w.player), money: target.resources?.money, memories: structuredClone(target.brain.memories) };
    const done = endTurn(lookOver(w, target.id), testDrive);
    const npc = vehicleById(done, target.id);
    expect(done.states.filter((s) => s.kind === 'feud' || s.kind === 'combat')).toEqual([]);
    expect(done.player.standing).toEqual(before.player.standing);
    expect(done.player.deeds).toEqual(before.player.deeds);
    expect(done.player.xp).toBe(before.player.xp);
    expect(done.player.money).toBe(before.player.money);
    expect(npc.resources?.money).toBe(before.money);
    expect(npc.brain!.memories.filter((m) => m.fact.kind === 'wronged')).toEqual([]);
    expect(done.events.filter((e) => e.t === 'practice' || e.t === 'hostile')).toEqual([]);
  });
});

describe('what a truck knows of a load', () => {
  it('reads the real cargo only after a look-over, and the visible hold before it', () => {
    const { w, target } = lookerWorld(5);
    const empty = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 35, y: 34 });
    const me = playerVehicle(w);
    expect(perceivedLoad(w, me, target)).toBe(perceivedLoad(w, me, empty));
    const done = endTurn(lookOver(w, target.id), testDrive);
    expect(perceivedLoad(done, playerVehicle(done), vehicleById(done, target.id))).toBe(cargoValue(vehicleById(done, target.id)));
  });

  it('gives Cargo eye the load of any truck in sight, near or far', () => {
    const { w, target } = lookerWorld(LOOK_OVER.reach + 5);
    expect(knowsCargo(w, playerVehicle(w), target)).toBe(false);
    w.player.perks.push('cargoEye');
    expect(knowsCargo(w, playerVehicle(w), target)).toBe(true);
  });
});
