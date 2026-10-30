import type { GridItem, Vehicle } from './types';

export type Loadout = Pick<Vehicle, 'chassisId' | 'items'>;
export type LoadoutSlot<T> = { readonly build: (loadout: Loadout) => T };

type MemoRecord = { fingerprint: unknown[]; facts: Map<LoadoutSlot<unknown>, unknown> };

const STRIDE = 10;
const records = new WeakMap<GridItem[], MemoRecord>();
let enabled = true;

export function setLoadoutMemo(on: boolean): void {
  enabled = on;
}

export function loadoutSlot<T>(build: (loadout: Loadout) => T): LoadoutSlot<T> {
  return { build };
}

export function loadoutFact<T>(loadout: Loadout, slot: LoadoutSlot<T>): T {
  if (!enabled) return slot.build(loadout);
  const record = currentRecord(loadout);
  if (record.facts.has(slot)) return record.facts.get(slot) as T;
  const fact = slot.build(loadout);
  freezeFact(fact, liveObjects(loadout));
  record.facts.set(slot, fact);
  return fact;
}

function currentRecord(loadout: Loadout): MemoRecord {
  const known = records.get(loadout.items);
  if (known && matches(known.fingerprint, loadout)) return known;
  const fresh: MemoRecord = { fingerprint: fingerprintOf(loadout), facts: new Map() };
  records.set(loadout.items, fresh);
  return fresh;
}

function matches(print: unknown[], { chassisId, items }: Loadout): boolean {
  if (print.length !== 2 + items.length * STRIDE || print[0] !== chassisId) return false;
  let at = 2;
  for (const it of items) {
    if (print[at] !== it || print[at + 1] !== it.x || print[at + 2] !== it.y || print[at + 3] !== it.rot || print[at + 4] !== it.kind) return false;
    if (it.kind === 'part') {
      const p = it.part;
      if (print[at + 5] !== p || print[at + 6] !== p.defId || print[at + 7] !== p.hp || print[at + 8] !== p.wear || print[at + 9] !== p.rebuilt) return false;
    } else if (print[at + 5] !== goodOrContract(it)) return false;
    at += STRIDE;
  }
  return true;
}

function fingerprintOf({ chassisId, items }: Loadout): unknown[] {
  const print: unknown[] = [chassisId, items.length];
  for (const it of items) {
    print.push(it, it.x, it.y, it.rot, it.kind);
    if (it.kind === 'part') print.push(it.part, it.part.defId, it.part.hp, it.part.wear, it.part.rebuilt);
    else print.push(goodOrContract(it), 0, 0, 0, 0);
  }
  return print;
}

function goodOrContract(it: Exclude<GridItem, { kind: 'part' }>): string {
  return it.kind === 'good' ? it.good : it.contract;
}

function liveObjects({ items }: Loadout): Set<object> {
  const live = new Set<object>(items);
  for (const it of items) if (it.kind === 'part') live.add(it.part);
  return live;
}

function freezeFact(value: unknown, live: Set<object>): void {
  if (typeof value !== 'object' || value === null || live.has(value) || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const inner of Object.values(value)) freezeFact(inner, live);
}
