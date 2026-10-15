import { describe, expect, it } from 'vitest';
import { END, HUB, TOPICS, type TopicId } from '../data/dialogue';
import { ENCOUNTERS } from '../data/encounters';
import { REGION } from '../data/region';
import { SALVAGE } from '../data/salvage';
import type { TraitId } from '../data/npcs';
import { lineKey } from '../text/names';
import { entryText } from '../text/resolve';
import { playerVehicle } from './damage';
import { chooseOption, currentOptions, hangUp, raiseCalls } from './dialogue';
import { encounterAvailable, encounterOpen, lapseEncounter, onStrangerSeen, tipPrice } from './encounters';
import { remember } from './memory';
import { stateOf } from './states';
import { topGoal } from './npc-activities';
import { emptyHidden, meanLootValue } from './salvage';
import { addVehicle, emptyWorld, forceOption, npcBrain, practiceOf, rngStateForForcedRolls, startCombat } from './testkit';
import type { LineId } from '../data/dialogue';
import type { SalvageStock, Vehicle, World } from './types';
import { refreshVision } from './vision';
import { update } from './world';

const SOURCES = import.meta.glob<string>('../**/*.ts', { query: '?raw', import: 'default', eager: true });

const en = (line: LineId): string => entryText('en', lineKey(line));

function optionIndex(w: World, text: string): number {
  const i = currentOptions(w).findIndex((o) => en(o.line) === text);
  if (i < 0) throw new Error(`No option "${text}" in ${currentOptions(w).map((o) => en(o.line)).join(' | ')}`);
  return i;
}

function pick(w: World, text: string): World {
  return chooseOption(w, optionIndex(w, text));
}

function scene(traits: TraitId[], parts: string[] = ['stockEngine'], x = 36): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  w.player.discovered = [...REGION.towns, ...REGION.locations].map((s) => s.id);
  w.salvage = [];
  const npc = addVehicle(w, 'independent', 'scout', parts, { x, y: 30 });
  npc.brain = npcBrain(traits[0], npc.pos, traits);
  refreshVision(w);
  return { w, npc };
}

function knowTip(w: World, npc: Vehicle): void {
  remember(w, npc, { kind: 'prices', shop: 'salvage-yard', pressure: { scrap: -0.3, parts: 0, tools: 0 } });
}

function wreck(id: string, pos: { x: number; y: number }, full = true): SalvageStock {
  return { id, pos, radius: 0.6, goods: {}, parts: [], hidden: full ? { ...emptyHidden(), goods: { scrap: 2 } } : emptyHidden() };
}

function talesWorld(): { w: World; npc: Vehicle } {
  const s = scene(['trader']);
  knowTip(s.w, s.npc);
  forceOption('strangerSeen', 'tale');
  s.w.rngState = rngStateForForcedRolls(1);
  return s;
}

describe('the roll', () => {
  it('sets one pending encounter when a driver rolls a tale', () => {
    const { w, npc } = talesWorld();
    onStrangerSeen(w, npc);
    expect(w.player.encounters.pending).toEqual({ encounter: 'tale', driver: npc.id, until: w.turn + ENCOUNTERS.pendingTurns });
  });

  it('rolls once per sighting', () => {
    const { w, npc } = talesWorld();
    onStrangerSeen(w, npc);
    w.player.encounters.pending = null;
    onStrangerSeen(w, npc);
    expect(w.player.encounters.pending).toBeNull();
  });

  it('does not roll while a call is open', () => {
    const { w, npc } = talesWorld();
    w.player.call = { with: npc.id, topic: null, node: HUB, vars: {}, line: { line: 'goAhead', vars: {} } };
    onStrangerSeen(w, npc);
    expect(w.player.encounters.pending).toBeNull();
    expect(encounterOpen(w)).toBe(false);
  });

  it('does not roll while the player is in combat', () => {
    const { w, npc } = talesWorld();
    startCombat(w, addVehicle(w, 'scrapjaw', 'scout', [], { x: 50, y: 50 }), playerVehicle(w));
    onStrangerSeen(w, npc);
    expect(w.player.encounters.pending).toBeNull();
  });

  it('does not roll before the next turn it may', () => {
    const { w, npc } = talesWorld();
    w.player.encounters.next = w.turn + 1;
    onStrangerSeen(w, npc);
    expect(w.player.encounters.pending).toBeNull();
    w.turn += 1;
    onStrangerSeen(w, npc);
    expect(w.player.encounters.pending?.driver).toBe(npc.id);
  });

  it('does not roll while another encounter is pending', () => {
    const { w, npc } = talesWorld();
    const other = addVehicle(w, 'independent', 'scout', [], { x: 36, y: 34 });
    other.brain = npcBrain('trader', other.pos, ['trader']);
    knowTip(w, other);
    refreshVision(w);
    onStrangerSeen(w, npc);
    onStrangerSeen(w, other);
    expect(w.player.encounters.pending?.driver).toBe(npc.id);
  });

  it('does not roll on Chaos Highway', () => {
    const { w, npc } = talesWorld();
    w.setup = { ...w.setup, mode: 'furyRoad' };
    onStrangerSeen(w, npc);
    expect(w.player.encounters.pending).toBeNull();
  });

  it('lapses a pending encounter after its turns, but not during its call', () => {
    const { w, npc } = talesWorld();
    onStrangerSeen(w, npc);
    w.turn += ENCOUNTERS.pendingTurns;
    lapseEncounter(w);
    expect(w.player.encounters.pending).not.toBeNull();
    w.turn += 1;
    w.player.call = { with: npc.id, topic: 'tale', node: 'offer', vars: {}, line: { line: 'gotAStoryFrom', vars: {} } };
    lapseEncounter(w);
    expect(w.player.encounters.pending).not.toBeNull();
    w.player.call = null;
    lapseEncounter(w);
    expect(w.player.encounters.pending).toBeNull();
  });

  it('sets the next roll turn when the call is raised', () => {
    const { w, npc } = talesWorld();
    onStrangerSeen(w, npc);
    raiseCalls(w);
    expect(w.player.call).toMatchObject({ with: npc.id, topic: 'tale' });
    expect(w.player.encounters.next).toBe(w.turn + ENCOUNTERS.gapTurns);
    expect(w.events).toContainEqual({ t: 'encounter', vehicle: npc.id, encounter: 'tale' });
  });

  it('lets no file but encounters.ts write the encounter log', () => {
    const write = /\.encounters\.(?:next|pending|story)(?:\.\w+)?\s*(?:=(?!=)|\+\+|--)|\.encounters\s*=(?!=)/;
    const writers = Object.entries(SOURCES)
      .filter(([path]) => !path.endsWith('.test.ts') && path !== './encounters.ts' && path !== '../three/save-migrations.ts' && path !== './world.ts')
      .filter(([, source]) => write.test(source))
      .map(([path]) => path);
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
    expect(writers).toEqual([]);
  });
});

describe('the tale', () => {
  it('tells the freshest trade tip and ends the call', () => {
    const { w, npc } = talesWorld();
    onStrangerSeen(w, npc);
    raiseCalls(w);
    let next = pick(w, 'Go on.');
    expect(next.player.call?.node).toBe('tip');
    next = pick(next, 'Thanks. Over and out.');
    expect(next.player.call).toBeNull();
    expect(next.player.encounters.pending).toBeNull();
    expect(next.player.talked[npc.id]?.tale).toBe('done');
  });

  it('discovers a site the driver knows', () => {
    const { w, npc } = talesWorld();
    const site = REGION.locations[0];
    w.player.discovered = w.player.discovered.filter((id) => id !== site.id);
    npc.pos = { x: site.pos.x - 8, y: site.pos.y };
    playerVehicle(w).pos = { x: site.pos.x - 14, y: site.pos.y };
    refreshVision(w);
    onStrangerSeen(w, npc);
    raiseCalls(w);
    const next = pick(w, 'Go on.');
    expect(next.player.call?.node).toBe('site');
    expect(next.player.discovered).toContain(site.id);
  });

  it('ends with the driver done when the player says not now', () => {
    const { w, npc } = talesWorld();
    onStrangerSeen(w, npc);
    raiseCalls(w);
    const next = pick(w, 'Not now.');
    expect(next.player.call).toBeNull();
    expect(next.player.talked[npc.id]?.tale).toBe('refused');
    expect(next.player.encounters.pending).toBeNull();
  });

  it('is offered only to a driver with a site or a tip to give, an open personality and no earlier tale', () => {
    const { w, npc } = scene(['trader']);
    expect(encounterAvailable(w, npc, 'tale')).toBe(false);
    knowTip(w, npc);
    expect(encounterAvailable(w, npc, 'tale')).toBe(true);
    npc.brain!.personality = 'grim';
    expect(encounterAvailable(w, npc, 'tale')).toBe(false);
    npc.brain!.personality = 'talkative';
    w.player.talked[npc.id] = { tale: 'done' };
    expect(encounterAvailable(w, npc, 'tale')).toBe(false);
  });

  it('is never offered to a lawman', () => {
    const { w, npc } = scene(['lawman']);
    knowTip(w, npc);
    expect(encounterAvailable(w, npc, 'tale')).toBe(false);
  });
});

describe('the salvage tip', () => {
  function tipWorld(traits: TraitId[] = ['scavenger']): { w: World; npc: Vehicle } {
    const s = scene(traits);
    s.w.salvage = [wreck('wreck7', { x: 50, y: 30 })];
    s.w.player.money = 100000;
    forceOption('strangerSeen', 'tip');
    s.w.rngState = rngStateForForcedRolls(1);
    return s;
  }

  it('sells an honest tip for exactly the price and marks the wreck', () => {
    const { w, npc } = tipWorld();
    onStrangerSeen(w, npc);
    raiseCalls(w);
    const money = w.player.money;
    const npcMoney = npc.resources!.money;
    let next = pick(w, 'Deal.');
    const seller = next.vehicles.find((v) => v.id === npc.id)!;
    expect(next.player.money).toBe(money - tipPrice());
    expect(seller.resources!.money).toBe(npcMoney + tipPrice());
    expect(next.player.rumored).toEqual(['wreck7']);
    next = pick(next, 'Thanks. Over and out.');
    expect(next.player.call).toBeNull();
    expect(next.player.encounters.pending).toBeNull();
  });

  it('sells a scumbag lie: a wreck it stripped itself', () => {
    const { w, npc } = tipWorld(['scavenger', 'scumbag']);
    w.salvage.push(wreck('wreck9', { x: 36, y: 44 }, false));
    remember(w, npc, { kind: 'stripped', stock: 'wreck9' });
    onStrangerSeen(w, npc);
    raiseCalls(w);
    const next = pick(w, 'Deal.');
    expect(next.player.rumored).toEqual(['wreck9']);
  });

  it('keeps a scumbag honest when it has stripped nothing', () => {
    const { w, npc } = tipWorld(['scavenger', 'scumbag']);
    onStrangerSeen(w, npc);
    raiseCalls(w);
    expect(pick(w, 'Deal.').player.rumored).toEqual(['wreck7']);
  });

  it('hides the option to pay when the player cannot afford it', () => {
    const { w, npc } = tipWorld();
    onStrangerSeen(w, npc);
    raiseCalls(w);
    w.player.money = tipPrice() - 1;
    expect(currentOptions(w).map((o) => en(o.line))).toEqual(['No thanks.', 'Hang up.']);
  });

  it('moves nothing when the player declines or hangs up', () => {
    const { w, npc } = tipWorld();
    onStrangerSeen(w, npc);
    raiseCalls(w);
    const money = w.player.money;
    const declined = pick(w, 'No thanks.');
    expect(declined.player.money).toBe(money);
    expect(declined.player.rumored).toEqual([]);
    expect(declined.player.talked[npc.id]?.salvageTip).toBe('refused');
    const hung = hangUp(w);
    expect(hung.player.encounters.pending).toBeNull();
    expect(hung.player.talked[npc.id]?.salvageTip).toBe('refused');
  });

  it('prices a tip at a share of the mean road wreck loot', () => {
    expect(tipPrice()).toBe(Math.round(ENCOUNTERS.tip.valueShare * meanLootValue(SALVAGE.roadWreck)));
    expect(meanLootValue(SALVAGE.roadWreck)).toBeGreaterThan(0);
  });
});

describe('the challenge', () => {
  function challengeWorld(): { w: World; npc: Vehicle } {
    const s = scene(['scavenger'], ['stockEngine', 'mg']);
    forceOption('strangerSeen', 'challenge');
    s.w.rngState = rngStateForForcedRolls(2);
    onStrangerSeen(s.w, s.npc);
    raiseCalls(s.w);
    return s;
  }

  const feud = (w: World, npc: Vehicle) => stateOf(w, 'feud', npc.id, w.player.vehicleId);

  it('backs the driver down without a feud when the player is not looking for trouble', () => {
    const { w, npc } = challengeWorld();
    expect(w.player.call).toMatchObject({ topic: 'challenge' });
    const next = pick(w, 'Not looking for trouble.');
    expect(stateOf(next, 'backedOff', npc.id, next.player.vehicleId)).not.toBeNull();
    expect(feud(next, npc)).toBeNull();
    expect(next.player.call).toBeNull();
    expect(next.player.encounters.pending).toBeNull();
  });

  it('moves no cargo and pays Social XP when the driver complies with the threat', () => {
    forceOption('threatened', 'comply');
    const { w, npc } = challengeWorld();
    const money = w.player.money;
    const cargo = JSON.stringify(playerVehicle(w).items);
    let next = pick(w, 'Look at my guns again.');
    expect(next.player.call?.node).toBe('comply');
    expect(practiceOf(next, 'deal')).toHaveLength(1);
    next = pick(next, 'Understood.');
    expect(next.player.money).toBe(money);
    expect(JSON.stringify(playerVehicle(next).items)).toBe(cargo);
    expect(stateOf(next, 'backedOff', npc.id, next.player.vehicleId)).not.toBeNull();
    expect(feud(next, npc)).toBeNull();
  });

  it('starts a fight when the driver fights back', () => {
    forceOption('threatened', 'fightBack');
    const { w, npc } = challengeWorld();
    const next = pick(w, 'Look at my guns again.');
    expect(next.player.call?.node).toBe('fightBack');
    expect(feud(next, npc)).not.toBeNull();
    expect(topGoal(next.vehicles.find((v) => v.id === npc.id)!)).toMatchObject({ kind: 'fight', reason: 'calledOut' });
  });

  it('makes the driver run when it answers the threat with flight', () => {
    forceOption('threatened', 'flee');
    const { w, npc } = challengeWorld();
    const next = pick(w, 'Look at my guns again.');
    expect(topGoal(next.vehicles.find((v) => v.id === npc.id)!)?.kind).toBe('flee');
  });

  it('starts a feud and a fight at once when the player accepts', () => {
    const { w, npc } = challengeWorld();
    const next = pick(w, 'Let us go, then.');
    expect(feud(next, npc)).not.toBeNull();
    expect(topGoal(next.vehicles.find((v) => v.id === npc.id)!)).toMatchObject({ kind: 'fight', reason: 'calledOut' });
    expect(next.player.call).toBeNull();
  });

  it('keeps a lawman in sight out of the fight', () => {
    const { w } = challengeWorld();
    const law = addVehicle(w, 'bowl', 'scout', ['stockEngine', 'mg'], { x: 30, y: 36 });
    law.brain = npcBrain('lawman', law.pos, ['lawman']);
    refreshVision(w);
    const next = pick(w, 'Let us go, then.');
    expect(stateOf(next, 'feud', law.id, next.player.vehicleId)).toBeNull();
  });

  it('is never offered to an unarmed driver, a lawman, or a driver the player wronged', () => {
    const unarmed = scene(['scavenger']);
    expect(encounterAvailable(unarmed.w, unarmed.npc, 'challenge')).toBe(false);
    const law = scene(['lawman'], ['stockEngine', 'mg']);
    expect(encounterAvailable(law.w, law.npc, 'challenge')).toBe(false);
    const wronged = scene(['scavenger'], ['stockEngine', 'mg']);
    expect(encounterAvailable(wronged.w, wronged.npc, 'challenge')).toBe(true);
    remember(wronged.w, wronged.npc, { kind: 'wronged', by: wronged.w.player.vehicleId, deed: 'attacked' });
    expect(encounterAvailable(wronged.w, wronged.npc, 'challenge')).toBe(false);
  });
});

describe('encounter topics', () => {
  const ENCOUNTER_TOPICS: TopicId[] = ['tale', 'salvageTip', 'challenge', 'courierShort', 'courierThanks', 'courierSquare', 'courierCold', 'courierGrudge', 'courierFavor'];

  function loops(topic: (typeof TOPICS)[TopicId]): boolean {
    const walk = (node: string, path: string[]): boolean => {
      if (path.includes(node)) return true;
      return topic.nodes[node].options.some((o) => o.go !== END && o.go !== HUB && walk(o.go, [...path, node]));
    };
    return walk(topic.start, []);
  }

  it('never lead back to a node they showed', () => {
    for (const id of ENCOUNTER_TOPICS) expect(loops(TOPICS[id]), id).toBe(false);
  });

  it('are raised, never asked, and once per driver', () => {
    for (const id of ENCOUNTER_TOPICS) {
      expect(TOPICS[id].ask, id).toBeNull();
      expect(TOPICS[id].raise, id).not.toBeNull();
      expect(TOPICS[id].once, id).toBe(true);
    }
  });

  it('keep the world moving: an update with no call raises nothing when nothing is pending', () => {
    const { w } = scene(['trader']);
    const next = update(w, (d) => raiseCalls(d));
    expect(next.player.call?.topic ?? null).not.toBe('tale');
  });
});
