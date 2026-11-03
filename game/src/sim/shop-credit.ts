import { CONTRACTS, CREDIT, SHOPS } from '../data/market';
import { SITE_FACTIONS } from '../data/npc-behavior';
import { fileUnpaidAccount, knownCasesOn } from './crime';
import { playerVehicle } from './damage';
import { shopMoney } from './economy';
import { requireShop, siteOf } from './market';
import { requireWholeM } from './money';
import { hasPerk } from './progress';
import { noteContractDeed } from './relations';
import { modeRules } from './settings';
import type { Refusal, ShopAccount, World } from './types';
import { playerCommand, Refused } from './world';

export function accountRefusal(world: World, shopId: string, price: number): Refusal | null {
  return creditClosed(world) ?? roomRefusal(world.player.account, shopId, price);
}

function creditClosed(world: World): Refusal | null {
  if (!hasPerk(world, 'shopCredit') || !modeRules(world).bounties) return { id: 'noMoney' };
  return knownCasesOn(world, world.player.vehicleId).length > 0 ? { id: 'wantedNoCredit' } : null;
}

function roomRefusal(account: ShopAccount | null, shopId: string, price: number): Refusal | null {
  if (account && account.shop !== shopId) return { id: 'accountElsewhere', shop: account.shop };
  return owedOn(account) + price > CREDIT.line ? { id: 'accountFull' } : null;
}

const owedOn = (account: ShopAccount | null): number => account?.owed ?? 0;

export function putOnAccount(world: World, shopId: string, price: number): void {
  requireWholeM(price, 'accountLot');
  const account = world.player.account ?? { shop: shopId, owed: 0, due: world.turn + CREDIT.dueTurns };
  world.player.account = { ...account, owed: account.owed + price };
}

export function payAccount(world: World): World {
  return playerCommand(world, (w) => {
    const account = requireAccount(w);
    if (requireShop(w) !== account.shop) throw new Error(`The account is at ${account.shop}`);
    if (w.player.money < account.owed) throw new Refused({ id: 'noMoney' });
    shopMoney(w, playerVehicle(w), -account.owed, 'accountPaid');
    w.events.push({ t: 'accountPaid', shop: account.shop, amount: account.owed });
    w.player.account = null;
  });
}

function requireAccount(world: World): ShopAccount {
  const account = world.player.account;
  if (!account) throw new Error('No account to pay');
  return account;
}

export function settleOverdue(world: World): void {
  const account = world.player.account;
  if (!account) return;
  requireSound(account);
  if (world.turn === account.due - CONTRACTS.warnTurns) world.events.push({ t: 'account', ...account, outcome: 'expiring' });
  if (world.turn >= account.due) lapse(world, account);
}

function requireSound(account: ShopAccount): void {
  if (!Object.hasOwn(SHOPS, account.shop)) throw new Error(`An account at ${account.shop}, which is not a shop`);
  requireWholeM(account.owed, 'accountOwed');
  if (account.owed <= 0) throw new Error(`An account owes ${account.owed}`);
}

function lapse(world: World, account: ShopAccount): void {
  world.events.push({ t: 'account', ...account, outcome: 'lapsed' });
  const faction = SITE_FACTIONS[account.shop];
  if (faction) noteContractDeed(world, `account:${account.shop}:${account.due}`, faction, 'failedContract');
  fileUnpaidAccount(world, account, siteOf(account.shop).pos);
  world.player.account = null;
}
