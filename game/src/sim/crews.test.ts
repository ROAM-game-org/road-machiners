import { describe, expect, it } from 'vitest';
import { CREW, NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { followersOf, followingOf, joinCompany } from './companies';
import { askToJoin, canMuster, crewCandidates, heirOf, musterGoal, onCrewCall, settleCrews, steerMuster } from './crews';
import { remember } from './memory';
import { getActivityDestination, goalHolds, placeBase, topGoal } from './npc-activities';
import { optionWeights } from './npc-decisions';
import { advanceStates } from './states';
import { addVehicle, emptyWorld, forceOption, npcBrain } from './testkit';
import type { GameEvent, NpcActivity, Vehicle, World } from './types';
import type { Vec } from './vec';
import { refreshVision } from './vision';

const KILN = REGION.locations.find((site) => site.id === 'kiln')!;
const SCRAPJAW = REGION.locations.find((site) => site.id === 'scrapjaw')!;
const near = (dx: number, dy = 0): Vec => ({ x: KILN.pos.x + KILN.radius + 4 + dx, y: KILN.pos.y + dy });

function raider(w: World, pos: Vec, home: Vec = KILN.pos, parts = ['mg', 'stockEngine']): Vehicle {
  const v = addVehicle(w, 'raiders', 'buggy', parts, pos);
  v.brain = npcBrain('buggy', home, NPCS.buggy.traits);
  return v;
}

function camp(): World {
  const w = emptyWorld({ x: 20, y: 20 });
  refreshVision(w);
  return w;
}

function crewOfTwo(w: World): { leader: Vehicle; a: Vehicle; b: Vehicle } {
  const leader = raider(w, near(0));
  const a = raider(w, near(3), KILN.pos, ['mg', 'mg', 'stockEngine']);
  const b = raider(w, near(6));
  for (const m of [a, b]) {
    joinCompany(w, m, leader, 'crew', { kind: 'crew', camp: 'kiln' });
    placeBase(w, m, { kind: 'follow', targetId: leader.id, destination: { ...leader.pos }, phase: 'travel', reason: 'crewLeader' });
  }
  return { leader, a, b };
}

const eventsOf = <T extends GameEvent['t']>(w: World, t: T) => w.events.filter((e): e is Extract<GameEvent, { t: T }> => e.t === t);

describe('mustering a crew', () => {
  it('signs up a raider that agrees, and it follows its new leader', () => {
    const w = camp();
    const [leader, candidate] = [raider(w, near(0)), raider(w, near(3))];
    forceOption('crewAsked', 'join');

    expect(askToJoin(w, leader, candidate)).toBe('join');

    expect(followingOf(w, candidate)).toMatchObject({ kind: 'crew', other: leader.id, turnsLeft: CREW.huntTurns });
    expect(candidate.brain!.goals[0]).toMatchObject({ kind: 'follow', targetId: leader.id, reason: 'crewLeader' });
    expect(eventsOf(w, 'crewAsked')).toEqual([{ t: 'crewAsked', leader: leader.id, member: candidate.id, answer: 'join', cause: 'joined' }]);
  });

  it('records a plain refusal and leaves the raider free', () => {
    const w = camp();
    const [leader, candidate] = [raider(w, near(0)), raider(w, near(3))];
    forceOption('crewAsked', 'decline');

    askToJoin(w, leader, candidate);

    expect(followingOf(w, candidate)).toBeNull();
    expect(eventsOf(w, 'crewAsked')[0].cause).toBe('declined');
  });

  it('never lets a raider wronged by the asker join, and names the grudge', () => {
    const w = camp();
    const [leader, candidate] = [raider(w, near(0)), raider(w, near(3))];
    remember(w, candidate, { kind: 'wronged', by: leader.id });

    expect(optionWeights(w, candidate, 'crewAsked', leader.id, null)).not.toHaveProperty('join');
    expect(askToJoin(w, leader, candidate)).toBe('decline');
    expect(eventsOf(w, 'crewAsked')[0].cause).toBe('grudge');
  });

  it('weighs a leader the candidate rates stronger up', () => {
    const w = camp();
    const weak = raider(w, near(0), KILN.pos, ['stockEngine']);
    const strong = addVehicle(w, 'raiders', 'wagon', ['tankGun', 'stockEngine'], near(3));
    strong.brain = npcBrain('buggy', KILN.pos, NPCS.buggy.traits);
    const candidate = raider(w, near(6));

    const fromStrong = optionWeights(w, candidate, 'crewAsked', strong.id, null).join!;
    const fromWeak = optionWeights(w, candidate, 'crewAsked', weak.id, null).join!;
    expect(fromStrong).toBe(fromWeak * CREW.strongerLeader);
  });

  it('never asks a raider of the other camp', () => {
    const w = camp();
    const leader = raider(w, near(0));
    const stranger = raider(w, near(3), SCRAPJAW.pos);
    const own = raider(w, near(6));

    expect(crewCandidates(w, leader, []).map((v) => v.id)).toEqual([own.id]);
    expect(crewCandidates(w, leader, []).map((v) => v.id)).not.toContain(stranger.id);
  });

  it('musters only at camp, with someone to ask, and not again before the rest is over', () => {
    const w = camp();
    const leader = raider(w, near(0));
    expect(canMuster(w, leader)).toBe(false);
    raider(w, near(3));
    expect(canMuster(w, leader)).toBe(true);

    leader.brain!.musteredAt = w.turn - CREW.retryTurns + 1;
    expect(canMuster(w, leader)).toBe(false);
    leader.brain!.musteredAt = w.turn - CREW.retryTurns;
    expect(canMuster(w, leader)).toBe(true);
    leader.pos = { x: KILN.pos.x, y: KILN.pos.y + KILN.radius + CREW.campReach + 2 };
    expect(canMuster(w, leader)).toBe(false);
  });

  it('stops at the crew size, rides out on a raid and logs the crew', () => {
    const w = camp();
    const leader = raider(w, near(0));
    const others = [raider(w, near(3)), raider(w, near(0, 3)), raider(w, near(3, 3))];
    forceOption('crewAsked', 'join');
    const goal = musterGoal(w, leader);
    placeBase(w, leader, goal);

    for (let i = 0; i < others.length && topGoal(leader)?.kind === 'muster'; i++) steerMuster(w, leader, goal);

    expect(followersOf(w, leader.id)).toHaveLength(CREW.size - 1);
    expect(leader.brain!.goals[0].kind).toBe('raid');
    expect(eventsOf(w, 'crewFormed')).toHaveLength(1);
    expect(leader.brain!.musteredAt).toBe(w.turn);
  });

  it('waits at camp for raiders to come in while its turns last', () => {
    const w = camp();
    const leader = raider(w, near(0));
    const first = raider(w, near(3));
    const goal: NpcActivity = musterGoal(w, leader);
    placeBase(w, leader, goal);
    goal.asked!.push(first.id);

    steerMuster(w, leader, goal);

    expect(topGoal(leader)).toMatchObject({ kind: 'muster', targetId: null, destination: null });
    const late = raider(w, { x: leader.pos.x, y: leader.pos.y + CREW.askReach + 4 });
    steerMuster(w, leader, goal);
    expect(goal).toMatchObject({ targetId: late.id, destination: late.pos, phase: 'travel' });
    expect(goal.asked).toEqual([first.id]);
  });

  it('gives up when its turns run out with nobody signed, logs it and rests', () => {
    const w = camp();
    const leader = raider(w, near(0));
    raider(w, near(3));
    const goal: NpcActivity = musterGoal(w, leader);
    placeBase(w, leader, goal);
    w.turn = goal.until!;

    steerMuster(w, leader, goal);

    expect(leader.brain!.goals.some((g) => g.kind === 'muster')).toBe(false);
    expect(eventsOf(w, 'crewFailed')).toEqual([{ t: 'crewFailed', leader: leader.id }]);
    expect(canMuster(w, leader)).toBe(false);
  });
});

describe('a crew on the hunt', () => {
  it('joins the fight its leader picks when the member chooses to', () => {
    const w = camp();
    const { leader, a } = crewOfTwo(w);
    const prey = addVehicle(w, 'traders', 'scout', ['stockEngine'], near(10, 4));
    placeBase(w, leader, { kind: 'fight', targetId: prey.id, destination: { ...prey.pos }, phase: 'travel', reason: 'robCargo' });
    forceOption('crewCalled', 'fight');

    onCrewCall(w, a);

    expect(topGoal(a)).toMatchObject({ kind: 'fight', targetId: prey.id });
    expect(followingOf(w, a)?.kind).toBe('crew');
  });

  it('lets a member run from a fight it rates lost, and it leaves the crew', () => {
    const w = camp();
    const { leader, a } = crewOfTwo(w);
    const prey = addVehicle(w, 'traders', 'scout', ['stockEngine'], near(10, 4));
    placeBase(w, leader, { kind: 'fight', targetId: prey.id, destination: { ...prey.pos }, phase: 'travel', reason: 'robCargo' });
    forceOption('crewCalled', 'flee');

    onCrewCall(w, a);

    expect(followingOf(w, a)).toBeNull();
    expect(topGoal(a)?.kind).toBe('flee');
    expect(eventsOf(w, 'crewLeft')).toEqual([{ t: 'crewLeft', leader: leader.id, member: a.id, cause: 'fled' }]);
  });

  it('holds a member back from a hostile that attacks nobody in the crew while the leader is in sight', () => {
    const w = camp();
    const { a } = crewOfTwo(w);
    const prey = addVehicle(w, 'traders', 'scout', ['stockEngine'], near(10, 4));
    const held = optionWeights(w, a, 'hostileSeen', prey.id, 0.5).fight;
    a.brain!.attackers[prey.id] = true;
    const attacked = optionWeights(w, a, 'hostileSeen', prey.id, 0.5).fight;

    expect(held).toBeCloseTo(attacked! * CREW.initiative);
  });
});

describe('losing the leader', () => {
  it('names the heir by firepower and condition, and the rest rejoin it with the same turns left', () => {
    const w = camp();
    const { leader, a, b } = crewOfTwo(w);
    followingOf(w, b)!.turnsLeft = 120;
    leader.defeat = { phase: 'out', turns: 10, unseen: 0, foes: [], gaveUp: false };

    settleCrews(w);

    expect(heirOf(w, [a, b]).id).toBe(a.id);
    expect(followingOf(w, a)).toBeNull();
    expect(followingOf(w, b)).toMatchObject({ kind: 'crew', other: a.id, turnsLeft: 120 });
    expect(b.brain!.goals[0]).toMatchObject({ kind: 'follow', targetId: a.id });
    expect(a.brain!.goals[0].kind).toBe('raid');
    expect(eventsOf(w, 'crewLed')).toEqual([{ t: 'crewLed', leader: a.id, fallen: leader.id }]);
  });

  it('breaks a tie by the lower id', () => {
    const w = camp();
    const [x, y] = [raider(w, near(0)), raider(w, near(3))];
    expect(heirOf(w, [y, x]).id).toBe(x.id < y.id ? x.id : y.id);
  });

  it('disbands a crew with one member left', () => {
    const w = camp();
    const { leader, b } = crewOfTwo(w);
    b.defeat = { phase: 'out', turns: 10, unseen: 0, foes: [], gaveUp: false };
    leader.defeat = { phase: 'out', turns: 10, unseen: 0, foes: [], gaveUp: false };

    settleCrews(w);

    expect(w.states.filter((s) => s.kind === 'crew')).toEqual([]);
    expect(eventsOf(w, 'crewDisbanded')).toHaveLength(1);
  });

  it('logs a member knocked out of its crew', () => {
    const w = camp();
    const { leader, b } = crewOfTwo(w);
    b.defeat = { phase: 'out', turns: 10, unseen: 0, foes: [], gaveUp: false };

    settleCrews(w);

    expect(eventsOf(w, 'crewLeft')).toEqual([{ t: 'crewLeft', leader: leader.id, member: b.id, cause: 'knockedOut' }]);
    expect(followersOf(w, leader.id)).toHaveLength(1);
  });
});

describe('the end of the hunt', () => {
  it('expires every membership together, disbands once and the follow goals drop', () => {
    const w = camp();
    const { a, b } = crewOfTwo(w);
    for (const s of w.states) {
      s.turnsLeft = 1;
      s.born = w.turn - 1;
    }

    advanceStates(w);

    expect(w.states.filter((s) => s.kind === 'crew')).toEqual([]);
    expect(eventsOf(w, 'crewDisbanded')).toHaveLength(1);
    expect(goalHolds(w, a, a.brain!.goals[0])).toBe(false);
    expect(goalHolds(w, b, b.brain!.goals[0])).toBe(false);
  });
});

describe('the muster on the road', () => {
  it('drives straight at the raider it goes to ask', () => {
    const w = camp();
    const leader = raider(w, near(0));
    raider(w, near(0, CREW.askReach + 4));
    const goal = musterGoal(w, leader);
    placeBase(w, leader, goal);
    steerMuster(w, leader, goal);

    expect(getActivityDestination(w, leader, goal)).toEqual(goal.destination);
    expect(goal.destination).not.toBeNull();
  });
});
