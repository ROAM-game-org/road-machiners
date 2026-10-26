import { afterEach, describe, expect, it } from 'vitest';
import { GOOD_IDS } from '../data/goods';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { defaultSetup } from './settings';
import { newWorld } from './world';
import { loadoutFact, loadoutSlot, setLoadoutMemo, type Loadout } from './loadout-memo';
import { coreParts, mountedItems, mountedParts } from './grid';
import { vehicleStats } from './stats';
import { playerVehicle } from './damage';
import type { PartKind } from '../data/parts';
import type { GridItem, Vehicle } from './types';

afterEach(() => setLoadoutMemo(true));

function truck(): Vehicle {
  return structuredClone(playerVehicle(newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'))));
}

function counted() {
  let builds = 0;
  const slot = loadoutSlot((l: Loadout) => {
    builds++;
    return { count: l.items.length, items: [...l.items] };
  });
  return { slot, builds: () => builds };
}

function firstPart(v: Vehicle): Extract<GridItem, { kind: 'part' }> {
  return v.items.find((it): it is Extract<GridItem, { kind: 'part' }> => it.kind === 'part')!;
}

describe('loadout memo', () => {
  it('builds once while nothing changes', () => {
    const v = truck();
    const { slot, builds } = counted();
    expect(loadoutFact(v, slot)).toBe(loadoutFact(v, slot));
    expect(builds()).toBe(1);
  });

  const changes: Record<string, (v: Vehicle) => void> = {
    hp: (v) => { firstPart(v).part.hp -= 1; },
    wear: (v) => { firstPart(v).part.wear += 1; },
    rebuilt: (v) => { firstPart(v).part.rebuilt = true; },
    'part replaced': (v) => { const it = firstPart(v); it.part = { ...it.part }; },
    'def id': (v) => { const it = firstPart(v); it.part = { ...it.part, defId: v.items.map((i) => (i.kind === 'part' ? i.part.defId : '')).find((d) => d && d !== it.part.defId)! }; },
    pushed: (v) => { v.items.push({ ...v.items[0], id: 'extra' }); },
    spliced: (v) => { v.items.splice(0, 1); },
    'item replaced': (v) => { v.items[0] = { ...v.items[0] }; },
    x: (v) => { Object.assign(v.items[0], { x: v.items[0].x + 1 }); },
    y: (v) => { Object.assign(v.items[0], { y: v.items[0].y + 1 }); },
    rot: (v) => { Object.assign(v.items[0], { rot: v.items[0].rot + 1 }); },
    chassis: (v) => { v.chassisId = `${v.chassisId}-other`; },
    good: (v) => { v.items.push({ id: 'g', x: 0, y: 0, rot: 0, kind: 'good', good: GOOD_IDS[0] } as GridItem); },
  };

  for (const [name, change] of Object.entries(changes)) {
    it(`rebuilds after ${name} changes`, () => {
      const v = truck();
      const { slot, builds } = counted();
      loadoutFact(v, slot);
      change(v);
      loadoutFact(v, slot);
      expect(builds()).toBe(2);
    });
  }

  it('rebuilds after a good or a contract changes in place', () => {
    const v = truck();
    v.items.push({ id: 'g', x: 0, y: 0, rot: 0, kind: 'good', good: GOOD_IDS[0] } as GridItem, { id: 'c', x: 0, y: 0, rot: 0, kind: 'parcel', contract: 'a' } as GridItem);
    const { slot, builds } = counted();
    loadoutFact(v, slot);
    (v.items[v.items.length - 2] as { good: string }).good = 'changed-good';
    loadoutFact(v, slot);
    (v.items[v.items.length - 1] as { contract: string }).contract = 'b';
    loadoutFact(v, slot);
    expect(builds()).toBe(3);
  });

  it('gives a cloned truck facts built from its own parts', () => {
    const v = truck();
    const copy = structuredClone(v);
    const fact = loadoutFact(v, loadoutSlot((l) => l.items.filter((it) => it.kind === 'part')));
    const cloned = loadoutFact(copy, loadoutSlot((l) => l.items.filter((it) => it.kind === 'part')));
    expect(cloned[0]).toBe(copy.items.find((it) => it.kind === 'part'));
    expect(cloned[0]).not.toBe(fact[0]);
    expect(mountedParts(copy)[0]).toBe((mountedItems(copy)[0]).part);
  });

  it('freezes stored arrays and objects but not the live items', () => {
    const v = truck();
    const { slot } = counted();
    const fact = loadoutFact(v, slot);
    expect(() => (fact.items as GridItem[]).push(v.items[0])).toThrow();
    expect(() => { (fact as { count: number }).count = 0; }).toThrow();
    expect(Object.isFrozen(fact.items[0])).toBe(false);
    expect(() => { (mountedItems(v) as GridItem[]).push(v.items[0]); }).toThrow();
  });

  it('builds on every read with the switch off', () => {
    setLoadoutMemo(false);
    const v = truck();
    const { slot, builds } = counted();
    loadoutFact(v, slot);
    loadoutFact(v, slot);
    expect(builds()).toBe(2);
  });
});

const KINDS: (PartKind | undefined)[] = [undefined, 'core', 'engine', 'weapon', 'armor', 'accessory', 'scanner', 'utility', 'cargo', 'store'];

function readings(v: Vehicle) {
  return {
    items: KINDS.map((k) => mountedItems(v, k as PartKind).map((it) => it.id)),
    parts: KINDS.map((k) => mountedParts(v, k as PartKind).map((p) => p.id)),
    cores: (['engine', 'transmission', 'wheel', 'fuel', 'cab'] as const).map((r) => { try { return coreParts(v, r as never).map((p) => p.id); } catch { return []; } }),
  };
}

describe('memo on and off agree', () => {
  it('on every vehicle of a seed 1337 world', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    for (const v of w.vehicles) {
      setLoadoutMemo(true);
      const on = readings(v);
      const onStats = vehicleStats(w, v);
      setLoadoutMemo(false);
      expect(readings(v), v.id).toEqual(on);
      expect(vehicleStats(w, v), v.id).toEqual(onStats);
    }
  });

  it('after damage, a broken wheel, engine wear and a new crate', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const v = playerVehicle(w);
    const check = () => {
      setLoadoutMemo(true);
      const on = vehicleStats(w, v);
      setLoadoutMemo(false);
      expect(vehicleStats(w, v)).toEqual(on);
      setLoadoutMemo(true);
    };
    check();
    const gun = mountedItems(v, 'weapon')[0];
    if (gun) { gun.part.hp = 0; check(); }
    coreParts(v, 'wheel')[0].hp = 0;
    check();
    mountedParts(v, 'engine')[0].wear += 1;
    check();
    v.items.push({ id: 'crate', x: 0, y: 0, rot: 0, kind: 'good', good: GOOD_IDS[0] } as GridItem);
    check();
  });
});
