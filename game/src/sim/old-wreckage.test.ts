import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { OLD_PLACES, OLD_TABLES, SALVAGE } from '../data/salvage';
import { planNpcOrders } from './ai';
import { playerVehicle } from './damage';
import { advanceFar } from './far';
import { goodsCount } from './grid';
import { topGoal } from './npc-activities';
import { isRoadWreck, oldPlaces, oldSpotOf, oldSpotPicks, oldStockId, rollStock } from './salvage';
import { startSearch } from './search';
import { TEST_MAP } from '../test/map';
import { addVehicle, emptyWorld, forceOption, npcBrain } from './testkit';
import { territoryAt } from './territory';
import type { Obstacle } from './types';
import { endTurn } from './world';

const pickedFor = vi.hoisted(() => ({ hash: '' }));

vi.mock('../data/old-spots.json', () => ({
  default: {
    get mapHash() {
      return pickedFor.hash;
    },
    picks: [{ propId: 'shipCache-91001', type: 'wreckage', pos: { x: 50.5, y: 50 }, reach: 0.7 }],
  },
}));

pickedFor.hash = TEST_MAP.hash;

const POD = { propId: 'shipCache-91001', type: 'wreckage' as const };

describe('a fallen cargo pod in the outer debris field', () => {
  it('is its own wreckage place, and no cache inside a territory is', () => {
    const outside: Obstacle = { id: 'shipCache-91001', pos: { x: 250, y: 250 }, r: 0.7, kind: 'landmark', look: 'shipCache', yaw: 0 };
    expect(territoryAt(outside.pos)).toBeNull();
    const fallenSun = territoryAt({ x: 998, y: 842 });
    expect(fallenSun?.id).toBe('fallen-sun');
    const inside: Obstacle = { ...outside, id: 'shipCache-91002', pos: { x: 998, y: 842 } };
    const places = oldPlaces([outside, inside]).map((p) => ({ type: p.type, ids: p.props.map((o) => o.id) }));
    expect(places).toEqual([{ type: 'wreckage', ids: ['shipCache-91001'] }]);
  });

  it('reads its stock id back as a wreckage spot and stocks it from the hull scrap table', () => {
    expect(oldSpotOf({ id: oldStockId(POD) })).toEqual(POD);
    expect(OLD_TABLES.wreckage).toBe(SALVAGE.hullScrap);
  });

  it('gives a player who searches it goods', () => {
    const w = emptyWorld({ x: 50, y: 50 });
    const stock = rollStock(w, OLD_TABLES.wreckage, oldStockId(POD), { x: 50.5, y: 50 }, 0.7);
    stock.goods = { scrap: 2 };
    stock.hidden = { goods: {}, parts: [], fuel: 0, supplies: 0 };
    w.salvage.push(stock);
    const me = playerVehicle(w);
    me.pos = { x: 52, y: 50 };
    me.speed = 0;
    let now = startSearch(w, stock.id);
    for (let turn = 0; turn < 30 && playerVehicle(now).job; turn++) now = endTurn(now, (world) => world.vehicles.forEach((v) => v.brain && advanceFar(world, v)));
    expect(goodsCount(playerVehicle(now)).scrap ?? 0).toBeGreaterThan(0);
  });

  it('is picked by a scavenger in range, which names its goal after the pod', () => {
    expect(oldSpotPicks({ hash: emptyWorld().mapHash, terrain: emptyWorld().terrain }).map(oldStockId)).toEqual([oldStockId(POD)]);
    const saved = OLD_PLACES.npcShare;
    OLD_PLACES.npcShare = 1;
    onTestFinished(() => void (OLD_PLACES.npcShare = saved));
    const w = emptyWorld({ x: 50, y: 50 });
    const npc = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 80, y: 50 });
    npc.brain = npcBrain('scavenger', npc.pos, ['scavenger']);
    forceOption('idle', 'scavenge');
    forceOption('salvageSeen', 'keep');
    w.salvage = w.salvage.filter((stock) => !isRoadWreck(stock));
    w.salvage.push(rollStock(w, OLD_TABLES.wreckage, oldStockId(POD), { x: 50.5, y: 50 }, 0.7));
    planNpcOrders(w);
    const goal = topGoal(npc)!;
    expect(goal.targetId).toBe(oldStockId(POD));
    expect(goal.reason).toBe('searchOldWreckage');
  });
});
