import type { GameEvent, ShopMoneyKind, Vehicle, World } from '../types';

export type NpcMoneyKind = ShopMoneyKind | 'tow' | 'escort' | 'guard' | 'patch' | 'transfer';
export type NpcLedgerRow = Partial<Record<NpcMoneyKind, number>>;
export type NpcLedger = Record<string, NpcLedgerRow>;

type NpcMove = { vehicle: string; kind: NpcMoneyKind; amount: number };

const MONEY_EPSILON = 1e-6;

export function npcLedger(before: World, next: World, events: readonly GameEvent[]): NpcLedger {
  const ledger: NpcLedger = {};
  for (const e of events) for (const move of rawMoves(e, next.player.vehicleId).filter((move) => move.vehicle !== next.player.vehicleId)) book(ledger, move);
  const was = new Map(before.vehicles.flatMap((v) => (v.resources ? [[v.id, v.resources.money] as const] : [])));
  for (const v of next.vehicles) if (v.id !== next.player.vehicleId) reconcile(next.turn, v, was.get(v.id), ledger[v.id]);
  return ledger;
}

function reconcile(turn: number, v: Vehicle, start: number | undefined, row: NpcLedgerRow = {}): void {
  if (start === undefined || !v.resources) return;
  const moved = v.resources.money - start;
  const explained = rowTotal(row);
  if (Math.abs(moved - explained) > MONEY_EPSILON) throw new Error(`turn ${turn}: ${v.id} moved ${moved} money but its events explain ${explained}`);
}

function book(ledger: NpcLedger, move: NpcMove): void {
  const row = (ledger[move.vehicle] ??= {});
  row[move.kind] = (row[move.kind] ?? 0) + move.amount;
}

function rowTotal(row: NpcLedgerRow): number {
  return Object.values(row).reduce((sum, amount) => sum + amount, 0);
}

type MoveRule<K extends GameEvent['t']> = (e: Extract<GameEvent, { t: K }>, me: string) => NpcMove[];

const MOVE_RULES: { [K in GameEvent['t']]?: MoveRule<K> } = {
  shopMoney: (e) => [{ vehicle: e.vehicle, kind: e.kind, amount: e.amount }],
  transfer: (e) => between(e.to, e.from, 'transfer', e.amount),
  escortPaid: (e) => between(e.by, e.client, 'escort', e.fee),
  guardPaid: (e) => between(e.guard, e.by, 'guard', e.fee),
  patch: (e) => (e.outcome === 'done' ? between(e.patcher, e.client, 'patch', e.price) : []),
  towDone: (e, me) => (e.by === me ? [] : between(e.by, e.client, 'tow', e.fee)),
  money: (e) => (e.reason.kind === 'towing' ? [{ vehicle: e.reason.vehicle, kind: 'tow', amount: -e.amount }] : []),
};

function rawMoves(e: GameEvent, me: string): NpcMove[] {
  const rule = MOVE_RULES[e.t] as MoveRule<typeof e.t> | undefined;
  return rule ? rule(e as never, me) : [];
}

function between(payee: string, payer: string, kind: NpcMoneyKind, amount: number): NpcMove[] {
  return [{ vehicle: payee, kind, amount }, { vehicle: payer, kind, amount: -amount }];
}
