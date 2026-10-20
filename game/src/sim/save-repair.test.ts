import { beforeAll, describe, expect, it } from 'vitest';
import { PARTS, partDef } from '../data/parts';
import { SHOPS } from '../data/market';
import { HAULER_KIT, START_KITS } from '../data/start';
import { FIRST_NAMES, NPCS, SURNAMES } from '../data/npcs';
import { addGoods } from './inventory';
import { fuelCap, suppliesCap } from './stats';
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
import { skillLevel } from './progress';
import { repairContent } from './save-repair';
import { defaultSetup } from './settings';
import { addState, advanceStates, settleStates } from './states';
import { furyRoadStart } from './testkit';
import type { GridItem, NpcState, Vehicle, World } from './types';
import { maxHp, restorePart } from './wear';
import { cloneWorld, newWorld } from './world';

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

function sorted(ids: string[]): string[] {
  return [...ids].sort();
}

describe('repairContent', () => {
  it('leaves a world with no drift alone and returns nothing', () => {
    const w = fresh();
    const before = cloneWorld(w);
    expect(repairContent(w)).toEqual([]);
    expect(w).toEqual(before);
  });

  it('leaves a Chaos Highway world with no drift alone', () => {
    const w = furyRoadStart();
    const before = cloneWorld(w);
    expect(repairContent(w)).toEqual([]);
    expect(w).toEqual(before);
  });

  it('drops parts, goods and chassis that left the data, from every container, and lists only what the player held', () => {
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

    const lost = repairContent(w);

    expect(sorted(lost)).toEqual(sorted(['ghostPart', 'ghostGood', 'ghostStored']));
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

    const lost = repairContent(w);

    expect(lost).toEqual(['ghostChassis']);
    expect(me.chassisId).toBe(START_KITS.standard.chassis);
    expect(w.player.storage).toHaveLength(storedBefore + spares.length);
    expect(me.items.filter((it) => it.kind === 'good')).toHaveLength(crates);
    expect(() => corePart(me, 'transmission')).not.toThrow();
    expect(() => vehicleMass(me)).not.toThrow();
  });

  it('gives the hauler the hauler chassis', () => {
    const w = furyRoadStart();
    const hauler = haulerOf(w);
    hauler.chassisId = 'ghostChassis';

    expect(repairContent(w)).toEqual(['ghostChassis']);
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

    expect(repairContent(w)).toEqual([]);
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

    expect(repairContent(w)).toEqual([]);
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

    expect(repairContent(w)).toEqual([]);
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

    expect(repairContent(w)).toEqual([]);

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

    expect(repairContent(w)).toEqual([]);
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

    expect(repairContent(w)).toEqual([]);
    expect(w.vehicles.some((v) => [a, b, c].some((gone) => gone.id === v.id))).toBe(false);
    expect(w.states.some((s) => s.holder === a.id)).toBe(false);
    for (const npc of npcs(w)) {
      expect(() => npcTraits(npc)).not.toThrow();
      expect(() => talkOf(npc)).not.toThrow();
    }
  });

  it('drops a removed trait and keeps the NPC when it has others', () => {
    const w = fresh();
    const npc = npcs(w).find((v) => v.brain!.traits.length > 0)!;
    const traits = [...npc.brain!.traits];
    npc.brain!.traits.push('ghostTrait' as never);

    expect(repairContent(w)).toEqual([]);
    expect(npc.brain!.traits).toEqual(traits);
    expect(w.vehicles).toContain(npc);
  });

  it('lapses a held bounty whose last target the repair removes, with the event the report shows', () => {
    const w = fresh();
    const npc = npcs(w)[0];
    const template = npc.brain!.templateId;
    for (const v of npcs(w)) if (v.brain!.templateId === template) v.chassisId = 'ghostChassis';
    w.player.contracts.push({ id: 'c-bounty', shop: 'bowl', kind: 'bounty', template, reward: 10, deadline: w.turn + 20, window: 20, tier: 'low', fulfilled: false } as never);

    expect(repairContent(w)).toEqual([]);
    expect(w.player.contracts.some((c) => c.id === 'c-bounty')).toBe(false);
    expect(w.events.flatMap((e) => (e.t === 'contract' ? [[e.contract.id, e.outcome]] : []))).toEqual([['c-bounty', 'lapsed']]);
  });

  it('drops a trade goal that buys a good at a shop that no longer trades it', () => {
    const w = fresh();
    const npc = npcs(w)[0];
    const untraded = Object.keys(GOODS).find((good) => !SHOPS.bowl.goods.includes(good))!;
    const traded = SHOPS.bowl.goods[0];
    const trade = (good: string) => ({ kind: 'trade', targetId: 'bowl', destination: null, phase: 'travel', reason: 'trade', purchase: { good, sellShop: 'dustwell' } }) as never;
    npc.brain!.goals = [trade(untraded), trade(traded)];

    expect(repairContent(w)).toEqual([]);
    expect(npc.brain!.goals.map((g) => g.purchase!.good)).toEqual([traded]);
  });

  it('clamps fuel and supplies to the tank and the crates', () => {
    const w = fresh();
    const me = playerVehicle(w);
    w.player.fuel = fuelCap(me) + 100;
    w.player.supplies = suppliesCap(me) + 100;

    expect(repairContent(w)).toEqual([]);
    expect([w.player.fuel, w.player.supplies]).toEqual([fuelCap(me), suppliesCap(me)]);
  });

  it('gives a driver outside the name lists a new name picked from the vehicle id', () => {
    const w = fresh();
    const [a, b] = npcs(w);
    a.brain!.driver = 'Nameless';
    b.brain!.driver = 'Ghost Name Extra';
    w.player.encounters.pending = { encounter: 'tale', driver: a.id, until: 9 };
    expect(() => fullName(a.brain!.driver)).toThrow();
    const twin = cloneWorld(w);

    expect(repairContent(w)).toEqual([]);
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

    const lost = repairContent(w);

    expect(lost).toEqual(['ghostNote']);
    expect(w.player.notes).toEqual([]);
    expect(w.player.ranks.perception).toBe(0);
    expect(Number.isFinite(skillLevel(w, 'perception'))).toBe(true);
  });

  it('closes an open call whose topic, node or line is gone', () => {
    const drift: [string, Partial<NonNullable<World['player']['call']>>][] = [
      ['ghostTopic', { topic: 'ghostTopic' as never }],
      ['ghostNode', { topic: 'directions', node: 'ghostNode' }],
      ['ghostLine', { line: { line: 'ghostLine' as never, vars: {} } }],
    ];
    for (const [, over] of drift) {
      const w = fresh();
      const npc = npcs(w)[0];
      w.player.call = { with: npc.id, topic: null, node: 'hub', vars: {}, line: { line: 'talk', vars: {} }, ...over };
      if (over.topic) expect(() => currentOptions(w)).toThrow();
      if (over.topic) expect(() => currentLine(w)).toThrow();

      expect(repairContent(w)).toEqual([]);
      expect(w.player.call).toBeNull();
    }
  });

  it('keeps a call that still fits', () => {
    const w = fresh();
    const npc = npcs(w)[0];
    w.player.call = { with: npc.id, topic: null, node: 'hub', vars: {}, line: { line: 'talk', vars: {} } };
    expect(repairContent(w)).toEqual([]);
    expect(w.player.call).not.toBeNull();
  });

  it('drops states of a kind that left the data', () => {
    const w = fresh();
    const [a, b] = npcs(w);
    const ghost: NpcState = { id: 'state-ghost', kind: 'ghostKind' as never, holder: a.id, other: b.id, turnsLeft: 5, born: -1, data: { kind: 'none' } };
    w.states.push(ghost);
    expect(() => advanceStates(w)).toThrow(/Unknown state kind/);

    expect(repairContent(w)).toEqual([]);
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

    expect(repairContent(w)).toEqual([]);

    const prices = npc.brain!.memories.flatMap((m) => (m.fact.kind === 'prices' ? [m.fact] : []));
    expect(prices.some((fact) => fact.shop === 'ghostShop')).toBe(false);
    expect(prices.find((fact) => fact.shop === 'dustwell')!.pressure).toEqual({ [traded]: 0.1 });
  });

  it('drops perks that left the data, lists them, and gives a missing skill its xp of the day', () => {
    const w = fresh();
    w.player.perks.push('ghostPerk' as never);
    delete (w.player.xpToday as Partial<typeof w.player.xpToday>).perception;

    expect(repairContent(w)).toEqual(['ghostPerk']);
    expect(w.player.perks).not.toContain('ghostPerk');
    expect(w.player.xpToday.perception).toBe(0);
  });

  it('drops player contracts whose shop or destination left the data, and lists the place', () => {
    const w = fresh();
    const good = SHOPS.bowl.goods[0];
    const haul = { id: 'c-haul', shop: 'bowl', kind: 'haul', good, units: 2, to: 'ghostTown', reward: 10, deadline: w.turn + 20, window: 20, rush: false, tier: 'low' } as const;
    const fetch = { id: 'c-fetch', shop: 'ghostShop', kind: 'fetch', defId: Object.keys(PARTS)[0], reward: 10, deadline: w.turn + 20, window: 20, tier: 'low' } as const;
    w.player.contracts.push(haul as never, fetch as never);

    expect(sorted(repairContent(w))).toEqual(['ghostShop', 'ghostTown']);
    expect(w.player.contracts.some((c) => c.id === 'c-haul' || c.id === 'c-fetch')).toBe(false);
    expect(() => advanceContracts(w)).not.toThrow();
  });

  it('clears a site event whose definition left the data', () => {
    const w = fresh();
    w.shops.bowl.event = { kind: 'breakdown', recipe: 'ghostRecipe', until: w.turn + 30 };

    expect(repairContent(w)).toEqual([]);
    expect(w.shops.bowl.event).toBeNull();
  });

  it('drops NPC goals aimed at a site that left the data and keeps goals aimed at live trucks', () => {
    const w = fresh();
    const [a, b] = npcs(w);
    const gone = { kind: 'travel', targetId: 'ghost-camp', destination: { x: 10, y: 10 }, phase: 'travel', reason: 'trade' } as const;
    const live = { kind: 'follow', targetId: b.id, destination: null, phase: 'travel', reason: 'trade' } as const;
    a.brain!.goals = [gone as never, live as never];

    expect(repairContent(w)).toEqual([]);
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

    expect(repairContent(w)).toEqual([]);
    expect(w.states.some((s) => s.kind === 'tow' && s.holder === me.id)).toBe(false);
    expect(a.brain!.goals).toEqual([]);
    expect(b.job).toBeNull();
    expect(() => settleStates(w)).not.toThrow();
  });

  it('gives a stranded parcel room before goods, and lists the goods that no longer fit', () => {
    const w = fresh();
    const me = playerVehicle(w);
    const good = SHOPS.bowl.goods[0];
    addGoods(w, me, good, 999);
    const crates = me.items.filter((it) => it.kind === 'good').length;
    const search = { id: 'c-search', shop: 'bowl', kind: 'search', target: 'v-x', driver: 'x', template: Object.keys(NPCS)[0], lead: { at: { x: 1, y: 1 }, turn: 0 }, reward: 5, deadline: w.turn + 20, window: 20, tier: 'low', delivered: false } as const;
    w.player.contracts.push(search as never);
    me.items.push({ id: 'i-parcel', x: 999, y: 999, rot: 0, kind: 'parcel', contract: 'c-search' });

    expect(repairContent(w)).toEqual([good]);
    expect(me.items.some((it) => it.kind === 'parcel' && it.contract === 'c-search')).toBe(true);
    expect(me.items.filter((it) => it.kind === 'good').length).toBeLessThan(crates);
  });

  it('breaks an escort bound for a site that left the data', () => {
    const w = fresh();
    const [a, b] = npcs(w);
    addState(w, 'escort', a.id, b.id, { kind: 'escort', site: 'ghostTown', fee: 0 });
    expect(() => settleStates(cloneWorld(w))).toThrow(/Unknown site/);

    expect(repairContent(w)).toEqual([]);
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

    expect(repairContent(w)).toEqual([]);
    expect(npc.brain!.goals.some((g) => g.shipment?.good === 'ghostGood')).toBe(false);
    expect(w.roadNews).toEqual([{ turn: w.turn, kind: 'robbed', good, units: 1, from: 'bowl', to: 'dustwell' }]);
  });

  it('drops wave templates that left the data, and an emptied wave never spawns', () => {
    const w = furyRoadStart();
    const [first, second] = w.furyRoad!.groups.filter((g) => !g.spawned);
    const kept = first.templates[0];
    first.templates = [kept, 'ghostRaider'];
    second.templates = ['ghostRaider'];

    expect(repairContent(w)).toEqual([]);
    expect(first.templates).toEqual([kept]);
    expect(second.spawned).toBe(true);
  });
});
