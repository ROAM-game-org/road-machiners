import { describe, expect, it } from 'vitest';
import { TOPICS, type LineId } from '../data/dialogue';
import { EFFORT } from '../data/market';
import { HIRE, NPCS } from '../data/npcs';
import { inFeud, noteAttack } from './combat';
import { followingOf } from './companies';
import { playerVehicle } from './damage';
import { callVehicle, chooseOption, currentOptions } from './dialogue';
import { dutyPrice } from './duty';
import { checkHire, dismissGuard, guardFee, hireGuard, playerGuard, canHireGuard } from './hire';
import { goalHolds, placeBase, topGoal } from './npc-activities';
import { judgeDanger } from './npc-decisions';
import { addState, advanceStates, endState } from './states';
import { addVehicle, emptyWorld, forceOption, furyRoadWorld, npcBrain } from './testkit';
import type { GameEvent, Vehicle, World } from './types';
import { refreshVision } from './vision';
import { lineKey } from '../text/names';
import { entryText } from '../text/resolve';

const en = (line: LineId): string => entryText('en', lineKey(line));

function mercWorld(): { w: World; merc: Vehicle } {
  const w = emptyWorld({ x: 40, y: 40 });
  const merc = addVehicle(w, 'mercs', 'scout', ['mg', 'stockEngine'], { x: 46, y: 40 });
  merc.brain = npcBrain('merc', merc.pos, NPCS.merc.traits);
  refreshVision(w);
  return { w, merc };
}

function hired(): { w: World; merc: Vehicle; fee: number } {
  const { w, merc } = mercWorld();
  const fee = guardFee(w, merc);
  w.player.money = fee + 500;
  hireGuard(w, merc, fee);
  return { w, merc, fee };
}

const ended = (w: World) => w.events.filter((e): e is Extract<GameEvent, { t: 'guardEnded' }> => e.t === 'guardEnded');

function optionIndex(w: World, text: string): number {
  const i = currentOptions(w).findIndex((o) => en(o.line) === text);
  if (i < 0) throw new Error(`No option "${text}" in ${currentOptions(w).map((o) => en(o.line)).join(' | ')}`);
  return i;
}

describe('the guard fee', () => {
  it('is a day of tier-1 wage plus the merc\'s supplies and fuel for a day at the reference speed', () => {
    const { w, merc } = mercWorld();
    expect(guardFee(w, merc)).toBe(dutyPrice(w, merc, HIRE.turns * EFFORT.refSpeed, HIRE.turns));
    expect(guardFee(w, merc)).toBeGreaterThan(HIRE.turns * EFFORT.wage[1]);
  });
});

describe('hiring on the radio', () => {
  const ask = () => en(TOPICS.hireGuard.ask!.say);

  it('takes the fee once, binds the merc and logs the hire', () => {
    const { w, merc } = mercWorld();
    const fee = guardFee(w, merc);
    w.player.money = fee + 100;
    const mercMoney = merc.resources!.money;
    forceOption('hireOffered', 'take');
    let next = callVehicle(w, merc.id);
    next = chooseOption(next, optionIndex(next, ask()));
    next = chooseOption(next, optionIndex(next, en('whatsYourRate')));
    expect(next.player.call?.vars.price).toEqual({ kind: 'money', amount: fee });
    next = chooseOption(next, optionIndex(next, en('dealSendingIt')));

    const after = next.vehicles.find((v) => v.id === merc.id)!;
    expect(next.player.money).toBe(100);
    expect(after.resources!.money).toBe(mercMoney + fee);
    expect(followingOf(next, after)).toMatchObject({ kind: 'hire', other: next.player.vehicleId, turnsLeft: HIRE.turns });
    expect(after.brain!.goals[0]).toMatchObject({ kind: 'follow', reason: 'hiredGuard' });
    expect(next.events.filter((e) => e.t === 'guardHired')).toEqual([{ t: 'guardHired', merc: merc.id, fee, until: next.turn + HIRE.turns }]);
  });

  it('never offers the deal to a player who cannot pay', () => {
    const { w, merc } = mercWorld();
    w.player.money = guardFee(w, merc) - 1;
    forceOption('hireOffered', 'take');
    let next = callVehicle(w, merc.id);
    next = chooseOption(next, optionIndex(next, ask()));
    next = chooseOption(next, optionIndex(next, en('whatsYourRate')));

    expect(currentOptions(next).map((o) => en(o.line))).not.toContain(en('dealSendingIt'));
  });

  it('remembers a refusal, so the same merc is not asked again', () => {
    const { w, merc } = mercWorld();
    w.player.money = 1e7;
    forceOption('hireOffered', 'decline');
    let next = callVehicle(w, merc.id);
    next = chooseOption(next, optionIndex(next, ask()));
    next = chooseOption(next, optionIndex(next, en('whatsYourRate')));
    expect(en(next.player.call!.line.line)).toBe(en('notRidingForYou'));
    next = chooseOption(next, optionIndex(next, en('understood')));

    expect(currentOptions(next).map((o) => en(o.line))).not.toContain(ask());
  });

  it('offers no hire on Chaos Highway', () => {
    const w = furyRoadWorld();
    const me = playerVehicle(w);
    const merc = addVehicle(w, 'mercs', 'scout', ['mg', 'stockEngine'], { x: me.pos.x + 5, y: me.pos.y });
    merc.brain = npcBrain('merc', merc.pos, NPCS.merc.traits);
    refreshVision(w);
    expect(canHireGuard(w, merc)).toBe(false);
  });
});

describe('the end of a hire', () => {
  function expectCleanEnd(w: World, merc: Vehicle, before: number, fee: number): void {
    expect(followingOf(w, merc)).toBeNull();
    expect(playerGuard(w)).toBeNull();
    expect(inFeud(w, merc, playerVehicle(w))).toBe(false);
    expect(merc.resources!.money).toBe(before);
    expect(w.player.money).toBe(500);
    expect(fee).toBeGreaterThan(0);
  }

  it('expires after a day, and the merc goes back to its own life', () => {
    const { w, merc, fee } = hired();
    const before = merc.resources!.money;
    followingOf(w, merc)!.turnsLeft = 1;
    followingOf(w, merc)!.born = w.turn - 1;
    advanceStates(w);

    expect(ended(w)).toEqual([{ t: 'guardEnded', merc: merc.id, end: 'expired' }]);
    expectCleanEnd(w, merc, before, fee);
    expect(goalHolds(w, merc, merc.brain!.goals[0])).toBe(false);
  });

  it('ends on dismissal with no refund', () => {
    const { w, merc, fee } = hired();
    const before = merc.resources!.money;
    dismissGuard(w);
    expect(ended(w).map((e) => e.end)).toEqual(['dismissed']);
    expectCleanEnd(w, merc, before, fee);
  });

  it('breaks when the merc or the player is knocked out', () => {
    for (const out of ['merc', 'player'] as const) {
      const { w, merc, fee } = hired();
      const before = merc.resources!.money;
      if (out === 'merc') merc.defeat = { phase: 'out', turns: 10, unseen: 0, foes: [], gaveUp: false };
      else w.player.state = 'knockedOut';
      const s = followingOf(w, merc)!;
      expect(checkHire(w, s)).toBe('broken');
      endState(w, s, 'broken');
      expect(ended(w).map((e) => e.end)).toEqual(['knockedOut']);
      expect(followingOf(w, merc)).toBeNull();
      expect(merc.resources!.money).toBe(before);
      expect(w.player.money).toBe(500);
      expect(fee).toBeGreaterThan(0);
    }
  });

  it('breaks when either side turns hostile', () => {
    const { w, merc } = hired();
    addState(w, 'feud', merc.id, w.player.vehicleId, { kind: 'feud', robbery: false });
    const s = followingOf(w, merc)!;
    expect(checkHire(w, s)).toBe('broken');
    endState(w, s, 'broken');
    expect(ended(w).map((e) => e.end)).toEqual(['hostile']);
    expect(w.player.money).toBe(500);
  });
});

describe('a guard on duty', () => {
  function raiderAt(w: World, x: number): Vehicle {
    const raider = addVehicle(w, 'raiders', 'buggy', ['mg', 'stockEngine'], { x, y: 46 });
    raider.brain = npcBrain('buggy', raider.pos, NPCS.buggy.traits);
    return raider;
  }

  it('takes up the fight against a raider that shoots the player', () => {
    const { w, merc } = hired();
    const raider = raiderAt(w, 50);
    noteAttack(w, raider, playerVehicle(w), true);
    expect(inFeud(w, merc, raider)).toBe(true);
  });

  it('stays out of a fight the player starts on a peaceful trader', () => {
    const { w, merc } = hired();
    const trader = addVehicle(w, 'traders', 'scout', ['stockEngine'], { x: 50, y: 44 });
    trader.brain = npcBrain('trader', trader.pos, NPCS.trader.traits);
    noteAttack(w, playerVehicle(w), trader, true);
    expect(inFeud(w, merc, trader)).toBe(false);
  });

  it('makes the player look stronger to a raider', () => {
    const { w } = mercWorld();
    const raider = raiderAt(w, 52);
    const alone = judgeDanger(w, raider, playerVehicle(w));
    const merc = w.vehicles.find((v) => v.brain?.templateId === 'merc')!;
    w.player.money = guardFee(w, merc);
    hireGuard(w, merc, guardFee(w, merc));
    expect(judgeDanger(w, raider, playerVehicle(w))).toBeGreaterThan(alone);
  });

  it('flees when hurt and stays hired, then follows again', () => {
    const { w, merc } = hired();
    placeBase(w, merc, merc.brain!.goals[0]);
    merc.brain!.goals.push({ kind: 'flee', targetId: null, destination: { x: 80, y: 80 }, phase: 'travel', reason: 'damagedThreatened', perceived: w.turn });
    expect(topGoal(merc)?.kind).toBe('flee');
    expect(followingOf(w, merc)?.kind).toBe('hire');
    merc.brain!.goals.pop();
    expect(goalHolds(w, merc, topGoal(merc)!)).toBe(true);
  });
});
