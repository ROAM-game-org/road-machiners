import { beforeAll, describe, expect, it } from 'vitest';
import { PARTS, partDef } from '../data/parts';
import { SHOPS } from '../data/market';
import { HAULER_KIT, START_KITS } from '../data/start';
import { FIRST_NAMES, SURNAMES } from '../data/npcs';
import { CONDITION } from '../data/wear';
import { PLAIN_KIT } from '../test/empty-world';
import { TEST_MAP } from '../test/map';
import { entryText } from '../text/resolve';
import { fullName } from '../text/names';
import { advanceContracts, goodStock } from './market';
import { haulerOf, playerVehicle } from './damage';
import { currentLine, currentOptions, talkOf } from './dialogue';
import { makePart } from './factory';
import { corePart, gridOf, mountedParts } from './grid';
import { vehicleMass } from './mass';
import { npcTraits } from './npc-decisions';
import { skillLevel } from './progress';
import { repairContent } from './save-repair';
import { defaultSetup } from './settings';
import { addState, advanceStates } from './states';
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

    const lost = repairContent(w);

    expect(sorted(lost)).toEqual(sorted(['ghostPart', 'ghostGood', 'ghostNpcPart', 'ghostStored', 'ghostSalvaged', 'ghostCrate', 'ghostSold']));
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

    const lost = repairContent(w);

    expect(lost).toEqual(['ghostChassis']);
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
    const gunId = gun.kind === 'part' ? gun.part.defId : '';
    expect(() => corePart(me, 'transmission')).toThrow(/mounted transmission/);

    const lost = repairContent(w);

    expect(lost).toEqual([gunId]);
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

    expect(repairContent(w)).toEqual([npc.chassisId]);
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

    const lost = repairContent(w);

    expect(lost).toEqual(['ghostShop']);
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

    const lost = repairContent(w);

    expect(sorted(lost)).toEqual(['ghostPersonality', 'ghostTemplate', 'ghostTrait']);
    expect(w.vehicles.some((v) => [a, b, c].some((gone) => gone.id === v.id))).toBe(false);
    expect(w.states.some((s) => s.holder === a.id)).toBe(false);
    for (const npc of npcs(w)) {
      expect(() => npcTraits(npc)).not.toThrow();
      expect(() => talkOf(npc)).not.toThrow();
    }
  });

  it('gives a driver outside the name lists a new name picked from the vehicle id', () => {
    const w = fresh();
    const [a, b] = npcs(w);
    a.brain!.driver = 'Nameless';
    b.brain!.driver = 'Ghost Name Extra';
    w.player.encounters.pending = { encounter: 'tale', driver: 'Nameless', until: 9 };
    expect(() => fullName(a.brain!.driver)).toThrow();
    const twin = cloneWorld(w);

    const lost = repairContent(w);
    repairContent(twin);

    expect(sorted(lost)).toEqual(['Ghost Name Extra', 'Nameless']);
    for (const v of [a, b]) {
      const [first, last] = v.brain!.driver.split(' ');
      expect(FIRST_NAMES).toContain(first);
      expect(SURNAMES).toContain(last);
      expect(() => fullName(v.brain!.driver)).not.toThrow();
    }
    expect(w.player.encounters.pending!.driver).toBe(a.brain!.driver);
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
    for (const [id, over] of drift) {
      const w = fresh();
      const npc = npcs(w)[0];
      w.player.call = { with: npc.id, topic: null, node: 'hub', vars: {}, line: { line: 'talk', vars: {} }, ...over };
      if (over.topic) expect(() => currentOptions(w)).toThrow();
      if (over.topic) expect(() => currentLine(w)).toThrow();

      expect(repairContent(w)).toEqual([id]);
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

    expect(repairContent(w)).toEqual(['ghostKind']);
    expect(w.states.includes(ghost)).toBe(false);
    expect(() => advanceStates(w)).not.toThrow();
  });
});
