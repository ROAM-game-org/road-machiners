import { describe, expect, it } from 'vitest';
import type { TraitId } from '../data/npcs';
import { awakeFoesOf, inCombat } from './combat';
import { playerVehicle } from './damage';
import { askTopic, callVehicle, chooseOption, currentOptions } from './dialogue';
import { asksOf, offersLine } from './dialogue-testkit';
import { canAskHelp, helpAnswer, joinPlayerFight, turnDownCall, type HelpAnswer } from './help-call';
import { remember } from './memory';
import { followingOf, joinCompany } from './companies';
import { NPC_BEHAVIOR } from '../data/npc-behavior';
import { fightOdds } from './fight-odds';
import { nextRandom } from './rng';
import { callFighters, dangerJoining, optionChances, optionWeights, strengthRatio } from './npc-decisions';
import { topGoal } from './npc-activities';
import { refreshVision } from './vision';
import { addState, stateOf } from './states';
import { endTurn } from './world';
import { addVehicle, emptyWorld, forceOption, npcBrain, startCombat, testDrive } from './testkit';
import type { Faction, Vehicle, World } from './types';
import { entryText } from '../text/resolve';
import { lineKey } from '../text/names';

type Fight = { w: World; foe: Vehicle; helper: Vehicle };

function faceGunForward(v: Vehicle, like: Vehicle): void {
  const kit = like.items.find((it) => it.kind === 'part' && it.part.defId === 'mg');
  const gun = v.items.find((it) => it.kind === 'part' && it.part.defId === 'mg');
  if (!kit || !gun) throw new Error('Both trucks need a gun');
  Object.assign(gun, { x: kit.x, y: kit.y, rot: kit.rot });
}

function fight(faction: Faction, traits: TraitId[], standing = 0, foeFaction: Faction = 'scrapjaw'): Fight {
  const w = emptyWorld({ x: 30, y: 30 });
  const foe = addVehicle(w, foeFaction, 'scout', ['mg', 'stockEngine'], { x: 26, y: 34 });
  foe.brain = npcBrain('buggy', foe.pos, ['raider']);
  const helper = addVehicle(w, faction, 'scout', ['mg', 'stockEngine'], { x: 34, y: 30 });
  helper.brain = npcBrain('trader', helper.pos, traits);
  faceGunForward(foe, w.vehicles[0]);
  faceGunForward(helper, w.vehicles[0]);
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

  it('says yes at the shared rate for the odds: even odds change nothing, twice as strong gives a neutral one in three', () => {
    const chance = (faction: Faction, traits: TraitId[], danger: number, standing = 0): number => {
      const { w, helper } = fight(faction, traits, standing);
      return optionChances(optionWeights(w, helper, 'helpCalled', playerVehicle(w).id, danger)).help!;
    };
    const table: [string, Faction, TraitId[], number, number[]][] = [
      ['neutral', 'independent', ['trader'], 0, [0.11, 0.22, 0.34, 0.55, 0.7]],
      ['brave', 'independent', ['brave'], 0, [0.22, 0.4, 0.56, 0.75, 0.85]],
      ['vulture', 'independent', ['vulture'], 0, [0.04, 0.08, 0.14, 0.27, 0.41]],
      ['friendly', 'bowl', ['trader'], 20, [0.74, 0.87, 0.92, 0.96, 0.97]],
      ['allied', 'bowl', ['trader'], 60, [0.97, 0.98, 0.99, 0.99, 0.99]],
    ];
    for (const [name, faction, traits, standing, expected] of table) {
      [1, 1 / 1.5, 1 / 2, 1 / 3, 1 / 4].forEach((danger, i) => {
        expect(Math.abs(chance(faction, traits, danger, standing) - expected[i]), `${name} at advantage ${1 / danger}`).toBeLessThan(0.02);
      });
    }
  });

  it('keeps today weights at even odds or worse and grows only up to the cap', () => {
    const { w, helper } = fight('independent', ['trader']);
    const me = playerVehicle(w).id;
    const weight = (danger: number) => optionWeights(w, helper, 'helpCalled', me, danger).help!;
    expect(weight(1)).toBe(weight(5));
    expect(weight(0.5)).toBeGreaterThan(weight(1));
    expect(weight(0.25)).toBeGreaterThan(weight(0.5));
    expect(weight(0.1)).toBe(weight(0.25));
    expect(weight(0)).toBe(weight(0.25));
  });

  it('throws when the weight gets no danger', () => {
    const { w, helper } = fight('independent', ['trader']);
    expect(() => optionWeights(w, helper, 'helpCalled', playerVehicle(w).id, null)).toThrow();
  });

  it('draws two numbers from the world, as before', () => {
    const { w, helper } = fight('independent', ['trader']);
    const copy = { rngState: w.rngState };
    helpAnswer(w, helper);
    nextRandom(copy);
    nextRandom(copy);
    expect(w.rngState).toBe(copy.rngState);
  });

  it('never says yes for a raider and says yes for a lawman', () => {
    expect(yesRate(() => fight('scrapjaw', ['raider']), 300)).toBe(0);
    expect(Math.abs(yesRate(() => fight('bowl', ['lawman']), 600) - 0.99)).toBeLessThan(0.03);
  });

  it('lets a neutral coward join only an overwhelming fight', () => {
    const overwhelming = fight('independent', ['coward']);
    const answers = new Set<HelpAnswer>();
    for (let i = 0; i < 400; i++) answers.add(helpAnswer(overwhelming.w, overwhelming.helper));
    expect(answers.has('help')).toBe(true);
    const even = fight('independent', ['coward']);
    for (let i = 0; i < 2; i++) {
      const extra = addVehicle(even.w, 'scrapjaw', 'scout', ['mg', 'stockEngine'], { x: 24 + i, y: 36 });
      extra.brain = npcBrain('buggy', extra.pos, ['raider']);
      startCombat(even.w, extra, playerVehicle(even.w));
    }
    refreshVision(even.w);
    for (let i = 0; i < 200; i++) expect(helpAnswer(even.w, even.helper)).not.toBe('help');
  });

  it('rolls a friendly coward as any friendly driver', () => {
    expect(yesRate(() => fight('bowl', ['coward'], 20), 400)).toBeGreaterThan(0.3);
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

type Convoy = Fight & { leader: Vehicle; guards: Vehicle[] };

function convoy(leaderParts: string[] = ['stockEngine']): Convoy {
  const c = fight('bowl', ['trader'], 20);
  c.w.vehicles = c.w.vehicles.filter((v) => v.id !== c.helper.id);
  const leader = addVehicle(c.w, 'bowl', 'scout', leaderParts, { x: 35, y: 28 });
  leader.brain = npcBrain('trader', leader.pos, ['trader']);
  const guards = [0, 1].map((i) => {
    const guard = addVehicle(c.w, 'bowl', 'scout', ['mg', 'stockEngine'], { x: 35 + i, y: 31 });
    guard.brain = npcBrain('trader', guard.pos, ['trader']);
    joinCompany(c.w, guard, leader, 'escort', { kind: 'escort', site: null, fee: 0 });
    return guard;
  });
  refreshVision(c.w);
  return { ...c, helper: guards[0], leader, guards };
}

describe('a company called for help', () => {
  it('answers with its leader, and a yes sends the armed guards but not the unarmed leader', () => {
    forceOption('helpCalled', 'help');
    const c = convoy();
    const before = topGoal(c.leader);
    expect(helpAnswer(c.w, c.helper)).toBe('help');
    joinPlayerFight(c.w, c.helper);
    for (const guard of c.guards) {
      expect(topGoal(guard)?.reason).toBe('answeredCall');
      for (const foe of awakeFoesOf(c.w, playerVehicle(c.w))) expect(stateOf(c.w, 'feud', guard.id, foe.id)).not.toBeNull();
      expect(stateOf(c.w, 'escort', guard.id, c.leader.id)).not.toBeNull();
      expect(stateOf(c.w, 'combat', guard.id, c.foe.id)).not.toBeNull();
    }
    expect(c.w.events.filter((e) => e.t === 'joins')).toHaveLength(2);
    expect(topGoal(c.leader)).toEqual(before);
  });

  it('sends an armed leader too', () => {
    forceOption('helpCalled', 'help');
    const c = convoy(['mg', 'stockEngine']);
    joinPlayerFight(c.w, c.helper);
    expect(topGoal(c.leader)?.reason).toBe('answeredCall');
    expect(c.w.events.filter((e) => e.t === 'joins')).toHaveLength(3);
  });

  it('judges the odds without the unarmed leader', () => {
    const c = convoy();
    const me = playerVehicle(c.w);
    const foes = awakeFoesOf(c.w, me);
    const fighters = callFighters(c.w, c.leader, me);
    expect(fighters.map((v) => v.id).sort()).toEqual(c.guards.map((v) => v.id).sort());
    const danger = (crew: Vehicle[]) => {
      c.w.rngState = 7;
      return dangerJoining(c.w, c.leader, crew, me, foes);
    };
    const withBus = danger([c.leader, ...fighters]);
    const withoutBus = danger(fighters);
    expect(withoutBus).toBeGreaterThan(withBus);
    const spread = NPC_BEHAVIOR.dangerSpread;
    const honest = strengthRatio(fightOdds(c.w, [...fighters, me], foes));
    expect(withoutBus / honest).toBeGreaterThanOrEqual(1 - spread);
    expect(withoutBus / honest).toBeLessThanOrEqual(1 + spread);
  });

  it('a no or too hot puts one refusal on every member and the leader', () => {
    forceOption('helpCalled', 'refuse');
    const c = convoy();
    turnDownCall(c.w, c.helper);
    const refused = c.w.states.filter((s) => s.kind === 'helpRefused').map((s) => s.holder).sort();
    expect(refused).toEqual([c.leader.id, ...c.guards.map((g) => g.id)].sort());
    for (const v of [c.leader, ...c.guards]) expect(canAskHelp(c.w, v)).toBe(false);
  });

  it('a guard out of sight of its leader answers alone and keeps its word', () => {
    const c = convoy();
    c.guards[0].pos = { x: 35, y: 90 };
    c.w.vehicles.find((v) => v.id === c.helper.id)!.pos = c.guards[0].pos;
    refreshVision(c.w);
    for (let i = 0; i < 30; i++) expect(helpAnswer(c.w, c.helper)).toBe('refuse');
    turnDownCall(c.w, c.helper);
    expect(c.w.states.filter((s) => s.kind === 'helpRefused')).toHaveLength(1);
  });

  it('does not send a guard bound to another deal', () => {
    const c = convoy();
    addState(c.w, 'aid', c.guards[1].id, c.w.player.vehicleId, { kind: 'aid', giver: 'npc', fuel: 1, supplies: 0, price: 0, free: true, agreed: true, started: false, work: 1, workLeft: 1 });
    const fighters = callFighters(c.w, c.leader, playerVehicle(c.w));
    expect(fighters.map((v) => v.id)).toEqual([c.guards[0].id]);
  });

  it('plays through the call topic for a yes and a no', () => {
    forceOption('helpCalled', 'help');
    const yes = convoy();
    const w = chooseOption(askTopic(callVehicle(yes.w, yes.helper.id), 'askHelp'), 0);
    for (const guard of yes.guards) expect(topGoal(w.vehicles.find((v) => v.id === guard.id)!)?.reason).toBe('answeredCall');
  });

  it('plays through the call topic for a no', () => {
    forceOption('helpCalled', 'refuse');
    const no = convoy();
    const w = chooseOption(askTopic(callVehicle(no.w, no.helper.id), 'askHelp'), 0);
    expect(w.states.filter((s) => s.kind === 'helpRefused')).toHaveLength(3);
  });

  it('a guard goes back to following when its fight ends', () => {
    forceOption('helpCalled', 'help');
    const c = convoy();
    joinPlayerFight(c.w, c.helper);
    for (const guard of c.guards) {
      expect(followingOf(c.w, guard)).not.toBeNull();
    }
    c.foe.pos = { x: 200, y: 200 };
    let w = c.w;
    for (let turn = 0; turn < 40; turn++) w = endTurn(w, testDrive);
    for (const guard of c.guards) {
      const g = w.vehicles.find((v) => v.id === guard.id)!;
      expect(topGoal(g)?.reason).not.toBe('answeredCall');
    }
  });

  it('the second ask counts the first helper', () => {
    const c = convoy();
    const other = addVehicle(c.w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 36, y: 26 });
    other.brain = npcBrain('trader', other.pos, ['trader']);
    refreshVision(c.w);
    const me = playerVehicle(c.w);
    const foes = awakeFoesOf(c.w, me);
    const measure = () => {
      c.w.rngState = 11;
      return dangerJoining(c.w, other, [other], me, foes);
    };
    const before = measure();
    forceOption('helpCalled', 'help');
    joinPlayerFight(c.w, c.helper);
    expect(measure()).toBeLessThan(before);
  });
});
