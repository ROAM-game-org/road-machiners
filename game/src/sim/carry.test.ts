import { payoutM } from './money';
import { describe, expect, it } from 'vitest';
import { PAINT } from '../data/chassis';
import { GOODS } from '../data/goods';
import { REGION } from '../data/region';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { carriedWorld, newWorld, type Carried, type CarriedItem } from './world';
import { playerVehicle } from './damage';
import { getLayoutError } from './inventory';
import { discoverSite } from './locations';
import { perkPair } from './progress';
import { townAt } from './sites';
import { MAX_RANK, PERKS } from '../data/skills';
import { CONDITION } from '../data/wear';
import { defaultSetup } from './settings';


const KIT = START_KITS.standard;
const fresh = () => 4242;

function part(defId: string, over: Partial<Extract<CarriedItem, { kind: 'part' }>['part']> = {}) {
  return { defId, wear: 0, hp: 1000, rebuilt: false, ...over };
}

let kitTemplate: CarriedItem[] | null = null;

function kitItems(): CarriedItem[] {
  if (kitTemplate === null) {
    const w = newWorld(1, KIT, TEST_MAP, defaultSetup('roaming'), false);
    kitTemplate = playerVehicle(w).items.map((it): CarriedItem =>
      it.kind !== 'part'
        ? { kind: 'good', good: it.kind === 'good' ? it.good : '', x: it.x, y: it.y, rot: it.rot }
        : { kind: 'part', part: { defId: it.part.defId, wear: it.part.wear, hp: it.part.hp, rebuilt: false }, x: it.x, y: it.y, rot: it.rot });
  }
  return structuredClone(kitTemplate);
}

function carriedOf(over: Partial<Carried> = {}): Carried {
  return {
    seed: 99, money: 777, xp: 340, ranks: { driving: 2, social: 1 }, xpBySource: { ram: 12 }, perks: [], paint: null, discovered: [],
    knockouts: 2, autoFire: true, autoRepair: false, fuel: 5, supplies: 3, costBasis: { scrap: 8 },
    truck: { chassisId: 'scout', items: kitItems() }, storage: [], setup: undefined, quests: { world: {}, local: {} }, run: null, notes: [], revisions: {}, refunded: 0, ...over,
  };
}

const defIds = (items: { kind: string; part?: { defId: string } }[]) => items.flatMap((it) => (it.part ? [it.part.defId] : []));

describe('carriedWorld', () => {
  it('keeps progression, the truck and the garage, and parks on a town pad', () => {
    const items = kitItems().map((it) => (it.kind === 'part' && it.part.defId === 'mg' ? { ...it, part: part('mg', { wear: 2, hp: 5 }) } : it));
    const [known, other] = REGION.towns;
    const world = carriedWorld(carriedOf({ truck: { chassisId: 'scout', items }, storage: [part('plates', { wear: 1 })], discovered: [known.id, 'gone'] }), KIT, () => TEST_MAP, fresh);
    const truck = playerVehicle(world);
    expect(townAt(world)).not.toBeNull();
    expect(world.seed).toBe(99);
    expect(world.turn).toBe(1);
    expect(world.player).toMatchObject({ money: 777, knockouts: 2, autoFire: true, autoRepair: false });
    expect(world.player.xp).toBe(340);
    expect(world.player.ranks).toEqual({ driving: 2, perception: 0, machining: 0, toughness: 0, social: 1 });
    expect(world.player.xpBySource.ram).toBe(12);
    const mg = truck.items.find((it) => it.kind === 'part' && it.part.defId === 'mg');
    expect(mg?.kind === 'part' && [mg.part.wear, mg.part.hp]).toEqual([2, 5]);
    expect(defIds(truck.items)).toEqual(expect.arrayContaining(KIT.parts));
    expect(world.player.storage.map((p) => [p.defId, p.wear])).toEqual([['plates', 1]]);
    expect(truck.items.filter((it) => it.kind === 'good').length).toBe(4);
    expect(world.player.costBasis).toEqual({ scrap: 8 });
    expect(getLayoutError(truck, truck.items)).toBeNull();
    expect(world.player.discovered).toContain(known.id);
    expect(world.player.discovered).not.toContain('gone');
    expect(() => discoverSite(world, known)).toThrow();
    expect(() => discoverSite(world, other)).not.toThrow();
  });

  it('mounts a part with an invalid spot on a free spot of the truck', () => {
    const items = kitItems().map((it) => (it.kind === 'part' && it.part.defId === 'mg' ? { ...it, x: 99, y: 99 } : it));
    const world = carriedWorld(carriedOf({ truck: { chassisId: 'scout', items } }), KIT, () => TEST_MAP, fresh);
    const truck = playerVehicle(world);
    expect(world.player.storage).toEqual([]);
    expect(defIds(truck.items)).toContain('mg');
    expect(truck.items.some((it) => it.kind === 'part' && it.part.defId === 'mg' && it.x === 99)).toBe(false);
    expect(getLayoutError(truck, truck.items)).toBeNull();
  });

  it('sells goods with no room at base value and keeps the money books', () => {
    const many: CarriedItem[] = Array.from({ length: 200 }, () => ({ kind: 'good', good: 'scrap', x: 0, y: 0, rot: 0 }));
    const world = carriedWorld(carriedOf({ truck: { chassisId: 'scout', items: [...kitItems().filter((it) => it.kind === 'part'), ...many] } }), KIT, () => TEST_MAP, fresh);
    const held = playerVehicle(world).items.filter((it) => it.kind === 'good').length;
    expect(held).toBeLessThan(200);
    expect(world.player.money).toBe(777 + payoutM((200 - held) * GOODS.scrap.value));
  });

  it('drops unknown ids and gives an unknown chassis the kit truck', () => {
    const items: CarriedItem[] = [...kitItems(), { kind: 'part', part: part('ghostGun'), x: 0, y: 0, rot: 0 }, { kind: 'good', good: 'ghostGood', x: 0, y: 0, rot: 0 }];
    const known = carriedWorld(carriedOf({ truck: { chassisId: 'scout', items } }), KIT, () => TEST_MAP, fresh);
    const ids = (w: typeof known) => [...defIds(playerVehicle(w).items), ...playerVehicle(w).items.flatMap((it) => (it.kind === 'good' ? [it.good] : [])), ...w.player.storage.map((p) => p.defId)];
    expect(ids(known).filter((id) => id.startsWith('ghost'))).toEqual([]);
    expect(known.player.money).toBe(777);
    const other = carriedWorld(carriedOf({ truck: { chassisId: 'ghostChassis', items }, storage: [part('ghostPlate')] }), KIT, () => TEST_MAP, fresh);
    expect(playerVehicle(other).chassisId).toBe(KIT.chassis);
    expect(other.player.storage.map((p) => p.defId)).toEqual(expect.arrayContaining(['mg']));
    expect(ids(other).filter((id) => id.startsWith('ghost'))).toEqual([]);
    const value = (goods: { kind: string; good?: string }[]) => {
      const units: Record<string, number> = {};
      for (const it of goods) if (it.kind === 'good' && it.good) units[it.good] = (units[it.good] ?? 0) + 1;
      return Object.entries(units).reduce((n, [good, count]) => n + payoutM(count * GOODS[good].value), 0);
    };
    expect(other.player.money).toBe(777 + value(kitItems()));
  });

  it('carries a known paint slot by slot and turns an unknown slot into its standard color', () => {
    const world = carriedWorld(carriedOf({ paint: { body: 'sand', cab: 'gold', gear: 'chalk' } }), KIT, () => TEST_MAP, fresh);
    expect(world.player.paint).toEqual({ body: 'sand', cab: PAINT.standard.cab, gear: 'chalk' });
    expect(carriedWorld(carriedOf({ paint: { body: 'oxblood' } }), KIT, () => TEST_MAP, fresh).player.paint).toEqual({ ...PAINT.standard, body: 'oxblood' });
    expect(carriedWorld(carriedOf({ paint: null }), KIT, () => TEST_MAP, fresh).player.paint).toEqual(PAINT.standard);
  });

  it('drops perks above the carried rank and a second perk of one pair', () => {
    const perks = ['rebuild', 'nope'];
    const world = carriedWorld(carriedOf({ ranks: { machining: PERKS.rebuild.level - 1 }, perks }), KIT, () => TEST_MAP, fresh);
    expect(world.player.perks).toEqual([]);
    const at = carriedWorld(carriedOf({ ranks: { machining: PERKS.rebuild.level }, perks: ['rebuild'] }), KIT, () => TEST_MAP, fresh);
    expect(at.player.perks).toEqual(['rebuild']);
    const partner = perkPair(PERKS.rebuild.skill, PERKS.rebuild.level).perks.filter((id) => id !== 'rebuild');
    const both = carriedWorld(carriedOf({ ranks: { machining: MAX_RANK }, perks: ['rebuild', ...partner] }), KIT, () => TEST_MAP, fresh);
    expect(both.player.perks).toEqual(['rebuild']);
  });

  it('clamps ranks to whole numbers from 0 to the top rank, the pool to 0 or more, fuel and supplies to the truck capacity, and part wear into the range', () => {
    const world = carriedWorld(carriedOf({ xp: -5, ranks: { driving: 99, social: -2, machining: 2.7 }, fuel: 1e9, supplies: 1e9, storage: [part('plates', { wear: 99, hp: -4 })] }), KIT, () => TEST_MAP, fresh);
    expect(world.player.ranks).toMatchObject({ driving: MAX_RANK, social: 0, machining: 2 });
    expect(world.player.xp).toBe(0);
    expect(world.player.fuel).toBeLessThan(1e9);
    expect(world.player.supplies).toBeLessThan(1e9);
    expect(world.player.storage[0].wear).toBe(CONDITION.maxWear + 1);
    expect(world.player.storage[0].hp).toBe(0);
  });
});
