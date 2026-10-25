import { describe, expect, it } from 'vitest';
import { BOUNTY, CRIME } from '../data/market';
import type { TraitId } from '../data/npcs';
import { advanceCrimes, fileReports, noteKnockout, openCasesOn, payCasesAtDesk, stepPosse } from './crime';
import { callVehicle, chooseOption, currentOptions, radioSpeakers, raiseCalls } from './dialogue';
import { playerVehicle } from './damage';
import { knockOutNpc } from './defeat';
import { makePart } from './factory';
import { attachLine } from './harpoon';
import { mountPart } from './inventory';
import { remember, rememberSightings, sightingOf } from './memory';
import { answerDemand, demandLapsed, demandOpen, hunt, marshalLead, outmatched, payHailedBounty, planMarshal, searchLead, takeCase, withdrawHunt, withdrawsOnTruce } from './marshals';
import { heldSearch } from './market';
import { QUEST_EFFECTS, QUEST_QUERIES } from './quests';
import { fleeFrom, interrupt, topGoal } from './npc-activities';
import { getKnownSite, npcProfile } from './npc-decisions';
import { makePeace, plead, settlePlayerPlea } from './parley';
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
    expect(takeCase(w, second, [])).toBeNull();
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
    expect(takeCase(w, marshal, [])).toBeNull();
    w.turn += BOUNTY.retryTurns;
    expect(takeCase(w, marshal, [])?.case.target).toBe(target.id);
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
    expect(takeCase(w, marshal, [me])).toBeNull();
    w.turn += BOUNTY.offerGapTurns;
    planMarshal(w, marshal, [me]);
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

  it('rides home when it sees its target before it may ask again, and the case waits out the day (no tailing, no stall)', () => {
    const { w, marshal, me } = inContact();
    answerDemand(w, marshal, me, 'refuse');
    makePeace(w, marshal, me);
    marshal.brain!.goals = marshal.brain!.goals.filter((g) => g.kind !== 'fight');
    const offered = w.crimes[0].offered!;
    w.turn += 5;
    hunt(w, marshal, [me]);
    expect(marshal.brain!.goals.some((g) => g.kind === 'pursue')).toBe(false);
    expect(w.events.some((e) => e.t === 'activity' && e.vehicle === marshal.id && e.previous === 'pursue' && e.reason === 'backToPost')).toBe(true);
    expect(w.crimes[0]).toMatchObject({ hunter: null, retryAt: offered + BOUNTY.offerGapTurns, status: 'open' });
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
      expect(topGoal(marshal)?.kind).toBe('pursue');
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

describe('a Marshall that backs off', () => {
  function onPlayer(): { w: World; marshal: Vehicle; me: Vehicle } {
    const w = emptyWorld({ x: 300, y: 300 });
    const me = playerVehicle(w);
    fileAgainst(w, me, { x: 300, y: 300 });
    const marshal = marshalAt(w, { x: 306, y: 300 });
    planMarshal(w, marshal, [me]);
    return { w, marshal, me };
  }

  const shotUp = (marshal: Vehicle) => (marshal.resources!.health = 10);

  it('takes a granted truce outgunned as a retreat: the case waits for the pair, the hunt is dropped and the Marshall rides home (IV2)', () => {
    const { w, marshal, me } = onPlayer();
    shotUp(marshal);
    expect(outmatched(w, marshal, me)).toBe(true);
    const rng = w.rngState;
    settlePlayerPlea(w, marshal, 'truce', true);
    expect(w.rngState).toBe(rng);
    expect(w.crimes[0]).toMatchObject({ posse: 'pair', hunter: null, retryAt: null, status: 'open' });
    expect(w.events.filter((e) => e.t === 'huntWithdrawn')).toEqual([{ t: 'huntWithdrawn', by: marshal.id, target: me.id, posse: 'pair' }]);
    expect(stateOf(w, 'truce', marshal.id, me.id)).not.toBeNull();
    const next = endTurn(w, testDrive);
    const after = next.vehicles.find((v) => v.id === marshal.id)!;
    expect(after.brain!.goals.some((g) => g.kind === 'pursue')).toBe(false);
    expect(next.events.some((e) => e.t === 'activity' && e.vehicle === marshal.id && e.previous === 'pursue' && e.reason === 'backToPost')).toBe(true);
    expect(topGoal(after)).toMatchObject({ kind: 'wait', reason: 'atPost' });
  });

  it('keeps the hunt through a truce it takes while it could win', () => {
    const w = emptyWorld({ x: 100, y: 100 });
    const target = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 500, y: 500 });
    target.brain = npcBrain('trader', target.pos, ['trader']);
    fileAgainst(w, target, { x: 500, y: 500 });
    const marshal = marshalAt(w, { x: 506, y: 500 });
    planMarshal(w, marshal, []);
    expect(outmatched(w, marshal, target)).toBe(false);
    expect(withdrawsOnTruce(w, target, marshal)).toBeNull();
    forceOption('truceOffered', 'accept');
    plead(w, target, marshal, 'truce');
    expect(w.crimes[0]).toMatchObject({ posse: 'lone', hunter: marshal.id });
    expect(w.events.some((e) => e.t === 'huntWithdrawn')).toBe(false);
  });

  it('withdraws the same way when an NPC target begs the truce', () => {
    const w = emptyWorld({ x: 100, y: 100 });
    const target = traderAt(w, 'independent', { x: 500, y: 500 });
    fileAgainst(w, target, { x: 500, y: 500 });
    const marshal = marshalAt(w, { x: 506, y: 500 });
    planMarshal(w, marshal, []);
    shotUp(marshal);
    forceOption('truceOffered', 'accept');
    plead(w, target, marshal, 'truce');
    expect(w.crimes[0]).toMatchObject({ posse: 'pair', hunter: null });
  });

  it('withdraws when it runs from its target outgunned, and draws no random number for it (IV7)', () => {
    const { w, marshal, me } = onPlayer();
    shotUp(marshal);
    interrupt(w, marshal, fleeFrom(w, marshal, npcProfile(marshal), me.id, me.pos, 'escapeThreat'));
    const rng = w.rngState;
    planMarshal(w, marshal, [me]);
    expect(w.rngState).toBe(rng);
    expect(w.crimes[0]).toMatchObject({ posse: 'pair', hunter: null });
  });

  it('leaves the case to the pair with no retry wait, once both Marshalls wait at the post', () => {
    const w = emptyWorld({ x: 100, y: 100 });
    const target = traderAt(w, 'independent', { x: 500, y: 500 });
    fileAgainst(w, target, { x: 500, y: 500 });
    const marshal = marshalAt(w, { x: 506, y: 500 });
    planMarshal(w, marshal, []);
    shotUp(marshal);
    forceOption('truceOffered', 'accept');
    plead(w, target, marshal, 'truce');
    const partner = marshalAt(w, { x: marshal.pos.x + 4, y: marshal.pos.y });
    marshal.resources!.health = 100;
    for (const m of [marshal, partner]) m.brain!.goals = [{ kind: 'wait', targetId: 'marshal-post', destination: { ...m.pos }, phase: 'act', reason: 'atPost', until: w.turn + 500 }];
    expect(takeCase(w, marshal, [])).toBeNull();
    expect(takeCase(w, marshal, [partner])).toMatchObject({ partner: { id: partner.id } });
  });

  it('lets the pair make its own demand on arrival, inside the day after the lone Marshall asked (IV4)', () => {
    const { w, marshal, me } = onPlayer();
    expect(w.crimes[0].offered).toBe(w.turn);
    shotUp(marshal);
    settlePlayerPlea(w, marshal, 'truce', true);
    expect(w.crimes[0].offered).toBeNull();
    const partner = marshalAt(w, { x: marshal.pos.x + 4, y: marshal.pos.y });
    marshal.resources!.health = 100;
    w.states = w.states.filter((s) => s.kind !== 'truce');
    for (const m of [marshal, partner]) m.brain!.goals = [{ kind: 'wait', targetId: 'marshal-post', destination: { ...m.pos }, phase: 'act', reason: 'atPost', until: w.turn + 500 }];
    w.turn += 10;
    planMarshal(w, marshal, [partner, me]);
    expect(demandOpen(w, marshal, me)).not.toBeNull();
  });

  it('throws on a withdrawal from a hunt it does not hold (P7)', () => {
    const { w, me } = onPlayer();
    const other = marshalAt(w, { x: 320, y: 300 });
    expect(() => withdrawHunt(w, other, me)).toThrow(/no hunt/);
  });
});

describe('the pair hunt', () => {
  const post = () => getKnownSite('marshal-post');

  function idleAt(w: World, pos: Vec): Vehicle {
    const m = marshalAt(w, pos);
    m.brain!.goals = [{ kind: 'wait', targetId: post().id, destination: { ...pos }, phase: 'act', reason: 'atPost', until: w.turn + 500 }];
    return m;
  }

  function pairCase(onPlayer = false): { w: World; leader: Vehicle; partner: Vehicle; target: Vehicle } {
    const w = emptyWorld({ x: 100, y: 700 });
    const target = onPlayer ? playerVehicle(w) : traderAt(w, 'independent', { x: 500, y: 500 });
    fileAgainst(w, target, { x: 500, y: 500 });
    stepPosse(w.crimes);
    const pad = nearestPad(post(), post().pos);
    const leader = idleAt(w, pad);
    const partner = idleAt(w, { x: pad.x + 4, y: pad.y });
    return { w, leader, partner, target };
  }

  function riding(onPlayer = false): ReturnType<typeof pairCase> {
    const scene = pairCase(onPlayer);
    planMarshal(scene.w, scene.leader, [scene.partner]);
    return scene;
  }

  it('sends both idle Marshalls: one hunts and the other follows on a fee-free escort (IV6)', () => {
    const { w, leader, partner, target } = riding();
    expect(topGoal(leader)).toMatchObject({ kind: 'pursue', targetId: target.id });
    expect(w.crimes[0].hunter).toBe(leader.id);
    expect(stateOf(w, 'escort', partner.id, leader.id)?.data).toEqual({ kind: 'escort', site: null, fee: 0 });
    expect(topGoal(partner)).toMatchObject({ kind: 'follow', targetId: leader.id });
    planMarshal(w, partner, [leader]);
    expect(topGoal(partner)).toMatchObject({ kind: 'follow', targetId: leader.id });
  });

  it('leaves a case marked for the pair when the partner is out of sight, and takes a lone case on another target instead (IV5)', () => {
    const { w, leader, partner } = pairCase();
    expect(takeCase(w, leader, [])).toBeNull();
    const other = traderAt(w, 'independent', { x: 520, y: 480 });
    w.turn += 1;
    fileAgainst(w, other, { x: 520, y: 480 });
    const taken = takeCase(w, leader, [])!;
    expect(taken).toMatchObject({ partner: null });
    expect(taken.case.target).toBe(other.id);
    expect(stateOf(w, 'escort', partner.id, leader.id)).toBeNull();
  });

  it('skips a partner that is still riding home', () => {
    const { w, leader, partner } = pairCase();
    topGoal(partner)!.phase = 'travel';
    expect(takeCase(w, leader, [partner])).toBeNull();
  });

  it('feuds the target from both on a refusal, and the follower in sight fights it', () => {
    const { w, leader, partner, target } = riding(true);
    target.pos = { x: leader.pos.x + 8, y: leader.pos.y };
    w.turn += 1;
    hunt(w, leader, [target]);
    expect(demandOpen(w, leader, target)).not.toBeNull();
    answerDemand(w, leader, target, 'refuse');
    expect(stateOf(w, 'feud', leader.id, target.id)).not.toBeNull();
    expect(stateOf(w, 'feud', partner.id, target.id)).not.toBeNull();
    expect(topGoal(partner)).toMatchObject({ kind: 'fight', targetId: target.id });
  });

  it('truces both on pay, and the follower leaves its escort the next time it plans (IV6)', () => {
    const { w, leader, partner, target } = riding(true);
    target.pos = { x: leader.pos.x + 8, y: leader.pos.y };
    w.player.money = 100000;
    hunt(w, leader, [target]);
    answerDemand(w, leader, target, 'pay');
    expect(w.crimes[0].status).toBe('paid');
    expect(stateOf(w, 'truce', leader.id, target.id)).not.toBeNull();
    expect(stateOf(w, 'truce', partner.id, target.id)).not.toBeNull();
    planMarshal(w, partner, []);
    expect(stateOf(w, 'escort', partner.id, leader.id)).toBeNull();
    expect(topGoal(partner)).toMatchObject({ kind: 'wait', reason: 'atPost' });
  });

  it('turns back when its follower is knocked out, and the case still waits for the pair (AS2)', () => {
    const { w, leader, partner } = riding();
    knockOutNpc(w, partner);
    const next = endTurn(endTurn(w, testDrive), testDrive);
    const lead = next.vehicles.find((v) => v.id === leader.id)!;
    expect(lead.brain!.goals.some((g) => g.kind === 'pursue')).toBe(false);
    expect(next.crimes[0]).toMatchObject({ hunter: null, posse: 'pair', status: 'open' });
    expect(next.crimes[0].retryAt).not.toBeNull();
  });

  it('lets a follower collect on a knockout as the hunter would', () => {
    const { w, partner, target } = riding();
    target.lastHitBy = partner.id;
    noteKnockout(w, target);
    expect(w.crimes[0]).toMatchObject({ status: 'collected' });
  });

  it('marks the case spent when the pair backs off outgunned, and then nobody rides it (IV4)', () => {
    const { w, leader, partner, target } = riding();
    leader.resources!.health = 10;
    expect(withdrawsOnTruce(w, target, partner)?.hunter.id).toBe(leader.id);
    forceOption('truceOffered', 'accept');
    plead(w, target, partner, 'truce');
    expect(w.crimes[0]).toMatchObject({ posse: 'spent', hunter: null });
    expect(stateOf(w, 'escort', partner.id, leader.id)).toBeNull();
    expect(partner.brain!.goals.some((g) => g.kind === 'follow')).toBe(false);
    w.turn += BOUNTY.retryTurns;
    leader.resources!.health = 100;
    for (const m of [leader, partner]) m.brain!.goals = [{ kind: 'wait', targetId: post().id, destination: { ...m.pos }, phase: 'act', reason: 'atPost', until: w.turn + 500 }];
    expect(takeCase(w, leader, [partner])).toBeNull();
  });

  it('lapses a spent case after its days, as any other', () => {
    const { w, target } = pairCase();
    stepPosse(w.crimes);
    w.turn = w.crimes[0].filed + BOUNTY.lapseTurns;
    advanceCrimes(w);
    expect(openCasesOn(w, target.id)).toEqual([]);
  });

  it('lets the player pay a spent case at the desk', () => {
    const w = emptyWorld({ x: 100, y: 700 });
    const me = playerVehicle(w);
    fileAgainst(w, me, { x: 300, y: 300 });
    stepPosse(w.crimes);
    stepPosse(w.crimes);
    me.pos = { ...nearestPad(post(), me.pos) };
    me.speed = 0;
    w.player.money = 100000;
    payCasesAtDesk(w, [w.crimes[0].id]);
    expect(w.crimes[0].status).toBe('paid');
  });

  it('rides out of the post together through the turns and raises no stall', () => {
    let { w, leader, partner } = pairCase();
    const stalls: unknown[] = [];
    let gap = 0;
    for (let i = 0; i < 30; i++) {
      w = endTurn(w, testDrive);
      stalls.push(...w.events.filter((e) => e.t === 'stall'));
      const l = w.vehicles.find((v) => v.id === leader.id)!;
      const p = w.vehicles.find((v) => v.id === partner.id)!;
      if (stateOf(w, 'escort', p.id, l.id) || stateOf(w, 'escort', l.id, p.id)) gap = Math.max(gap, dist(l.pos, p.pos));
    }
    expect(stalls).toEqual([]);
    expect(w.crimes[0].hunter).not.toBeNull();
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(40);
  });
});

describe('the Marshall on the radio after a truce plea', () => {
  function pleaded(health: number): { w: World; marshal: Vehicle } {
    const w = emptyWorld({ x: 300, y: 300 });
    const me = playerVehicle(w);
    fileAgainst(w, me, { x: 300, y: 300 });
    const marshal = marshalAt(w, { x: 306, y: 300 });
    planMarshal(w, marshal, [me]);
    answerDemand(w, marshal, me, 'refuse');
    marshal.resources!.health = health;
    forceOption('truceOffered', 'accept');
    let call = callVehicle(w, marshal.id);
    call = chooseOption(call, currentOptions(call).findIndex((o) => o.line === 'enoughShootingCanWe'));
    const options = currentOptions(call);
    expect(options.map((o) => o.line)).toEqual(['weBothDriveAway', 'hangUp']);
    return { w: chooseOption(call, 0), marshal };
  }

  it('warns an outgunned Marshall will be back with company, and the case then waits for the pair (IV3)', () => {
    const { w } = pleaded(10);
    expect(w.player.call?.line.line).toBe('marshalBackWithCompany');
    expect(w.crimes[0]).toMatchObject({ posse: 'pair', hunter: null });
  });

  it('keeps the plain truce line and the hunt for a Marshall that could win', () => {
    const { w, marshal } = pleaded(100);
    expect(w.player.call?.line.line).toBe('fineKeepYourGuns');
    expect(w.crimes[0]).toMatchObject({ posse: 'lone', hunter: marshal.id });
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
