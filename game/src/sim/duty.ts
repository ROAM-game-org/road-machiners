import { ECONOMY } from '../data/goods';
import { EFFORT, SHOPS } from '../data/market';
import type { TraitId } from '../data/npcs';
import { RULES } from '../data/rules';
import { getUpkeepReserve, shopMoney } from './economy';
import { getResources } from './resources';
import { supplyUseScale } from './settings';
import { plainFuelPerTile } from './stats';
import type { NpcActivity, Vehicle, World } from './types';
import { dist, type Vec } from './vec';
import { chargeM, fairM, requireWholeM } from './money';

export type DutyLeg = { from: Vec; turn: number };
type Duty = 'patrol' | 'dispatch' | 'guard';

const CONVOY_DUTY_KINDS: readonly NpcActivity['kind'][] = ['trade', 'sell'];

const DUTIES: readonly { trait: TraitId; duty: Duty; pays: (goal: NpcActivity) => boolean }[] = [
  { trait: 'lawman', duty: 'patrol', pays: (goal) => goal.kind === 'patrol' && goal.reason === 'patrolTown' },
  { trait: 'courier', duty: 'dispatch', pays: (goal) => goal.kind === 'travel' && isShop(goal.targetId) },
  { trait: 'supplier', duty: 'guard', pays: (goal) => CONVOY_DUTY_KINDS.includes(goal.kind) },
];

function isShop(siteId: string | null): boolean {
  return siteId !== null && siteId in SHOPS;
}

function dutyOf(v: Vehicle, goal: NpcActivity): Duty | null {
  const traits = v.brain?.traits ?? [];
  return DUTIES.find((d) => traits.includes(d.trait) && d.pays(goal))?.duty ?? null;
}

export function stampLeg(world: World, v: Vehicle, goal: NpcActivity): void {
  if (!goal.leg && dutyOf(v, goal)) goal.leg = { from: { ...v.pos }, turn: world.turn };
}

export function dutyPrice(world: World, payee: Vehicle, tiles: number, turns: number): number {
  if (!(tiles >= 0) || !(turns >= 0)) throw new Error(`${payee.id} cannot be paid for ${tiles} tiles over ${turns} turns`);
  const fuel = tiles * plainFuelPerTile(world, payee) * ECONOMY.supplyPrice.fuel;
  const supplies = turns * RULES.suppliesPerTurn * supplyUseScale(world) * ECONOMY.supplyPrice.supplies;
  const pay = fairM(fuel + supplies + turns * EFFORT.wage[1]);
  if (!Number.isFinite(pay)) throw new Error(`${payee.id} got a pay of ${pay}`);
  return pay;
}

export function dutyPay(world: World, payee: Vehicle, leg: DutyLeg, to: Vec): number {
  const turns = world.turn - leg.turn;
  if (turns < 0) throw new Error(`${payee.id} finished a leg ${-turns} turns before it began`);
  return dutyPrice(world, payee, dist(leg.from, to) * EFFORT.routeFactor, turns);
}

export function fundSupplyRun(world: World, convoy: Vehicle, load: number): void {
  if (!convoy.brain?.traits.includes('supplier')) throw new Error(`${convoy.id} drew supply money with no supplier trait`);
  if (!(load > 0)) throw new Error(`${convoy.id} drew supply money for a load of ${load}`);
  const due = chargeM(load + getUpkeepReserve(convoy) - getResources(world, convoy).money);
  if (due > 0) shopMoney(world, convoy, due, 'supplyFund');
}

export function payDuty(world: World, v: Vehicle, goal: NpcActivity, escorts: readonly Vehicle[]): void {
  const duty = dutyOf(v, goal);
  if (!duty) return;
  if (!goal.leg) throw new Error(`${v.id} finished a ${goal.kind} duty leg with no start`);
  if (duty === 'guard') {
    shopMoney(world, v, dutyPay(world, v, goal.leg, v.pos), 'haulPay');
    payGuards(world, v, goal.leg, escorts);
  } else {
    shopMoney(world, v, dutyPay(world, v, goal.leg, v.pos), duty === 'patrol' ? 'patrolPay' : 'dispatchPay');
    if (duty === 'dispatch') payPartners(world, v, goal.leg, escorts);
  }
}

function payPartners(world: World, leader: Vehicle, leg: DutyLeg, escorts: readonly Vehicle[]): void {
  for (const partner of escorts.filter((e) => e.brain?.traits.includes('courier'))) {
    shopMoney(world, partner, dutyPay(world, partner, leg, leader.pos), 'dispatchPay');
  }
}

function payGuards(world: World, convoy: Vehicle, leg: DutyLeg, escorts: readonly Vehicle[]): void {
  const purse = getResources(world, convoy);
  for (const guard of escorts.filter((e) => e.brain?.traits.includes('guard'))) {
    const fee = Math.min(dutyPay(world, guard, leg, convoy.pos), Math.max(0, purse.money));
    if (fee <= 0) continue;
    requireWholeM(fee, 'guard pay');
    purse.money -= fee;
    getResources(world, guard).money += fee;
    world.events.push({ t: 'guardPaid', by: convoy.id, guard: guard.id, fee });
  }
}
