import { describe, expect, it } from 'vitest';
import { LOOK_OVER, NPC_BEHAVIOR, NPCS } from '../data/npcs';
import { playerVehicle, vehicleById } from './damage';
import { raiseCalls } from './dialogue';
import { spawnGroup, waveOf } from './chaos-highway';
import { alongOf, toRoad } from './highway';
import { addGoods } from './inventory';
import { holdsUp, optionWeights, passReason, judgeDanger } from './npc-decisions';
import { thinkNpc, topGoal } from './npc-activities';
import { addState, stateOf } from './states';
import { addVehicle, emptyWorld, forceOption, chaosHighwayWorld, npcBrain, sizedUp, startCombat, testDrive } from './testkit';
import type { Vehicle, World } from './types';
import { endTurn } from './world';

function scumbagAndPrey(gap = 5): { w: World; robber: Vehicle; prey: Vehicle } {
  const w = emptyWorld({ x: 200, y: 200 });
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  const robber = addVehicle(w, 'independent', 'wagon', ['mg', 'stockEngine'], { x: 10, y: 10 });
  robber.brain = npcBrain('scavenger', robber.pos, ['scavenger', 'scumbag']);
  const prey = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 10 + gap, y: 10 });
  prey.brain = npcBrain('trader', prey.pos, ['trader']);
  prey.resources!.money = 0;
  return { w, robber, prey };
}

function raiderAndPlayer(): { w: World; raider: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  addGoods(w, playerVehicle(w), 'electronics', 3);
  const raider = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine', 'mg'], { x: 38, y: 30 }, Math.PI);
  raider.brain = npcBrain('buggy', raider.pos, ['raider']);
  return { w, raider };
}

const find = (w: World, id: string): Vehicle => vehicleById(w, id);

describe('what a robber weighs before a look-over', () => {
  it('reads a rich hidden load like an empty one in the same hold, in every robbery choice', () => {
    const rich = scumbagAndPrey();
    addGoods(rich.w, rich.prey, 'electronics', 6);
    const empty = scumbagAndPrey();
    const raiderOf = (w: World) => {
      const raider = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine', 'mg'], { x: 10, y: 14 });
      raider.brain = npcBrain('buggy', raider.pos, ['raider']);
      return raider;
    };
    const richRaider = raiderOf(rich.w);
    const emptyRaider = raiderOf(empty.w);
    const choices = (s: ReturnType<typeof scumbagAndPrey>, raider: Vehicle) => ({
      rob: optionWeights(s.w, s.robber, 'preySeen', s.prey.id, 0).rob,
      fight: optionWeights(s.w, raider, 'hostileSeen', s.prey.id, 0).fight,
      pass: passReason(s.w, raider, s.prey, judgeDanger(s.w, raider, s.prey)),
      holdUp: holdsUp(s.w, s.robber, s.prey, null),
    });
    expect(choices(rich, richRaider)).toEqual(choices(empty, emptyRaider));
    sizedUp(rich.w, rich.robber, rich.prey);
    sizedUp(empty.w, empty.robber, empty.prey);
    expect(optionWeights(rich.w, rich.robber, 'preySeen', rich.prey.id, 0).rob).toBeGreaterThan(optionWeights(empty.w, empty.robber, 'preySeen', empty.prey.id, 0).rob ?? 0);
  });

  it('never holds up prey it has not looked over', () => {
    const { w, robber, prey } = scumbagAndPrey();
    addGoods(w, prey, 'electronics', 3);
    addState(w, 'feud', robber.id, prey.id, { kind: 'feud', robbery: true });
    expect(holdsUp(w, robber, prey, null)).toBe(false);
    sizedUp(w, robber, prey);
    expect(holdsUp(w, robber, prey, null)).toBe(true);
  });
});

describe('a robber that likes the look', () => {
  it('sizes the prey up with no feud, looks it over, then robs what it saw', () => {
    const { w: start, robber, prey } = scumbagAndPrey(14);
    prey.brain = null;
    addGoods(start, prey, 'electronics', 3);
    forceOption('preySeen', 'rob');
    forceOption('sizedUp', 'rob');
    forceOption('mugging', 'attack');
    thinkNpc(start, find(start, robber.id));
    expect(topGoal(find(start, robber.id))).toMatchObject({ kind: 'sizeUp', targetId: prey.id, reason: 'sizingUp' });
    expect(stateOf(start, 'feud', robber.id, prey.id)).toBeNull();

    let w = start;
    let looked = false;
    for (let turn = 0; turn < 8 && topGoal(find(w, robber.id))?.kind !== 'fight'; turn++) {
      w = endTurn(w, testDrive);
      looked ||= w.events.some((e) => e.t === 'lookedOver' && e.by === robber.id && e.target === prey.id);
    }

    expect(looked).toBe(true);
    expect(topGoal(find(w, robber.id))).toMatchObject({ kind: 'fight', targetId: prey.id, reason: 'robCargo' });
    expect(stateOf(w, 'feud', robber.id, prey.id)).toMatchObject({ data: { kind: 'feud', robbery: true } });
  });

  it('backs off a poor load it looked over', () => {
    const { w, robber, prey } = scumbagAndPrey();
    forceOption('preySeen', 'rob');
    forceOption('sizedUp', 'keep');
    const me = find(w, robber.id);
    thinkNpc(w, me);
    expect(topGoal(me)?.kind).toBe('sizeUp');
    sizedUp(w, me, prey);
    w.turn++;
    w.events = [];
    thinkNpc(w, me);
    expect(me.brain!.goals.some((g) => g.kind === 'sizeUp')).toBe(false);
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'activity', vehicle: me.id, previous: 'sizeUp', reason: 'poorLoad' }));
    expect(stateOf(w, 'backedOff', me.id, prey.id)).not.toBeNull();
    expect(stateOf(w, 'feud', me.id, prey.id)).toBeNull();
  });

  it('gives up and backs off once the prey stays out of sight past the search turns', () => {
    const { w, robber, prey } = scumbagAndPrey();
    forceOption('preySeen', 'rob');
    const me = find(w, robber.id);
    thinkNpc(w, me);
    prey.pos = { x: 10 + 3 * LOOK_OVER.reach + 30, y: 10 };
    for (let i = 0; i <= NPC_BEHAVIOR.fightSearchTurns + 1; i++) {
      w.turn++;
      thinkNpc(w, me);
    }
    expect(me.brain!.goals.some((g) => g.kind === 'sizeUp')).toBe(false);
    expect(stateOf(w, 'backedOff', me.id, prey.id)).not.toBeNull();
  });
});

describe('a raider sizing up the player', () => {
  it('holds fire and makes no demand until it has looked the player over', () => {
    const { w: start, raider } = raiderAndPlayer();
    forceOption('hostileSeen', 'fight');
    forceOption('sizedUp', 'rob');
    forceOption('mugging', 'demand');
    let w = endTurn(start, testDrive);
    expect(topGoal(find(w, raider.id))?.kind).toBe('sizeUp');
    expect(w.player.call).toBeNull();
    expect(w.events.some((e) => e.t === 'shot' && e.shooter === raider.id)).toBe(false);
    for (let turn = 0; turn < 6 && w.player.call?.topic !== 'demand'; turn++) {
      expect(w.events.some((e) => e.t === 'shot' && e.shooter === raider.id)).toBe(false);
      w = endTurn(w, testDrive);
    }
    expect(w.player.call).toMatchObject({ with: raider.id, topic: 'demand' });
    expect(stateOf(w, 'sizedUp', raider.id, w.player.vehicleId)).not.toBeNull();
  });

  it('raises no demand from a fight goal without a look-over', () => {
    const { w, raider } = raiderAndPlayer();
    raider.brain!.goals = [{ kind: 'fight', targetId: w.player.vehicleId, destination: { ...playerVehicle(w).pos }, phase: 'travel', reason: 'fightHostile', demands: true, worn: { turn: w.turn, condition: 1 } }];
    raiseCalls(w);
    expect(w.player.call).toBeNull();
    sizedUp(w, raider, playerVehicle(w));
    raiseCalls(w);
    expect(w.player.call).toMatchObject({ with: raider.id, topic: 'demand' });
  });

  it('drops the look-over once the player opens a fight on it', () => {
    const { w: start, raider } = raiderAndPlayer();
    forceOption('hostileSeen', 'fight');
    const w = endTurn(start, testDrive);
    const me = find(w, raider.id);
    expect(topGoal(me)?.kind).toBe('sizeUp');
    startCombat(w, playerVehicle(w), me);
    w.turn++;
    thinkNpc(w, me);
    expect(me.brain!.goals.some((g) => g.kind === 'sizeUp')).toBe(false);
    expect(stateOf(w, 'backedOff', me.id, w.player.vehicleId)).toBeNull();
  });
});

describe('Chaos Highway groups', () => {
  it('never size anyone up, since they fight the convoy on a feud', () => {
    let w = chaosHighwayWorld(3);
    const run = w.chaosHighway!;
    const group = { ...run.groups[0], stretch: 1, from: 'ahead' as const, templates: ['buggy'], level: waveOf(1).level };
    run.groups = [group];
    spawnGroup(w, run, group, alongOf(w.seed, toRoad(w.seed, 0, playerVehicle(w).pos)));
    for (let turn = 0; turn < 12; turn++) {
      w = endTurn(w, testDrive);
      expect(w.vehicles.flatMap((v) => v.brain?.goals ?? []).filter((g) => g.kind === 'sizeUp')).toEqual([]);
      expect(w.states.filter((s) => s.kind === 'lookOver' || s.kind === 'sizedUp')).toEqual([]);
    }
  });
});
