import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { generateNpcLoadout } from './npc-loadout';
import { fillHollow, isFree, spawnAt } from './spawn';
import { standardWorld } from '../test/world-cache';
import { playerVehicle } from './damage';
import { applyHazards, inCore } from './hazard';
import { checkDeath } from './defeat';
import { followTower, dragOf, isOnRope, startDrag, unhitch } from './tow';
import { advanceStates, settleStates } from './states';
import { refreshVision } from './vision';
import { boundToOrder, callStrangers, craterNews, dropSpot, giveWord, inDropRing, lightZone, meetingLapsed, meetStrangers, offeringOf, wordGap } from './sunward-crater';
import { chooseOn } from './tracks';
import { endTurn } from './world';
import { addVehicle, emptyWorld, npcBrain, testDrive } from './testkit';
import { watchStalls } from './npc-watchdog';
import { advanceSunward, craterExit, gateOrder, isCavalcadeCar, planSunward, dawnAfter, duskTurn, fallenSun, isSunwardMember, returnTurn, rideOutTurn, sunwardFacts, vigilGrounds, vigilPosts } from './sunward';
import { callVehicle, chooseOption, currentOptions, hangUp, raiseCalls, talkOf } from './dialogue';
import { topGoal } from './npc-activities';
import { CRATER_ACCOUNTS, SUNWARD } from '../data/sunward';
import { REGION } from '../data/region';
import { t } from '../text/msg';
import { resolve } from '../text/resolve';
import { leaveQuest, QUEST_QUERIES, QUESTS, questView } from './quests';
import { isHostile } from './combat';
import { inTruce } from './relations';
import type { Vehicle, World } from './types';
import { dist, type Vec } from './vec';

function member(w: World, pos: Vec): Vehicle {
  const tpl = NPCS.cavalcade;
  return spawnAt(w, tpl, generateNpcLoadout(w, tpl), pos, 'sunward');
}

function crater(): World {
  const w = standardWorld(5);
  w.vehicles = [playerVehicle(w)];
  w.turn = duskTurn(1) + 80;
  playerVehicle(w).pos = { ...vigilGrounds()[0] };
  refreshVision(w);
  w.events = [];
  return w;
}

function knockOutPlayer(w: World, by: Vehicle): void {
  w.player.state = 'knockedOut';
  playerVehicle(w).defeat = { phase: 'out', turns: 0, unseen: 0, foes: [by.id], gaveUp: false };
}

function pose(v: Vehicle, pos: Vec, heading = 0): void {
  v.pos = { ...pos };
  v.heading = heading;
  v.trail = [{ ...pos, heading }, { ...pos, heading }];
}

describe('the hostile drag', () => {
  it('takes only a knocked-out or stranded truck the order fought, never an awake one', () => {
    const w = crater();
    const me = playerVehicle(w);
    const dragger = member(w, { x: me.pos.x + 3, y: me.pos.y });
    expect(() => startDrag(w, dragger, me, dropSpot(dragger.pos).stop, isSunwardMember)).toThrow(/cannot drag/);
    knockOutPlayer(w, dragger);

    startDrag(w, dragger, me, dropSpot(dragger.pos).stop, isSunwardMember);

    expect(isOnRope(w, me.id)).toBe(true);
    expect(w.events.filter((e) => e.t === 'hostile' || e.t === 'joins')).toEqual([]);
    expect(() => startDrag(w, member(w, { x: me.pos.x - 3, y: me.pos.y }), me, dropSpot(me.pos).stop, isSunwardMember)).toThrow(/cannot drag/);
  });

  it('ends when the dragger is wrecked and removed, without throwing', () => {
    const w = crater();
    const me = playerVehicle(w);
    const dragger = member(w, { x: me.pos.x + 3, y: me.pos.y });
    knockOutPlayer(w, dragger);
    startDrag(w, dragger, me, dropSpot(dragger.pos).stop, isSunwardMember);
    w.vehicles = w.vehicles.filter((v) => v.id !== dragger.id);

    settleStates(w);

    expect(dragOf(w, me.id)).toBeNull();
  });

  it('pulls the victim behind the dragger on the tow bar', () => {
    const w = crater();
    const me = playerVehicle(w);
    const dragger = member(w, { x: me.pos.x + 3, y: me.pos.y });
    knockOutPlayer(w, dragger);
    startDrag(w, dragger, me, dropSpot(dragger.pos).stop, isSunwardMember);
    pose(dragger, { x: me.pos.x + 3, y: me.pos.y });
    dragger.trail = [{ x: me.pos.x + 3, y: me.pos.y, heading: 0 }, { x: me.pos.x + 6, y: me.pos.y, heading: 0 }];
    dragger.pos = { x: me.pos.x + 6, y: me.pos.y };

    const before = { ...me.pos };
    followTower(w);

    expect(me.pos.x).toBeGreaterThan(before.x + 1);
    expect(dist(me.pos, dragger.pos)).toBeLessThan(5);
  });

  it('lets an awake player cut free at any time, and the drag ends broken', () => {
    const w = crater();
    const me = playerVehicle(w);
    const dragger = member(w, { x: me.pos.x + 3, y: me.pos.y });
    knockOutPlayer(w, dragger);
    startDrag(w, dragger, me, dropSpot(dragger.pos).stop, isSunwardMember);
    w.player.state = 'active';
    delete me.defeat;

    const free = unhitch(w);

    expect(dragOf(free, me.id)).toBeNull();
    expect(free.events.some((e) => e.t === 'stateEnded' && e.state.kind === 'drag' && e.ending === 'broken')).toBe(true);
    expect(playerVehicle(free).order).toEqual({ kind: 'brake' });
  });

  it('lets an NPC victim cut free as soon as it wakes', () => {
    const w = crater();
    const dragger = member(w, { x: 300, y: 200 });
    const trader = spawnAt(w, NPCS.trader, generateNpcLoadout(w, NPCS.trader), { x: 303, y: 200 }, 'independent');
    trader.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [dragger.id], gaveUp: false };
    startDrag(w, dragger, trader, dropSpot(dragger.pos).stop, isSunwardMember);
    w.turn++;
    trader.defeat = { phase: 'retreat', turns: 3, unseen: 0, foes: [dragger.id], gaveUp: false };

    advanceStates(w);

    expect(dragOf(w, trader.id)).toBeNull();
  });

  it('lets go of the victim at dawn', () => {
    const w = crater();
    const me = playerVehicle(w);
    const dragger = member(w, { x: me.pos.x + 3, y: me.pos.y });
    knockOutPlayer(w, dragger);
    startDrag(w, dragger, me, dropSpot(dragger.pos).stop, isSunwardMember);
    w.turn = dawnAfter(duskTurn(1));

    advanceStates(w);

    expect(dragOf(w, me.id)).toBeNull();
    expect(w.events.some((e) => e.t === 'stateEnded' && e.state.kind === 'drag' && e.ending === 'expired')).toBe(true);
  });

  it('drops the victim in the drain ring, never in the core, and leaves it be until dawn', () => {
    const w = crater();
    const me = playerVehicle(w);
    const dragger = member(w, { x: me.pos.x + 3, y: me.pos.y });
    const other = member(w, { x: me.pos.x - 6, y: me.pos.y });
    knockOutPlayer(w, dragger);
    const lane = dropSpot(dragger.pos);
    startDrag(w, dragger, me, lane.stop, isSunwardMember);
    expect(inDropRing(lane.stop)).toBe(true);
    const zone = lightZone();
    pose(me, { x: lane.stop.x + (lane.stop.x - zone.pos.x) * 0.4, y: lane.stop.y + (lane.stop.y - zone.pos.y) * 0.4 });
    w.turn++;

    advanceStates(w);

    expect(inDropRing(me.pos)).toBe(true);
    expect(dragOf(w, me.id)).toBeNull();
    expect(inTruce(w, dragger, me)).toBe(true);
    expect(inTruce(w, other, me)).toBe(true);
    const truce = w.states.find((s) => s.kind === 'truce' && s.holder === other.id && s.other === me.id)!;
    expect(w.turn + truce.turnsLeft!).toBe(dawnAfter(duskTurn(1)));
  });
});

describe('the reactor core', () => {
  function inZone(w: World, gap: number): void {
    const zone = lightZone();
    const me = playerVehicle(w);
    w.player.state = 'active';
    pose(me, { x: zone.pos.x + gap, y: zone.pos.y });
    me.trail[0] = { x: zone.pos.x + zone.radius + 2, y: zone.pos.y, heading: Math.PI };
  }

  it('drains health outside the core no lower than its floor', () => {
    const w = crater();
    inZone(w, -6);
    w.player.health = 33;
    for (let i = 0; i < 10; i++) applyHazards(w);
    expect(w.player.health).toBe(30);
    checkDeath(w);
    expect(w.player.state).toBe('active');
  });

  it('burns to death inside the core and plays the fallen light scene on that death only', () => {
    const w = crater();
    inZone(w, 2.5);
    w.player.health = 12;
    applyHazards(w);
    expect(w.events.some((e) => e.t === 'info' && e.note.id === 'core')).toBe(true);
    applyHazards(w);
    checkDeath(w);
    expect(w.player.health).toBe(0);
    expect(w.events.filter((e) => e.t === 'death')).toEqual([{ t: 'death', cause: 'core' }]);
    expect(w.player.quests.live?.quest).toBe('fallen_light');
    expect(questView(w, QUESTS)).toMatchObject({ view: 'page', ended: true, choices: [] });
    expect(leaveQuest(w).player.quests.live).toBeNull();
  });

  it('opens the scene in the breach of the reactor and names the word given tonight only when it was given', () => {
    const dieInTheCore = (offered: boolean): string => {
      const w = crater();
      advanceSunward(w);
      if (offered) giveWord(w, playerVehicle(w), member(w, { x: playerVehicle(w).pos.x + 4, y: playerVehicle(w).pos.y }));
      w.states = w.states.filter((s) => s.kind !== 'offering');
      inZone(w, 2.5);
      w.player.health = 6;
      applyHazards(w);
      checkDeath(w);
      const page = w.player.quests.live!.lines;
      expect(page[0].text).toMatch(/reactor/);
      expect(page[0].tags).toContain('place: The reactor of the Fallen Sun');
      return page.map((l) => l.text).join(' ');
    };

    expect(dieInTheCore(true)).toMatch(/your word tonight/);
    expect(dieInTheCore(false)).not.toMatch(/your word/);
  });

  it('shows no scene for a death by any other cause', () => {
    const w = crater();
    w.player.health = 0;
    checkDeath(w);
    expect(w.events.filter((e) => e.t === 'death')).toEqual([{ t: 'death', cause: 'injury' }]);
    expect(w.player.quests.live).toBeNull();
  });

  it('never drops a truck in the core', () => {
    const zone = lightZone();
    for (const from of [{ x: 0, y: 0 }, { x: 600, y: 600 }, { x: zone.pos.x, y: zone.pos.y + 40 }]) {
      const lane = dropSpot(from);
      expect(inDropRing(lane.stop)).toBe(true);
      expect(dist(lane.stop, zone.pos)).toBeGreaterThan(zone.core!.radius);
    }
  });
});


describe('the vigil invitation', () => {
  function vigil(): { w: World; caller: Vehicle } {
    const w = crater();
    const spot = vigilGrounds()[0];
    pose(playerVehicle(w), spot);
    const caller = member(w, { x: spot.x + 5, y: spot.y });
    refreshVision(w);
    advanceSunward(w);
    return { w, caller };
  }

  function call(w: World): World {
    raiseCalls(w);
    return w;
  }

  function later(w: World, turns: number): World {
    w.turn += turns;
    return w;
  }

  function answer(w: World, line: string): World {
    const index = currentOptions(w).findIndex((o) => o.line === line);
    if (index < 0) throw new Error(`No option ${line}`);
    return chooseOption(w, index);
  }

  const feuds = (w: World, member: Vehicle) => w.states.filter((s) => s.kind === 'feud' && s.holder === member.id && s.other === w.player.vehicleId);

  it('calls three times, a set gap apart, and only the last refusal starts a fight', () => {
    let { w, caller } = vigil();
    w = call(w);
    expect(w.player.call?.topic).toBe('vigilCall1');
    w = answer(w, 'notGoing');
    expect(feuds(w, caller)).toEqual([]);
    raiseCalls(w);
    expect(w.player.call).toBeNull();
    w = call(later(w, SUNWARD.callGap));
    expect(w.player.call?.topic).toBe('vigilCall2');
    w = answer(w, 'notGoing');
    expect(feuds(w, caller)).toEqual([]);
    w = call(later(w, SUNWARD.callGap));
    expect(w.player.call?.topic).toBe('vigilCall3');

    w = answer(w, 'notGoing');

    expect(feuds(w, caller)).toHaveLength(1);
    raiseCalls(later(w, SUNWARD.callGap));
    expect(w.player.call).toBeNull();
  });

  it('makes no call before dusk to a stranger in the crater while a car already holds its post', () => {
    const { w } = vigil();
    w.turn = duskTurn(1) - 1;
    sunwardFacts(w).night = { dusk: duskTurn(1), roster: [], beaten: [], calls: {}, hunt: null, shouted: [], offered: [] };

    raiseCalls(w);

    expect(w.player.call).toBeNull();
    expect(sunwardFacts(w).night!.calls).toEqual({});
  });

  it('treats hanging up on the last call as a refusal', () => {
    let { w, caller } = vigil();
    sunwardFacts(w).night = { dusk: duskTurn(1), roster: [], beaten: [], calls: { [w.player.vehicleId]: { count: 2, turn: w.turn - SUNWARD.callGap } }, hunt: null, shouted: [], offered: [] };
    w = call(w);
    expect(w.player.call?.topic).toBe('vigilCall3');

    w = hangUp(w);

    expect(feuds(w, caller)).toHaveLength(1);
  });

  it('stops calling once the truck leaves the crater', () => {
    const { w } = vigil();
    pose(playerVehicle(w), { x: fallenSun().pos.x, y: fallenSun().pos.y - fallenSun().radius - 30 });
    refreshVision(w);
    raiseCalls(w);
    expect(w.player.call).toBeNull();
  });

  function wordHeld(): { w: World; caller: Vehicle; me: Vehicle } {
    let { w, caller } = vigil();
    w = hangUp(answer(call(w), 'comeAndWatch'));
    return { w, caller: w.vehicles.find((v) => v.id === caller.id)!, me: playerVehicle(w) };
  }

  const farFromTheLight = (me: Vehicle, share: number): Vec => {
    const zone = lightZone();
    return { x: me.pos.x + (me.pos.x - zone.pos.x) * share, y: me.pos.y + (me.pos.y - zone.pos.y) * share };
  };

  const said = (w: World, line: string) => w.events.filter((e) => e.t === 'say' && e.line === line);

  it('keeps the word on the free turn however far the truck ran on, then hunts a truck that turns back, with one incident', () => {
    const { w, caller, me } = wordHeld();
    expect(offeringOf(w, me.id)).not.toBeNull();
    w.turn += SUNWARD.wordGrace;
    pose(me, farFromTheLight(me, 0.5));

    advanceStates(w);

    expect(offeringOf(w, me.id)).not.toBeNull();
    w.turn++;
    pose(me, farFromTheLight(me, 1.5));

    advanceStates(w);

    expect(offeringOf(w, me.id)).toBeNull();
    expect(w.events.filter((e) => e.t === 'stateEnded' && e.state.kind === 'offering' && e.ending === 'broken')).toHaveLength(1);
    expect(feuds(w, caller)).toHaveLength(1);
    const lines = said(w, 'wordBroken');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ speaker: caller.id });
  });

  it('breaks on the free turn when the truck leaves the crater', () => {
    const { w, me } = wordHeld();
    w.turn += SUNWARD.wordGrace;
    pose(me, { x: fallenSun().pos.x, y: fallenSun().pos.y - fallenSun().radius - 30 });

    advanceStates(w);

    expect(offeringOf(w, me.id)).toBeNull();
  });

  it('says nothing when the caller is down as the word breaks', () => {
    const { w, caller, me } = wordHeld();
    caller.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [me.id], gaveUp: false };
    w.turn += SUNWARD.wordGrace + 1;
    pose(me, farFromTheLight(me, 3));

    advanceStates(w);

    expect(offeringOf(w, me.id)).toBeNull();
    expect(said(w, 'wordBroken')).toEqual([]);
  });

  it('gaps the word by the drive, which the wreck in the bow makes longer than the straight line', () => {
    const w = crater();
    const me = playerVehicle(w);
    const south = { x: lightZone().pos.x + 1, y: lightZone().pos.y + 26 };
    pose(me, south);
    expect(wordGap(w, me)).toBeGreaterThan(dist(south, lightZone().pos) + SUNWARD.offerMargin);
  });

  it('keeps the straight line near the light', () => {
    const w = crater();
    const me = playerVehicle(w);
    pose(me, { x: lightZone().pos.x + 6, y: lightZone().pos.y });
    expect(wordGap(w, me)).toBeCloseTo(6, 5);
  });

  it('ends the fight of the car whose word was broken when a second car takes a word', () => {
    const { w, caller, me } = wordHeld();
    w.turn += SUNWARD.wordGrace + 1;
    pose(me, farFromTheLight(me, 3));
    advanceStates(w);
    expect(feuds(w, caller)).toHaveLength(1);
    const second = member(w, { x: me.pos.x + 4, y: me.pos.y });

    giveWord(w, me, second);

    expect(feuds(w, caller)).toEqual([]);
    expect(w.states.filter((s) => s.kind === 'combat' && (s.holder === caller.id || s.other === caller.id))).toEqual([]);
    expect(Object.values(caller.weaponOrders).filter((o) => o.targetId === me.id)).toEqual([]);
    expect(w.states.filter((s) => s.kind === 'truce')).toEqual([]);
    expect(inTruce(w, caller, me)).toBe(false);
    expect(isHostile(w, caller, me)).toBe(false);
  });

  it('lets the drag follow a word broken after a second word', () => {
    const { w, caller, me } = wordHeld();
    w.turn += SUNWARD.wordGrace + 1;
    pose(me, farFromTheLight(me, 3));
    advanceStates(w);
    giveWord(w, me, member(w, { x: me.pos.x + 4, y: me.pos.y }));
    const second = offeringOf(w, me.id)!;
    w.turn += SUNWARD.wordGrace + 1;
    second.born = w.turn - SUNWARD.wordGrace - 1;
    pose(me, farFromTheLight(me, 4));

    advanceStates(w);

    expect(offeringOf(w, me.id)).toBeNull();
    expect(feuds(w, caller).length + w.states.filter((s) => s.kind === 'feud' && s.other === me.id).length).toBeGreaterThan(0);
    expect(w.states.filter((s) => s.kind === 'truce')).toEqual([]);
  });

  it('does not let a hunting party seize a truck that holds a word', () => {
    const { w, me } = wordHeld();
    const hunter = member(w, { x: me.pos.x + 6, y: me.pos.y });
    expect(boundToOrder(w, hunter, me)).toBe(true);
    expect(boundToOrder(w, hunter, member(w, { x: me.pos.x + 9, y: me.pos.y }))).toBe(false);
  });

  it('frees a truck that keeps its word until the riders leave', () => {
    let { w, caller } = vigil();
    w = hangUp(answer(call(w), 'comeAndWatch'));
    w.turn = returnTurn(duskTurn(1));

    advanceStates(w);

    expect(offeringOf(w, w.player.vehicleId)).toBeNull();
    expect(w.events.some((e) => e.t === 'stateEnded' && e.state.kind === 'offering' && e.ending === 'expired')).toBe(true);
    expect(feuds(w, caller)).toEqual([]);
  });

  it('calls an NPC stranger once, and the stranger answers by its own choice', () => {
    const { w, caller } = vigil();
    pose(playerVehicle(w), { x: 50, y: 50 });
    refreshVision(w);
    const spot = vigilGrounds()[0];
    const scav = spawnAt(w, NPCS.scavenger, generateNpcLoadout(w, NPCS.scavenger), { x: spot.x - 4, y: spot.y }, 'independent');
    sunwardFacts(w).night = { dusk: duskTurn(1), roster: [], beaten: [], calls: {}, hunt: null, shouted: [], offered: [] };

    callStrangers(w);
    callStrangers(w);

    expect(sunwardFacts(w).night!.calls[scav.id]).toEqual({ count: 1, turn: w.turn });
    const fled = topGoal(scav)?.kind === 'flee';
    const refused = feuds(w, caller).length + w.states.filter((s) => s.kind === 'feud' && s.holder === caller.id && s.other === scav.id).length > 0;
    const promised = offeringOf(w, scav.id) !== null;
    expect([fled, refused, promised].filter(Boolean)).toHaveLength(1);
  });
});

describe('the order takes the beaten', () => {
  it('sends one rider to a truck the order beat at night, and that rider hitches it for the light', () => {
    const w = crater();
    advanceSunward(w);
    const me = playerVehicle(w);
    const rider = member(w, { x: me.pos.x + 7, y: me.pos.y });
    const other = member(w, { x: me.pos.x - 7, y: me.pos.y });
    knockOutPlayer(w, rider);

    planSunward(w, rider);
    planSunward(w, other);
    expect(rider.brain!.goals[0]).toMatchObject({ kind: 'explore', reason: 'dragToLight', targetId: me.id });
    expect(other.brain!.goals[0].reason).not.toBe('dragToLight');
    pose(rider, { x: me.pos.x + 2.4, y: me.pos.y });
    planSunward(w, rider);

    expect(dragOf(w, me.id)?.holder).toBe(rider.id);
    expect(rider.brain!.goals[0].reason).toBe('dragToLight');
  });
});

describe('talk of the order', () => {
  function trader(w: World): Vehicle {
    const me = playerVehicle(w);
    const v = spawnAt(w, NPCS.trader, generateNpcLoadout(w, NPCS.trader), { x: me.pos.x + 5, y: me.pos.y }, 'independent');
    v.brain!.personality = 'talkative';
    return v;
  }

  function askCrater(w: World, npc: Vehicle): World {
    const open = callVehicle(w, npc.id);
    const index = currentOptions(open).findIndex((o) => o.line === 'askAboutTheCrater');
    expect(index).toBeGreaterThanOrEqual(0);
    return chooseOption(open, index);
  }

  const offers = (w: World, npc: Vehicle) => currentOptions(callVehicle(w, npc.id)).some((o) => o.line === 'askAboutTheCrater');
  const newsOf = (w: World): string => {
    const news = w.player.call?.vars.news;
    if (!news || news.kind !== 'line') throw new Error('No crater account on the line');
    return news.line;
  };
  const told = (w: World, npc: Vehicle) => newsOf(askCrater(w, npc));

  function farFromTheCrater(w: World, npc: Vehicle): void {
    npc.brain!.home = { ...REGION.towns.find((t) => t.id === 'nose')!.pos };
    npc.brain!.memories = [];
  }

  it('lets only a driver with reason to know talk of the crater: one who lives near it or saw a car of the order', () => {
    const w = crater();
    w.turn = duskTurn(1) - 100;
    const near = trader(w);
    const far = trader(w);
    farFromTheCrater(w, far);
    refreshVision(w);

    expect(offers(w, near)).toBe(true);
    expect(offers(w, far)).toBe(false);
    expect(() => craterNews(w, far)).toThrow(/knows nothing of the crater/);

    const rider = member(w, { x: 10, y: 10 });
    far.brain!.memories = [{ turn: w.turn, fact: { kind: 'sighting', vehicle: rider.id, at: { ...rider.pos }, heading: 0 } }];
    expect(offers(w, far)).toBe(true);
  });

  it('has each driver tell its own account once, then answer with its repeat line', () => {
    let w = crater();
    w.turn = duskTurn(1) - 100;
    const npc = trader(w);
    refreshVision(w);

    w = askCrater(w, npc);
    expect(CRATER_ACCOUNTS.standing).toContain(newsOf(w));
    w = hangUp(w);

    expect(askCrater(w, npc).player.call?.line.line).toBe(talkOf(npc).repeatLine);
  });

  it('spreads the accounts over the drivers, with the eight lamps and the lost cousin each told by one account only', () => {
    const w = crater();
    w.turn = duskTurn(1) - 100;
    const drivers = Array.from({ length: 40 }, () => trader(w));
    refreshVision(w);

    const accounts = drivers.map((d) => (craterNews(w, d).news as { line: string }).line);

    const counts = new Map<string, number>();
    for (const a of accounts) counts.set(a, (counts.get(a) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(6);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(10);
    const text = (id: string) => resolve(t(`line.${id}` as never, {} as never), 'en');
    expect(CRATER_ACCOUNTS.standing.filter((id) => /\beight\b/i.test(text(id)))).toEqual(['craterLamps']);
    expect(CRATER_ACCOUNTS.standing.filter((id) => /cousin|brother|sister|uncle|aunt/i.test(text(id)))).toEqual(['carsDraggedIntoTheDark']);
  });

  it('tells only of the quiet once the order falls', () => {
    const w = crater();
    w.turn = duskTurn(1) - 100;
    sunwardFacts(w).collapsed = w.turn;
    const drivers = Array.from({ length: 8 }, () => trader(w));

    for (const d of drivers) expect(CRATER_ACCOUNTS.fallen).toContain((craterNews(w, d).news as { line: string }).line);
    expect(told(w, drivers[0])).toBe((craterNews(w, drivers[0]).news as { line: string }).line);
  });

  it('answers cult_broken() from the world and fails loud where no order exists', () => {
    const w = crater();
    expect(QUEST_QUERIES.cult_broken(w, [])).toBe(false);
    sunwardFacts(w).collapsed = w.turn;
    expect(QUEST_QUERIES.cult_broken(w, [])).toBe(true);
    w.sunward = null;
    expect(() => QUEST_QUERIES.cult_broken(w, [])).toThrow(/no Sunward order/);
  });
});

describe('meeting the stranger at the vigil', () => {
  function ring(): World {
    const w = standardWorld(5);
    w.vehicles = [playerVehicle(w)];
    fillHollow(w);
    w.vehicles = w.vehicles.filter((v) => !isSunwardMember(v) || isCavalcadeCar(v));
    w.turn = rideOutTurn(duskTurn(1)) + SUNWARD.driveTurns + 10;
    advanceSunward(w);
    const posts = vigilPosts(w);
    gateOrder(w, sunwardFacts(w).night!).forEach((id, seat) => pose(w.vehicles.find((v) => v.id === id)!, posts[seat]));
    for (const v of w.vehicles.filter(isSunwardMember)) planSunward(w, v);
    w.events = [];
    return w;
  }

  function besideTheDrain(w: World): Vec {
    const zone = lightZone();
    const posts = vigilPosts(w);
    const middle = { x: posts.reduce((a, p) => a + p.x, 0) / posts.length, y: posts.reduce((a, p) => a + p.y, 0) / posts.length };
    const ring = Array.from({ length: 72 }, (_, k) => (k * Math.PI) / 36).map((a) => ({ x: zone.pos.x + Math.cos(a) * (zone.radius + 1.5), y: zone.pos.y + Math.sin(a) * (zone.radius + 1.5) }));
    return ring.filter((p) => isFree({ ...w, vehicles: [] }, p, 1.2, null)).sort((a, b) => dist(b, middle) - dist(a, middle))[0];
  }

  const claim = (v: Vehicle) => v.brain!.goals.find((g) => g.kind === 'meet' && g.reason === 'meetStranger');
  const hear = (w: World, member: Vehicle, stranger: Vehicle) => chooseOn(w, member, stranger.id, stranger.pos, 'keep', false);

  it('calls a player parked lamps-off beside the drain within the meeting time, and the first call stays open', () => {
    let w = ring();
    const me = playerVehicle(w);
    pose(me, besideTheDrain(w));
    w.player.headlights = false;
    refreshVision(w);

    for (let turn = 0; turn < SUNWARD.meetTurns && !w.player.call; turn++) w = endTurn(w, testDrive);

    expect(w.player.call?.topic).toBe('vigilCall1');
  }, 600_000);

  it('sends the nearest car that only hears a stranger to meet it, over its post', () => {
    const w = ring();
    const me = playerVehicle(w);
    pose(me, besideTheDrain(w));
    const members = w.vehicles.filter(isSunwardMember);
    const far = members.sort((a, b) => dist(b.pos, me.pos) - dist(a.pos, me.pos))[0];
    hear(w, far, me);

    meetStrangers(w);

    expect(claim(far)).toMatchObject({ targetId: me.id, until: w.turn + SUNWARD.meetTurns });
    expect(far.brain!.goals[0].reason).toBe('keepVigil');
    expect(members.filter((m) => claim(m))).toHaveLength(1);
  });

  it('gives two strangers two cars, one each', () => {
    const w = ring();
    const me = playerVehicle(w);
    pose(me, besideTheDrain(w));
    const scav = spawnAt(w, NPCS.scavenger, generateNpcLoadout(w, NPCS.scavenger), { x: me.pos.x + 4, y: me.pos.y }, 'independent');
    const [a, b] = w.vehicles.filter(isSunwardMember);
    for (const m of [a, b]) for (const x of [me, scav]) hear(w, m, x);

    meetStrangers(w);

    expect(new Set([claim(a)?.targetId, claim(b)?.targetId])).toEqual(new Set([me.id, scav.id]));
  });

  it('drops the meeting when the stranger leaves the crater, and the car keeps its post', () => {
    const w = ring();
    const me = playerVehicle(w);
    pose(me, besideTheDrain(w));
    const car = w.vehicles.find(isSunwardMember)!;
    hear(w, car, me);
    meetStrangers(w);

    pose(me, craterExit(me.pos));

    expect(meetingLapsed(w, car, claim(car)!)).toBe('contactGone');
    expect(car.brain!.goals[0]).toMatchObject({ kind: 'wait', reason: 'keepVigil' });
  });

  it('lets a meeting lapse after its time', () => {
    const w = ring();
    const me = playerVehicle(w);
    pose(me, besideTheDrain(w));
    const car = w.vehicles.find(isSunwardMember)!;
    hear(w, car, me);
    meetStrangers(w);

    w.turn += SUNWARD.meetTurns;

    expect(meetingLapsed(w, car, claim(car)!)).toBe('meetingOff');
  });
});

describe('the drop lanes and the breach light', () => {
  it.each(SUNWARD.dropLanes)('keeps the stop and the dragger clear of the core on lane %s', (angle) => {
    const zone = lightZone();
    const stop = dropSpot({ x: zone.pos.x + Math.cos(angle) * 20, y: zone.pos.y + Math.sin(angle) * 20 }).stop;
    const dragger = { x: zone.pos.x + Math.cos(angle) * (zone.radius - 2), y: zone.pos.y + Math.sin(angle) * (zone.radius - 2) };
    expect(inDropRing(stop)).toBe(true);
    expect(inCore(zone, stop)).toBe(false);
    expect(inCore(zone, dragger)).toBe(false);
  });
});

describe('a stranger who gave the order its word', () => {
  it('waits out the night at the crater without counting as stalled', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 40, y: 30 });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    npc.brain.goals = [{ kind: 'wait', targetId: null, destination: { ...npc.pos }, phase: 'act', reason: 'keepWord', until: w.turn + 200 }];
    for (let i = 0; i < 150; i++) {
      w.turn++;
      watchStalls(w);
    }
    expect(w.events.filter((e) => e.t === 'stall')).toEqual([]);
    expect(topGoal(npc)?.reason).toBe('keepWord');
  });
});
