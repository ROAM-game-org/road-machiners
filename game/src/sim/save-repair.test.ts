import { beforeAll, describe, expect, it } from 'vitest';
import { PARTS, partDef } from '../data/parts';
import { SHOPS } from '../data/market';
import { HAULER_KIT, START_KITS } from '../data/start';
import { FIRST_NAMES, NPCS, SURNAMES } from '../data/npcs';
import { REGION } from '../data/region';
import { DECKS } from './bridge';
import { addGoods } from './inventory';
import { CONDITION } from '../data/wear';
import { PLAIN_KIT } from '../test/empty-world';
import { TEST_MAP } from '../test/map';
import { entryText } from '../text/resolve';
import { fullName } from '../text/names';
import { GOODS } from '../data/goods';
import { advanceContracts, goodStock, standingPrice } from './market';
import { haulerOf, playerVehicle } from './damage';
import { currentLine, currentOptions, talkOf } from './dialogue';
import { makePart } from './factory';
import { corePart, gridOf, mountedParts } from './grid';
import { vehicleMass } from './mass';
import { npcTraits } from './npc-decisions';
import { pendingPerkPairs, practice, skillLevel } from './progress';
import { TIME } from '../data/time';
import { repairContent } from './save-repair';
import { defaultSetup } from './settings';
import { addState, advanceStates, settleStates } from './states';
import { chaosHighwayStart } from './testkit';
import type { CallVars, GridItem, NpcState, Vehicle, World } from './types';
import { maxHp, restorePart } from './wear';
import { cloneWorld, endTurn, newWorld } from './world';

let base: World;

beforeAll(() => {
  base = newWorld(1, PLAIN_KIT, TEST_MAP, defaultSetup('roaming'));
});

function fresh(): World {
  return cloneWorld(base);
}

function npcs(w: World): Vehicle[] {
  return w.vehicles.filter((v) => v.brain !== null);
}

function partItem(id: string, defId: string, x = 0, y = 0): GridItem {
  return { id: `i-${id}`, kind: 'part', x, y, rot: 0, part: { id: `p-${id}`, defId, hp: 10, wear: 0 } };
}

function partOf(v: Vehicle, defId: string): Extract<GridItem, { kind: 'part' }> {
  const item = v.items.find((it): it is Extract<GridItem, { kind: 'part' }> => it.kind === 'part' && it.part.defId === defId);
  if (!item) throw new Error(`${v.id} has no ${defId}`);
  return item;
}


describe('repairContent', () => {
  it('leaves a world with no drift alone', () => {
    const w = fresh();
    const before = cloneWorld(w);
    repairContent(w);
    expect(w).toEqual(before);
  });

  it('drops a retired Cannibal pick and reopens the Machining 2 pair without awarding anything', () => {
    const w = fresh();
    w.player.ranks.machining = 2;
    w.player.perks = ['cannibal' as never];
    const money = w.player.money;
    const xp = w.player.xp;
    repairContent(w);
    expect(w.player.perks).toEqual([]);
    expect(pendingPerkPairs(w).some((pair) => pair.perks.includes('teardown'))).toBe(true);
    expect([w.player.money, w.player.xp]).toEqual([money, xp]);
  });

  it('leaves a Chaos Highway world with no drift alone', () => {
    const w = chaosHighwayStart();
    const before = cloneWorld(w);
    repairContent(w);
    expect(w).toEqual(before);
  });

  it('drops parts, goods and chassis that left the data, from every container', () => {
    const w = fresh();
    const me = playerVehicle(w);
    me.items.push(partItem('ghost', 'ghostPart', 20, 20), { id: 'i-gg', kind: 'good', x: 21, y: 21, rot: 0, good: 'ghostGood' });
    const npc = npcs(w)[0];
    npc.items.push(partItem('npcGhost', 'ghostNpcPart', 30, 30));
    w.player.storage.push({ id: 'p-store', defId: 'ghostStored', hp: 1, wear: 0 });
    w.salvage[0].parts.push({ id: 'p-salvage', defId: 'ghostSalvaged', hp: 1, wear: 0 });
    w.salvage[0].goods.ghostCrate = 3;
    w.shops.bowl.stock.push({ id: 'p-shop', defId: 'ghostSold', hp: 1, wear: 0 });
    w.player.costBasis.ghostCrate = 5;
    expect(() => vehicleMass(me)).toThrow();

    repairContent(w);

    expect(npc.items.some((it) => it.kind === 'part' && it.part.defId === 'ghostNpcPart')).toBe(false);
    expect(w.salvage[0].parts.some((p) => p.defId === 'ghostSalvaged')).toBe(false);
    expect(w.shops.bowl.stock.some((p) => p.defId === 'ghostSold')).toBe(false);
    expect(me.items.some((it) => (it.kind === 'part' && it.part.defId === 'ghostPart') || (it.kind === 'good' && it.good === 'ghostGood'))).toBe(false);
    expect(w.player.storage.some((p) => p.defId === 'ghostStored')).toBe(false);
    expect(w.salvage[0].goods.ghostCrate).toBeUndefined();
    expect(w.player.costBasis.ghostCrate).toBeUndefined();
    for (const v of w.vehicles) expect(() => vehicleMass(v)).not.toThrow();
  });

  it('gives the player truck the start chassis and keeps its parts, goods and parcels', () => {
    const w = fresh();
    const me = playerVehicle(w);
    const spares = me.items.filter((it) => it.kind === 'part' && partDef(it.part.defId).kind !== 'core');
    const crates = me.items.filter((it) => it.kind === 'good').length;
    const storedBefore = w.player.storage.length;
    me.chassisId = 'ghostChassis';
    expect(() => gridOf(me)).toThrow();

    repairContent(w);

    expect(me.chassisId).toBe(START_KITS.standard.chassis);
    const mounted = me.items.filter((it) => spares.includes(it));
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length + w.player.storage.length - storedBefore).toBe(spares.length);
    expect(me.items.filter((it) => it.kind === 'good')).toHaveLength(crates);
    expect(() => corePart(me, 'transmission')).not.toThrow();
    expect(() => vehicleMass(me)).not.toThrow();
  });

  it('gives the hauler the hauler chassis', () => {
    const w = chaosHighwayStart();
    const hauler = haulerOf(w);
    hauler.chassisId = 'ghostChassis';

    repairContent(w);
    expect(hauler.chassisId).toBe(HAULER_KIT.chassis);
    expect(() => corePart(hauler, 'transmission')).not.toThrow();
  });

  it('removes an NPC whose chassis is gone and settles the states that name it', () => {
    const w = fresh();
    const npc = npcs(w)[0];
    const me = playerVehicle(w);
    npc.chassisId = 'ghostChassis';
    addState(w, 'tow', npc.id, me.id, { kind: 'tow', site: 'bowl', fee: 100, waived: 0, hitched: true });
    addState(w, 'escort', me.id, npc.id, { kind: 'escort', site: null, fee: 0 });
    addState(w, 'patch', npc.id, me.id, { kind: 'patch', deal: 'free', parts: 0, partIds: [], price: 0, work: 1, workLeft: 1 } as never);
    w.player.call = { with: npc.id, topic: null, node: 'hub', vars: {}, line: { line: 'talk', vars: {} } };

    repairContent(w);
    expect(w.vehicles.some((v) => v.id === npc.id)).toBe(false);
    expect(w.states.some((s) => s.holder === npc.id || s.other === npc.id)).toBe(false);
    expect(w.player.call).toBeNull();
    expect(() => advanceStates(w)).not.toThrow();
    expect(() => advanceContracts(w)).not.toThrow();
  });

  it('moves parts that no longer fit to storage for the player and drops them for an NPC', () => {
    const w = fresh();
    const me = playerVehicle(w);
    const transmission = partOf(me, 'transmission');
    transmission.part.hp = 7;
    transmission.x = -5;
    transmission.y = -5;
    const spare = partItem('spare', 'cage', 90, 90);
    me.items.push(spare);
    const npc = npcs(w).find((v) => v.items.some((it) => it.kind === 'part' && partDef(it.part.defId).kind === 'weapon'))!;
    const gun = npc.items.find((it) => it.kind === 'part' && partDef(it.part.defId).kind === 'weapon')!;
    gun.x = 90;
    gun.y = 90;
    expect(() => corePart(me, 'transmission')).toThrow(/mounted transmission/);

    repairContent(w);
    expect(() => corePart(me, 'transmission')).not.toThrow();
    expect(corePart(me, 'transmission').hp).toBe(7);
    expect(me.items.includes(spare)).toBe(false);
    expect(w.player.storage.some((p) => p.id === 'p-spare')).toBe(true);
    expect(npc.items.includes(gun)).toBe(false);
    expect(w.vehicles.includes(npc)).toBe(true);
  });

  it('removes an NPC whose core part is out of place', () => {
    const w = fresh();
    const npc = npcs(w)[0];
    const transmission = partOf(npc, (corePart(npc, 'transmission')).defId);
    transmission.x = -5;
    transmission.y = -5;
    expect(() => corePart(npc, 'transmission')).toThrow(/mounted transmission/);

    repairContent(w);
    expect(w.vehicles.includes(npc)).toBe(false);
  });

  it('clamps hp, wear, ammo and charge to the current maximum', () => {
    const w = fresh();
    const me = playerVehicle(w);
    const gun = mountedParts(me, 'weapon')[0];
    const utility = makePart(w, Object.values(PARTS).find((d) => d.kind === 'utility' && d.reload !== null)!.id, 0);
    w.player.storage.push(utility);
    gun.hp = 100000;
    gun.wear = 99;
    gun.gun!.ammo = 999;
    utility.charge!.reload = 999;
    expect(() => restorePart(gun, maxHp(gun))).toThrow(/would lower/);

    repairContent(w);

    expect(gun.wear).toBe(CONDITION.maxWear + 1);
    expect(gun.hp).toBe(maxHp(gun));
    expect(gun.gun!.ammo).toBe((partDef(gun.defId) as { magazine: number }).magazine);
    expect(utility.charge!.reload).toBeLessThan(999);
    expect(() => restorePart(gun, maxHp(gun))).not.toThrow();
  });

  it('keeps a part that is down at zero hp', () => {
    const w = fresh();
    const gun = mountedParts(playerVehicle(w), 'weapon')[0];
    gun.hp = 0;
    repairContent(w);
    expect(gun.hp).toBe(0);
  });

  it('adds a missing good at zero stock and rebuilds shops that left the save, and drops shops that left the data', () => {
    const w = fresh();
    const good = SHOPS.bowl.goods[0];
    delete w.shops.bowl.goods[good];
    delete w.shops.dustwell;
    w.shops.ghostShop = cloneWorld(w).shops.bowl;
    expect(() => goodStock(w.shops.bowl, good)).toThrow();

    repairContent(w);
    expect(goodStock(w.shops.bowl, good)).toBe(0);
    expect(w.shops.ghostShop).toBeUndefined();
    expect(Object.keys(w.shops).sort()).toEqual(Object.keys(SHOPS).sort());
    expect(w.shops.dustwell.stock.length).toBeGreaterThan(0);
    expect(Object.keys(w.shops.dustwell.goods).sort()).toEqual([...SHOPS.dustwell.goods].sort());
  });

  it('removes NPCs whose template, trait or personality is gone', () => {
    const w = fresh();
    const [a, b, c] = npcs(w);
    a.brain!.templateId = 'ghostTemplate';
    b.brain!.traits = ['ghostTrait' as never];
    c.brain!.personality = 'ghostPersonality' as never;
    addState(w, 'feud', a.id, playerVehicle(w).id, { kind: 'feud', robbery: false });
    expect(() => npcTraits(b)).toThrow();

    repairContent(w);
    expect(w.vehicles.some((v) => [a, b, c].some((gone) => gone.id === v.id))).toBe(false);
    expect(w.states.some((s) => s.holder === a.id)).toBe(false);
    for (const npc of npcs(w)) {
      expect(() => npcTraits(npc)).not.toThrow();
      expect(() => talkOf(npc)).not.toThrow();
    }
  });

  it('removes an NPC with any trait or faction that left the data, since its services rest on them', () => {
    const w = fresh();
    const [a, b] = npcs(w);
    a.brain!.traits.push('ghostTrait' as never);
    b.faction = 'ghostFaction' as never;

    repairContent(w);
    expect(w.vehicles.some((v) => v.id === a.id || v.id === b.id)).toBe(false);
    expect(() => endTurn(w, () => {})).not.toThrow();
  });

  it('pays a met contract whose shop left the data, and ends an escort whose shop left', () => {
    const w = fresh();
    const [client] = npcs(w);
    const me = playerVehicle(w);
    const survey = { id: 'c-done', shop: 'ghostShop', kind: 'survey', points: [{ site: REGION.towns[0].id, found: true, done: true }], reward: 900, deadline: w.turn + 20, window: 20, tier: 'low' } as const;
    const escort = { id: 'c-esc', shop: 'ghostShop', kind: 'escort', client: client.id, to: REGION.towns[0].id, reward: 500, deadline: w.turn + 20, window: 20, tier: 'low', threat: 'low', span: 10, together: 0, seen: null, apart: 0, stuck: 0, holdUntil: null } as const;
    w.player.contracts.push(survey as never, escort as never);
    addState(w, 'escort', me.id, client.id, { kind: 'escort', site: REGION.towns[0].id, fee: 0 });
    const money = w.player.money;

    repairContent(w);
    expect(w.player.money).toBe(money + 900);
    expect(w.player.contracts.some((c) => c.id === 'c-done' || c.id === 'c-esc')).toBe(false);
    expect(w.states.some((s) => s.kind === 'escort' && s.holder === me.id && s.other === client.id)).toBe(false);
    expect(() => endTurn(w, () => {})).not.toThrow();
  });

  it('drops a trade goal that buys a good at a shop that no longer trades it', () => {
    const w = fresh();
    const npc = npcs(w)[0];
    const untraded = Object.keys(GOODS).find((good) => !SHOPS.bowl.goods.includes(good))!;
    const traded = SHOPS.bowl.goods[0];
    const trade = (good: string) => ({ kind: 'trade', targetId: 'bowl', destination: null, phase: 'travel', reason: 'trade', purchase: { good, sellShop: 'dustwell' } }) as never;
    npc.brain!.goals = [trade(untraded), trade(traded)];

    repairContent(w);
    expect(npc.brain!.goals.map((g) => g.purchase!.good)).toEqual([traded]);
  });

  it('gives a driver outside the name lists a new name picked from the vehicle id', () => {
    const w = fresh();
    const [a, b] = npcs(w);
    a.brain!.driver = 'Nameless';
    b.brain!.driver = 'Ghost Name Extra';
    w.player.encounters.pending = { encounter: 'tale', driver: a.id, until: 9 };
    expect(() => fullName(a.brain!.driver)).toThrow();
    const twin = cloneWorld(w);

    repairContent(w);
    repairContent(twin);

    for (const v of [a, b]) {
      const [first, last] = v.brain!.driver.split(' ');
      expect(FIRST_NAMES).toContain(first);
      expect(SURNAMES).toContain(last);
      expect(() => fullName(v.brain!.driver)).not.toThrow();
    }
    expect(w.player.encounters.pending!.driver).toBe(a.id);
    expect(twin.vehicles.find((v) => v.id === a.id)!.brain!.driver).toBe(a.brain!.driver);
    expect(new Set(npcs(w).map((v) => v.brain!.driver)).size).toBe(npcs(w).length);
  });

  it('drops notes without a catalog entry and gives a missing skill rank 0', () => {
    const w = fresh();
    w.player.notes.push({ id: 'ghostNote' as never, turn: 1 });
    delete (w.player.ranks as Partial<typeof w.player.ranks>).perception;
    expect(() => entryText('en', 'journalNote.ghostNote.title')).toThrow();
    expect(Number.isFinite(skillLevel(w, 'perception'))).toBe(false);

    repairContent(w);

    expect(w.player.notes).toEqual([]);
    expect(w.player.ranks.perception).toBe(0);
    expect(Number.isFinite(skillLevel(w, 'perception'))).toBe(true);
  });

  it('closes an open call whose topic, node or line is gone', () => {
    const drift: [string, Partial<NonNullable<World['player']['call']>>][] = [
      ['ghostTopic', { topic: 'ghostTopic' as never }],
      ['ghostNode', { topic: 'directions', node: 'ghostNode' }],
      ['ghostLine', { line: { line: 'ghostLine' as never, vars: {} } }],
      ['removedRaiderLesson', { line: { line: 'lessonRaiderPay' as never, vars: {} } }],
    ];
    for (const [, over] of drift) {
      const w = fresh();
      const npc = npcs(w)[0];
      w.player.call = { with: npc.id, topic: null, node: 'hub', vars: {}, line: { line: 'talk', vars: {} }, ...over };
      if (over.topic) expect(() => currentOptions(w)).toThrow();
      if (over.topic) expect(() => currentLine(w)).toThrow();

      repairContent(w);
      expect(w.player.call).toBeNull();
    }
  });

  it('closes an open call whose vars name a good, site or driver that left the data', () => {
    const vars: CallVars[] = [
      { haul: { kind: 'haul', goods: { ghostGood: 2 }, parts: [] } },
      { at: { kind: 'site', id: 'ghost-camp' } },
      { who: { kind: 'sighting', driver: 'Retired Name', seen: null } },
      { way: { kind: 'directions', steps: [{ do: 'turn', side: 'left', at: { kind: 'site', id: 'ghost-camp' }, road: { kind: 'heading', octant: 'north' }, span: 'near' }] } },
      { way: { kind: 'directions', steps: [{ do: 'leave', at: { kind: 'deck', id: 'ghost-deck' }, octant: 'north', lean: null, span: 'near' }] } },
      { way: { kind: 'directions', steps: [{ do: 'search', clue: { kind: 'site', id: 'ghost-camp' }, rough: false }] } },
      { square: { kind: 'square', column: 8, row: 0 } },
    ];
    for (const v of vars) {
      const w = fresh();
      w.player.call = { with: npcs(w)[0].id, topic: null, node: 'hub', vars: {}, line: { line: 'talk', vars: v } };
      repairContent(w);
      expect(w.player.call).toBeNull();
    }
  });

  it('keeps a call that still fits', () => {
    const w = fresh();
    const npc = npcs(w)[0];
    const site = REGION.towns[0].id;
    const way: CallVars = { way: { kind: 'directions', steps: [
      { do: 'turn', side: 'left', at: { kind: 'site', id: site }, road: { kind: 'to', site }, span: 'near' },
      { do: 'leave', at: { kind: 'deck', id: DECKS[0].id }, octant: 'north', lean: null, span: 'near' },
      { do: 'search', clue: { kind: 'site', id: site }, rough: false },
    ] }, square: { kind: 'square', column: 7, row: 0 } };
    w.player.call = { with: npc.id, topic: null, node: 'hub', vars: {}, line: { line: 'talk', vars: way } };
    repairContent(w);
    expect(w.player.call).not.toBeNull();
  });

  it('drops states of a kind that left the data', () => {
    const w = fresh();
    const [a, b] = npcs(w);
    const ghost: NpcState = { id: 'state-ghost', kind: 'ghostKind' as never, holder: a.id, other: b.id, turnsLeft: 5, born: -1, data: { kind: 'none' } };
    w.states.push(ghost);
    expect(() => advanceStates(w)).toThrow(/Unknown state kind/);

    repairContent(w);
    expect(w.states.includes(ghost)).toBe(false);
    expect(() => advanceStates(w)).not.toThrow();
  });

  it('forgets remembered prices of goods a shop no longer trades and of shops that left the data', () => {
    const w = fresh();
    const npc = npcs(w)[0];
    const traded = SHOPS.dustwell.goods[0];
    const untraded = Object.keys(GOODS).find((good) => !SHOPS.dustwell.goods.includes(good))!;
    npc.brain!.memories.push(
      { turn: w.turn, fact: { kind: 'prices', shop: 'dustwell', pressure: { [traded]: 0.1, [untraded]: 0.2 } } },
      { turn: w.turn, fact: { kind: 'prices', shop: 'ghostShop', pressure: { [traded]: 0.1 } } },
    );
    expect(() => standingPrice('dustwell', untraded, 0.2)).toThrow(/does not trade/);

    repairContent(w);

    const prices = npc.brain!.memories.flatMap((m) => (m.fact.kind === 'prices' ? [m.fact] : []));
    expect(prices.some((fact) => fact.shop === 'ghostShop')).toBe(false);
    expect(prices.find((fact) => fact.shop === 'dustwell')!.pressure).toEqual({ [traded]: 0.1 });
  });

  it('drops the XP tallies of an XP source that left the data, so the next game day starts clean', () => {
    const w = fresh();
    (w.player.xpBySource as Record<string, number>).ghostSource = 4;
    w.player.repeats['ghostSource:10,23'] = { count: 2, turn: w.turn };
    const kept = { ...w.player.repeats };

    repairContent(w);
    expect(w.player.xpBySource).not.toHaveProperty('ghostSource');
    expect(w.player.repeats).toEqual(Object.fromEntries(Object.entries(kept).filter(([key]) => !key.startsWith('ghostSource'))));
    w.turn += TIME.turnsPerDay;
    expect(() => practice(w, 'contract', 10, null, 'bowl')).not.toThrow();
  });

  it('drops perks that left the data and gives a missing skill its xp of the day', () => {
    const w = fresh();
    w.player.perks.push('ghostPerk' as never);
    delete (w.player.xpToday as Partial<typeof w.player.xpToday>).perception;

    repairContent(w);
    expect(w.player.perks).not.toContain('ghostPerk');
    expect(w.player.xpToday.perception).toBe(0);
  });

  it('drops player contracts whose shop or destination left the data', () => {
    const w = fresh();
    const good = SHOPS.bowl.goods[0];
    const haul = { id: 'c-haul', shop: 'bowl', kind: 'haul', good, units: 2, to: 'ghostTown', reward: 10, deadline: w.turn + 20, window: 20, rush: false, tier: 'low' } as const;
    const order = { id: 'c-procure', shop: 'ghostShop', kind: 'procure', good, units: 3, cratePay: 10, reward: 40, deadline: w.turn + 20, window: 20, tier: 'low' } as const;
    w.player.contracts.push(haul as never, order as never);

    repairContent(w);
    expect(w.player.contracts.some((c) => c.id === 'c-haul' || c.id === 'c-procure')).toBe(false);
    expect(() => advanceContracts(w)).not.toThrow();
  });

  it('ends the survey job of a survey contract whose shop left the data', () => {
    const w = fresh();
    const survey = { id: 'c-survey', shop: 'ghostShop', kind: 'survey', points: [{ site: 'x', found: false, done: false }], reward: 10, deadline: w.turn + 20, window: 20, tier: 'low' } as const;
    w.player.contracts.push(survey as never);
    playerVehicle(w).job = { kind: 'survey', contractId: 'c-survey', site: 'x', turnsLeft: 2, total: 3 };

    repairContent(w);
    expect(playerVehicle(w).job).toBeNull();
  });

  it('clears a site event whose definition left the data', () => {
    const w = fresh();
    w.shops.bowl.event = { kind: 'breakdown', recipe: 'ghostRecipe', until: w.turn + 30 };

    repairContent(w);
    expect(w.shops.bowl.event).toBeNull();
  });

  it('drops NPC goals aimed at a site that left the data and keeps goals aimed at live trucks', () => {
    const w = fresh();
    const [a, b] = npcs(w);
    const gone = { kind: 'travel', targetId: 'ghost-camp', destination: { x: 10, y: 10 }, phase: 'travel', reason: 'trade' } as const;
    const live = { kind: 'follow', targetId: b.id, destination: null, phase: 'travel', reason: 'trade' } as const;
    a.brain!.goals = [gone as never, live as never];

    repairContent(w);
    expect(a.brain!.goals.map((g) => g.targetId)).toEqual([b.id]);
  });

  it('ends tow states and business jobs that name a site that left the data', () => {
    const w = fresh();
    const [a, b] = npcs(w);
    const me = playerVehicle(w);
    addState(w, 'tow', me.id, a.id, { kind: 'tow', site: 'ghost-camp', fee: 0, waived: 0, hitched: true });
    a.brain!.goals = [{ kind: 'tow', targetId: 'ghost-camp', destination: { x: 10, y: 10 }, phase: 'travel', reason: 'towPlayer' }];
    b.job = { kind: 'business', siteId: 'ghost-camp', deal: 'sell', turnsLeft: 2, total: 3 };
    expect(() => settleStates(cloneWorld(w))).toThrow(/Unknown site/);

    repairContent(w);
    expect(w.states.some((s) => s.kind === 'tow' && s.holder === me.id)).toBe(false);
    expect(a.brain!.goals).toEqual([]);
    expect(b.job).toBeNull();
    expect(() => settleStates(w)).not.toThrow();
  });

  it('gives a stranded parcel room before goods, and sells the goods that no longer fit', () => {
    const w = fresh();
    const me = playerVehicle(w);
    const good = SHOPS.bowl.goods[0];
    addGoods(w, me, good, 999);
    const crates = me.items.filter((it) => it.kind === 'good').length;
    const money = w.player.money;
    const search = { id: 'c-search', shop: 'bowl', kind: 'search', target: 'v-x', driver: 'x', template: Object.keys(NPCS)[0], lead: { at: { x: 1, y: 1 }, turn: 0 }, reward: 5, deadline: w.turn + 20, window: 20, tier: 'low', delivered: false } as const;
    w.player.contracts.push(search as never);
    me.items.push({ id: 'i-parcel', x: 999, y: 999, rot: 0, kind: 'parcel', contract: 'c-search' });

    repairContent(w);

    const units = crates - me.items.filter((it) => it.kind === 'good').length;
    expect(units).toBeGreaterThan(0);
    expect(w.player.money).toBe(money + units * GOODS[good].value);
    expect(me.items.some((it) => it.kind === 'parcel' && it.contract === 'c-search')).toBe(true);
  });

  it('sells the goods a removed rack held when the rest of the cargo is full', () => {
    const w = fresh();
    const me = playerVehicle(w);
    const good = SHOPS.bowl.goods[0];
    addGoods(w, me, good, 999);
    const crates = me.items.filter((it) => it.kind === 'good').length;
    const money = w.player.money;
    const rack = me.items.find((it) => it.kind === 'part' && partDef(it.part.defId).kind === 'cargo');
    if (!rack || rack.kind !== 'part') throw new Error('The start truck has no cargo part to remove');
    rack.part.defId = 'ghostRack';

    repairContent(w);

    const units = crates - me.items.filter((it) => it.kind === 'good').length;
    expect(units).toBeGreaterThan(0);
    expect(w.player.money).toBe(money + units * GOODS[good].value);
  });

  it('breaks an escort bound for a site that left the data', () => {
    const w = fresh();
    const [a, b] = npcs(w);
    addState(w, 'escort', a.id, b.id, { kind: 'escort', site: 'ghostTown', fee: 0 });
    expect(() => settleStates(cloneWorld(w))).toThrow(/Unknown site/);

    repairContent(w);
    expect(w.states.some((s) => s.kind === 'escort' && s.holder === a.id)).toBe(false);
    expect(() => settleStates(w)).not.toThrow();
  });

  it('drops NPC goals and road news that name a good or shop that left the data', () => {
    const w = fresh();
    const npc = npcs(w)[0];
    const good = SHOPS.bowl.goods[0];
    const goal = { kind: 'trade', targetId: null, destination: null, phase: 'travel', reason: 'trade', shipment: { good: 'ghostGood', from: 'bowl', to: 'dustwell' } } as const;
    npc.brain!.goals.unshift(goal as never);
    w.roadNews.push({ turn: w.turn, kind: 'robbed', good: 'ghostGood', units: 1, from: 'bowl', to: 'dustwell' }, { turn: w.turn, kind: 'robbed', good, units: 1, from: 'ghostShop', to: 'dustwell' }, { turn: w.turn, kind: 'robbed', good, units: 1, from: 'bowl', to: 'dustwell' });

    repairContent(w);
    expect(npc.brain!.goals.some((g) => g.shipment?.good === 'ghostGood')).toBe(false);
    expect(w.roadNews).toEqual([{ turn: w.turn, kind: 'robbed', good, units: 1, from: 'bowl', to: 'dustwell' }]);
  });

  it('drops wave templates that left the data, and an emptied wave never spawns', () => {
    const w = chaosHighwayStart();
    const [first, second] = w.chaosHighway!.groups.filter((g) => !g.spawned);
    const kept = first.templates[0];
    first.templates = [kept, 'ghostRaider'];
    second.templates = ['ghostRaider'];

    repairContent(w);
    expect(first.templates).toEqual([kept]);
    expect(second.spawned).toBe(true);
  });
});
