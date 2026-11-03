import { describe, expect, it } from 'vitest';
import type { TraitId } from '../data/npcs';
import { noteAttack } from './combat';
import { playerVehicle } from './damage';
import { stateOf } from './states';
import { addVehicle, editableTerrain, emptyWorld, npcBrain } from './testkit';
import type { Faction, GameEvent, Vehicle, World } from './types';
import type { Vec } from './vec';
import { refreshVision } from './vision';

function addNpc(w: World, faction: Faction, template: string, traits: TraitId[], pos: Vec): Vehicle {
  const v = addVehicle(w, faction, 'scout', ['mg', 'stockEngine'], pos);
  v.brain = npcBrain(template, pos, traits);
  return v;
}

const patrol = (w: World, pos: Vec) => addNpc(w, 'bowl', 'bowlFarmer', ['lawman', 'brave'], pos);
const trader = (w: World, faction: Faction, pos: Vec) => addNpc(w, faction, 'trader', ['trader'], pos);
const feuds = (w: World, v: Vehicle, against: Vehicle) => stateOf(w, 'feud', v.id, against.id) !== null;
const joins = (w: World) => w.events.filter((e): e is Extract<GameEvent, { t: 'joins' }> => e.t === 'joins');

function raiseHill(w: World): void {
  editableTerrain(w);
  const size = w.terrain.size;
  for (let i = 32; i <= 36; i++) for (let j = 24; j <= 36; j++) w.terrain.heights[j * (size + 1) + i] = 3;
  refreshVision(w);
}

describe('witnesses of a calm attack', () => {
  it('brings a second Bowl patrol that sees the attack into the fight, with a joins line for the player', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const shot = patrol(w, { x: 30, y: 36 });
    const watcher = patrol(w, { x: 40, y: 32 });
    noteAttack(w, me, shot, true);
    expect(feuds(w, shot, me)).toBe(true);
    expect(feuds(w, watcher, me)).toBe(true);
    expect(joins(w)).toEqual([{ t: 'joins', vehicle: watcher.id, against: me.id, victim: shot.id }]);
  });

  it('leaves the same patrol out behind a hill, where it sees neither truck', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    raiseHill(w);
    const me = playerVehicle(w);
    const shot = patrol(w, { x: 30, y: 36 });
    const watcher = patrol(w, { x: 40, y: 32 });
    noteAttack(w, me, shot, true);
    expect(feuds(w, shot, me)).toBe(true);
    expect(feuds(w, watcher, me)).toBe(false);
    expect(watcher.brain!.attackers).toEqual({});
  });

  it('brings allied Bowl drivers near a Bowl trader and a lawman from farther off, and leaves a far Bowl trader out', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const victim = trader(w, 'bowl', { x: 30, y: 34 });
    const near = trader(w, 'bowl', { x: 36, y: 34 });
    const far = trader(w, 'bowl', { x: 31, y: 46 });
    const law = patrol(w, { x: 28, y: 46 });
    noteAttack(w, me, victim, true);
    expect(feuds(w, near, me)).toBe(true);
    expect(feuds(w, law, me)).toBe(true);
    expect(feuds(w, far, me)).toBe(false);
  });

  it('never moves a neutral independent, and moves a friendly Guild courier at about the friendly rate', () => {
    let joined = 0;
    const runs = 200;
    for (let k = 0; k < runs; k++) {
      const w = emptyWorld({ x: 30, y: 30 });
      w.rngState = 1000 + k * 7919;
      const me = playerVehicle(w);
      const victim = trader(w, 'bowl', { x: 30, y: 34 });
      const road = trader(w, 'independent', { x: 36, y: 34 });
      const guild = addNpc(w, 'guidestar', 'courier', ['courier'], { x: 34, y: 38 });
      noteAttack(w, me, victim, true);
      expect(feuds(w, road, me)).toBe(false);
      if (feuds(w, guild, me)) joined++;
    }
    expect(joined / runs).toBeGreaterThan(0.15);
    expect(joined / runs).toBeLessThan(0.35);
  });

  it('starts no new incident from the defender counterfire', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const victim = trader(w, 'bowl', { x: 30, y: 34 });
    noteAttack(w, me, victim, true);
    const watcher = patrol(w, { x: 36, y: 36 });
    const feudsBefore = w.states.filter((s) => s.kind === 'feud').length;
    w.events = [];
    noteAttack(w, victim, me, false);
    expect(w.states.filter((s) => s.kind === 'feud')).toHaveLength(feudsBefore);
    expect(w.events.filter((e) => e.t === 'hostile' || e.t === 'joins')).toEqual([]);
    expect(feuds(w, watcher, me)).toBe(false);
  });

  it('keeps the aggressor faction mates out of a fight their friend started', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const aggressor = trader(w, 'bowl', { x: 40, y: 30 });
    const victim = trader(w, 'independent', { x: 44, y: 30 });
    const mate = trader(w, 'bowl', { x: 42, y: 34 });
    noteAttack(w, aggressor, victim, true);
    expect(feuds(w, victim, aggressor)).toBe(true);
    expect(feuds(w, mate, aggressor)).toBe(false);
    expect(feuds(w, mate, victim)).toBe(false);
  });
});
