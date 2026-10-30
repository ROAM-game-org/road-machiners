import { describe, expect, it } from 'vitest';
import type { LineId } from '../data/dialogue';
import { MOMENTS, type MomentId } from '../data/moments';
import type { PersonalityId } from '../data/personalities';
import type { TraitId } from '../data/npcs';
import { lineKey } from '../text/names';
import { entryText } from '../text/resolve';
import { playerVehicle } from './damage';
import { chooseOption, currentOptions, hangUp, raiseCalls } from './dialogue';
import { assignMoments, eligibleFor, freshMoments, momentOf, passMoments, releaseGoneHolders } from './moments';
import { pushGoal, topGoal } from './npc-activities';
import { getResources } from './resources';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { Vehicle, World } from './types';
import { refreshVision } from './vision';

const en = (line: LineId): string => entryText('en', lineKey(line));

function pick(w: World, text: string): World {
  const i = currentOptions(w).findIndex((o) => en(o.line) === text);
  if (i < 0) throw new Error(`No option "${text}" in ${currentOptions(w).map((o) => en(o.line)).join(' | ')}`);
  return chooseOption(w, i);
}

function driver(w: World, traits: TraitId[], personality: PersonalityId, x = 36): Vehicle {
  const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x, y: 30 });
  npc.brain = npcBrain(traits[0], npc.pos, traits, personality);
  return npc;
}

function linger(w: World, npc: Vehicle, id: MomentId): void {
  pushGoal(w, npc, { kind: 'wait', targetId: null, destination: { ...npc.pos }, phase: 'act', reason: MOMENTS[id].reason, until: w.turn + 30 });
}

function scene(id: MomentId, traits: TraitId[] = ['roamer']): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  w.moments = freshMoments();
  const npc = driver(w, traits, 'kind');
  w.moments[id].driver = npc.id;
  linger(w, npc, id);
  playerVehicle(w).speed = 0;
  refreshVision(w);
  return { w, npc };
}

describe('moments', () => {
  it('opens when the holder lingers for its reason and the player parks nearby', () => {
    const { w } = scene('fromTheWest');
    raiseCalls(w);
    expect(w.player.call?.topic).toBe('fromTheWest');
    expect(currentOptions(w).map((o) => en(o.line)).slice(0, 2)).toEqual(['What was she like?', '…']);
  });

  it('waits while the player drives, stands far off or the driver is busy', () => {
    const moving = scene('fromTheWest');
    playerVehicle(moving.w).speed = 3;
    raiseCalls(moving.w);
    expect(moving.w.player.call).toBeNull();

    const far = scene('fromTheWest');
    far.npc.pos = { x: 50, y: 30 };
    far.npc.brain!.goals[0].destination = { ...far.npc.pos };
    refreshVision(far.w);
    raiseCalls(far.w);
    expect(far.w.player.call).toBeNull();

    const busy = scene('fromTheWest');
    busy.npc.brain!.goals = [];
    raiseCalls(busy.w);
    expect(busy.w.player.call).toBeNull();
  });

  it('opens only for the moment the driver holds', () => {
    const { w, npc } = scene('fromTheWest');
    w.moments!.fromTheWest.driver = null;
    w.moments!.eightToNine.driver = npc.id;
    raiseCalls(w);
    expect(w.player.call).toBeNull();
  });

  it('tells From the west to its end, honks once and drives on', () => {
    const { w, npc } = scene('fromTheWest');
    raiseCalls(w);
    const money = getResources(w, playerVehicle(w)).money;
    let next = pick(w, 'What was she like?');
    next = pick(next, 'Where was she from?');
    next = pick(next, '…');
    const end = pick(next, 'Over and out.');
    expect(end.player.call).toBeNull();
    expect(end.moments!.fromTheWest.heard).toBe(true);
    expect(end.events).toContainEqual({ t: 'honk', vehicle: npc.id });
    expect(topGoal(end.vehicles.find((v) => v.id === npc.id)!)).toBeNull();
    expect(getResources(end, playerVehicle(end)).money).toBe(money);
  });

  it('lets the player say nothing through Eight to nine', () => {
    const { w } = scene('eightToNine', ['trader']);
    raiseCalls(w);
    let next = pick(w, '…');
    expect(currentOptions(next).map((o) => en(o.line)).slice(0, 2)).toEqual(['What is that song?', '…']);
    next = pick(next, '…');
    const end = pick(next, 'Over and out.');
    expect(end.moments!.eightToNine.heard).toBe(true);
  });

  it('asks about the fire and the door in The Crucible', () => {
    const { w } = scene('crucible', ['scavenger']);
    raiseCalls(w);
    let next = pick(w, 'The Crucible?');
    next = pick(next, 'Why clean the door?');
    next = pick(next, '…');
    const end = pick(next, 'Over and out.');
    expect(end.moments!.crucible.heard).toBe(true);
    expect(end.player.call).toBeNull();
  });

  it('is heard once in a world, even when the player hangs up', () => {
    const { w, npc } = scene('crucible', ['scavenger']);
    raiseCalls(w);
    const after = hangUp(w);
    expect(after.moments!.crucible.heard).toBe(true);
    const again = after.vehicles.find((v) => v.id === npc.id)!;
    linger(after, again, 'crucible');
    raiseCalls(after);
    expect(after.player.call).toBeNull();
    expect(momentOf(after, again)).toBeNull();
  });

  it('picks the same eligible holders from the same seed and draws nothing from the streams', () => {
    const w = emptyWorld();
    w.moments = freshMoments();
    driver(w, ['roamer'], 'kind', 40);
    driver(w, ['roamer'], 'pious', 44);
    driver(w, ['trader'], 'talkative', 48);
    driver(w, ['scavenger', 'scumbag'], 'kind', 52);
    driver(w, ['roamer'], 'suspicious', 56);
    const twin = structuredClone(w);
    const rng = w.rngState;
    assignMoments(w);
    assignMoments(twin);
    expect(w.moments).toEqual(twin.moments);
    expect(w.rngState).toBe(rng);
    const holders = Object.values(w.moments!).map((m) => m.driver);
    expect(new Set(holders).size).toBe(3);
    for (const [id, m] of Object.entries(w.moments!)) expect(eligibleFor(w.vehicles.find((v) => v.id === m.driver)!, id as MomentId)).toBe(true);
  });

  it('keeps moments from the wrong people', () => {
    const w = emptyWorld();
    expect(eligibleFor(driver(w, ['roamer'], 'suspicious'), 'fromTheWest')).toBe(false);
    expect(eligibleFor(driver(w, ['roamer'], 'tightLipped'), 'fromTheWest')).toBe(false);
    expect(eligibleFor(driver(w, ['trader', 'scumbag'], 'kind'), 'crucible')).toBe(false);
    expect(eligibleFor(driver(w, ['raider'], 'kind'), 'crucible')).toBe(false);
    expect(eligibleFor(driver(w, ['trader'], 'talkative'), 'eightToNine')).toBe(true);
  });

  it('passes an unheard moment on when its driver is gone', () => {
    const w = emptyWorld();
    w.moments = freshMoments();
    const first = driver(w, ['roamer'], 'kind', 40);
    const second = driver(w, ['roamer'], 'kind', 44);
    w.moments.fromTheWest.driver = first.id;
    w.vehicles = w.vehicles.filter((v) => v.id !== first.id);
    w.removed = [first];
    passMoments(w);
    expect(w.moments.fromTheWest.driver).toBe(second.id);
  });

  it('waits for the next fitting driver to spawn when nobody alive fits', () => {
    const w = emptyWorld();
    w.moments = freshMoments();
    const first = driver(w, ['roamer'], 'kind', 40);
    w.moments.fromTheWest.driver = first.id;
    w.vehicles = w.vehicles.filter((v) => v.id !== first.id);
    w.removed = [first];
    passMoments(w);
    expect(w.moments.fromTheWest.driver).toBeNull();
    w.removed = [];
    const grim = driver(w, ['roamer'], 'grim', 44);
    w.events = [{ t: 'spawn', vehicle: grim.id }];
    passMoments(w);
    expect(w.moments.fromTheWest.driver).toBeNull();
    const kind = driver(w, ['roamer'], 'kind', 48);
    w.events = [{ t: 'spawn', vehicle: kind.id }];
    passMoments(w);
    expect(w.moments.fromTheWest.driver).toBe(kind.id);
  });

  it('frees a moment whose driver a load repair dropped', () => {
    const w = emptyWorld();
    w.moments = freshMoments();
    w.moments.crucible.driver = 'v9999';
    releaseGoneHolders(w);
    expect(w.moments.crucible.driver).toBeNull();
  });

  it('stays out of worlds that keep no moments', () => {
    const { w, npc } = scene('fromTheWest');
    w.moments = null;
    raiseCalls(w);
    expect(w.player.call).toBeNull();
    expect(momentOf(w, npc)).toBeNull();
    passMoments(w);
    expect(w.moments).toBeNull();
  });
});
