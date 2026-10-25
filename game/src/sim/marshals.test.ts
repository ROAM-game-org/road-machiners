import { describe, expect, it } from 'vitest';
import { BOUNTY, CRIME } from '../data/market';
import type { TraitId } from '../data/npcs';
import { fileReports, noteKnockout, openCasesOn } from './crime';
import { chooseOption, currentOptions, radioSpeakers, raiseCalls } from './dialogue';
import { playerVehicle } from './damage';
import { knockOutNpc } from './defeat';
import { makePart } from './factory';
import { attachLine } from './harpoon';
import { mountPart } from './inventory';
import { remember, rememberSightings, sightingOf } from './memory';
import { answerDemand, demandLapsed, hunt, marshalLead, payHailedBounty, planMarshal, searchLead, takeCase } from './marshals';
import { heldSearch } from './market';
import { QUEST_EFFECTS, QUEST_QUERIES } from './quests';
import { topGoal } from './npc-activities';
import { getKnownSite } from './npc-decisions';
import { nearestPad } from './sites';
import { stateOf } from './states';
import { addVehicle, emptyWorld, forceOption, npcBrain, testDrive } from './testkit';
import { startEscort } from './tow';
import type { Faction, Vehicle, World } from './types';
import { dist, type Vec } from './vec';
import { endTurn } from './world';

function npc(w: World, faction: Faction, template: string, traits: TraitId[], pos: Vec): Vehicle {
  const v = addVehicle(w, faction, 'scout', ['mg', 'stockEngine'], pos);
  v.brain = npcBrain(template, pos, traits);
  v.resources = { money: 50000, fuel: 50, supplies: 10, health: 100 };
  return v;
}

const marshalAt = (w: World, pos: Vec) => npc(w, 'marshals', 'marshal', ['marshal', 'brave'], pos);
const traderAt = (w: World, faction: Faction, pos: Vec) => npc(w, faction, 'trader', ['trader'], pos);

function fileAgainst(w: World, culprit: Vehicle, at: Vec): void {
  const bowl = traderAt(w, 'bowl', { x: 100, y: 600 });
  remember(w, bowl, { kind: 'witnessed', crime: `${w.turn}:${culprit.id}:${bowl.id}:robbed`, by: culprit.id, victim: bowl.id, offense: 'robbed', at: { ...at }, heading: 0 });
  bowl.pos = { ...nearestPad(getKnownSite('bowl'), bowl.pos) };
  bowl.speed = 0;
  fileReports(w, bowl);
  if (w.crimes.length === 0) throw new Error('The test case was not filed');
}

function hunting(): { w: World; marshal: Vehicle; target: Vehicle } {
  const w = emptyWorld({ x: 100, y: 100 });
  const target = traderAt(w, 'independent', { x: 500, y: 500 });
  fileAgainst(w, target, { x: 300, y: 300 });
  const marshal = marshalAt(w, { x: 650, y: 100 });
  planMarshal(w, marshal, []);
  return { w, marshal, target };
}

describe('the Marshall hunt', () => {
  it('takes the case with the most owed and leaves it to one hunter', () => {
    const { w, marshal, target } = hunting();
    expect(topGoal(marshal)).toMatchObject({ kind: 'pursue', targetId: target.id, reason: 'bountyHunt' });
    expect(openCasesOn(w, target.id).every((c) => c.hunter === marshal.id)).toBe(true);
    const second = marshalAt(w, { x: 660, y: 100 });
    expect(takeCase(w, second)).toBeNull();
  });

  it('follows a driver it asks to its sighting and never reads the target position out of sight (IV5)', () => {
    const { w, marshal, target } = hunting();
    const driver = traderAt(w, 'independent', { x: 640, y: 110 });
    w.turn += 5;
    rememberSightings(w, driver, [target]);
    const at = { ...target.pos };
    Object.defineProperty(target, 'pos', { get: () => { throw new Error('The hunt read the target position'); } });
    hunt(w, marshal, [driver]);
    expect(topGoal(marshal)!.destination).toEqual(at);
    expect(w.crimes[0].lead).toMatchObject({ at, turn: w.turn });
    expect(w.events.filter((e) => e.t === 'asked')).toEqual([{ t: 'asked', by: marshal.id, of: driver.id, target: target.id, told: true }]);
    expect(radioSpeakers(w.events, w.player.vehicleId).sort()).toEqual([marshal.id, driver.id].sort());
    hunt(w, marshal, [driver]);
    expect(w.events.filter((e) => e.t === 'asked')).toHaveLength(1);
  });

  it('remembers the player truck as a sighting', () => {
    const w = emptyWorld({ x: 100, y: 100 });
    const driver = traderAt(w, 'independent', { x: 104, y: 100 });
    rememberSightings(w, driver, [playerVehicle(w)]);
    expect(sightingOf(driver, w.player.vehicleId)?.fact.at).toEqual(playerVehicle(w).pos);
  });

  it('searches a stale lead toward the reporting pad along its heading', () => {
    const nose = getKnownSite('nose');
    const from = { x: nose.pos.x - 40, y: nose.pos.y };
    const pad = searchLead({ at: from, turn: 1, heading: 0 });
    expect(pad).not.toBeNull();
    expect(dist(pad!, nose.pos)).toBeLessThan(nose.radius + 8);
    expect(searchLead({ at: from, turn: 1, heading: null })).toBeNull();
  });

  it('rides on from a cold lead with no heading to the nearest other reporting pad, asking on the way', () => {
    const { w, marshal } = hunting();
    const lead = w.crimes[0].lead!;
    w.crimes[0].lead = { ...lead, heading: null };
    marshal.pos = { ...lead.at };
    hunt(w, marshal, []);
    const next = topGoal(marshal)!;
    expect(next.kind).toBe('pursue');
    expect(dist(next.destination!, lead.at)).toBeGreaterThan(BOUNTY.leadReach);
    expect(CRIME.reportSites.some((id) => dist(nearestPad(getKnownSite(id), lead.at), next.destination!) < 0.01)).toBe(true);
  });

  it('gives up after its hunt turns with no newer lead, and takes the case again after the retry wait', () => {
    const { w, marshal, target } = hunting();
    w.turn += BOUNTY.huntTurns;
    hunt(w, marshal, []);
    expect(topGoal(marshal)?.kind).not.toBe('pursue');
    expect(w.crimes[0]).toMatchObject({ hunter: null, retryAt: w.turn + BOUNTY.retryTurns });
    expect(takeCase(w, marshal)).toBeNull();
    w.turn += BOUNTY.retryTurns;
    expect(takeCase(w, marshal)?.target).toBe(target.id);
  });

  it('frees the case when its Marshall is knocked out', () => {
    const { w, marshal } = hunting();
    marshal.lastHitBy = w.player.vehicleId;
    knockOutNpc(w, marshal);
    endTurn(w, testDrive);
    const next = endTurn(w, testDrive);
    expect(next.crimes[0].hunter).toBeNull();
    expect(next.crimes[0].status).toBe('open');
  });
});

describe('pay or fight', () => {
  function inContact(): { w: World; marshal: Vehicle; me: Vehicle } {
    const w = emptyWorld({ x: 300, y: 300 });
    const me = playerVehicle(w);
    fileAgainst(w, me, { x: 300, y: 300 });
    const marshal = marshalAt(w, { x: 306, y: 300 });
    planMarshal(w, marshal, [me]);
    return { w, marshal, me };
  }

  it('demands once per contact and not again within the offer gap (IV4)', () => {
    const { w, marshal, me } = inContact();
    const s = stateOf(w, 'bountyStop', marshal.id, me.id);
    expect(s?.data).toEqual({ kind: 'bountyStop', owed: CRIME.fine.robbed, answered: false });
    hunt(w, marshal, [me]);
    expect(w.states.filter((x) => x.kind === 'bountyStop')).toHaveLength(1);
    w.states = w.states.filter((x) => x.kind !== 'bountyStop');
    w.turn += 5;
    hunt(w, marshal, [me]);
    expect(stateOf(w, 'bountyStop', marshal.id, me.id)).toBeNull();
    w.turn += BOUNTY.offerGapTurns;
    hunt(w, marshal, [me]);
    expect(stateOf(w, 'bountyStop', marshal.id, me.id)).not.toBeNull();
  });

  it('closes every case on a player who pays and makes a truce, charging the owed amount once', () => {
    const { w, marshal, me } = inContact();
    w.player.money = 100000;
    answerDemand(w, marshal, me, 'pay');
    expect(openCasesOn(w, me.id)).toEqual([]);
    expect(w.player.money).toBe(100000 - CRIME.fine.robbed);
    expect(stateOf(w, 'truce', marshal.id, me.id)).not.toBeNull();
    expect(() => answerDemand(w, marshal, me, 'pay')).toThrow();
  });

  it.each(['answer', 'hail'] as const)('ends the Marshall\'s harpoon line on a driver who pays (%s)', (path) => {
    const { w, marshal, me } = inContact();
    w.player.money = 100000;
    const harpoon = makePart(w, 'harpoon', 0);
    if (!mountPart(w, marshal, harpoon)) throw new Error('No deck room for the harpoon');
    const held = me.items.find((it) => it.kind === 'part');
    if (!held || held.kind !== 'part') throw new Error('No part to hold');
    attachLine(w, { from: marshal, fromPart: harpoon.id, to: me, toPart: held.part.id }, 10);
    if (path === 'hail') w.states = w.states.filter((x) => x.kind !== 'bountyStop');

    if (path === 'answer') answerDemand(w, marshal, me, 'pay');
    else payHailedBounty(w, marshal, me);

    expect(w.lines).toEqual([]);
  });

  it('refuses a player who cannot pay, and a refusal brings a feud and a fight', () => {
    const { w, marshal, me } = inContact();
    w.player.money = 0;
    expect(() => answerDemand(w, marshal, me, 'pay')).toThrow();
    answerDemand(w, marshal, me, 'refuse');
    expect(stateOf(w, 'feud', marshal.id, me.id)).not.toBeNull();
    expect(topGoal(marshal)).toMatchObject({ kind: 'fight', targetId: me.id });
  });

  it('counts silence until the demand lapses as a refusal', () => {
    const { w, marshal, me } = inContact();
    const s = stateOf(w, 'bountyStop', marshal.id, me.id)!;
    demandLapsed(w, s);
    expect(stateOf(w, 'feud', marshal.id, me.id)).not.toBeNull();
  });

  it('closes the cases with no money taken when the hunter knocks the target out', () => {
    const { w, marshal, me } = inContact();
    const money = w.player.money;
    me.lastHitBy = marshal.id;
    noteKnockout(w, me);
    expect(w.crimes[0].status).toBe('collected');
    expect(w.player.money).toBe(money);
    expect(w.events.filter((e) => e.t === 'bountyClosed')).toHaveLength(1);
  });

  it.each(['pay', 'fight', 'flee'] as const)('lets an NPC target %s', (option) => {
    forceOption('bountyDemanded', option);
    const w = emptyWorld({ x: 100, y: 100 });
    const target = traderAt(w, 'independent', { x: 500, y: 500 });
    fileAgainst(w, target, { x: 500, y: 500 });
    const marshal = marshalAt(w, { x: 506, y: 500 });
    planMarshal(w, marshal, [target]);
    if (option === 'pay') {
      expect(w.crimes[0].status).toBe('paid');
      expect(stateOf(w, 'truce', marshal.id, target.id)).not.toBeNull();
    } else {
      expect(stateOf(w, 'feud', marshal.id, target.id)).not.toBeNull();
      expect(topGoal(target)?.kind).toBe(option);
    }
  });
});

describe('the idle Marshall', () => {
  it('waits at the post with its partner and no case, without dropping the wait each turn, and raises no stall', () => {
    const post = getKnownSite('marshal-post');
    let w = emptyWorld({ x: 100, y: 700 });
    const marshal = marshalAt(w, nearestPad(post, post.pos));
    const partner = marshalAt(w, { x: marshal.pos.x + 3, y: marshal.pos.y });
    startEscort(w, partner, marshal, null, 0);
    const stalls: unknown[] = [];
    let pushed = 0;
    for (let i = 0; i < 150; i++) {
      w = endTurn(w, testDrive);
      stalls.push(...w.events.filter((e) => e.t === 'stall' && (e.vehicle === marshal.id || e.vehicle === partner.id)));
      pushed += w.events.filter((e) => e.t === 'activity' && e.vehicle === marshal.id && e.reason === 'atPost').length;
    }
    expect(pushed).toBeLessThanOrEqual(150 / BOUNTY.postTurns + 1);
    const me = w.vehicles.find((v) => v.id === marshal.id)!;
    expect(topGoal(me)).toMatchObject({ kind: 'wait', reason: 'atPost' });
    expect(stalls).toEqual([]);
    expect(dist(me.pos, post.pos)).toBeLessThan(post.radius + 30);
  });
});

describe('a broke target', () => {
  it('sees Pay offered but off with the shortfall, and a knockout by the hunter closes the debt with nothing taken (R3)', () => {
    const w = emptyWorld({ x: 300, y: 300 });
    const me = playerVehicle(w);
    fileAgainst(w, me, { x: 300, y: 300 });
    w.player.money = 1000;
    const marshal = marshalAt(w, { x: 306, y: 300 });
    planMarshal(w, marshal, [me]);
    raiseCalls(w);
    expect(w.player.call?.topic).toBe('bountyDemand');
    const pay = currentOptions(w).find((o) => o.line === 'payTheBook')!;
    expect(pay.short).toBe(CRIME.fine.robbed - 1000);
    const next = chooseOption(w, currentOptions(w).findIndex((o) => o.line === 'notPaying'));
    expect(stateOf(next, 'feud', marshal.id, me.id)).not.toBeNull();
    const after = structuredClone(next);
    const hit = after.vehicles.find((v) => v.id === me.id)!;
    hit.lastHitBy = marshal.id;
    noteKnockout(after, hit);
    expect(after.crimes[0].status).toBe('collected');
    expect(after.player.money).toBe(1000);
  });
});

describe('a hunt in the turn pipeline', () => {
  it('rides out after its target through the turns, parks beside it and raises no stall', () => {
    let w = emptyWorld({ x: 100, y: 100 });
    const target = traderAt(w, 'independent', { x: 420, y: 420 });
    target.brain!.goals = [{ kind: 'wait', targetId: null, destination: null, phase: 'act', reason: 'idle', until: 10_000 }];
    fileAgainst(w, target, { x: 420, y: 420 });
    const marshal = marshalAt(w, { x: 400, y: 400 });
    const stalls: unknown[] = [];
    let demanded = false;
    for (let i = 0; i < 40; i++) {
      w = endTurn(w, testDrive);
      stalls.push(...w.events.filter((e) => e.t === 'stall' && e.vehicle === marshal.id));
      demanded ||= w.events.some((e) => e.t === 'stateEnded' && e.state.kind === 'bountyStop' && e.state.holder === marshal.id && e.state.other === target.id);
    }
    expect(stalls).toEqual([]);
    expect(demanded).toBe(true);
  });
});

describe('the paid Marshall lead', () => {
  function searching(): { w: World; target: Vehicle; marshal: Vehicle } {
    const w = emptyWorld({ x: 100, y: 100 });
    const target = traderAt(w, 'independent', { x: 500, y: 500 });
    w.turn = 50;
    w.player.contracts.push({
      id: 'ct-s', shop: 'bowl', kind: 'search', target: target.id, driver: 'Mack Holt', template: 'trader',
      lead: { at: { x: 0, y: 0 }, turn: 10 }, reward: 3700, deadline: 900, window: 600, tier: 1, delivered: false,
    });
    return { w, target, marshal: marshalAt(w, { x: 650, y: 100 }) };
  }

  function sawAt(w: World, by: Vehicle, target: Vehicle, turn: number, at: Vec): void {
    const was = w.turn;
    w.turn = turn;
    remember(w, by, { kind: 'sighting', vehicle: target.id, at, heading: 0 });
    w.turn = was;
  }

  it('gives the newest Marshall sighting when it is newer than the held lead', () => {
    const { w, target, marshal } = searching();
    sawAt(w, marshal, target, 30, { x: 90, y: 30 });
    const second = marshalAt(w, { x: 660, y: 100 });
    sawAt(w, second, target, 40, { x: 120, y: 60 });
    expect(marshalLead(w)).toEqual({ at: { x: 120, y: 60 }, turn: 40 });
  });

  it('gives nothing for a sighting no newer than the held lead', () => {
    const { w, target, marshal } = searching();
    sawAt(w, marshal, target, 10, { x: 90, y: 30 });
    expect(marshalLead(w)).toBeNull();
    sawAt(w, marshal, target, 5, { x: 90, y: 30 });
    expect(marshalLead(w)).toBeNull();
  });

  it('ignores a driver that is no Marshall and the target live place', () => {
    const { w, target } = searching();
    const trader = traderAt(w, 'bowl', { x: 300, y: 300 });
    sawAt(w, trader, target, 45, { x: 90, y: 30 });
    expect(marshalLead(w)).toBeNull();
    target.pos = { x: 700, y: 700 };
    expect(marshalLead(w)).toBeNull();
  });

  it('gives nothing without a held search', () => {
    const w = emptyWorld({ x: 100, y: 100 });
    const target = traderAt(w, 'independent', { x: 500, y: 500 });
    const marshal = marshalAt(w, { x: 650, y: 100 });
    sawAt(w, marshal, target, 30, { x: 90, y: 30 });
    expect(marshalLead(w)).toBeNull();
    expect(QUEST_QUERIES.holds_search(w, [])).toBe(false);
  });

  it('moves the lead through the quest function, and throws with none to take', () => {
    const { w, target, marshal } = searching();
    expect(QUEST_QUERIES.marshal_lead(w, [])).toBe(false);
    expect(() => QUEST_EFFECTS.take_marshal_lead(w, [])).toThrow(/no Marshall sighting/);
    sawAt(w, marshal, target, 30, { x: 90, y: 30 });
    expect(QUEST_QUERIES.holds_search(w, [])).toBe(true);
    expect(QUEST_QUERIES.marshal_lead(w, [])).toBe(true);
    QUEST_EFFECTS.take_marshal_lead(w, []);
    expect(heldSearch(w)!.lead).toEqual({ at: { x: 90, y: 30 }, turn: 30 });
    expect(QUEST_QUERIES.marshal_lead(w, [])).toBe(false);
  });

  it('prices the lead at 3 M', () => {
    expect(QUEST_QUERIES.lead_price(emptyWorld({ x: 0, y: 0 }), [])).toBe(3);
  });
});
