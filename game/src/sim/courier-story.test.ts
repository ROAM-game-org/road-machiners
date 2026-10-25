import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../data/encounters';
import { NPCS, STATE_TURNS } from '../data/npcs';
import { REGION } from '../data/region';
import { lineKey } from '../text/names';
import { entryText } from '../text/resolve';
import type { LineId } from '../data/dialogue';
import { hasAid, isLow, playerAid, readyAid, startAid, wantedAid } from './aid';
import { playerVehicle } from './damage';
import { chooseOption, currentOptions, hangUp, raiseCalls } from './dialogue';
import { encounterAvailable, favorAmount, lapseEncounter, onStrangerSeen, storyBeatDue } from './encounters';
import { remember } from './memory';
import { stateOf } from './states';
import { fuelCap, suppliesCap } from './stats';
import { addVehicle, emptyWorld, forceOption, npcBrain, rngStateForForcedRolls, testDrive } from './testkit';
import type { SalvageStock, Vehicle, World } from './types';
import { refreshVision } from './vision';
import { endTurn, update } from './world';
import { emptyHidden } from './salvage';

const en = (line: LineId): string => entryText('en', lineKey(line));

function pick(w: World, text: string): World {
  const i = currentOptions(w).findIndex((o) => en(o.line) === text);
  if (i < 0) throw new Error(`No option "${text}" in ${currentOptions(w).map((o) => en(o.line)).join(' | ')}`);
  return chooseOption(w, i);
}

const find = (w: World, id: string): Vehicle => w.vehicles.find((v) => v.id === id)!;

function quiet(w: World): void {
  w.player.encounters.next = Number.MAX_SAFE_INTEGER;
}

function courierWorld(): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  w.player.discovered = [...REGION.towns, ...REGION.locations].map((s) => s.id);
  w.salvage = [];
  const npc = addVehicle(w, 'guidestar', 'scout', ['stockEngine'], { x: 36, y: 30 });
  npc.brain = npcBrain('courier', npc.pos, ['courier']);
  npc.resources!.fuel = 1;
  npc.resources!.supplies = suppliesCap(npc);
  npc.resources!.money = 20000;
  w.player.fuel = fuelCap(playerVehicle(w));
  w.player.money = 50000;
  refreshVision(w);
  return { w, npc };
}

function askedWorld(): { w: World; npc: Vehicle } {
  const s = courierWorld();
  forceOption('strangerSeen', 'courier');
  s.w.rngState = rngStateForForcedRolls(1);
  onStrangerSeen(s.w, s.npc);
  raiseCalls(s.w);
  expect(s.w.player.call).toMatchObject({ with: s.npc.id, topic: 'courierShort' });
  return s;
}

function handOver(start: World, npcId: string): World {
  let w = start;
  for (let i = 0; i < 80 && playerAid(w) !== null; i++) {
    if (w.player.call) w = update(w, (d) => { d.player.call = null; });
    const ready = readyAid(w);
    if (ready) w = startAid(w, ready.holder);
    w = endTurn(w, testDrive);
    quiet(w);
  }
  expect(playerAid(w)).toBeNull();
  return w;
}

function meetAgain(start: World, npcId: string, turns: number): World {
  return update(start, (w) => {
    w.turn += turns;
    const npc = find(w, npcId);
    npc.pos = { x: 36, y: 30 };
    npc.brain!.goals = [];
    playerVehicle(w).pos = { x: 30, y: 30 };
    quiet(w);
    refreshVision(w);
  });
}

function wreck(id: string, pos: { x: number; y: number }): SalvageStock {
  return { id, pos, radius: 0.6, goods: {}, parts: [], hidden: { ...emptyHidden(), goods: { scrap: 2 } } };
}

const GAP = ENCOUNTERS.storyGapTurns;
const wealth = (w: World, id: string) => w.player.money + find(w, id).resources!.money;
const supplies = (w: World, id: string) => w.player.fuel + w.player.supplies + find(w, id).resources!.fuel + find(w, id).resources!.supplies;

describe('the courier story, free help', () => {
  it('runs the thanks, the favor and the end, and never starts again', () => {
    const { w, npc } = askedWorld();
    expect(w.player.encounters.story).toMatchObject({ driver: npc.id, beat: 'asked' });
    expect(currentOptions(w).map((o) => en(o.line))).toEqual(['No charge.', 'At the town price.', "Can't help, sorry.", 'Hang up.']);
    const stock = supplies(w, npc.id);
    const money = wealth(w, npc.id);
    let next = pick(w, 'No charge.');
    expect(next.player.encounters.story).toMatchObject({ beat: 'promised', free: true });
    expect(next.player.encounters.pending).toBeNull();
    quiet(next);
    next = handOver(next, npc.id);
    const story = next.player.encounters.story!;
    expect(story.beat).toBe('helped');
    expect(story.aidValue).toBeGreaterThan(0);
    expect(supplies(next, npc.id)).toBeCloseTo(stock, 0);
    expect(wealth(next, npc.id)).toBe(money);

    next = meetAgain(next, npc.id, GAP - 1);
    raiseCalls(next);
    expect(next.player.call).toBeNull();
    next = meetAgain(next, npc.id, 1 + 1);
    next.salvage = [wreck('wreck4', { x: 45, y: 30 })];
    raiseCalls(next);
    expect(next.player.call).toMatchObject({ topic: 'courierThanks' });
    next = pick(next, 'Go on.');
    expect(next.player.call?.node).toBe('wreck');
    next = pick(next, 'Thanks. Over and out.');
    expect(next.player.rumored).toEqual(['wreck4']);
    expect(next.player.encounters.story?.beat).toBe('owed');

    next = meetAgain(next, npc.id, GAP);
    const courier = find(next, npc.id);
    courier.resources!.money = 100000;
    const before = wealth(next, npc.id);
    const owed = Math.min(Math.round(story.aidValue * ENCOUNTERS.favorShare), 100000 - ENCOUNTERS.favorReserve);
    expect(favorAmount(next, courier)).toBe(owed);
    raiseCalls(next);
    expect(next.player.call).toMatchObject({ topic: 'courierFavor' });
    const moneyBefore = next.player.money;
    next = pick(next, 'Thanks. Over and out.');
    expect(next.player.money).toBe(moneyBefore + owed);
    expect(wealth(next, npc.id)).toBe(before);
    expect(next.player.encounters.story?.beat).toBe('ended');

    find(next, npc.id).resources!.fuel = 1;
    expect(encounterAvailable(next, find(next, npc.id), 'courier')).toBe(false);
  });

  it('waits for the favor until the courier has money to spare', () => {
    const { w, npc } = askedWorld();
    quiet(w);
    let next = handOver(pick(w, 'No charge.'), npc.id);
    next = meetAgain(next, npc.id, GAP);
    raiseCalls(next);
    next = pick(pick(next, 'Go on.'), 'Thanks. Over and out.');
    next = meetAgain(next, npc.id, GAP);
    find(next, npc.id).resources!.money = ENCOUNTERS.favorReserve;
    expect(storyBeatDue(next, find(next, npc.id))).toBeNull();
    find(next, npc.id).resources!.money = ENCOUNTERS.favorReserve + 10;
    expect(storyBeatDue(next, find(next, npc.id))).toBe('courierFavor');
  });
});

describe('the courier story, paid help', () => {
  it('pays the courier price, then shares a tip and ends the story', () => {
    const { w, npc } = askedWorld();
    const stock = supplies(w, npc.id);
    const money = wealth(w, npc.id);
    let next = pick(w, 'At the town price.');
    expect(next.player.encounters.story).toMatchObject({ beat: 'promised', free: false });
    quiet(next);
    next = handOver(next, npc.id);
    expect(next.player.encounters.story?.beat).toBe('paid');
    expect(next.player.money).toBeGreaterThan(w.player.money);
    expect(supplies(next, npc.id)).toBeCloseTo(stock, 0);
    expect(wealth(next, npc.id)).toBe(money);
    remember(next, find(next, npc.id), { kind: 'prices', shop: 'salvage-yard', pressure: { scrap: -0.3, parts: 0, tools: 0 } });
    next = meetAgain(next, npc.id, GAP);
    raiseCalls(next);
    expect(next.player.call).toMatchObject({ topic: 'courierSquare' });
    next = pick(next, 'Thanks. Over and out.');
    expect(next.player.encounters.story?.beat).toBe('ended');
    expect(next.player.call).toBeNull();
  });
});

describe('the courier story, refused help', () => {
  it('gives the cold shoulder and shuts the player out of asking for aid', () => {
    const { w, npc } = askedWorld();
    let next = pick(w, "Can't help, sorry.");
    expect(next.player.encounters.story?.beat).toBe('refused');
    quiet(next);
    next = meetAgain(next, npc.id, GAP);
    raiseCalls(next);
    expect(next.player.call).toMatchObject({ topic: 'courierCold' });
    next = pick(next, 'Understood.');
    expect(next.player.talked[npc.id]?.askAid).toBe('refused');
    expect(next.player.encounters.story?.beat).toBe('ended');
  });

  it('counts a hung up call as a refusal', () => {
    const { w, npc } = askedWorld();
    const next = hangUp(w);
    expect(next.player.encounters.story?.beat).toBe('refused');
    expect(next.player.encounters.pending).toBeNull();
    expect(next.player.talked[npc.id]?.courierShort).toBe('refused');
  });

  it('counts a call that ended unanswered as a refusal', () => {
    const { w } = askedWorld();
    w.player.call = null;
    lapseEncounter(w);
    expect(w.player.encounters.story?.beat).toBe('refused');
  });

  it('counts a deal that lapses unfulfilled as a refusal', () => {
    const { w, npc } = askedWorld();
    let next = pick(w, 'No charge.');
    quiet(next);
    for (let i = 0; i < (STATE_TURNS.aid ?? 0) + 5 && next.player.encounters.story?.beat === 'promised'; i++) {
      next = update(next, (d) => { d.player.call = null; playerVehicle(d).pos = { x: 5, y: 5 }; find(d, npc.id).pos = { x: 90, y: 90 }; });
      next = endTurn(next, testDrive);
      quiet(next);
    }
    expect(next.player.encounters.story?.beat).toBe('refused');
  });
});

describe('the courier story, a wrong done to the courier', () => {
  function helpedWorld(): { w: World; npc: Vehicle } {
    const { w, npc } = askedWorld();
    quiet(w);
    const next = meetAgain(handOver(pick(w, 'No charge.'), npc.id), npc.id, GAP);
    remember(next, find(next, npc.id), { kind: 'wronged', by: next.player.vehicleId, deed: 'attacked' });
    return { w: next, npc };
  }

  it('gives the grudge call before the thanks, and peace ends the story', () => {
    forceOption('truceOffered', 'accept');
    const { w, npc } = helpedWorld();
    raiseCalls(w);
    expect(w.player.call).toMatchObject({ topic: 'courierGrudge' });
    const next = pick(pick(w, "Let's call it even."), 'Over and out.');
    expect(stateOf(next, 'truce', npc.id, next.player.vehicleId)).not.toBeNull();
    expect(stateOf(next, 'feud', npc.id, next.player.vehicleId)).toBeNull();
    expect(next.player.encounters.story?.beat).toBe('ended');
  });

  it('starts a feud and revenge when the courier refuses to call it even', () => {
    forceOption('truceOffered', 'refuse');
    const { w, npc } = helpedWorld();
    raiseCalls(w);
    const next = pick(pick(w, "Let's call it even."), 'Then we finish this.');
    expect(stateOf(next, 'feud', npc.id, next.player.vehicleId)).not.toBeNull();
    expect(stateOf(next, 'revenge', npc.id, next.player.vehicleId)).not.toBeNull();
    expect(next.player.encounters.story?.beat).toBe('ended');
  });

  it('starts a feud and revenge when the player says bring it', () => {
    const { w, npc } = helpedWorld();
    raiseCalls(w);
    const next = pick(w, 'Bring it.');
    expect(stateOf(next, 'feud', npc.id, next.player.vehicleId)).not.toBeNull();
    expect(stateOf(next, 'revenge', npc.id, next.player.vehicleId)).not.toBeNull();
    expect(next.player.encounters.story?.beat).toBe('ended');
  });

  it('rolls no courier call toward a truck that wronged the courier', () => {
    const { w, npc } = courierWorld();
    remember(w, npc, { kind: 'wronged', by: w.player.vehicleId, deed: 'attacked' });
    expect(encounterAvailable(w, npc, 'courier')).toBe(false);
  });
});

describe('a courier on its way to refuel', () => {
  function resupplying(): { w: World; npc: Vehicle } {
    const s = courierWorld();
    s.npc.resources!.fuel = Math.floor(fuelCap(s.npc) * 0.5);
    s.npc.brain!.goals = [{ kind: 'resupply', targetId: 'bowl', destination: { x: 90, y: 90 }, phase: 'travel', reason: 'lowFuel' }];
    return s;
  }

  it('asks the player for the fuel it is short of before the pump', () => {
    const { w, npc } = resupplying();
    expect(isLow(w, npc)).toBe(false);
    expect(hasAid(wantedAid(w, npc))).toBe(false);
    expect(hasAid(wantedAid(w, npc, true))).toBe(true);
    expect(encounterAvailable(w, npc, 'courier')).toBe(true);
  });

  it('raises the first call through the turn pipeline, with one encounter event and no stall', () => {
    forceOption('strangerSeen', 'courier');
    const { w, npc } = resupplying();
    let next = w;
    for (let i = 0; i < 6 && !next.player.call; i++) {
      next = endTurn(next, testDrive);
      expect(next.events.filter((e) => e.t === 'stall')).toEqual([]);
    }
    expect(next.player.call).toMatchObject({ with: npc.id, topic: 'courierShort' });
    expect(next.player.encounters.story?.beat).toBe('asked');
    expect(next.events.filter((e) => e.t === 'encounter')).toEqual([{ t: 'encounter', vehicle: npc.id, encounter: 'courierShort' }]);
  });

  it('does not ask while it is not on the way to refuel', () => {
    const { w, npc } = resupplying();
    npc.brain!.goals = [];
    expect(encounterAvailable(w, npc, 'courier')).toBe(false);
  });
});

describe('a courier who is gone', () => {
  it('clears a running story when the courier leaves the world', () => {
    const { w, npc } = askedWorld();
    const next = pick(w, 'No charge.');
    next.vehicles = next.vehicles.filter((v) => v.id !== npc.id);
    lapseEncounter(next);
    expect(next.player.encounters.story).toBeNull();
  });

  it('keeps an ended story when the courier leaves, so it never starts again', () => {
    const { w, npc } = askedWorld();
    w.player.encounters.story!.beat = 'ended';
    w.vehicles = w.vehicles.filter((v) => v.id !== npc.id);
    lapseEncounter(w);
    expect(w.player.encounters.story?.beat).toBe('ended');
  });
});
