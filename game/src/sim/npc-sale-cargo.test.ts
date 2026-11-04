import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { SHOPS } from '../data/market';
import { NPC_UPKEEP } from '../data/npcs';
import { sellsAnythingAt, sellVehicleCargo } from './economy';
import { goodsCount } from './grid';
import { addGoods, stowPart } from './inventory';
import { makePart } from './factory';
import { hasSaleCargo, type NpcProfile } from './npc-decisions';
import { saleGoal } from './npc-activities';
import { addVehicle, emptyWorld } from './testkit';
import { sitePads } from './sites';

const shops = Object.keys(SHOPS);
const withoutGrain = shops.filter((id) => !SHOPS[id].goods.includes('grain'));
const withGrain = shops.filter((id) => SHOPS[id].goods.includes('grain'));
const camp = REGION.locations.find((l) => l.kind === 'camp')!.id;

function truckHolding(good: string | null) {
  const w = emptyWorld();
  const npc = addVehicle(w, 'independent', 'hauler', [], sitePads(REGION.towns[0])[0]);
  if (good) addGoods(w, npc, good, 1);
  return { w, npc };
}

function marketsOf(markets: string[]): NpcProfile {
  return { markets } as NpcProfile;
}

describe('sale cargo needs a buyer who takes it', () => {
  it('does not count grain nobody known buys', () => {
    const { npc } = truckHolding('grain');
    expect(hasSaleCargo(npc, marketsOf(withoutGrain.slice(0, 3)))).toBe(false);
  });

  it('counts grain once a known market trades it', () => {
    const { npc } = truckHolding('grain');
    expect(hasSaleCargo(npc, marketsOf([withoutGrain[0], withGrain[0]]))).toBe(true);
  });

  it('counts any good at a camp', () => {
    const { npc } = truckHolding('grain');
    expect(hasSaleCargo(npc, marketsOf([camp]))).toBe(true);
  });

  it('counts a spare part at any shop', () => {
    const { w, npc } = truckHolding(null);
    expect(stowPart(w, npc, makePart(w, 'stockEngine', 0))).toBe(true);
    expect(hasSaleCargo(npc, marketsOf([withoutGrain[0]]))).toBe(true);
  });

  it('keeps retained repair parts', () => {
    const { w, npc } = truckHolding(null);
    addGoods(w, npc, 'parts', NPC_UPKEEP.repairParts);
    expect(hasSaleCargo(npc, marketsOf([withGrain[0]]))).toBe(false);
  });

  it('agrees with what the shop sells', () => {
    for (const shop of shops) {
      for (const good of ['grain', 'salt', 'scrap', 'parts', 'water']) {
        const { w, npc } = truckHolding(null);
        addGoods(w, npc, good, NPC_UPKEEP.repairParts + 1);
        const predicted = sellsAnythingAt(npc, shop, NPC_UPKEEP.repairParts);
        const before = structuredClone(goodsCount(npc));
        const town = REGION.towns.find((t) => t.id === shop);
        if (!town) continue;
        npc.pos = { ...sitePads(town)[0] };
        sellVehicleCargo(w, npc, shop, NPC_UPKEEP.repairParts);
        expect(predicted).toBe(JSON.stringify(goodsCount(npc)) !== JSON.stringify(before));
      }
    }
  });

  it('saleGoal throws when no market takes the cargo', () => {
    const { w, npc } = truckHolding('grain');
    expect(() => saleGoal(w, npc, marketsOf(withoutGrain.slice(0, 2)))).toThrow('no buyer');
  });
});
