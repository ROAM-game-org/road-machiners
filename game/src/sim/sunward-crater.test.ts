import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { generateNpcLoadout } from './npc-loadout';
import { spawnAt } from './spawn';
import { standardWorld } from '../test/world-cache';
import { playerVehicle } from './damage';
import { applyHazards } from './hazard';
import { checkDeath } from './defeat';
import { followTower, dragOf, isOnRope, startDrag, unhitch } from './tow';
import { advanceStates } from './states';
import { refreshVision } from './vision';
import { callStrangers, dropSpot, inDropRing, lightZone, offeringOf } from './sunward-crater';
import { advanceSunward, planSunward, dawnAfter, duskTurn, fallenSun, isSunwardMember, returnTurn, sunwardFacts, vigilGrounds } from './sunward';
import { callVehicle, chooseOption, currentOptions, hangUp, raiseCalls } from './dialogue';
import { topGoal } from './npc-activities';
import { SUNWARD } from '../data/sunward';
import { leaveQuest, QUEST_QUERIES, QUESTS, questView } from './quests';
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
    inZone(w, 6);
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

  it('treats hanging up on the last call as a refusal', () => {
    let { w, caller } = vigil();
    sunwardFacts(w).night = { dusk: duskTurn(1), roster: [], beaten: [], calls: { [w.player.vehicleId]: { count: 2, turn: w.turn - SUNWARD.callGap } }, hunt: null, shouted: [] };
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

  it('hunts a truck that gives its word and turns back, with one incident', () => {
    let { w, caller } = vigil();
    w = answer(call(w), 'comeAndWatch');
    w = hangUp(w);
    expect(offeringOf(w, w.player.vehicleId)).not.toBeNull();
    const zone = lightZone();
    const me = playerVehicle(w);
    const away = { x: me.pos.x + (me.pos.x - zone.pos.x) * 0.3, y: me.pos.y + (me.pos.y - zone.pos.y) * 0.3 };
    w.turn++;
    pose(me, away);

    advanceStates(w);

    expect(offeringOf(w, me.id)).toBeNull();
    expect(w.events.filter((e) => e.t === 'stateEnded' && e.state.kind === 'offering' && e.ending === 'broken')).toHaveLength(1);
    expect(feuds(w, caller)).toHaveLength(1);
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
    sunwardFacts(w).night = { dusk: duskTurn(1), roster: [], beaten: [], calls: {}, hunt: null, shouted: [] };

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

  it('has road drivers warn of the lamps while the order stands, and tell of the quiet once it falls', () => {
    const w = crater();
    w.turn = duskTurn(1) - 100;
    const npc = trader(w);
    refreshVision(w);

    expect(askCrater(w, npc).player.call?.vars.news).toEqual({ kind: 'line', line: 'carsDraggedIntoTheDark' });
    sunwardFacts(w).collapsed = w.turn;
    expect(askCrater(w, npc).player.call?.vars.news).toEqual({ kind: 'line', line: 'crowdAtTheCraterAgain' });
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
