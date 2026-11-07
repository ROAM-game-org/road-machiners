import { describe, expect, it } from 'vitest';
import { HONK_RANGE, ROAD_HORN } from '../data/personalities';
import { playerVehicle } from './damage';
import { slotOf } from './fidelity';
import { hearsHorn, hornAtBrake, hornAtSight } from './road-horn';
import { charCodes, hashRandom } from './rng';
import { addVehicle, emptyWorld, npcBrain, startCombat } from './testkit';
import type { TraitId } from '../data/npcs';
import type { Vehicle, World } from './types';

function scene(traits: TraitId[] = ['trader']): { w: World; npc: Vehicle; other: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 40, y: 30 }, 0);
  npc.brain = npcBrain('trader', npc.pos, traits);
  const other = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 50, y: 30 }, Math.PI);
  other.brain = npcBrain('trader', other.pos, ['trader']);
  return { w, npc, other };
}

function sees(npc: Vehicle, other: Vehicle, since: number): void {
  npc.brain!.tracks[other.id] = { at: { ...other.pos }, turn: since, sighted: true, seenSince: since, choice: null, chosenInSight: false };
}

function rollPasses(w: World, id: string, salt: string, chance: number): boolean {
  return hashRandom(w.seed, ...charCodes(id), w.turn, ...charCodes(salt)) < chance;
}

function hornTurn(w: World, npc: Vehicle, fits: (turn: number) => boolean): number {
  for (let turn = 100; turn < 5000; turn++) {
    w.turn = turn;
    if (fits(turn)) return turn;
  }
  throw new Error('No turn fits');
}

function sightTurn(w: World, npc: Vehicle): void {
  hornTurn(w, npc, (t) => (t + slotOf(npc.id)) % ROAD_HORN.paceTurns === 0 && rollPasses(w, npc.id, ROAD_HORN.sightSalt, ROAD_HORN.sightChance));
}

function brakeTurn(w: World, npc: Vehicle): void {
  hornTurn(w, npc, () => rollPasses(w, npc.id, ROAD_HORN.brakeSalt, ROAD_HORN.brakeChance));
}

describe('sight horn', () => {
  it('sounds at a truck first seen this turn on the horn turn', () => {
    const { w, npc, other } = scene();
    sightTurn(w, npc);
    sees(npc, other, w.turn);
    hornAtSight(w, npc, [other]);
    expect(w.events).toEqual([{ t: 'roadHorn', vehicle: npc.id, cause: 'sight', other: other.id, at: npc.pos }]);
  });

  it('stays quiet off the horn turn', () => {
    const { w, npc, other } = scene();
    sightTurn(w, npc);
    w.turn += 1;
    sees(npc, other, w.turn);
    hornAtSight(w, npc, [other]);
    expect(w.events).toEqual([]);
  });

  it('stays quiet at a truck seen for a long time', () => {
    const { w, npc, other } = scene();
    sightTurn(w, npc);
    sees(npc, other, w.turn - ROAD_HORN.paceTurns);
    hornAtSight(w, npc, [other]);
    expect(w.events).toEqual([]);
  });

  it('stays quiet at a hostile truck', () => {
    const { w, npc, other } = scene();
    sightTurn(w, npc);
    sees(npc, other, w.turn);
    other.brain = npcBrain('raider', other.pos, ['raider']);
    startCombat(w, other, npc);
    hornAtSight(w, npc, [other]);
    expect(w.events).toEqual([]);
  });

  it('stays quiet in combat, when knocked out, and for a voice that does not honk back', () => {
    const quiet = (change: (s: ReturnType<typeof scene>) => void, traits?: TraitId[]): number => {
      const s = scene(traits);
      sightTurn(s.w, s.npc);
      sees(s.npc, s.other, s.w.turn);
      change(s);
      hornAtSight(s.w, s.npc, [s.other]);
      return s.w.events.length;
    };
    expect(quiet(({ w, npc }) => startCombat(w, npc, playerVehicle(w)))).toBe(0);
    expect(quiet(({ npc }) => { npc.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false }; })).toBe(0);
    expect(quiet(() => undefined, ['raider'])).toBe(0);
    expect(quiet(() => undefined)).toBe(1);
  });

  it('stays quiet in a mode without radio', () => {
    const { w, npc, other } = scene();
    w.setup = { ...w.setup, mode: 'chaosHighway' };
    sightTurn(w, npc);
    sees(npc, other, w.turn);
    hornAtSight(w, npc, [other]);
    expect(w.events).toEqual([]);
  });

  it('gives one horn per earshot in a turn', () => {
    const { w, npc, other } = scene();
    const third = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 41, y: 31 }, 0);
    third.brain = npcBrain('trader', third.pos, ['trader']);
    sightTurn(w, npc);
    w.events.push({ t: 'roadHorn', vehicle: third.id, cause: 'sight', other: other.id, at: { ...third.pos } });
    sees(npc, other, w.turn);
    hornAtSight(w, npc, [other]);
    expect(w.events).toHaveLength(1);
  });

  it('is the same for the same world and touches no rng or truck', () => {
    const a = scene();
    const b = scene();
    sightTurn(a.w, a.npc);
    b.w.turn = a.w.turn;
    for (const s of [a, b]) sees(s.npc, s.other, s.w.turn);
    const before = JSON.stringify({ ...b.w, events: [] });
    hornAtSight(a.w, a.npc, [a.other]);
    hornAtSight(b.w, b.npc, [b.other]);
    expect(a.w.events).toEqual(b.w.events);
    expect(a.w.events).toHaveLength(1);
    expect(JSON.stringify({ ...b.w, events: [] })).toBe(before);
    expect(a.w.events.some((e) => e.t === 'honk' || e.t === 'practice')).toBe(false);
  });
});

describe('brake horn', () => {
  it('sounds at the nearest truck of the meeting when a driving truck starts braking', () => {
    const { w, npc, other } = scene();
    npc.speed = ROAD_HORN.brakeSpeed;
    brakeTurn(w, npc);
    hornAtBrake(w, npc, [other], false);
    expect(w.events).toEqual([{ t: 'roadHorn', vehicle: npc.id, cause: 'brake', other: other.id, at: npc.pos }]);
  });

  it('stays quiet when the truck was already braking', () => {
    const { w, npc, other } = scene();
    npc.speed = ROAD_HORN.brakeSpeed;
    brakeTurn(w, npc);
    hornAtBrake(w, npc, [other], true);
    expect(w.events).toEqual([]);
  });

  it('stays quiet below the brake speed', () => {
    const { w, npc, other } = scene();
    npc.speed = ROAD_HORN.brakeSpeed - 0.1;
    brakeTurn(w, npc);
    hornAtBrake(w, npc, [other], false);
    expect(w.events).toEqual([]);
  });

  it('never honks for the player truck', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = playerVehicle(w);
    const other = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 50, y: 30 }, 0);
    me.speed = ROAD_HORN.brakeSpeed;
    brakeTurn(w, me);
    hornAtBrake(w, me, [other], false);
    expect(w.events).toEqual([]);
  });
});

describe('earshot', () => {
  it('carries up to the horn range', () => {
    const { w, npc } = scene();
    const me = playerVehicle(w);
    me.pos = { x: npc.pos.x + HONK_RANGE, y: npc.pos.y };
    expect(hearsHorn(w, me, npc)).toBe(true);
    me.pos = { x: npc.pos.x + HONK_RANGE + 1, y: npc.pos.y };
    expect(hearsHorn(w, me, npc)).toBe(false);
  });
});
