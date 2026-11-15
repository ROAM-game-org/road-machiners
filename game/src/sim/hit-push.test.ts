import { describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import type { WeaponDef } from '../data/parts';
import { partDef } from '../data/parts';
import { mountedItems, mountedParts } from './grid';
import { hitPushes } from './hit-push';
import type { TimedShot } from './timed-combat';
import { addVehicle, emptyWorld } from './testkit';
import type { GameEvent, ShotRound, Vehicle } from './types';

type ShotEvent = Extract<GameEvent, { t: 'shot' }>;

function roundOf(weapon: string): WeaponDef['round'] {
  return (partDef(weapon) as WeaponDef).round;
}

function flightOf(weapon: string, from: { x: number; y: number }, impactAt: { x: number; y: number }): TimedShot {
  return { round: roundOf(weapon), from, impactAt } as TimedShot;
}

function eventOf(target: Vehicle, round: Partial<ShotRound>): ShotEvent {
  const full: ShotRound = { hit: true, crit: false, offset: 0, struck: target.id, hits: [{ part: mountedParts(target)[0].id, damage: 1 }], blast: [], burst: null, ...round };
  return { t: 'shot', shooter: 'x', weapon: 'w', target: target.id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [full] };
}

function scene() {
  const w = emptyWorld();
  const target = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 40, y: 30 });
  const near = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 40.4, y: 30 });
  const far = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 60, y: 50 });
  return { w, target, near, far };
}

describe('hitPushes', () => {
  it('pushes the struck truck once along a bullet flight, flat', () => {
    const { w, target } = scene();
    const flight = flightOf('mg', { x: 30, y: 30 }, { x: 40, y: 30 });
    const pushes = hitPushes(w, flight, eventOf(target, {}), [target]);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ vehicle: target.id, unit: 0, dir: { x: 1, y: 0 }, lift: 0 });
    expect(pushes[0].impulse).toBeCloseTo(2.5 * RULES.hitPush.kinetic);
  });

  it('gives a missed bullet no push', () => {
    const { w, target } = scene();
    const flight = flightOf('mg', { x: 30, y: 30 }, { x: 40, y: 34 });
    expect(hitPushes(w, flight, eventOf(target, { struck: null, hits: [], hit: false }), [target])).toEqual([]);
  });

  it('pushes harder and lifts for a shell, and pushes neighbours away from the burst', () => {
    const { w, target, near, far } = scene();
    const flight = flightOf('cannon', { x: 30, y: 30 }, { x: 40, y: 30 });
    const pushes = hitPushes(w, flight, eventOf(target, {}), [target, near, far]);
    const direct = pushes.find((p) => p.vehicle === target.id)!;
    const side = pushes.find((p) => p.vehicle === near.id)!;
    expect(direct.impulse).toBeCloseTo(95 * RULES.hitPush.blast);
    expect(direct.lift).toBe(RULES.hitPush.lift);
    expect(side.impulse).toBeLessThan(direct.impulse);
    expect(side.dir.x).toBeGreaterThan(0.5);
    expect(pushes.some((p) => p.vehicle === far.id)).toBe(false);
  });

  it('pushes a shell this many times harder than a bullet of equal damage', () => {
    const { w, target } = scene();
    const shell = hitPushes(w, flightOf('cannon', { x: 30, y: 30 }, { x: 40, y: 30 }), eventOf(target, {}), [target])[0];
    const bullet = hitPushes(w, { ...flightOf('mg', { x: 30, y: 30 }, { x: 40, y: 30 }), round: { ...roundOf('mg'), damage: 95 } }, eventOf(target, {}), [target])[0];
    expect(shell.impulse / bullet.impulse).toBeCloseTo(RULES.hitPush.blast / RULES.hitPush.kinetic);
  });

  it('treats a flamer hit as a bullet', () => {
    const { w, target } = scene();
    const push = hitPushes(w, flightOf('flamer', { x: 30, y: 30 }, { x: 40, y: 30 }), eventOf(target, {}), [target])[0];
    expect(push.lift).toBe(0);
  });

  it('pushes a ground burst on a nearby truck without a struck one', () => {
    const { w, target } = scene();
    const flight = flightOf('cannon', { x: 30, y: 30 }, { x: 40, y: 32 });
    const pushes = hitPushes(w, flight, eventOf(target, { struck: null, hits: [], hit: false, burst: { x: 40, y: 32 } }), [target]);
    expect(pushes.every((p) => p.dir.y < 0)).toBe(true);
  });

  it('pushes nothing for a zero-length flight, which has no direction', () => {
    const { w, target } = scene();
    expect(hitPushes(w, flightOf('mg', { x: 40, y: 30 }, { x: 40, y: 30 }), eventOf(target, {}), [target])).toEqual([]);
  });

  it('names the rear unit for a hit on a trailer', () => {
    const w = emptyWorld();
    const semi = addVehicle(w, 'independent', 'sorokonoga', ['stockEngine'], { x: 40, y: 30 });
    const flight = flightOf('mg', { x: 30, y: 30 }, { x: 40, y: 30 });
    const units = mountedItems(semi).map((it) => {
      const push = hitPushes(w, flight, eventOf(semi, { hits: [{ part: it.part.id, damage: 1 }] }), [semi])[0];
      return push.unit;
    });
    expect(new Set(units)).toEqual(new Set([0, 1]));
  });
});
