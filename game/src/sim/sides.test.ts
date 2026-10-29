import { describe, expect, it } from 'vitest';
import { NPCS, SPAWN, type TraitId } from '../data/npcs';
import { inFeud } from './combat';
import { joinCompany } from './companies';
import { judgeDanger } from './npc-decisions';
import { makePeace } from './parley';
import { fightSide, fightsSideOf, perceivedGroup, spokesman } from './sides';
import { allegianceFor } from './spawn';
import { addState } from './states';
import { addVehicle, emptyWorld, npcBrain, startCombat } from './testkit';
import type { Vehicle, World } from './types';
import { refreshVision } from './vision';

function npc(w: World, templateId: string, traits: TraitId[], x: number, y = 40): Vehicle {
  const v = addVehicle(w, allegianceFor(w, NPCS[templateId], null, null), 'scout', ['mg', 'stockEngine'], { x, y });
  v.brain = npcBrain(templateId, { x, y }, traits);
  return v;
}

const escort = { kind: 'escort', site: null, fee: 0 } as const;
const crew = { kind: 'crew', camp: 'kiln' } as const;
const ids = (vs: Vehicle[]) => vs.map((v) => v.id).sort();

function scene(): { w: World; raider: Vehicle; trader: Vehicle } {
  const w = emptyWorld({ x: 120, y: 120 });
  return { w, raider: npc(w, 'buggy', ['raider'], 40), trader: npc(w, 'trader', ['trader'], 52) };
}

describe('perceived groups', () => {
  it('makes a trader with a merc three tiles off look stronger to a raider than one alone', () => {
    const { w, raider, trader } = scene();
    const alone = judgeDanger(w, raider, trader);
    const merc = npc(w, 'merc', ['merc'], 52, 43);
    joinCompany(w, merc, trader, 'escort', escort);

    expect(ids(perceivedGroup(w, raider, trader))).toEqual(ids([trader, merc]));
    expect(judgeDanger(w, raider, trader)).toBeGreaterThan(alone);
  });

  it('counts a convoy guard that is both a mate and an escort once', () => {
    const w = emptyWorld({ x: 120, y: 120 });
    const raider = npc(w, 'buggy', ['raider'], 40);
    const convoy = npc(w, 'convoy', ['supplier'], 50);
    const guard = npc(w, 'convoyGuard', ['guard'], 52);
    joinCompany(w, guard, convoy, 'escort', escort);

    expect(perceivedGroup(w, raider, convoy).map((v) => v.id)).toEqual([convoy.id, guard.id]);
    expect(fightSide(w, convoy).map((v) => v.id)).toEqual([convoy.id, guard.id]);
  });

  it('leaves out a member the observer cannot see', () => {
    const { w, raider, trader } = scene();
    const merc = npc(w, 'merc', ['merc'], 52, 90);
    joinCompany(w, merc, trader, 'escort', escort);

    expect(perceivedGroup(w, raider, trader).map((v) => v.id)).toEqual([trader.id]);
  });

  it('counts two raiders twelve tiles apart together only when they ride in one crew', () => {
    const w = emptyWorld({ x: 120, y: 120 });
    const trader = npc(w, 'trader', ['trader'], 40);
    const leader = npc(w, 'buggy', ['raider'], 50);
    const member = npc(w, 'buggy', ['raider'], 50, 52);
    expect(perceivedGroup(w, trader, leader).map((v) => v.id)).toEqual([leader.id]);

    joinCompany(w, member, leader, 'crew', crew);

    expect(ids(perceivedGroup(w, trader, leader))).toEqual(ids([leader, member]));
  });

  it('counts a lawman fighting the same raider with the trader, and leaves out a calm bystander', () => {
    const { w, raider, trader } = scene();
    const lawman = npc(w, 'bowlFarmer', ['lawman', 'brave'], 50, 48);
    const bystander = npc(w, 'scavenger', ['scavenger'], 54, 36);
    startCombat(w, raider, trader);
    startCombat(w, lawman, raider);

    const group = ids(perceivedGroup(w, raider, trader));
    expect(group).toContain(lawman.id);
    expect(group).not.toContain(bystander.id);
  });

  it('ends the feuds of a whole crew and of the guard riding with the player in one truce', () => {
    const w = emptyWorld({ x: 46, y: 40 });
    const me = w.vehicles[0];
    const merc = npc(w, 'merc', ['merc'], 46, 44);
    const leader = npc(w, 'buggy', ['raider'], 56);
    const member = npc(w, 'buggy', ['raider'], 58, 44);
    joinCompany(w, merc, me, 'hire', { kind: 'hire', fee: 100 });
    joinCompany(w, member, leader, 'crew', crew);
    for (const [a, b] of [[leader, me], [member, me], [member, merc], [merc, member]]) addState(w, 'feud', a.id, b.id, { kind: 'feud', robbery: false });
    refreshVision(w);

    makePeace(w, me, leader);

    expect([inFeud(w, leader, me), inFeud(w, member, me), inFeud(w, member, merc)]).toEqual([false, false, false]);
  });

  it('lets a crew leader in sight speak for its member, and never makes the player speak for its guard', () => {
    const w = emptyWorld({ x: 46, y: 40 });
    const me = w.vehicles[0];
    const leader = npc(w, 'buggy', ['raider'], 56);
    const member = npc(w, 'buggy', ['raider'], 58, 44);
    const merc = npc(w, 'merc', ['merc'], 46, 44);
    joinCompany(w, member, leader, 'crew', crew);
    joinCompany(w, merc, me, 'hire', { kind: 'hire', fee: 100 });

    expect(spokesman(w, member).id).toBe(leader.id);
    expect(spokesman(w, merc).id).toBe(merc.id);
    leader.pos = { x: 56, y: 100 };
    expect(spokesman(w, member).id).toBe(member.id);
  });
});

describe('a truck fighting the side of a driver', () => {
  function sideScene(): { w: World; raider: Vehicle; foe: Vehicle } {
    const w = emptyWorld({ x: 120, y: 120 });
    const raider = npc(w, 'buggy', ['raider'], 40);
    const foe = npc(w, 'trader', ['trader'], 52);
    refreshVision(w);
    return { w, raider, foe };
  }

  it('holds for a truck fighting the driver itself, in either direction', () => {
    const { w, raider, foe } = sideScene();
    startCombat(w, raider, foe);
    expect(fightsSideOf(w, foe, raider)).toBe(true);
  });

  it('holds for a truck fighting a company mate however far away', () => {
    const { w, raider, foe } = sideScene();
    const mate = npc(w, 'buggy', ['raider'], 40, 100);
    joinCompany(w, mate, raider, 'crew', crew);
    startCombat(w, foe, mate);
    expect(fightsSideOf(w, foe, raider)).toBe(true);
  });

  it('holds for a truck fighting a nearby ally in sight', () => {
    const { w, raider, foe } = sideScene();
    const ally = npc(w, 'buggy', ['raider'], 44);
    startCombat(w, foe, ally);
    expect(fightsSideOf(w, foe, raider)).toBe(true);
  });

  it('does not hold for an ally beyond the help reach', () => {
    const { w, raider, foe } = sideScene();
    const ally = npc(w, 'buggy', ['raider'], 40, 40 + SPAWN.neighborHelp + 5);
    startCombat(w, foe, ally);
    expect(fightsSideOf(w, foe, raider)).toBe(false);
  });

  it('does not hold for a nearby ally the driver cannot see', () => {
    const { w, raider, foe } = sideScene();
    const ally = npc(w, 'buggy', ['raider'], 48);
    w.vehicles[0].pos = { x: 44, y: 30 };
    w.obstacles = [...w.obstacles, { id: 'cover', kind: 'rock', pos: { x: 44, y: 40 }, r: 1.5 }];
    refreshVision(w);
    startCombat(w, foe, ally);
    expect(fightsSideOf(w, foe, raider)).toBe(false);
  });

  it('does not hold for a fight with a stranger', () => {
    const { w, raider, foe } = sideScene();
    const stranger = npc(w, 'trader', ['trader'], 56);
    startCombat(w, foe, stranger);
    expect(fightsSideOf(w, foe, raider)).toBe(false);
  });
});
