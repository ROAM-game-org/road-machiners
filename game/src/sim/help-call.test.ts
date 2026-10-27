import { describe, expect, it } from 'vitest';
import type { TraitId } from '../data/npcs';
import { awakeFoesOf, inCombat } from './combat';
import { playerVehicle } from './damage';
import { askTopic, callVehicle, chooseOption, currentOptions } from './dialogue';
import { asksOf, offersLine } from './dialogue-testkit';
import { canAskHelp, helpAnswer, joinPlayerFight, turnDownCall, type HelpAnswer } from './help-call';
import { remember } from './memory';
import { topGoal } from './npc-activities';
import { refreshVision } from './vision';
import { stateOf } from './states';
import { endTurn } from './world';
import { addVehicle, emptyWorld, forceOption, npcBrain, startCombat, testDrive } from './testkit';
import type { Faction, Vehicle, World } from './types';
import { entryText } from '../text/resolve';
import { lineKey } from '../text/names';

type Fight = { w: World; foe: Vehicle; helper: Vehicle };

function fight(faction: Faction, traits: TraitId[], standing = 0, foeFaction: Faction = 'scrapjaw'): Fight {
  const w = emptyWorld({ x: 30, y: 30 });
  const foe = addVehicle(w, foeFaction, 'scout', ['mg', 'stockEngine'], { x: 26, y: 34 });
  foe.brain = npcBrain('buggy', foe.pos, ['raider']);
  const helper = addVehicle(w, faction, 'scout', ['mg', 'stockEngine'], { x: 34, y: 30 });
  helper.brain = npcBrain('trader', helper.pos, traits);
  if (faction === 'bowl') w.player.standing.bowl = standing;
  startCombat(w, foe, playerVehicle(w));
  refreshVision(w);
  return { w, foe, helper };
}

function yesRate(make: () => Fight, asks = 2000): number {
  const { w, helper } = make();
  let yes = 0;
  for (let i = 0; i < asks; i++) if (helpAnswer(w, helper) === 'help') yes++;
  return yes / asks;
}

describe('who is offered the topic', () => {
  it('opens on a calm driver in sight while the player is in combat', () => {
    const { w, helper } = fight('independent', ['trader']);
    expect(canAskHelp(w, helper)).toBe(true);
  });

  it('stays closed with no fight, on the foe, on a driver in the fight and after a refusal', () => {
    const calm = fight('independent', ['trader']);
    calm.w.states = [];
    expect(canAskHelp(calm.w, calm.helper)).toBe(false);
    expect(canAskHelp(calm.w, calm.foe)).toBe(false);
    const busy = fight('independent', ['trader']);
    const other = addVehicle(busy.w, 'independent', 'scout', ['mg'], { x: 34, y: 36 });
    other.brain = npcBrain('trader', other.pos, ['trader']);
    startCombat(busy.w, other, busy.helper);
    expect(canAskHelp(busy.w, busy.helper)).toBe(false);
    const refused = fight('independent', ['trader']);
    turnDownCall(refused.w, refused.helper);
    expect(canAskHelp(refused.w, refused.helper)).toBe(false);
  });

  it('offers the line first in the call menu and hides it for a free merc', () => {
    const { w, helper } = fight('independent', ['trader']);
    expect(offersLine(callVehicle(w, helper.id), 'needAHandHere')).toBe(true);
    const merc = fight('independent', ['merc']);
    expect(canAskHelp(merc.w, merc.helper)).toBe(false);
  });
});

describe('the answer', () => {
  it('refuses outright for hard reasons and never rolls a yes', () => {
    const cases: [string, Fight][] = [
      ['a raider', fight('scrapjaw', ['raider'])],
      ['a neutral coward', fight('independent', ['coward'])],
      ['a driver who likes the foe', fight('bowl', ['trader'], 20, 'bowl')],
    ];
    for (const [name, c] of cases) {
      for (let i = 0; i < 50; i++) expect(helpAnswer(c.w, c.helper), name).not.toBe('help');
    }
  });

  it('refuses a lawman when the player wronged a lawful foe', () => {
    const c = fight('bowl', ['lawman'], 0, 'independent');
    c.foe.brain!.traits = ['trader'];
    remember(c.w, c.foe, { kind: 'wronged', by: c.w.player.vehicleId, deed: 'attacked' });
    for (let i = 0; i < 50; i++) expect(helpAnswer(c.w, c.helper)).not.toBe('help');
  });

  it('says yes at the shared rate: allied almost always, friendly three in four, neutral one in ten, never for a coward or a raider', () => {
    expect(yesRate(() => fight('bowl', ['trader'], 60))).toBeCloseTo(0.98, 1);
    expect(Math.abs(yesRate(() => fight('bowl', ['trader'], 20)) - 0.75)).toBeLessThan(0.03);
    expect(Math.abs(yesRate(() => fight('independent', ['trader'])) - 0.11)).toBeLessThan(0.03);
    expect(Math.abs(yesRate(() => fight('bowl', ['lawman']), 600) - 0.98)).toBeLessThan(0.03);
    expect(yesRate(() => fight('independent', ['coward']), 300)).toBe(0);
    expect(yesRate(() => fight('scrapjaw', ['raider']), 300)).toBe(0);
  });

  it('owns up to being outgunned when the foes are too much', () => {
    const c = fight('bowl', ['trader'], 60);
    for (let i = 0; i < 4; i++) {
      const extra = addVehicle(c.w, 'scrapjaw', 'scout', ['mg', 'mg', 'stockEngine'], { x: 24 + i, y: 36 });
      extra.brain = npcBrain('buggy', extra.pos, ['raider']);
      startCombat(c.w, extra, playerVehicle(c.w));
    }
    refreshVision(c.w);
    const answers = new Set<HelpAnswer>();
    for (let i = 0; i < 30; i++) answers.add(helpAnswer(c.w, c.helper));
    expect(answers.has('outgunned')).toBe(true);
    expect(answers.has('help')).toBe(false);
  });
});

describe('after the answer', () => {
  it('a yes puts the helper in a feud with every foe, with one joins event and a fight goal on the nearest', () => {
    const c = fight('bowl', ['trader'], 60);
    const second = addVehicle(c.w, 'scrapjaw', 'scout', ['mg', 'stockEngine'], { x: 20, y: 40 });
    second.brain = npcBrain('buggy', second.pos, ['raider']);
    startCombat(c.w, second, playerVehicle(c.w));
    joinPlayerFight(c.w, c.helper);
    expect(stateOf(c.w, 'feud', c.helper.id, c.foe.id)).not.toBeNull();
    expect(stateOf(c.w, 'feud', c.helper.id, second.id)).not.toBeNull();
    expect(c.w.events.filter((e) => e.t === 'joins')).toHaveLength(1);
    const goal = topGoal(c.helper)!;
    expect(goal.kind).toBe('fight');
    expect(goal.kind === 'fight' && goal.targetId).toBe(c.foe.id);
    expect(goal.reason).toBe('answeredCall');
    expect(awakeFoesOf(c.w, playerVehicle(c.w))).toHaveLength(2);
  });

  it('joining throws when the helper cannot answer', () => {
    const c = fight('scrapjaw', ['raider']);
    expect(() => joinPlayerFight(c.w, c.helper)).toThrow();
  });

  it('a refusal leaves one state for 20 turns that hides the topic', () => {
    const c = fight('independent', ['trader']);
    turnDownCall(c.w, c.helper);
    const held = c.w.states.filter((s) => s.kind === 'helpRefused');
    expect(held).toHaveLength(1);
    expect([held[0].holder, held[0].other, held[0].turnsLeft]).toEqual([c.helper.id, c.w.player.vehicleId, 20]);
    expect(() => turnDownCall(c.w, c.helper)).toThrow();
  });

  it('plays through the call topic: a yes sends the helper and a no is final', () => {
    forceOption('helpCalled', 'help');
    const yes = fight('independent', ['trader']);
    let w = askTopic(callVehicle(yes.w, yes.helper.id), 'askHelp');
    expect(entryText('en', lineKey(currentOptions(w)[0].line))).toBe('That one, on my tail.');
    w = chooseOption(w, 0);
    expect(topGoal(w.vehicles.find((v) => v.id === yes.helper.id)!)?.reason).toBe('answeredCall');
    expect(w.states.some((s) => s.kind === 'helpRefused')).toBe(false);
  });

  it('a no leaves the topic gone from the next call', () => {
    forceOption('helpCalled', 'refuse');
    const no = fight('independent', ['trader']);
    let w = askTopic(callVehicle(no.w, no.helper.id), 'askHelp');
    w = chooseOption(w, 0);
    expect(w.states.filter((s) => s.kind === 'helpRefused')).toHaveLength(1);
    expect(topGoal(w.vehicles.find((v) => v.id === no.helper.id)!)?.reason).not.toBe('answeredCall');
    expect(canAskHelp(w, w.vehicles.find((v) => v.id === no.helper.id)!)).toBe(false);
  });

  it('moves no money and gives no XP', () => {
    const c = fight('bowl', ['trader'], 60);
    const { money, xp } = c.w.player;
    joinPlayerFight(c.w, c.helper);
    expect(inCombat(c.w, playerVehicle(c.w))).toBe(true);
    expect([c.w.player.money, c.w.player.xp]).toEqual([money, xp]);
  });
});

describe('a helper in the fight', () => {
  it('fires at the foe within a few turns and keeps its goal while it can see it', () => {
    const c = fight('bowl', ['trader'], 60);
    c.foe.pos = { x: 40, y: 32 };
    c.foe.heading = Math.PI;
    refreshVision(c.w);
    joinPlayerFight(c.w, c.helper);
    let w = c.w;
    const shooters = new Set<string>();
    for (let turn = 0; turn < 6; turn++) {
      w = endTurn(w, testDrive);
      for (const e of w.events) if (e.t === 'shot') shooters.add(e.shooter);
    }
    expect(shooters.has(c.helper.id)).toBe(true);
  });
});

describe('a merc hired in the fight', () => {
  it('is offered the hire topic and not the help topic', () => {
    const c = fight('independent', ['merc']);
    const offered = asksOf(callVehicle(c.w, c.helper.id));
    expect(offered).toContain('Ride guard for me for a day?');
    expect(offered).not.toContain("Need a hand here, I'm under fire!");
  });
});
