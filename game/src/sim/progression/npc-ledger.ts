import type { GameEvent, ShopMoneyKind, World } from '../types';

export type NpcMoneyKind = ShopMoneyKind | 'tow' | 'escort' | 'guard' | 'patch' | 'transfer';
export type NpcLedgerRow = Partial<Record<NpcMoneyKind, number>>;
export type NpcLedger = Record<string, NpcLedgerRow>;

type NpcMove = { vehicle: string; kind: NpcMoneyKind; amount: number };

const MONEY_EPSILON = 1e-6;

export function npcLedger(before: World, next: World, events: readonly GameEvent[]): NpcLedger {
  const ledger: NpcLedger = {};
  for (const e of events) for (const move of npcMoves(e, next.player.vehicleId)) book(ledger, move);
  const was = new Map(before.vehicles.flatMap((v) => (v.resources ? [[v.id, v.resources.money] as const] : [])));
  for (const v of next.vehicles) {
    const start = was.get(v.id);
    if (start === undefined || !v.resources || v.id === next.player.vehicleId) continue;
    const moved = v.resources.money - start;
    const explained = rowTotal(ledger[v.id] ?? {});
    if (Math.abs(moved - explained) > MONEY_EPSILON) throw new Error(`turn ${next.turn}: ${v.id} moved ${moved} money but its events explain ${explained}`);
  }
  return ledger;
}

function book(ledger: NpcLedger, move: NpcMove): void {
  const row = (ledger[move.vehicle] ??= {});
  row[move.kind] = (row[move.kind] ?? 0) + move.amount;
}

function rowTotal(row: NpcLedgerRow): number {
  return Object.values(row).reduce((sum, amount) => sum + amount, 0);
}

function npcMoves(e: GameEvent, me: string): NpcMove[] {
  const moves = rawMoves(e, me);
  return moves.filter((move) => move.vehicle !== me);
}

function rawMoves(e: GameEvent, me: string): NpcMove[] {
  if (e.t === 'shopMoney') return [{ vehicle: e.vehicle, kind: e.kind, amount: e.amount }];
  if (e.t === 'transfer') return between(e.to, e.from, 'transfer', e.amount);
  if (e.t === 'escortPaid') return between(e.by, e.client, 'escort', e.fee);
  if (e.t === 'guardPaid') return between(e.guard, e.by, 'guard', e.fee);
  if (e.t === 'patch' && e.outcome === 'done') return between(e.patcher, e.client, 'patch', e.price);
  if (e.t === 'towDone') return e.by === me ? [] : between(e.by, e.client, 'tow', e.fee);
  if (e.t === 'money' && e.reason.kind === 'towing') return [{ vehicle: e.reason.vehicle, kind: 'tow', amount: -e.amount }];
  return [];
}

function between(payee: string, payer: string, kind: NpcMoneyKind, amount: number): NpcMove[] {
  return [{ vehicle: payee, kind, amount }, { vehicle: payer, kind, amount: -amount }];
}
