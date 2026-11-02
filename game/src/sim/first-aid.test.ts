import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/goods';
import { EFFORT } from '../data/market';
import { REGION } from '../data/region';
import { RULES } from '../data/rules';
import { firstAidSupplies, firstAidTurns, healPlayer, maxHealthOf } from './health';
import { advanceJobs, canFirstAid, firstAidBlock, startFirstAid } from './jobs';
import { sitePads } from './sites';
import { addState } from './states';
import { addVehicle, emptyWorld, practiceOf, startCombat } from './testkit';
import { playerVehicle } from './damage';
import type { World } from './types';

const gate = sitePads(REGION.towns[0])[0];

function hurt(at = { x: 30, y: 30 }, health = 30, supplies = 10): World {
  const w = emptyWorld(at);
  w.player.ranks.toughness = 1;
  Object.assign(w.player, { health, supplies });
  w.vehicles[0].speed = 0;
  return w;
}

function turn(w: World): void {
  advanceJobs(w);
  healPlayer(w);
}

describe('first aid supplies', () => {
  it('prices the turns saved at the tier 1 wage', () => {
    const expected = ((RULES.townHealMult - 1) * RULES.healPerTurn * EFFORT.wage[1]) / ECONOMY.supplyPrice.supplies;
    expect(firstAidSupplies()).toBeCloseTo(expected);
    expect(firstAidSupplies()).toBeCloseTo(0.295, 2);
  });
});

describe('the first aid job', () => {
  it('heals at the town rate away from town and spends the extra supplies', () => {
    const w = startFirstAid(hurt());
    const supplies = w.player.supplies;
    turn(w);
    expect(w.player.health).toBe(30 + RULES.healPerTurn * RULES.townHealMult);
    expect(w.player.supplies).toBeCloseTo(supplies - RULES.healSupplies - firstAidSupplies());
  });

  it('spends only the normal supplies near a town', () => {
    const w = startFirstAid(hurt(gate));
    const supplies = w.player.supplies;
    turn(w);
    expect(w.player.supplies).toBeCloseTo(supplies - RULES.healSupplies);
  });

  it('leaves resting alone without the job', () => {
    const w = hurt();
    turn(w);
    expect(w.player.health).toBe(30 + RULES.healPerTurn);
  });

  it('ends done at full health and charges nothing on that turn', () => {
    const w = startFirstAid(hurt());
    const turns = firstAidTurns(w);
    for (let i = 0; i < turns; i++) turn(w);
    expect(w.player.health).toBe(maxHealthOf(w));
    const supplies = w.player.supplies;
    const events = w.events.length;
    turn(w);
    expect(playerVehicle(w).job).toBeNull();
    expect(w.player.supplies).toBe(supplies);
    expect(w.events.slice(events).some((e) => e.t === 'job' && e.outcome === 'done')).toBe(true);
  });

  it('awards no XP and no money', () => {
    const w = startFirstAid(hurt());
    const money = w.player.money;
    for (let i = 0; i < 20; i++) turn(w);
    expect(w.player.money).toBe(money);
    expect(practiceOf(w, 'fieldJob')).toEqual([]);
  });

  it('is cancelled when the truck moves', () => {
    const w = startFirstAid(hurt());
    w.vehicles[0].speed = RULES.parkedSpeed + 5;
    turn(w);
    expect(playerVehicle(w).job).toBeNull();
    expect(w.player.health).toBe(30);
  });

  it('is cancelled when combat starts', () => {
    const w = startFirstAid(hurt());
    const raider = addVehicle(w, 'scrapjaw', 'buggy', ['mg'], { x: 35, y: 30 });
    addState(w, 'feud', raider.id, w.vehicles[0].id, { kind: 'feud', robbery: false });
    startCombat(w, raider, w.vehicles[0]);
    turn(w);
    expect(playerVehicle(w).job).toBeNull();
    expect(w.player.health).toBe(30 + RULES.healPerTurn);
  });

  it('is cancelled when supplies run short', () => {
    const w = startFirstAid(hurt());
    w.player.supplies = RULES.healSupplies;
    turn(w);
    expect(playerVehicle(w).job).toBeNull();
    expect(w.player.health).toBe(30 + RULES.healPerTurn);
  });
});

describe('the first aid gate', () => {
  it('names the first failing condition', () => {
    const w = hurt();
    w.player.ranks.toughness = 0;
    expect(firstAidBlock(w)).toBe('noBasic');
    expect(() => startFirstAid(w)).toThrow(/Toughness/);
    w.player.ranks.toughness = 1;
    w.vehicles[0].speed = RULES.parkedSpeed + 5;
    expect(firstAidBlock(w)).toBe('stopFirst');
    w.vehicles[0].speed = 0;
    w.player.health = maxHealthOf(w);
    expect(firstAidBlock(w)).toBe('unhurt');
    expect(() => startFirstAid(w)).toThrow('Refused: unhurt');
    w.player.health = 30;
    w.player.supplies = 0;
    expect(firstAidBlock(w)).toBe('noSupplies');
    expect(() => startFirstAid(w)).toThrow('Refused: noSupplies');
    w.player.supplies = 10;
    expect(canFirstAid(w)).toBe(true);
  });

  it('is busy while another job runs', () => {
    const w = startFirstAid(hurt());
    expect(firstAidBlock(w)).toBe('busy');
  });

  it('is closed in combat', () => {
    const w = hurt();
    const raider = addVehicle(w, 'scrapjaw', 'buggy', ['mg'], { x: 35, y: 30 });
    addState(w, 'feud', raider.id, w.vehicles[0].id, { kind: 'feud', robbery: false });
    startCombat(w, raider, w.vehicles[0]);
    expect(firstAidBlock(w)).toBe('inCombat');
  });

  it('returns a value for a knocked-out or dead player', () => {
    for (const state of ['knockedOut', 'dead'] as const) {
      const w = hurt();
      w.player.state = state;
      expect(() => firstAidBlock(w)).not.toThrow();
    }
  });
});
