import { describe, expect, it } from 'vitest';
import { CHASSIS, PLAYER_CHASSIS } from '../data/chassis';
import { NPCS } from '../data/npcs';
import { PARTS } from '../data/parts';
import { REGION } from '../data/region';
import { barrelClash } from './barrels';
import { buyChassis } from './economy';
import { partDef } from '../data/parts';
import { makePart, makeVehicle, partWithId } from './factory';
import { baseGrid, bareGrid, belowDeck, cargoCellsOn, cellCount, cellsTurned, findSpot, fixedHoldCells, freeCells, gridOf, hitGridOf, holdCell, holdOwners, layerOf, isMounted, onDeadCell, placementError, itemCells, mountedItems, mountedParts, mountSpots, plateSide, poseTurnedLike, sideOf, type Cell } from './grid';
import { getLayoutError, moveItem, mountPart, storePart, stowSpot } from './inventory';
import { generateNpcLoadout } from './npc-loadout';
import { addVehicle, emptyWorld } from './testkit';
import type { GridItem, Vehicle, World } from './types';
import { sitePads } from './sites';
import { fallbackFaction } from './spawn';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;

const coreIds = (v: Vehicle) => mountedParts(v, 'core').map((p) => p.defId).sort();
const roleOf = (defId: string) => { const def = partDef(defId); return def.kind === 'core' ? def.role : null; };
const coreItem = (w: World, role: string) => w.vehicles[0].items.find((it) => it.kind === 'part' && roleOf(it.part.defId) === role)!;

function spotOn(chassisId: string, defId: string, letter: Cell, items: GridItem[]): GridItem {
  const g = baseGrid(chassisId);
  const taken = new Set(items.flatMap((it) => itemCells(it).map((c) => `${c.x},${c.y}`)));
  for (const rot of [0, 1] as const) {
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const item: GridItem = { id: 'probe', x, y, rot, kind: 'part', part: { id: 'probe', defId, hp: 1, wear: 0 } };
        const cells = itemCells(item);
        if (cells.every((c) => g.cells[c.y]?.[c.x] === letter && !taken.has(`${c.x},${c.y}`))) return item;
      }
    }
  }
  throw new Error(`No ${letter} spot for ${defId} on ${chassisId}`);
}

describe('built-in parts', () => {
  it('every chassis builds with all its core parts mounted', () => {
    for (const ch of Object.values(CHASSIS)) {
      const w = emptyWorld();
      const v = addVehicle(w, 'scrapjaw', ch.id, [], { x: 40, y: 40 });
      const want = ch.core.map((c) => c.defId).sort();
      const roles = want.map(roleOf);
      expect(roles.filter((r) => r === 'cab')).toHaveLength(1);
      const wheels = roles.filter((r) => r === 'wheel').length;
      expect(wheels >= 4 && wheels % 2 === 0, `${ch.id} has ${wheels} wheels`).toBe(true);
      expect(roles.filter((r) => r === 'transmission')).toHaveLength(1);
      expect(roles.filter((r) => r === 'tank')).toHaveLength(1);
      expect(coreIds(v)).toEqual(want);
    }
  });

  it('every NPC template mounts all its parts', () => {
    for (const tpl of Object.values(NPCS)) {
      const w = emptyWorld();
      const loadout = generateNpcLoadout(w, tpl);
      const v = makeVehicle(w, { faction: fallbackFaction(tpl), ...loadout, pos: { x: 40, y: 40 }, heading: 0, brain: null });
      const mounted = mountedParts(v).map((p) => p.defId).filter((id) => PARTS[id].kind !== 'core');
      expect(mounted.sort()).toEqual(loadout.parts.map((p) => p.defId).sort());
    }
  });

  it('moving or storing a core part throws', () => {
    const w = emptyWorld(sitePads(bowl)[0]);
    const cab = coreItem(w, 'cab');
    expect(() => moveItem(w, cab.id, { x: cab.x, y: cab.y, rot: cab.rot })).toThrow('Refused: builtInFixed');
    expect(() => storePart(w, cab.id)).toThrow(/Refused/);
  });

  it('shops never stock core parts', () => {
    const w = emptyWorld(sitePads(bowl)[0]);
    const stocked = Object.values(w.shops).flatMap((shop) => shop.stock);
    expect(stocked.some((p) => partDef(p.defId).kind === 'core')).toBe(false);
  });

  it('a chassis swap replaces the core parts with the new chassis ones', () => {
    let w = emptyWorld(sitePads(bowl)[0]);
    w.player.money = CHASSIS.hauler.value;
    w.vehicles[0].items.forEach((it) => { if (it.kind === 'part' && roleOf(it.part.defId) === 'cab') it.part.hp = 1; });
    w = buyChassis(w, 'hauler');
    const me = w.vehicles[0];
    expect(coreIds(me)).toEqual(CHASSIS.hauler.core.map((c) => c.defId).sort());
    expect(mountedParts(me, 'core').every((p) => p.hp === PARTS[p.defId].hp)).toBe(true);
    expect(w.player.storage.filter((p) => PARTS[p.defId].kind === 'core')).toHaveLength(0);
  });
});

describe('cargo in the hold', () => {
  it('rejects an item across the end of the chassis grid', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'scout', [], { x: 40, y: 40 });
    v.items.push({ ...spotOn('scout', 'rack', 'D', v.items), id: 'i-rack', part: makePart(w, 'rack', 0) } as GridItem);
    const g = gridOf(v);
    const spare = (y: number, rot: 0 | 1): GridItem => ({ id: 'i-spare', x: 1, y, rot, kind: 'part', part: makePart(w, 'rack', 0) });
    expect(g.cells[g.chassisH][1]).toBe('.');
    expect(placementError(g, v.items, spare(g.chassisH - 1, 0), null)).toEqual({ id: 'noFit' });
    expect(placementError(g, v.items, spare(g.chassisH, 1), null)).toBeNull();
  });
});

describe('broken cargo cells', () => {
  function hauler(parts: string[]) {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'hauler', parts, { x: 40, y: 40 });
    const cargo = mountedParts(v, 'cargo');
    return { v, cargo };
  }

  it('a broken hauling rack keeps its cells in the hold but makes them dead', () => {
    const { v, cargo } = hauler(['haulingRack']);
    const working = gridOf(v);
    const free = freeCells(v);
    cargo[0].hp = 0;
    const g = gridOf(v);
    expect(g.h).toBe(working.h);
    expect(g.hold).toBe('.'.repeat(fixedHoldCells('hauler')) + 'x'.repeat(8));
    expect(freeCells(v)).toBe(free - 8);
  });

  it('a broken part kills only its own cells, wherever it sits in the hold', () => {
    const { v, cargo } = hauler(['haulingRack', 'rack']);
    const [big, small] = cargo.map((p) => p.defId === 'haulingRack' ? 8 : 4);
    cargo[0].hp = 0;
    const g = gridOf(v);
    const fixed = fixedHoldCells('hauler');
    expect(g.hold).toBe('.'.repeat(fixed) + 'x'.repeat(big) + '.'.repeat(small));
    expect(holdOwners(v).slice(fixed)).toEqual([...Array(big).fill(mountedItems(v, 'cargo')[0].part.id), ...Array(small).fill(mountedItems(v, 'cargo')[1].part.id)]);
  });

  it('rejects an item on a dead cell', () => {
    const { v, cargo } = hauler(['haulingRack']);
    cargo[0].hp = 0;
    const g = gridOf(v);
    const deadSpot = holdCell(g, fixedHoldCells('hauler'));
    const salt: GridItem = { id: 'i-salt', ...deadSpot, rot: 0, kind: 'good', good: 'salt' };
    expect(placementError(g, v.items, salt, null)).toEqual({ id: 'noFit' });
    expect(onDeadCell(g, salt)).toBe(true);
    expect(onDeadCell(g, { ...salt, ...holdCell(g, fixedHoldCells('hauler') - 1) })).toBe(false);
  });

  it('repairing the part brings its cells back', () => {
    const { v, cargo } = hauler(['haulingRack']);
    cargo[0].hp = 0;
    gridOf(v);
    cargo[0].hp = 1;
    expect(gridOf(v).hold).toBe('.'.repeat(fixedHoldCells('hauler') + 8));
  });
});

describe('cargoCellsOn', () => {
  const cargoIds = Object.values(PARTS).filter((p) => p.kind === 'cargo').map((p) => p.id);

  it.each(['hauler', 'courier', 'scout'])('matches the hold cells a working %s gains by mounting each cargo part', (chassisId) => {
    for (const defId of cargoIds) {
      const w = emptyWorld();
      const v = addVehicle(w, 'scrapjaw', chassisId, [], { x: 40, y: 40 });
      const before = gridOf(v).hold.length;
      if (!mountPart(w, v, makePart(w, defId, 0))) continue;
      expect(gridOf(v).hold.length - before, `${defId} on ${chassisId}`).toBe(cargoCellsOn(chassisId, defId));
    }
  });

  it('gives the cells the part names: panniers 3, rack 4, hauling rack 8', () => {
    expect(['panniers', 'rack', 'haulingRack'].map((id) => cargoCellsOn('hauler', id))).toEqual([3, 4, 8]);
  });

  it('throws for a part that is not cargo', () => {
    expect(() => cargoCellsOn('hauler', 'mg')).toThrow();
  });
});

describe('side armor mounts', () => {
  for (const letter of ['F', 'B', 'L', 'R'] as const) {
    it(`armor mounts on ${letter}`, () => {
      const w = emptyWorld();
      const v = addVehicle(w, 'scrapjaw', 'hauler', [], { x: 40, y: 40 });
      const plate: GridItem = { ...spotOn('hauler', 'plates', letter, v.items), id: 'i-plate', part: makePart(w, 'plates', 0) } as GridItem;
      v.items.push(plate);
      expect(isMounted('hauler', plate)).toBe(true);
      expect(sideOf(v, (plate as Extract<GridItem, { kind: 'part' }>).part)).toBe(letter);
    });
  }

  it('a part spanning two letters is not mounted', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'hauler', [], { x: 40, y: 40 });
    const onL = spotOn('hauler', 'plates', 'L', v.items);
    const g = baseGrid('hauler');
    const across: GridItem = { ...onL, rot: 1, id: 'i-plate', part: makePart(w, 'plates', 0) } as GridItem;
    const letters = new Set(itemCells(across).map((c) => g.cells[c.y][c.x]));
    expect(letters.has('L')).toBe(true);
    expect(letters.size).toBeGreaterThan(1);
    expect(isMounted('hauler', across)).toBe(false);
  });

  it('plateSide gives a mounted plate its mount side, even a square one', () => {
    for (const letter of ['F', 'B', 'L', 'R'] as const) expect(plateSide('hauler', spotOn('hauler', 'steelPlate', letter, []))).toBe(letter);
  });

  it('plateSide lays a spare plate on the front when it lies wide and on the left when it lies tall', () => {
    const spare = (rot: 0 | 1): GridItem => ({ id: 'i-plate', x: 0, y: 20, rot, kind: 'part', part: { id: 'p', defId: 'plates', hp: 1, wear: 0 } });
    const wide = partDef('plates').w > partDef('plates').h;
    expect(plateSide('hauler', spare(0))).toBe(wide ? 'F' : 'L');
    expect(plateSide('hauler', spare(1))).toBe(wide ? 'L' : 'F');
  });

  it('sideOf is null for parts that are not mounted armor', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'hauler', ['mg'], { x: 40, y: 40 });
    expect(sideOf(v, mountedParts(v, 'weapon')[0])).toBeNull();
  });

  it('NPC armor takes the front first', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'wagon', ['plates'], { x: 40, y: 40 });
    const [plate] = mountedItems(v, 'armor');
    expect(sideOf(v, plate.part)).toBe('F');
  });

  it('mounted items follow a part moved off its mount and give the current objects of a cloned truck', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'wagon', ['plates'], { x: 40, y: 40 });
    const [plate] = mountedItems(v, 'armor');
    const clone = structuredClone(v);
    expect(mountedItems(clone, 'armor')[0]).toBe(clone.items.find((it) => it.id === plate.id));
    plate.y += 20;
    expect(mountedItems(v, 'armor')).toEqual([]);
    expect(mountedItems(clone, 'armor')).toHaveLength(1);
  });

  it('every part states its armor', () => {
    for (const p of Object.values(PARTS)) expect(p.armor).toBeGreaterThan(0);
  });

  it('the ram multiplies ram damage, plates and cage do not', () => {
    const ram = PARTS.ram;
    if (ram.kind !== 'accessory') throw new Error('ram must be an accessory');
    expect(ram.ramMult).toBeGreaterThan(1);
    for (const id of ['plates', 'cage']) {
      const d = PARTS[id];
      if (d.kind !== 'armor') throw new Error(`${id} must be armor`);
      expect(d.ramMult).toBe(1);
    }
  });
});

const OPEN_RING = ['buggy', 'courier', 'jeep'];
const FACES: Record<string, { dx: number; dy: number }> = { F: { dx: 0, dy: -1 }, B: { dx: 0, dy: 1 }, L: { dx: -1, dy: 0 }, R: { dx: 1, dy: 0 } };

function openFaces(chassisId: string, x: number, y: number): string[] {
  const g = baseGrid(chassisId);
  const insideBody = (nx: number, ny: number) => nx >= 1 && nx <= g.w - 2 && ny >= 1 && ny <= g.h - 2;
  return Object.entries(FACES).filter(([, f]) => g.cells[y + f.dy]?.[x + f.dx] == null && !insideBody(x + f.dx, y + f.dy)).map(([letter]) => letter);
}

function cellsOfLayout(chassisId: string): { x: number; y: number; letter: Cell }[] {
  const g = baseGrid(chassisId);
  return g.cells.flatMap((row, y) => row.flatMap((letter, x) => (letter === null ? [] : [{ x, y, letter }])));
}

describe('armor ring', () => {
  it('leaves the four corner cells out of every chassis', () => {
    for (const id of Object.keys(CHASSIS)) {
      const g = baseGrid(id);
      const corners = [g.cells[0][0], g.cells[0][g.w - 1], g.cells[g.h - 1][0], g.cells[g.h - 1][g.w - 1]];
      expect(corners, id).toEqual([null, null, null, null]);
    }
  });

  it('puts an armor mount on every outline cell, on a side that cell faces', () => {
    for (const id of Object.keys(CHASSIS).filter((c) => !OPEN_RING.includes(c))) {
      for (const { x, y, letter } of cellsOfLayout(id)) {
        const faces = openFaces(id, x, y);
        if (faces.length > 0) expect(faces, `${id} ${x},${y}`).toContain(letter);
      }
    }
  });

  it('keeps armor mounts off the inside of the ring', () => {
    for (const id of Object.keys(CHASSIS).filter((c) => !OPEN_RING.includes(c))) {
      for (const { x, y, letter } of cellsOfLayout(id)) {
        if (openFaces(id, x, y).length === 0) expect('FBLR'.includes(letter), `${id} ${x},${y}`).toBe(false);
      }
    }
  });
});

describe('side armor skin', () => {
  const probe = (defId: string, x: number, y: number): GridItem => ({ id: 'probe', x, y, rot: 0, kind: 'part', part: { id: 'probe', defId, hp: 1, wear: 0 } });

  it('lets armor lie on a side column and refuses every other item there', () => {
    const g = baseGrid('scout');
    expect(placementError(g, [], probe('steelPlate', 0, 2), null)).toBeNull();
    expect(placementError(g, [], probe('mg', 0, 2), null)).toEqual({ id: 'armorOnly' });
    expect(placementError(g, [], { id: 'g', x: g.w - 1, y: 2, rot: 0, kind: 'good', good: 'scrap' }, null)).toEqual({ id: 'armorOnly' });
  });

  it('does not count the armor ring as cargo cells', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'scout', [], { x: 40, y: 40 });
    const g = baseGrid('scout');
    const skin = g.cells.flat().filter((c) => c === 'F' || c === 'B' || c === 'L' || c === 'R').length;
    expect(skin).toBe(2 * (g.h - 2) + 2 * (g.w - 2));
    expect(cellCount(g)).toBe(g.cells.flat().filter((c) => c !== null).length - skin);
    const before = freeCells(v);
    v.items.push({ id: 'i-plate', x: 0, y: 2, rot: 0, kind: 'part', part: makePart(w, 'steelPlate', 0) });
    expect(freeCells(v)).toBe(before);
  });

  it('refuses goods and spare parts on the front and back rows, and takes armor and a ram there', () => {
    const w = emptyWorld();
    const g = baseGrid('scout');
    const crate: GridItem = { id: 'i-crate', x: 3, y: 0, rot: 0, kind: 'good', good: 'salt' };
    expect(placementError(g, [], crate, null)).toEqual({ id: 'armorOnly' });
    expect(placementError(g, [], { ...crate, y: g.h - 1 }, null)).toEqual({ id: 'armorOnly' });
    expect(placementError(g, [], { ...crate, x: 1, y: 1 }, null)).toBeNull();
    const plate: GridItem = { id: 'i-plate', x: 2, y: 0, rot: 0, kind: 'part', part: makePart(w, 'steelPlate', 0) };
    expect(placementError(g, [], plate, null)).toBeNull();
  });
});

describe('the fixed hold', () => {
  const bedOf: Record<string, number> = { scout: 2, hauler: 4, longbed: 6 };

  it('holds two cells plus the built-in bed cells, laid in rows of the inner width with a partial last row', () => {
    for (const id of PLAYER_CHASSIS) {
      const cells = 2 + (bedOf[id] ?? 0);
      const g = bareGrid(id);
      const layout = baseGrid(id);
      const width = layout.w - 2;
      expect(fixedHoldCells(id), id).toBe(cells);
      expect(g.hold, id).toBe('.'.repeat(cells));
      expect(g.h, id).toBe(layout.h + Math.ceil(cells / width));
      expect(g.chassisH, id).toBe(layout.h);
      expect(cellCount(g) - cellCount(layout), id).toBe(cells);
      const last = g.cells[g.h - 1];
      expect(last.filter((c) => c === '.').length, id).toBe(cells - width * (Math.ceil(cells / width) - 1));
      expect([last[0], last[g.w - 1]], id).toEqual([null, null]);
    }
  });

  it('is the whole hold of a truck with no cargo part', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'hauler', [], { x: 40, y: 40 });
    expect(gridOf(v)).toBe(bareGrid('hauler'));
  });

  it('keeps the layout grid alone', () => {
    expect(baseGrid('scout').h).toBe(CHASSIS.scout.layout.length);
  });

  it('keeps its cargo when every cargo part breaks', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'longbed', ['rack'], { x: 40, y: 40 });
    for (const p of mountedParts(v, 'cargo')) p.hp = 0;
    const g = gridOf(v);
    const crate: GridItem = { id: 'i-crate', ...holdCell(g, fixedHoldCells('longbed') - 1), rot: 0, kind: 'good', good: 'salt' };
    expect(onDeadCell(g, crate)).toBe(false);
    expect(placementError(g, v.items, crate, null)).toBeNull();
  });

  it('leaves the two base cells out of the hit grid and keeps every other cell where it was', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'hauler', ['rack'], { x: 40, y: 40 });
    const g = gridOf(v);
    const hit = hitGridOf(v);
    expect(hit.h).toBe(g.h);
    expect([holdCell(g, 0), holdCell(g, 1)].map((c) => hit.cells[c.y][c.x])).toEqual([null, null]);
    expect(hit.cells.flat().filter((c) => c === '.').length).toBe(g.cells.flat().filter((c) => c === '.').length - 2);
  });
});

describe('sorokonoga trailer cargo', () => {
  const cargoIds = Object.values(PARTS).filter((p) => p.kind === 'cargo').map((p) => p.id);

  it('gives half again as many cells from every cargo part, rounded down', () => {
    for (const id of cargoIds) {
      const own = (partDef(id) as { cells: number }).cells;
      expect(cargoCellsOn('sorokonoga', id), id).toBe(Math.floor(own * 1.5));
      expect(cargoCellsOn('hauler', id), id).toBe(own);
    }
  });
});

describe('placement from a layout built once', () => {
  const oracleLayer = (g: ReturnType<typeof gridOf>, it: GridItem) => layerOf(g, it);

  function oracleError(g: ReturnType<typeof gridOf>, items: GridItem[], item: GridItem, ignoreId: string | null) {
    const cells = itemCells(item);
    const onChassis = cells.filter((c) => c.y < g.chassisH).length;
    if (!belowDeck(g.chassisId, item) && ((onChassis !== 0 && onChassis !== cells.length) || !cells.every((c) => g.cells[c.y]?.[c.x] != null))) return { id: 'noFit' };
    const layer = oracleLayer(g, item);
    const others = items.filter((o) => o.id !== ignoreId && oracleLayer(g, o) === layer);
    if (others.some((o) => itemCells(o).some((c) => cells.some((d) => d.x === c.x && d.y === c.y)))) return { id: 'inTheWay' };
    const onSkin = item.kind === 'part' && (partDef(item.part.defId).kind === 'armor' || layer === 'accessory');
    if (!onSkin && cells.some((c) => 'FBLR'.includes(g.cells[c.y]?.[c.x] ?? ' ') && g.cells[c.y]?.[c.x] != null)) return { id: 'armorOnly' };
    return barrelClash(g.chassisId, items.filter((o) => o.id !== ignoreId), item) ? { id: 'barrel' } : null;
  }

  function oracleSpot(g: ReturnType<typeof gridOf>, items: GridItem[], item: GridItem, avoid: Cell[] | null) {
    const spots = [0, 1].flatMap((rot) => Array.from({ length: g.w * g.h }, (_, i) => ({ x: i % g.w, y: Math.floor(i / g.w), rot: rot as 0 | 1 })));
    const onlyOn = (s: (typeof spots)[number], cell: Cell) => itemCells({ ...item, ...s }).every((c) => g.cells[c.y]?.[c.x] === cell);
    const allowed = (s: (typeof spots)[number]) => oracleError(g, items, { ...item, ...s }, item.id) === null && !(avoid && avoid.some((a) => onlyOn(s, a)));
    return spots.find((s) => allowed(s) && onlyOn(s, '.')) ?? spots.find(allowed) ?? null;
  }

  function loadedVehicles(): Vehicle[] {
    const w = emptyWorld();
    return Object.values(NPCS).map((tpl) => makeVehicle(w, { faction: fallbackFaction(tpl), ...generateNpcLoadout(w, tpl), pos: { x: 40, y: 40 }, heading: 0, brain: null }));
  }

  it('findSpot returns the spot of a from-scratch search for goods and every item of an NPC truck', () => {
    for (const v of loadedVehicles()) {
      const g = gridOf(v);
      const crate = { id: 'crate-probe', kind: 'good', good: 'scrap', x: 0, y: 0, rot: 0 } as GridItem;
      for (const item of [crate, ...v.items]) {
        expect(findSpot(g, v.items, item, null, null)).toEqual(oracleSpot(g, v.items, item, null));
        expect(findSpot(g, v.items, item, null, ['D'])).toEqual(oracleSpot(g, v.items, item, ['D']));
      }
    }
  });

  it('placementError matches a from-scratch check for every item moved over the truck', () => {
    for (const v of loadedVehicles()) {
      const g = gridOf(v);
      for (const item of v.items) {
        for (const other of v.items.slice(0, 6)) {
          const moved = { ...item, x: other.x, y: other.y } as GridItem;
          expect(placementError(g, v.items, moved, item.id)).toEqual(oracleError(g, v.items, moved, item.id));
        }
      }
    }
  });

  it('getLayoutError gives the first refusal of a per-item check on valid and broken layouts', () => {
    for (const v of loadedVehicles()) {
      const first = (items: GridItem[]) => {
        const g = gridOf({ ...v, items });
        for (const item of items) {
          const cause = oracleError(g, items, item, item.id);
          if (cause) return { id: 'badLayout', cause };
        }
        return null;
      };
      expect(getLayoutError(v, v.items)).toEqual(first(v.items));
      expect(getLayoutError(v, v.items)).toBeNull();
      const stacked = v.items.map((it, i) => (i === v.items.length - 1 ? { ...it, x: v.items[0].x, y: v.items[0].y } : it)) as GridItem[];
      expect(getLayoutError(v, stacked)).toEqual(first(stacked));
      const off = v.items.map((it, i) => (i === 3 ? { ...it, x: 99, y: 99 } : it)) as GridItem[];
      expect(getLayoutError(v, off)).toEqual(first(off));
      for (let i = 0; i < v.items.length; i++) {
        const shifted = v.items.map((it, j) => (j === i ? { ...it, x: it.x + 1 } : it)) as GridItem[];
        expect(getLayoutError(v, shifted)).toEqual(first(shifted));
      }
    }
  });
});

describe('loose storage on deck cells', () => {
  const deckSpot = (chassisId: string): { x: number; y: number } => {
    const cell = cellsOfLayout(chassisId).find((c) => c.letter === 'D');
    if (!cell) throw new Error(`No deck cell on ${chassisId}`);
    return cell;
  };

  it('takes a goods crate on a deck cell', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'scout', [], { x: 40, y: 40 });
    const { x, y } = deckSpot('scout');
    const crate: GridItem = { id: 'i-crate', x, y, rot: 0, kind: 'good', good: 'salt' };
    expect(placementError(gridOf(v), v.items, crate, null)).toBeNull();
  });

  it('takes a spare engine part on a deck cell without mounting it', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'hauler', [], { x: 40, y: 40 });
    const loose: GridItem = { id: 'i-spare', x: 0, y: 0, rot: 0, kind: 'part', part: makePart(w, 'stockEngine', 0) };
    const onDeck = mountSpots(gridOf(v), v.items, loose, ['D'])[0];
    if (!onDeck) throw new Error('No deck spot on the hauler takes an engine');
    const spare: GridItem = { ...loose, ...onDeck };
    expect(placementError(gridOf(v), v.items, spare, null)).toBeNull();
    expect(isMounted('hauler', spare)).toBe(false);
    v.items.push(spare);
    expect(mountedParts(v, 'engine')).not.toContain(spare.part);
  });

  it('stows a goods crate on a deck cell when the storage rows are full', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'scout', [], { x: 40, y: 40 });
    const g = gridOf(v);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        if (g.cells[y][x] === '.') v.items.push({ id: `i-fill-${x}-${y}`, x, y, rot: 0, kind: 'good', good: 'scrap' });
      }
    }
    const crate: GridItem = { id: 'i-crate', x: 0, y: 0, rot: 0, kind: 'good', good: 'salt' };
    const spot = stowSpot(v, crate)!;
    expect(spot).not.toBeNull();
    expect(spot.y).toBeLessThan(g.chassisH);
    expect(baseGrid('scout').cells[spot.y][spot.x]).toBe('D');
  });
});

describe('poseTurnedLike', () => {
  const gun = (rot: number) => ({ id: 'g', kind: 'part', x: 0, y: 0, rot, part: partWithId('pg', 'mg', 0) }) as GridItem;
  const plate = (rot: number) => ({ id: 'a', kind: 'part', x: 0, y: 0, rot, part: partWithId('pa', 'spacedArmor', 0) }) as GridItem;

  it.each([0, 1, 2, 3, 4, 5, 6, 7] as const)('keeps pose %i for a gun and lays a plate the same way', (rot) => {
    expect(poseTurnedLike(gun(0), rot)).toBe(rot);
    const pose = poseTurnedLike(plate(0), rot);
    expect([0, 1]).toContain(pose);
    expect(cellsTurned({ rot: pose })).toBe(cellsTurned({ rot }));
  });
});
