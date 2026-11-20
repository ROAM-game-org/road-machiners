import { describe, expect, it } from 'vitest';
import { cargoCellsOn, fixedHoldCells, gridOf, holdCell, isDeadCell, itemCells, mountedParts } from './grid';
import { moveItem } from './inventory';
import { makePart } from './factory';
import { spillDeadCells } from './spill';
import { addVehicle, emptyWorld, parkedAtOutpost, stockOfKind, testDrive } from './testkit';
import { haulerOf } from './damage';
import { outpostBuyPart } from './outposts';
import { installSpot, takeFromStorage } from './inventory';
import type { GameEvent, GridItem, PartInstance, Vehicle, World } from './types';
import { endTurn } from './world';
import { damagePart, maxHp } from './wear';
import { WEAR } from '../data/wear';

const panniersOf = (v: Vehicle): PartInstance => mountedParts(v, 'cargo').find((p) => p.defId === 'panniers')!;
const lastRow = (v: Vehicle) => gridOf(v).h - 1;
const onRow = (v: Vehicle, y: number) => v.items.filter((it) => itemCells(it).some((c) => c.y === y));
const spills = (w: World) => w.events.filter((e): e is Extract<GameEvent, { t: 'cargoSpilled' }> => e.t === 'cargoSpilled');
const unitsOn = (v: Vehicle) => v.items.length;
const pileUnits = (w: World) => w.salvage.filter((s) => s.pile).reduce((n, s) => n + Object.values(s.goods).reduce((a, b) => a + b, 0) + s.parts.length, 0);

function loadedPlayer(): { w: World; me: Vehicle } {
  const w = emptyWorld();
  const me = w.vehicles[0];
  const y = lastRow(me);
  me.items = me.items.filter((it) => !onRow(me, y).includes(it));
  const g = gridOf(me);
  for (let x = 0; x < g.w; x++) if (g.cells[y][x] === '.') me.items.push({ id: `salt-${x}`, x, y, rot: 0, kind: 'good', good: 'salt' });
  w.player.costBasis.salt = 20;
  return { w, me };
}

describe('cargo spills', () => {
  it('a broken cargo part drops what lies on its rows onto a player pile at the truck', () => {
    const { w, me } = loadedPlayer();
    const salt = onRow(me, lastRow(me)).length;
    const kept = me.items.filter((it) => it.y < lastRow(me)).map((it) => ({ ...it }));
    const before = unitsOn(me);
    panniersOf(me).hp = 0;
    const next = endTurn(w, testDrive);
    const mine = next.vehicles[0];
    const piles = next.salvage.filter((s) => s.pile);
    expect(piles).toHaveLength(1);
    expect(piles[0].goods.salt).toBe(salt);
    expect(piles[0].pile!.fromPlayer).toBe(true);
    expect(piles[0].pile!.basis.salt).toBe(20);
    expect(mine.items).toEqual(kept);
    expect(unitsOn(mine) + pileUnits(next)).toBe(before);
    expect(spills(next)).toEqual([{ t: 'cargoSpilled', vehicle: mine.id, part: panniersOf(mine).id, pile: piles[0].id, units: salt }]);
  });

  it('a spilled part keeps its id, wear and HP', () => {
    const { w, me } = loadedPlayer();
    const spare = makePart(w, 'mg', 2);
    spare.hp = 7;
    me.items = me.items.filter((it) => it.id !== 'salt-1');
    me.items.push({ id: 'i-spare', x: 1, y: lastRow(me), rot: 0, kind: 'part', part: spare });
    panniersOf(me).hp = 0;
    spillDeadCells(w);
    const pile = w.salvage.find((s) => s.pile)!;
    expect(pile.parts).toEqual([{ ...spare }]);
  });

  it('an item lying partly on dead cells spills whole', () => {
    const w = emptyWorld();
    const npc = addVehicle(w, 'independent', 'hauler', ['rack', 'haulingRack'], { x: 60, y: 60 });
    const hauling = mountedParts(npc, 'cargo').find((p) => p.defId === 'haulingRack')!;
    const g = gridOf(npc);
    const lastRackCell = holdCell(g, fixedHoldCells('hauler') + cargoCellsOn('hauler', 'rack') - 1);
    const tall: GridItem = { id: 'i-tall', ...lastRackCell, rot: 1, kind: 'part', part: makePart(w, 'rack', 0) };
    npc.items.push(tall);
    hauling.hp = 0;
    expect(isDeadCell(gridOf(npc), lastRackCell.x + 1, lastRackCell.y)).toBe(true);
    spillDeadCells(w);
    expect(npc.items.some((it) => it.id === 'i-tall')).toBe(false);
    const pile = w.salvage.find((s) => s.pile)!;
    expect(pile.parts.map((p) => p.id)).toEqual([tall.part.id]);
    expect(pile.pile!.fromPlayer).toBe(false);
  });

  it('a broken cargo part spills only the goods on its own cells', () => {
    const w = emptyWorld();
    const npc = addVehicle(w, 'independent', 'hauler', ['rack', 'haulingRack'], { x: 60, y: 60 });
    npc.items = npc.items.filter((it) => it.kind !== 'good');
    const rack = mountedParts(npc, 'cargo').find((p) => p.defId === 'rack')!;
    const g = gridOf(npc);
    const first = fixedHoldCells('hauler');
    const onRack = { id: 'on-rack', ...holdCell(g, first), rot: 0, kind: 'good', good: 'salt' } as GridItem;
    const onHauling = { id: 'on-hauling', ...holdCell(g, first + cargoCellsOn('hauler', 'rack')), rot: 0, kind: 'good', good: 'salt' } as GridItem;
    const onBed = { id: 'on-bed', ...holdCell(g, 0), rot: 0, kind: 'good', good: 'salt' } as GridItem;
    npc.items.push(onRack, onHauling, onBed);
    rack.hp = 0;
    spillDeadCells(w);
    expect(npc.items.filter((it) => it.kind === 'good').map((it) => it.id).sort()).toEqual(['on-bed', 'on-hauling']);
    expect(spills(w)).toEqual([expect.objectContaining({ part: rack.id, units: 1 })]);
  });

  it('a second spill beside the first joins its pile', () => {
    const { w, me } = loadedPlayer();
    const box = panniersOf(me);
    box.hp = 0;
    spillDeadCells(w);
    box.hp = 5;
    me.items.push({ id: 'salt-again', x: 1, y: lastRow(me), rot: 0, kind: 'good', good: 'salt' });
    box.hp = 0;
    spillDeadCells(w);
    const piles = w.salvage.filter((s) => s.pile);
    expect(piles).toHaveLength(1);
    expect(spills(w).map((e) => e.pile)).toEqual([piles[0].id, piles[0].id]);
  });

  it('a repaired cargo part gives its rows back empty and spills nothing more', () => {
    const { w, me } = loadedPlayer();
    const box = panniersOf(me);
    box.hp = 0;
    spillDeadCells(w);
    box.hp = 5;
    spillDeadCells(w);
    const g = gridOf(me);
    expect(g.hold).not.toContain('x');
    expect(onRow(me, lastRow(me))).toEqual([]);
    expect(spills(w)).toHaveLength(1);
  });

  it('wear that breaks a cargo part on the road spills it in the same turn', () => {
    const { w, me } = loadedPlayer();
    const box = panniersOf(me);
    box.hp = maxHp(box) * WEAR.hpShare;
    const salt = onRow(me, lastRow(me)).length;
    const rough = (world: World) => {
      const v = world.vehicles[0];
      v.trail = Array.from({ length: 200 }, (_, i) => ({ x: i % 2 === 0 ? 30 : 90, y: 30, heading: 0 }));
      v.speed = 5;
    };
    const next = endTurn(w, rough);
    expect(panniersOf(next.vehicles[0]).hp).toBe(0);
    expect(spills(next).map((e) => e.units)).toEqual([salt]);
    expect(onRow(next.vehicles[0], lastRow(next.vehicles[0]))).toEqual([]);
  });

  it('an open refit that moved a spilled item cancels', () => {
    const { w, me } = loadedPlayer();
    w.player.autoRepair = false;
    const gun = me.items.find((it) => it.kind === 'part' && it.part.defId === 'mg')!;
    const target = onRow(me, lastRow(me))[0];
    me.items = me.items.filter((it) => it === target || it.kind !== 'good' || it.y !== target.y);
    let next = moveItem(w, gun.id, { x: target.x, y: target.y, rot: 1 });
    expect(next.vehicles[0].job?.kind).toBe('refit');
    panniersOf(next.vehicles[0]).hp = 0;
    next = endTurn(next, testDrive);
    expect(next.vehicles[0].job).toBeNull();
  });
});

describe('built-in bed cells', () => {
  it('stay when every cargo part breaks, and spill only the part cells', () => {
    const w = emptyWorld();
    const npc = addVehicle(w, 'independent', 'hauler', ['rack'], { x: 40, y: 40 });
    const g = gridOf(npc);
    const bed = holdCell(g, fixedHoldCells('hauler') - 1);
    const onPart = holdCell(g, g.hold.length - 1);
    npc.items = npc.items.filter((it) => !itemCells(it).some((c) => (c.x === bed.x && c.y === bed.y) || (c.x === onPart.x && c.y === onPart.y)));
    npc.items.push({ id: 'bed-salt', ...bed, rot: 0, kind: 'good', good: 'salt' }, { id: 'part-salt', ...onPart, rot: 0, kind: 'good', good: 'salt' });
    for (const p of mountedParts(npc, 'cargo')) p.hp = 0;
    spillDeadCells(w);
    expect(npc.items.some((it) => it.id === 'bed-salt')).toBe(true);
    expect(npc.items.some((it) => it.id === 'part-salt')).toBe(false);
  });
});

describe('cargo spills in Chaos Highway', () => {
  it('a broken hauler cargo frame loses what lies on it for good', () => {
    const w = parkedAtOutpost();
    const hauler = haulerOf(w);
    const frame = stockOfKind(w, 'cargo');
    const bought = outpostBuyPart(w, frame.id, hauler.id);
    const frameSpot = installSpot(haulerOf(bought), { id: 'probe-frame', kind: 'part', part: frame, x: 0, y: 0, rot: 0 })!;
    const fitted = takeFromStorage(bought, frame.id, frameSpot, hauler.id);
    const truck = haulerOf(fitted);
    const stowed = makePart(fitted, 'jerrycans', 0);
    const lastCell = holdCell(gridOf(truck), gridOf(truck).hold.length - 1);
    truck.items = truck.items.filter((it) => !itemCells(it).some((c) => c.x === lastCell.x && c.y === lastCell.y));
    truck.items.push({ id: 'stowed-part', ...lastCell, rot: 0, kind: 'part', part: stowed });
    const money = fitted.player.money;
    const storage = fitted.player.storage.length;
    damagePart(mountedParts(truck, 'cargo').find((p) => p.id === frame.id)!, maxHp(frame), 0);

    const next = endTurn(fitted, testDrive);

    expect(haulerOf(next).items.some((it) => it.kind === 'part' && it.part.id === stowed.id)).toBe(false);
    expect(next.player.storage).toHaveLength(storage);
    expect(next.player.money).toBe(money);
    expect(next.salvage.filter((s) => s.pile)).toEqual([]);
    expect(spills(next)).toEqual([expect.objectContaining({ vehicle: truck.id, pile: null, units: 1 })]);
  });
});
