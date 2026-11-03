import { CONTRACTS, CREDIT } from '../../data/market';
import { playerVehicle } from '../damage';
import { getUpkeepReserve } from '../npc-decisions';
import { estimateTurns, shopAt, siteOf } from '../market';
import { accountRefusal, payAccount } from '../shop-credit';
import type { World } from '../types';
import { driveToSite, type Orders } from './orders';

export type CreditPolicy = 'creditTrader' | 'defaulter';
export const CREDIT_POLICIES: readonly CreditPolicy[] = ['creditTrader', 'defaulter'];

export function isCreditPolicy(policy: string): policy is CreditPolicy {
  return (CREDIT_POLICIES as readonly string[]).includes(policy);
}

export function tradeAs<P extends string>(policy: P): Exclude<P, CreditPolicy> | 'trader' {
  return isCreditPolicy(policy) ? 'trader' : (policy as Exclude<P, CreditPolicy>);
}

export function withCredit(world: World, policy: string): World {
  if (isCreditPolicy(policy)) world.player.perks = [...world.player.perks, 'shopCredit'];
  return world;
}

export function lotSpend(world: World, shopId: string, cash: number): number {
  if (accountRefusal(world, shopId, 0) !== null) return cash;
  return Math.max(cash, CREDIT.line - (world.player.account?.owed ?? 0));
}

export function payWhenDue(o: Orders, policy: string): boolean {
  const account = o.world.player.account;
  if (policy !== 'creditTrader' || !account) return false;
  if (o.world.player.money < account.owed + getUpkeepReserve(playerVehicle(o.world))) return false;
  if (shopAt(o.world) === account.shop) {
    o.run(payAccount, 'goodsBought');
    return true;
  }
  const shop = siteOf(account.shop);
  if (o.world.turn + estimateTurns(o.me.pos, shop.pos) + CONTRACTS.warnTurns < account.due) return false;
  driveToSite(o, shop);
  return true;
}
