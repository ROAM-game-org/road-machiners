import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FORMAT_2_120 from './save-fixtures/format-2-120.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';
import { CHASSIS_121_122, PARTS_121_122 } from './save-square-grid-data';

type Spot = { x: number; y: number; rot: number };
type Item = Spot & { id: string; kind: string; part?: { id: string; defId: string; hp: number; wear: number }; good?: string };
type Step = { moves: { itemId: string; from: Spot; to: Spot }[]; pickup: { itemId: string; partId: string; to: Spot } | null };
type Vehicle = { id: string; chassisId: string; faction?: string; items: Item[]; weaponOrders?: Record<string, unknown>; job: (Step & { queue: Step[] }) | null };
type Saved = { player: { vehicleId: string; storage: { id: string; defId: string }[] }; vehicles: Vehicle[] };

const armor = TINY_STEPS.find((s) => s.name === 'withArmorRowsOutside')!;
const step = TINY_STEPS.find((s) => s.name === 'withSquareGrid')!;
const SKIN = 'FBLR';

const part = (id: string, defId: string) => ({ id: `p-${id}`, defId, hp: 50, wear: 0 });
const partItem = (id: string, defId: string, x: number, y: number, rot = 0): Item => ({ id, kind: 'part', x, y, rot, part: part(id, defId) });
const atOrigin = (it: Item): Item => ({ ...it, x: 0, y: 0 });

const afterArmor = (): Saved => armor.step(structuredClone(FORMAT_2_120) as SavedJson) as unknown as Saved;
const run = (world: Saved): Saved => step.step(structuredClone(world) as unknown as SavedJson) as unknown as Saved;
const truck = (id: string, chassisId: string, items: Item[], extra: Partial<Vehicle> = {}): Vehicle => ({ id, chassisId, items, job: null, ...extra });
const worldOf = (vehicles: Vehicle[], vehicleId = vehicles[0].id): Saved => ({ player: { vehicleId, storage: [] }, vehicles });

const dimOf = (it: Item) => {
  if (!it.part) return { w: 1, h: 1 };
  const [w, h] = PARTS_121_122[it.part.defId].next;
  return it.rot % 2 === 1 ? { w: h, h: w } : { w, h };
};

const cellsOf = (it: Item) => {
  const { w, h } = dimOf(it);
  return Array.from({ length: w * h }, (_, i) => ({ x: it.x + (i % w), y: it.y + Math.floor(i / w) }));
};

const letters = (chassisId: string, it: Item) => cellsOf(it).map((c) => CHASSIS_121_122[chassisId].next[c.y]?.[c.x] ?? '#');

function mountedOn(chassisId: string, it: Item): boolean {
  if (!it.part) return false;
  const l = letters(chassisId, it);
  return l.every((c) => c === l[0]) && PARTS_121_122[it.part.defId].mounts.includes(l[0]);
}

function layerOf(chassisId: string, it: Item): string {
  return it.part && PARTS_121_122[it.part.defId].kind === 'accessory' && mountedOn(chassisId, it) ? 'accessory' : 'base';
}

function expectLegal(v: Vehicle): void {
  const rows = CHASSIS_121_122[v.chassisId].next;
  const width = Math.max(...rows.map((r) => r.length));
  const taken = new Set<string>();
  for (const it of v.items) {
    const l = letters(v.chassisId, it);
    const chassisCells = cellsOf(it).filter((c) => c.y < rows.length).length;
    expect([0, cellsOf(it).length], `${v.id} ${it.id} crosses the chassis end`).toContain(chassisCells);
    for (const c of cellsOf(it)) {
      expect(c.x >= 0 && c.x < width && c.y >= 0, `${v.id} ${it.id} on the grid`).toBe(true);
      expect(l.includes(' '), `${v.id} ${it.id} on a hole`).toBe(false);
      const key = `${layerOf(v.chassisId, it)}:${c.x},${c.y}`;
      expect(taken.has(key), `${v.id} ${it.id} overlaps at ${key}`).toBe(false);
      taken.add(key);
    }
    const kind = it.part ? PARTS_121_122[it.part.defId].kind : 'good';
    if (kind !== 'armor' && !mountedOn(v.chassisId, it)) expect(l.some((c) => SKIN.includes(c)), `${v.id} ${it.id} loose on skin`).toBe(false);
  }
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const warnings = () => warn.mock.calls.map((c) => String(c[0]));

describe('save migration 121 to 122, square grid', () => {
  it('is the newest tiny step, from format 121', () => {
    expect(TINY_STEPS[121 - TINY_FROM]).toBe(step);
    expect(TINY_STEPS[TINY_STEPS.length - 1]).toBe(step);
  });

  it('puts every fixture item on a legal spot of the new grid with no overlaps, and loses none unreported', () => {
    const before = afterArmor();
    const after = run(before);
    const known = (v: Vehicle) => v.chassisId in CHASSIS_121_122;
    for (const v of after.vehicles.filter(known)) expectLegal(v);
    const count = (w: Saved) => w.vehicles.filter(known).reduce((n, v) => n + v.items.length, 0);
    const dropped = warnings().filter((w) => w.includes('was dropped')).length;
    const stored = after.player.storage.length - before.player.storage.length;
    expect(count(after) + stored + dropped).toBe(count(before));
    expect(stored + dropped).toBe(0);
  });

  it('keeps ids, kinds, rotations and parts of every kept item', () => {
    const before = afterArmor();
    const after = run(before);
    for (const v of after.vehicles) {
      const old = before.vehicles.find((x) => x.id === v.id)!;
      expect(v.items.map(atOrigin)).toEqual(old.items.map(atOrigin));
    }
  });

  it('leaves a truck of an unknown chassis as it is', () => {
    const before = afterArmor();
    expect(run(before).vehicles.find((v) => v.id === 'r1')).toEqual(before.vehicles.find((v) => v.id === 'r1'));
  });

  it('moves a ram to the nearest front cells, the left one when two are as near', () => {
    const ram = run(afterArmor()).vehicles.find((v) => v.id === 's1')!.items.find((i) => i.id === 'ram')!;
    expect({ x: ram.x, y: ram.y }).toEqual({ x: 1, y: 0 });
  });

  it('reports each move off the nearest spot with the truck, item and reason', () => {
    run(afterArmor());
    const line = warnings().find((w) => w.includes('crateF'))!;
    expect(line).toContain('s1 (scout)');
    expect(line).toContain('its nearest spot is taken');
    expect(warnings().find((w) => w.includes('bedBox'))).toContain('its nearest spot is not legal for it');
  });

  it('keeps bed rows in order below the new chassis rows', () => {
    const rows = CHASSIS_121_122.hauler.next.length;
    const bed = run(afterArmor()).vehicles.find((v) => v.id === 'h1')!.items;
    const crate = bed.find((i) => i.id === 'bedCrate')!;
    expect(crate.y).toBeGreaterThanOrEqual(rows);
    const box = bed.find((i) => i.id === 'bedBox')!;
    expect(box.y).toBeGreaterThanOrEqual(rows);
  });

  it('puts built-in core items on the new core spots of their chassis', () => {
    const c = CHASSIS_121_122.scout;
    const items = c.oldCore.map((k, i) => partItem(`core${i}`, k.defId, k.x, k.y, k.rot ?? 0));
    const out = run(worldOf([truck('t1', 'scout', items)])).vehicles[0].items;
    const spots = out.map((i) => `${i.part!.defId}@${i.x},${i.y}`).sort();
    expect(spots).toEqual(c.nextCore.map((k) => `${k.defId}@${k.x},${k.y}`).sort());
    expect(out.filter((i) => i.part!.defId === 'wheel').map((i) => `${i.x},${i.y}`).sort()).toEqual(['1,11', '1,2', '4,11', '4,2']);
    expectLegal(truck('t1', 'scout', out));
  });

  it.each(Object.keys(CHASSIS_121_122))('puts every built-in core of the %s on its exact new core spot, legally', (chassisId) => {
    const c = CHASSIS_121_122[chassisId];
    const items = c.oldCore.map((k, i) => partItem(`core${i}`, k.defId, k.x, k.y, k.rot ?? 0));
    const out = run(worldOf([truck('t1', chassisId, items)])).vehicles[0];
    const spots = out.items.map((i) => `${i.part!.defId}@${i.x},${i.y},${i.rot}`).sort();
    expect(spots).toEqual(c.nextCore.map((k) => `${k.defId}@${k.x},${k.y},${k.rot ?? 0}`).sort());
    expectLegal(out);
    out.items.forEach((i) => expect(mountedOn(chassisId, i), `${chassisId} ${i.id} sits on X cells`).toBe(true));
    expect(warnings()).toEqual([]);
  });

  it('places a core part that is not at its built-in spot like any other mounted part', () => {
    const swapped = partItem('w', 'wheelHeavy', 1, 2);
    const out = run(worldOf([truck('t1', 'scout', [swapped])])).vehicles[0];
    expectLegal(out);
    expect(mountedOn('scout', out.items[0])).toBe(true);
  });

  it('sends a part that fits nowhere on a player truck to storage and reports it', () => {
    const guns = Array.from({ length: 5 }, (_, i) => partItem(`gun${i}`, 'mg', 1, 4));
    const out = run(worldOf([truck('t1', 'scout', guns, { weaponOrders: { gun4: { targetId: 'x' }, gun0: { targetId: 'y' } } })]));
    expect(out.vehicles[0].items).toHaveLength(3);
    expectLegal(out.vehicles[0]);
    expect(out.player.storage.map((p) => p.id)).toEqual(['p-gun3', 'p-gun4']);
    expect(Object.keys(out.vehicles[0].weaponOrders!)).toEqual(['gun0']);
    const lines = warnings().filter((w) => w.includes('player storage'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('t1 (scout) item gun3 (mg)');
  });

  it('drops the part on an NPC truck and reports it', () => {
    const guns = Array.from({ length: 5 }, (_, i) => partItem(`gun${i}`, 'mg', 1, 4));
    const out = run(worldOf([truck('p0', 'scout', []), truck('n1', 'scout', guns, { faction: 'raiders' })], 'p0'));
    expect(out.vehicles[1].items).toHaveLength(3);
    expect(out.player.storage).toEqual([]);
    expect(warnings().filter((w) => w.includes('n1 (scout) item') && w.includes('was dropped'))).toHaveLength(2);
  });

  it('maps refit moves and pickups, keeps a moved item at its new spot and drops queued steps that name a lost item', () => {
    const guns = Array.from({ length: 4 }, (_, i) => partItem(`gun${i}`, 'mg', 1, 4));
    const job = {
      kind: 'refit',
      turnsLeft: 1,
      total: 1,
      moves: [{ itemId: 'gun0', from: { x: 1, y: 4, rot: 0 }, to: { x: 5, y: 4, rot: 0 } }],
      pickup: null,
      queue: [
        { moves: [{ itemId: 'gun3', from: { x: 1, y: 4, rot: 0 }, to: { x: 5, y: 4, rot: 0 } }], pickup: null },
        { moves: [{ itemId: 'gun1', from: { x: 5, y: 4, rot: 0 }, to: { x: 1, y: 4, rot: 0 } }], pickup: null },
      ],
    };
    const out = run(worldOf([truck('t1', 'scout', guns, { job: job as unknown as Vehicle['job'] })]));
    const v = out.vehicles[0];
    const gun0 = v.items.find((i) => i.id === 'gun0')!;
    expect(v.job!.moves[0].from).toEqual({ x: gun0.x, y: gun0.y, rot: 0 });
    expect(CHASSIS_121_122.scout.next[v.job!.moves[0].to.y][v.job!.moves[0].to.x]).toBe('D');
    expect(v.job!.queue).toHaveLength(1);
    expect(v.job!.queue[0].moves[0].itemId).toBe('gun1');
    expect(warnings().some((w) => w.includes('dropped queued refit step 1'))).toBe(true);
  });

  it('refuses a part it does not know', () => {
    expect(() => run(worldOf([truck('t1', 'scout', [partItem('x', 'ghostPart', 1, 4)])]))).toThrow('ghostPart');
  });
});

describe('square grid step, a gun that fits nowhere in its rotation', () => {
  it('turns it as a last resort, says so, and keeps the truck legal', () => {
    const out = run(worldOf([truck('t1', 'buggy', [partItem('side', 'mg', 1, 5, 1)])]));
    const gun = out.vehicles[0].items[0];
    expect(gun.rot).not.toBe(1);
    expectLegal(out.vehicles[0]);
    expect(mountedOn('buggy', gun)).toBe(true);
    expect(warnings().find((w) => w.includes('t1 (buggy) item side'))).toContain('turned from rotation 1 to');
  });
});
