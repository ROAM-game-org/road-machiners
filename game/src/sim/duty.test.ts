import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/goods';
import { EFFORT } from '../data/market';
import { NPCS, type TraitId } from '../data/npcs';
import { REGION } from '../data/region';
import { RULES } from '../data/rules';
import { dutyPay, fundSupplyRun, payDuty } from './duty';
import { getUpkeepReserve } from './economy';
import { goodsCount } from './grid';
import { addGoods } from './inventory';
import { chargeM } from './money';
import { optionWeights, tradeSpend } from './npc-decisions';
import { idleGoal, placeBase, resolveNpcActivities } from './npc-activities';
import { getResources } from './resources';
import { siteGates, sitePads } from './sites';
import { plainFuelPerTile, vehicleStats } from './stats';
import { addVehicle, emptyWorld, finishBusiness, npcBrain } from './testkit';
import { escortFee, startEscort } from './tow';
import type { GameEvent, NpcActivity, Vehicle, World } from './types';
import { dist, type Vec } from './vec';
import { fallbackFaction } from './spawn';

const BOWL = REGION.towns.find((t) => t.id === 'bowl')!;
const NOSE = REGION.towns.find((t) => t.id === 'nose')!;
const KILN = REGION.locations.find((l) => l.id === 'kiln')!;
const TERRITORY = REGION.locations.find((l) => l.kind === 'territory')!;
const LEG_TURNS = 300;
const LEG_START = { x: 40, y: 40 };

function createNpc(w: World, templateId: string, traits: TraitId[], parts: string[], pos: Vec, chassis = 'scout'): Vehicle {
  const npc = addVehicle(w, fallbackFaction(NPCS[templateId]), chassis, parts, pos);
  npc.brain = npcBrain(templateId, pos, traits);
  return npc;
}

function legWorld(): World {
  const w = emptyWorld({ x: 300, y: 300 });
  w.turn = 1000;
  return w;
}

function onLeg(w: World, npc: Vehicle, goal: Omit<NpcActivity, 'leg'>): NpcActivity {
  const withLeg = { ...goal, leg: { from: { ...LEG_START }, turn: w.turn - LEG_TURNS } };
  npc.brain!.goals = [withLeg];
  return withLeg;
}

function plainRunningCost(w: World, npc: Vehicle, tiles: number, turns: number): number {
  return tiles * plainFuelPerTile(w, npc) * ECONOMY.supplyPrice.fuel + turns * RULES.suppliesPerTurn * ECONOMY.supplyPrice.supplies;
}

function shopPay(w: World, npc: Vehicle): Extract<GameEvent, { t: 'shopMoney' }>[] {
  return w.events.filter((e): e is Extract<GameEvent, { t: 'shopMoney' }> => e.t === 'shopMoney' && e.vehicle === npc.id);
}

describe('duty pay', () => {
  it('pays a lawman at its patrol stop for the plain running cost of the leg and the tier 1 wage', () => {
    const w = legWorld();
    const stop = { ...sitePads(BOWL)[0] };
    const lawman = createNpc(w, 'bowlFarmer', ['lawman', 'brave'], ['mg', 'stockEngine'], stop);
    const goal = onLeg(w, lawman, { kind: 'patrol', targetId: 'bowl', destination: { ...stop }, phase: 'travel', reason: 'patrolTown' });
    const money = getResources(w, lawman).money;
    const tiles = dist(LEG_START, stop) * EFFORT.routeFactor;

    resolveNpcActivities(w);

    const pay = dutyPay(w, lawman, goal.leg!, stop);
    expect(shopPay(w, lawman)).toEqual([{ t: 'shopMoney', vehicle: lawman.id, amount: pay, kind: 'patrolPay' }]);
    expect(getResources(w, lawman).money).toBe(money + pay);
    expect(pay).toBeGreaterThanOrEqual(plainRunningCost(w, lawman, tiles, LEG_TURNS) + LEG_TURNS * EFFORT.wage[1] - 1);
    expect(lawman.brain!.goals).toEqual([]);
  });

  it('pays a raider nothing for a patrol of its camp', () => {
    const w = legWorld();
    const stop = { ...siteGates(KILN)[0] };
    const raider = createNpc(w, 'buggy', ['raider'], ['mg', 'stockEngine'], stop, 'buggy');
    onLeg(w, raider, { kind: 'patrol', targetId: 'kiln', destination: { ...stop }, phase: 'travel', reason: 'patrolCamp' });
    const money = getResources(w, raider).money;

    resolveNpcActivities(w);

    expect(shopPay(w, raider)).toEqual([]);
    expect(getResources(w, raider).money).toBe(money);
  });

  it('pays a courier at a town and nothing at a territory', () => {
    const w = legWorld();
    const pad = { ...sitePads(NOSE)[0] };
    const courier = createNpc(w, 'courier', ['courier'], ['stockEngine'], pad);
    const goal = onLeg(w, courier, { kind: 'travel', targetId: 'nose', destination: { ...pad }, phase: 'travel', reason: 'tripToSite' });

    resolveNpcActivities(w);

    expect(shopPay(w, courier).map((e) => [e.kind, e.amount])).toEqual([['dispatchPay', dutyPay(w, courier, goal.leg!, pad)]]);

    const away = legWorld();
    const edge = { ...TERRITORY.pos };
    const roamer = createNpc(away, 'courier', ['courier'], ['stockEngine'], edge);
    onLeg(away, roamer, { kind: 'travel', targetId: TERRITORY.id, destination: { ...edge }, phase: 'travel', reason: 'tripToSite' });
    payDuty(away, roamer, roamer.brain!.goals[0], []);
    expect(shopPay(away, roamer)).toEqual([]);
  });

  it('pays a courier partner for the same leg from the same shop', () => {
    const w = legWorld();
    const pad = { ...sitePads(NOSE)[0] };
    const leader = createNpc(w, 'courier', ['courier'], ['stockEngine'], pad);
    const partner = createNpc(w, 'courier', ['courier'], ['stockEngine'], { ...sitePads(NOSE)[1] });
    startEscort(w, partner, leader, null, 0);
    const goal = onLeg(w, leader, { kind: 'travel', targetId: 'nose', destination: { ...pad }, phase: 'travel', reason: 'tripToSite' });
    const money = getResources(w, partner).money;

    resolveNpcActivities(w);

    const pay = dutyPay(w, partner, goal.leg!, leader.pos);
    expect(shopPay(w, partner).map((e) => [e.kind, e.amount])).toEqual([['dispatchPay', pay]]);
    expect(getResources(w, partner).money).toBe(money + pay);
    expect(shopPay(w, leader)).toHaveLength(1);
  });

  it('pays neither courier of a pair for a leg to a territory', () => {
    const w = legWorld();
    const edge = { ...TERRITORY.pos };
    const leader = createNpc(w, 'courier', ['courier'], ['stockEngine'], edge);
    const partner = createNpc(w, 'courier', ['courier'], ['stockEngine'], { x: edge.x + 4, y: edge.y });
    startEscort(w, partner, leader, null, 0);
    onLeg(w, leader, { kind: 'travel', targetId: TERRITORY.id, destination: { ...edge }, phase: 'travel', reason: 'tripToSite' });
    payDuty(w, leader, leader.brain!.goals[0], [partner]);
    expect(shopPay(w, partner)).toEqual([]);
    expect(shopPay(w, leader)).toEqual([]);
  });

  it('gives a merc escort of a courier no dispatch pay', () => {
    const w = legWorld();
    const pad = { ...sitePads(NOSE)[0] };
    const leader = createNpc(w, 'courier', ['courier'], ['stockEngine'], pad);
    const merc = createNpc(w, 'merc', ['merc'], ['mg', 'stockEngine'], { ...sitePads(NOSE)[1] });
    startEscort(w, merc, leader, 'nose', 10);
    onLeg(w, leader, { kind: 'travel', targetId: 'nose', destination: { ...pad }, phase: 'travel', reason: 'tripToSite' });
    payDuty(w, leader, leader.brain!.goals[0], [merc]);
    expect(shopPay(w, merc)).toEqual([]);
  });

  it('has a convoy pay each guard when it sells, never more than it holds', () => {
    const w = legWorld();
    const pad = { ...sitePads(NOSE)[0] };
    const convoy = createNpc(w, 'convoy', ['supplier'], ['mg', 'workhorseDiesel', 'trailerBox'], pad, 'hauler');
    const guard = createNpc(w, 'convoyGuard', ['guard', 'brave'], ['mg', 'stockEngine'], { ...sitePads(NOSE)[1] });
    startEscort(w, guard, convoy, null, 0);
    addGoods(w, convoy, 'scrap', 1);
    const goal = onLeg(w, convoy, { kind: 'sell', targetId: 'nose', destination: { ...pad }, phase: 'travel', reason: 'sellCargo' });
    getResources(w, convoy).money = 0;
    const guardMoney = getResources(w, guard).money;

    finishBusiness(w, convoy);

    const fee = getResources(w, guard).money - guardMoney;
    expect(w.events.filter((e) => e.t === 'guardPaid')).toEqual([{ t: 'guardPaid', by: convoy.id, guard: guard.id, fee }]);
    const order = w.events.filter((e) => e.t === 'guardPaid' || (e.t === 'shopMoney' && e.kind === 'haulPay')).map((e) => e.t);
    expect(order).toEqual(['shopMoney', 'guardPaid']);
    expect(fee).toBeGreaterThan(0);
    expect(fee).toBeLessThanOrEqual(dutyPay(w, guard, goal.leg!, pad));
    expect(getResources(w, convoy).money).toBeGreaterThanOrEqual(0);
  });

  it('pays a convoy its own leg when it sells, before it pays its guards', () => {
    const w = legWorld();
    const pad = { ...sitePads(NOSE)[0] };
    const convoy = createNpc(w, 'convoy', ['supplier'], ['mg', 'workhorseDiesel', 'trailerBox'], pad, 'hauler');
    addGoods(w, convoy, 'scrap', 1);
    const goal = onLeg(w, convoy, { kind: 'sell', targetId: 'nose', destination: { ...pad }, phase: 'travel', reason: 'sellCargo' });

    finishBusiness(w, convoy);

    const wage = dutyPay(w, convoy, goal.leg!, pad);
    expect(w.events.filter((e) => e.t === 'shopMoney' && e.vehicle === convoy.id && e.kind === 'haulPay')).toEqual([{ t: 'shopMoney', vehicle: convoy.id, amount: wage, kind: 'haulPay' }]);
  });

  it('has the faction fund a broke convoy at its supply source, so it buys a full load and sets out to deliver it', () => {
    const w = legWorld();
    w.salvage = [];
    w.shops.granary.goods.grain = 0;
    const convoy = createNpc(w, 'convoy', ['supplier'], ['mg', 'workhorseDiesel', 'trailerBox'], { ...sitePads(NOSE)[0] }, 'hauler');
    getResources(w, convoy).money = 0;
    const run = Array.from({ length: 40 }, () => idleGoal(w, convoy)).find((goal) => goal.reason === 'loadCargo');
    if (!run?.purchase || !run.targetId) throw new Error('A broke convoy planned no supply run');
    const source = REGION.towns.find((t) => t.id === run.targetId) ?? REGION.locations.find((l) => l.id === run.targetId)!;
    const pad = { ...sitePads(source)[0] };
    convoy.pos = { ...pad };
    onLeg(w, convoy, { ...run, destination: { ...pad } });

    finishBusiness(w, convoy);

    const funds = shopPay(w, convoy).filter((e) => e.kind === 'supplyFund');
    expect(funds).toHaveLength(1);
    expect(funds[0].amount).toBe(chargeM(tradeSpend(w, convoy, 'faction') + getUpkeepReserve(convoy)));
    expect(goodsCount(convoy)[run.purchase.good]).toBeGreaterThan(0);
    expect(convoy.brain!.goals[0]).toMatchObject({ kind: 'sell', shipment: { good: run.purchase.good, from: run.targetId, to: run.purchase.sellShop } });
  });

  it('gives a convoy that holds enough for its load no supply money', () => {
    const w = legWorld();
    const convoy = createNpc(w, 'convoy', ['supplier'], ['mg', 'workhorseDiesel', 'trailerBox'], { ...sitePads(NOSE)[0] }, 'hauler');
    getResources(w, convoy).money = tradeSpend(w, convoy, 'faction') + getUpkeepReserve(convoy) + 1;

    fundSupplyRun(w, convoy, tradeSpend(w, convoy, 'faction'));

    expect(shopPay(w, convoy)).toEqual([]);
  });

  it('leaves supply runs to faction convoys, so a trader only trades', () => {
    const w = legWorld();
    w.shops.granary.goods.grain = 0;
    const trader = createNpc(w, 'trader', ['trader'], ['mg', 'workhorseDiesel', 'trailerBox'], { ...sitePads(NOSE)[0] }, 'hauler');
    const convoy = createNpc(w, 'convoy', ['supplier'], ['mg', 'workhorseDiesel', 'trailerBox'], { ...sitePads(NOSE)[1] }, 'hauler');

    expect(optionWeights(w, trader, 'idle', null, null)).not.toHaveProperty('haul');
    expect(optionWeights(w, trader, 'idle', null, null)).toHaveProperty('trade');
    expect(optionWeights(w, convoy, 'idle', null, null)).toHaveProperty('haul');
  });

  it('prices a merc escort at its plain running cost there and back plus the wage', () => {
    const w = legWorld();
    const trader = createNpc(w, 'trader', ['trader'], ['mg', 'stockEngine'], { x: 60, y: 60 }, 'hauler');
    const merc = createNpc(w, 'merc', ['merc'], ['mg', 'stockEngine'], { x: 66, y: 60 });
    const tiles = 2 * dist(trader.pos, NOSE.pos) * EFFORT.routeFactor;

    const fee = escortFee(w, trader, merc, 'nose');

    expect(fee).toBeGreaterThan(tiles * plainFuelPerTile(w, merc) * ECONOMY.supplyPrice.fuel);
  });

  it('pays a thirsty engine the same as a plain one on the same leg', () => {
    const w = legWorld();
    const stop = { ...sitePads(BOWL)[0] };
    const plain = createNpc(w, 'bowlFarmer', ['lawman', 'brave'], ['mg', 'stockEngine'], stop);
    const thirsty = createNpc(w, 'bowlFarmer', ['lawman', 'brave'], ['mg', 'tunedEngine'], stop);
    const leg = { from: { ...LEG_START }, turn: w.turn - LEG_TURNS };

    expect(vehicleStats(w, thirsty).fuelPerTile).toBeGreaterThan(vehicleStats(w, plain).fuelPerTile);
    expect(dutyPay(w, thirsty, leg, stop)).toBe(dutyPay(w, plain, leg, stop));
  });

  it('marks where and when a duty leg begins, and only on a paid goal', () => {
    const w = legWorld();
    const lawman = createNpc(w, 'bowlFarmer', ['lawman', 'brave'], ['mg', 'stockEngine'], { ...LEG_START });
    const raider = createNpc(w, 'buggy', ['raider'], ['mg', 'stockEngine'], { ...LEG_START }, 'buggy');
    const patrol = (reason: 'patrolTown' | 'patrolCamp'): NpcActivity => ({ kind: 'patrol', targetId: 'bowl', destination: { ...BOWL.pos }, phase: 'travel', reason });

    placeBase(w, lawman, patrol('patrolTown'));
    placeBase(w, raider, patrol('patrolCamp'));

    expect(lawman.brain!.goals[0].leg).toEqual({ from: LEG_START, turn: w.turn });
    expect(raider.brain!.goals[0].leg).toBeUndefined();
  });

  it('throws on a paid duty leg with no start', () => {
    const w = legWorld();
    const stop = { ...sitePads(BOWL)[0] };
    const lawman = createNpc(w, 'bowlFarmer', ['lawman', 'brave'], ['mg', 'stockEngine'], stop);
    const goal: NpcActivity = { kind: 'patrol', targetId: 'bowl', destination: { ...stop }, phase: 'travel', reason: 'patrolTown' };

    expect(() => payDuty(w, lawman, goal, [])).toThrow(/no start/);
  });

  it('throws on a leg that ends before it began', () => {
    const w = legWorld();
    const lawman = createNpc(w, 'bowlFarmer', ['lawman', 'brave'], ['mg', 'stockEngine'], { ...LEG_START });

    expect(() => dutyPay(w, lawman, { from: { ...LEG_START }, turn: w.turn + 1 }, LEG_START)).toThrow(/before it began/);
  });
});
