import { partDef, type WeaponDef } from '../data/parts';
import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../data/physics';
import { RULES } from '../data/rules';
import { aimWithin, openArcShares, gunBlockers, gunLayoutScore, gunSpans, laneCount, lanePoint, partLane, planBlast, planLane, sideToward, spanDegrees, spanSides, spansHold, walkLane, type FireSpan } from './armor';
import { fireBlock, inArc, resolveDestroyed } from './combat';
import { GRID_CELL, cellCenter, spanOf } from './body';
import { makePart } from './factory';
import { advanceKnockout, checkKnockout } from './defeat';
import { baseGrid, corePart, coreParts, facingOf, gridOf, itemCells, itemSize, mountedItems, mountedParts } from './grid';
import { vehicleStats } from './stats';
import { maxHp } from './wear';
import { leakFuel } from './supplies';
import { addVehicle, emptyWorld, npcBrain, rngStateWhere } from './testkit';
import { coreItem, freeMounts, rectOf, roundedSpans, shadowHolds, shadowOf } from '../test/layout-spots';
import type { GridItem, Rot, Vehicle, World } from './types';

const partAt = (v: Vehicle, x: number, y: number) =>
  mountedItems(v).find((it) => itemCells(it).some((c) => c.x === x && c.y === y))!.part;
const defOf = (v: Vehicle, defId: string) => mountedParts(v).find((p) => p.defId === defId)!;

function plated() {
  const w = emptyWorld();
  const v = addVehicle(w, 'scrapjaw', 'scout', ['plates', 'stockEngine'], { x: 40, y: 40 });
  return { w, v, plate: defOf(v, 'plates'), engine: defOf(v, 'stockEngine') };
}

describe('sideToward', () => {
  it('picks the side facing the point in the vehicle frame', () => {
    const { v } = plated();
    v.heading = 0;
    expect(sideToward(v, { x: 45, y: 40.5 })).toBe('front');
    expect(sideToward(v, { x: 35, y: 39.5 })).toBe('rear');
    expect(sideToward(v, { x: 40.5, y: 45 })).toBe('right');
    expect(sideToward(v, { x: 40.5, y: 35 })).toBe('left');
    v.heading = Math.PI / 2;
    expect(sideToward(v, { x: 40, y: 45 })).toBe('front');
    expect(sideToward(v, { x: 35, y: 40 })).toBe('right');
  });
});

describe('walkLane', () => {
  it('has one lane per column on the ends and one per row on the flanks', () => {
    const { v } = plated();
    const g = gridOf(v);
    expect(laneCount(v, 'front')).toBe(g.w);
    expect(laneCount(v, 'rear')).toBe(g.w);
    expect(laneCount(v, 'left')).toBe(g.h);
    expect(laneCount(v, 'right')).toBe(g.h);
  });

  it('enters each side from its own edge', () => {
    const { w, v } = plated();
    const last = gridOf(v).chassisH - 1;
    const round = { damage: 1, pen: 2, blast: false, armorShare: 1 };
    expect(walkLane(w, v, 'front', 2, round)[0].part).toBe(partAt(v, 2, 0).id);
    expect(walkLane(w, v, 'left', 3, round)[0].part).toBe(partAt(v, 1, 3).id);
    expect(walkLane(w, v, 'right', 3, round)[0].part).toBe(partAt(v, 4, 3).id);
    expect(walkLane(w, v, 'rear', 1, { ...round, pen: 3 })[0].part).toBe(partAt(v, 1, last - 2).id);
  });

  it('a plate absorbs a weak round', () => {
    const { w, v, plate, engine } = plated();
    const hits = walkLane(w, v, 'front', 2, { damage: 10, pen: 3, blast: false, armorShare: 1 });
    expect(hits.map((h) => h.part)).toEqual([plate.id]);
    expect(plate.hp).toBeLessThan(maxHp(plate));
    expect(engine.hp).toBe(maxHp(engine));
  });

  it('a worn plate lets more of a round through to the part behind', () => {
    const fresh = plated();
    const worn = plated();
    worn.plate.wear = 3;
    const round = { damage: 100, pen: 20, blast: false, armorShare: 1 };
    const behind = (hits: { amount: number }[]) => hits.slice(1).reduce((sum, h) => sum + h.amount, 0);
    expect(behind(planLane(worn.v, 'front', 2, round))).toBeGreaterThan(behind(planLane(fresh.v, 'front', 2, round)));
  });

  it('never deals more than its damage over all the parts it passes, however high its pen', () => {
    const { v } = plated();
    for (const pen of [3, 8, 13, 20, 40, 100]) {
      const hits = planLane(v, 'front', 2, { damage: 20, pen, blast: false, armorShare: 1 });
      expect(hits.reduce((sum, h) => sum + h.amount, 0)).toBeLessThanOrEqual(20);
    }
  });

  it('leaves more of a high pen round to the parts behind than a low pen one', () => {
    const { v } = plated();
    const deep = planLane(v, 'front', 2, { damage: 20, pen: 20, blast: false, armorShare: 1 });
    const shallow = planLane(v, 'front', 2, { damage: 20, pen: 8, blast: false, armorShare: 1 });
    const behind = (hits: { amount: number }[]) => hits.slice(1).reduce((sum, h) => sum + h.amount, 0);
    expect(behind(deep)).toBeGreaterThan(behind(shallow));
  });

  it('a strong round passes the plate and hits the part behind', () => {
    const { w, v, plate, engine } = plated();
    const cab = defOf(v, 'cabPickup');
    const hits = walkLane(w, v, 'front', 2, { damage: 10, pen: 20, blast: false, armorShare: 1 });
    expect(hits.map((h) => h.part).slice(0, 3)).toEqual([plate.id, engine.id, cab.id]);
    expect(engine.hp).toBeLessThan(maxHp(engine));
  });

  it('armor share scales damage to armor parts and leaves the part behind alone', () => {
    const plain = plated();
    const chip = plated();
    const base = walkLane(plain.w, plain.v, 'front', 2, { damage: 10, pen: 40, blast: false, armorShare: 1 });
    const scaled = walkLane(chip.w, chip.v, 'front', 2, { damage: 10, pen: 40, blast: false, armorShare: 2 });
    expect(scaled[0].part).toBe(chip.plate.id);
    expect(scaled[0].damage).toBeCloseTo(2 * base[0].damage);
    expect(scaled[1].damage).toBeCloseTo(base[1].damage);
  });

  it('a round loses damage with the pen each part takes from it', () => {
    const { w, v } = plated();
    const hits = walkLane(w, v, 'front', 2, { damage: 20, pen: 40, blast: false, armorShare: 1 });
    expect(hits.length).toBeGreaterThan(1);
    expect(hits[1].damage).toBeLessThan(hits[0].damage);
  });

  it('armor scales damage down when pen is below it, and a round of pen equal to it spends all its damage there', () => {
    const { v, plate } = plated();
    const armor = partDef(plate.defId).armor;
    const cellPen = RULES.cellPen * RULES.laneCellShare.lengthwise;
    const weak = planLane(v, 'front', 2, { damage: 12, pen: armor / 2 + cellPen, blast: false, armorShare: 1 })[0].amount;
    const full = planLane(v, 'front', 2, { damage: 12, pen: armor + cellPen, blast: false, armorShare: 1 })[0].amount;
    expect(weak).toBeCloseTo(6);
    expect(full).toBeCloseTo(12);
  });

  it('a broken part lets the round pass', () => {
    const { w, v, plate, engine } = plated();
    plate.hp = 0;
    const hits = walkLane(w, v, 'front', 2, { damage: 10, pen: 3, blast: false, armorShare: 1 });
    expect(hits.map((h) => h.part)).toEqual([engine.id]);
    expect(plate.hp).toBe(0);
  });

  it('the round stops at zero pen', () => {
    const { w, v, plate, engine } = plated();
    const hits = walkLane(w, v, 'front', 2, { damage: 10, pen: 12, blast: false, armorShare: 1 });
    expect(hits.map((h) => h.part)).toEqual([plate.id]);
    expect(engine.hp).toBe(maxHp(engine));
  });

  it('a part spanning several cells of the lane is hit once', () => {
    const { w, v, plate, engine } = plated();
    plate.hp = 0;
    const hits = walkLane(w, v, 'front', 2, { damage: 1, pen: 100, blast: false, armorShare: 1 });
    expect(hits.filter((h) => h.part === engine.id)).toHaveLength(1);
  });

  it('cab damage to the player also costs health', () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const cab = corePart(me, 'cab');
    const lane = mountedItems(me).find((it) => it.part.id === cab.id)!.y;
    const hits = walkLane(w, me, 'right', lane, { damage: 40, pen: 8, blast: false, armorShare: 1 });
    const dealt = hits.find((h) => h.part === cab.id)!.damage;
    expect(dealt).toBeGreaterThan(0);
    expect(w.player.health).toBe(RULES.maxHealth - Math.round(dealt * RULES.cabHealthShare));
  });
});

describe('planBlast', () => {
  const round = { damage: 20, pen: 20, blast: true, armorShare: 1 };

  function firstCell(v: Vehicle, partId: string): [number, number] {
    const cell = itemCells(mountedItems(v).find((it) => it.part.id === partId)!)[0];
    return [cell.x, cell.y];
  }

  function scout() {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'scout', ['stockEngine', 'mg'], { x: 40, y: 40 });
    v.heading = 0;
    return { w, v };
  }

  it('hurts the wheels on the side of the blast more than the wheels on the far side', () => {
    const { v } = scout();
    const hits = planBlast(v, lanePoint(v, 'left', Math.floor(laneCount(v, 'left') / 2)), 3, round, null);
    const wheelSide = (id: string) => Math.sign(cellCenter(v.chassisId, ...firstCell(v, id)).z);
    const dealt = (sign: number) => hits.filter((h) => h.part.defId === 'wheel' && wheelSide(h.part.id) === sign).reduce((sum, h) => sum + h.amount, 0);
    expect(dealt(-1)).toBeGreaterThan(dealt(1));
  });

  it('deals less the farther a part is from the blast, and nothing past the radius', () => {
    const { v } = scout();
    const lane = Math.floor(laneCount(v, 'left') / 2);
    const face = lanePoint(v, 'left', lane);
    const close = planBlast(v, face, 2, round, null);
    const far = planBlast(v, { x: face.x, y: face.y - 0.5 }, 2, round, null);
    const top = [...close].sort((a, b) => b.amount - a.amount)[0];
    expect(far.find((h) => h.part.id === top.part.id)?.amount ?? 0).toBeLessThan(top.amount);
    expect(planBlast(v, { x: face.x, y: face.y - 20 }, 2, round, null)).toEqual([]);
  });

  it('reads the radius in meters, so a small blast a tile off the hull touches nothing', () => {
    const { v } = scout();
    const face = lanePoint(v, 'left', Math.floor(laneCount(v, 'left') / 2));
    expect(planBlast(v, { x: face.x, y: face.y - 1 }, 1.5, round, null)).toEqual([]);
  });

  it('shields a part behind another, so it takes more once the part in front is broken', () => {
    const { v } = scout();
    const lane = Math.floor(laneCount(v, 'left') / 2);
    const face = lanePoint(v, 'left', lane);
    const hits = planBlast(v, face, 3, round, null);
    const byGap = [...hits].sort((a, b) => b.amount - a.amount);
    const front = byGap[0].part;
    const behindBefore = Object.fromEntries(hits.map((h) => [h.part.id, h.amount]));
    front.hp = 0;
    const after = planBlast(v, face, 3, round, null);
    expect(after.some((h) => h.amount > (behindBefore[h.part.id] ?? 0))).toBe(true);
    expect(after.find((h) => h.part.id === front.id)).toBeUndefined();
  });

  it('skips the part a direct round already struck', () => {
    const { v } = scout();
    const face = lanePoint(v, 'left', Math.floor(laneCount(v, 'left') / 2));
    const hits = planBlast(v, face, 2, round, null);
    const struck = hits[0].part.id;
    expect(planBlast(v, face, 2, round, struck).some((h) => h.part.id === struck)).toBe(false);
  });
});

describe('knockout', () => {
  it('an NPC with a dead cab is knocked out and stays in the world', () => {
    const w = emptyWorld();
    const buggy = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 34, y: 30 });
    buggy.brain = npcBrain('buggy', buggy.pos, ['raider']);
    resolveDestroyed(w);
    expect(buggy.defeat).toBeUndefined();
    corePart(buggy, 'cab').hp = 0;
    w.rngState = rngStateWhere((roll) => roll >= RULES.npcDeathChance);
    resolveDestroyed(w);
    expect(w.vehicles.some((v) => v.id === buggy.id)).toBe(true);
    expect(buggy.defeat?.phase).toBe('out');
  });

  it('player cab death knocks the player out, and waking patches broken core parts', () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const cab = corePart(me, 'cab');
    const wheel = coreParts(me, 'wheel')[0];
    cab.hp = 0;
    wheel.hp = 0;
    checkKnockout(w);
    expect(w.events.some((e) => e.t === 'knockout')).toBe(true);
    expect(mountedParts(me, 'engine')).toHaveLength(1);
    advanceKnockout(w);
    expect(w.events.some((e) => e.t === 'wake')).toBe(true);
    expect(cab.hp).toBe(Math.max(1, Math.round(maxHp(cab) * RULES.defeatPatch)));
    expect(wheel.hp).toBeGreaterThan(0);
  });

  it('a hurt but working cab is no knockout', () => {
    const w = emptyWorld();
    corePart(w.vehicles[0], 'cab').hp = 1;
    checkKnockout(w);
    expect(w.events.some((e) => e.t === 'knockout')).toBe(false);
  });
});

describe('broken core parts', () => {
  it('a broken tank leaks fuel each turn', () => {
    const w = emptyWorld();
    const fuel = w.player.fuel;
    leakFuel(w);
    expect(w.player.fuel).toBe(fuel);
    corePart(w.vehicles[0], 'tank').hp = 0;
    leakFuel(w);
    expect(w.player.fuel).toBeCloseTo(fuel - RULES.tankLeak, 9);
  });

  it('each broken wheel cuts speed and turning', () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const whole = vehicleStats(w, me);
    coreParts(me, 'wheel')[0].hp = 0;
    const one = vehicleStats(w, me);
    expect(one.maxSpeed / whole.maxSpeed).toBeCloseTo(1 - RULES.wheelLoss, 9);
    expect(one.turnSlow / whole.turnSlow).toBeCloseTo(1 - RULES.wheelLoss, 9);
    coreParts(me, 'wheel')[1].hp = 0;
    expect(vehicleStats(w, me).maxSpeed).toBeLessThan(one.maxSpeed);
  });

  it('a broken transmission caps speed like a broken engine', () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    corePart(me, 'transmission').hp = 0;
    expect(vehicleStats(w, me).maxSpeed).toBe(RULES.limpSpeed);
  });
});

describe('lane depth', () => {
  it('a crash-strength hit on the nose fades before the rear wheels', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'hauler', ['stockEngine'], { x: 40, y: 40 });
    for (let lane = 0; lane < laneCount(v, 'front'); lane++) walkLane(w, v, 'front', lane, { damage: 50, pen: RULES.crashPen, blast: false, armorShare: 1 });
    const g = gridOf(v);
    const rear = coreParts(v, 'wheel').filter((p) => mountedItems(v).find((it) => it.part.id === p.id)!.y > g.h / 2);
    expect(rear.length).toBe(2);
    for (const p of rear) expect(p.hp).toBeGreaterThan(0);
  });
  it('a broken cargo box still slows rounds from the rear', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'hauler', ['trailerBox'], { x: 40, y: 40 });
    const round = { damage: 50, pen: 4, blast: false, armorShare: 1 };
    const lanes = Array.from({ length: laneCount(v, 'rear') }, (_, lane) => lane);
    const working = lanes.map((lane) => planLane(v, 'rear', lane, round));
    mountedParts(v, 'cargo')[0].hp = 0;
    const broken = lanes.map((lane) => planLane(v, 'rear', lane, round).filter((h) => h.part.defId !== 'trailerBox'));
    expect(broken).toEqual(working.map((hits) => hits.filter((h) => h.part.defId !== 'trailerBox')));
  });
});

describe('blast armor', () => {
  function caged() {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'scout', ['cage', 'stockEngine'], { x: 40, y: 40 });
    return { w, v, cage: defOf(v, 'cage'), engine: defOf(v, 'stockEngine') };
  }

  it('a cage stops a blast round that a bullet of the same pen gets through', () => {
    const blast = caged();
    const bullet = caged();
    const lane = partLane(blast.v, blast.cage.id, 'front');
    walkLane(blast.w, blast.v, 'front', lane, { damage: 10, pen: 8, blast: true, armorShare: 1 });
    walkLane(bullet.w, bullet.v, 'front', lane, { damage: 10, pen: 8, blast: false, armorShare: 1 });
    expect(blast.engine.hp).toBe(partDef('stockEngine').hp);
    expect(bullet.engine.hp).toBeLessThan(partDef('stockEngine').hp);
  });

  it('parts other than armor meet blast with their plain armor', () => {
    const { w, v, engine } = plated();
    defOf(v, 'plates').hp = 0;
    const kinetic = walkLane(w, v, 'front', 2, { damage: 10, pen: 3, blast: false, armorShare: 1 }).find((h) => h.part === engine.id)!.damage;
    engine.hp = partDef('stockEngine').hp;
    const blast = walkLane(w, v, 'front', 2, { damage: 10, pen: 3, blast: true, armorShare: 1 }).find((h) => h.part === engine.id)!.damage;
    expect(blast).toBe(kinetic);
  });
});

function truckWith(w: World, chassisId: string, parts: { defId: string; x: number; y: number; rot?: Rot }[]): Vehicle {
  const v = addVehicle(w, 'player', chassisId, ['stockEngine'], { x: 40, y: 40 });
  for (const [i, p] of parts.entries()) {
    v.items.push({ id: `i-test-${i}`, x: p.x, y: p.y, rot: p.rot ?? 0, kind: 'part', part: makePart(w, p.defId, 0) });
  }
  return v;
}

function itemOf(v: Vehicle, defId: string): GridItem {
  return mountedItems(v).find((it) => it.part.defId === defId)!;
}

function cabShadow(v: Vehicle, gun: GridItem): FireSpan {
  return shadowOf(gun, coreItem(v, 'cab'));
}

function without(arc: FireSpan, shadow: FireSpan): FireSpan[] {
  return [{ from: arc.from, to: shadow.from }, { from: shadow.to, to: arc.to }];
}

function putGun(w: World, v: Vehicle, defId: string, spot: { x: number; y: number; rot: Rot }): void {
  v.items.push({ id: `i-test-${v.items.length}`, x: spot.x, y: spot.y, rot: spot.rot, kind: 'part', part: makePart(w, defId, 0) });
}

function overlap(a: GridItem, b: GridItem): boolean {
  const p = rectOf(a);
  const q = rectOf(b);
  return p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
}

describe('shadows of tall parts', () => {
  it('a gun in the bed cannot fire forward across the cab, however far it stands', () => {
    const v = truckWith(emptyWorld(), 'longbed', [{ defId: 'mg', x: 3, y: 12 }]);
    const gun = itemOf(v, 'mg');
    expect(roundedSpans(gunSpans(v, gun))).toEqual(roundedSpans(without({ from: -135, to: 135 }, cabShadow(v, gun))));
  });

  it('a heavy machine gun beside the cab loses the angles over the cab and keeps the rest', () => {
    const v = truckWith(emptyWorld(), 'longbed', [{ defId: 'heavyMg', x: 1, y: 8 }]);
    const gun = itemOf(v, 'heavyMg');
    expect(roundedSpans(gunSpans(v, gun))).toEqual(roundedSpans(without({ from: -135, to: 135 }, cabShadow(v, gun))));
  });

  it('a gun beside the hood fires forward and loses only the angles back across the cab', () => {
    const v = truckWith(emptyWorld(), 'longbed', [{ defId: 'mg', x: 5, y: 2 }]);
    const gun = itemOf(v, 'mg');
    const shadow = cabShadow(v, gun);
    expect(roundedSpans(gunSpans(v, gun))).toEqual(roundedSpans([{ from: shadow.to, to: 135 }]));
  });

  it('a gun facing away from the hauler cab keeps its whole arc', () => {
    const w = emptyWorld();
    const v = truckWith(w, 'hauler', []);
    putGun(w, v, 'shotgun', freeMounts(w, v, 'shotgun', 2).at(-1)!);
    expect(gunSpans(v, itemOf(v, 'shotgun'))).toEqual([{ from: 135, to: 225 }]);
  });

  it('a gun behind the hauler cab loses the slice the cab covers, off its own lane', () => {
    const w = emptyWorld();
    const v = truckWith(w, 'hauler', []);
    const cab = rectOf(coreItem(v, 'cab'));
    const spot = freeMounts(w, v, 'mg').find((s) => s.y >= cab.y1 && (s.x + 1 <= cab.x0 || s.x >= cab.x1))!;
    putGun(w, v, 'mg', spot);
    const gun = itemOf(v, 'mg');
    const shadow = cabShadow(v, gun);
    expect(shadow.from).toBeGreaterThan(-135);
    expect(shadow.to).toBeLessThan(135);
    expect(roundedSpans(gunSpans(v, gun))).toEqual(roundedSpans(without({ from: -135, to: 135 }, shadow)));
  });

  it('a cargo box behind a gun blinds it there, and a flat rack does not', () => {
    const w = emptyWorld();
    const base = truckWith(w, 'hauler', []);
    const cab = coreItem(base, 'cab');
    const found =freeMounts(w, base, 'mg').flatMap((g) => {
      const withGun = truckWith(w, 'hauler', []);
      putGun(w, withGun, 'mg', g);
      const gun = itemOf(withGun, 'mg');
      return freeMounts(w, withGun, 'trailerBox').map((b) => ({ g, b, gun, probe: { ...gun, id: 'box', x: b.x, y: b.y, rot: b.rot, part: makePart(w, 'trailerBox', 0) } as GridItem }));
    }).find(({ gun, probe }) => !overlap(gun, probe) && shadowHolds(shadowOf(gun, probe), 130) && !shadowHolds(shadowOf(gun, cab), 130))!;
    const boxed = truckWith(w, 'hauler', []);
    const racked = truckWith(w, 'hauler', []);
    for (const v of [boxed, racked]) putGun(w, v, 'mg', found.g);
    putGun(w, boxed, 'trailerBox', found.b);
    putGun(w, racked, 'rack', found.b);
    expect(spansHold(gunSpans(boxed, itemOf(boxed, 'mg')), 130)).toBe(false);
    expect(spansHold(gunSpans(racked, itemOf(racked, 'mg')), 130)).toBe(true);
  });

  it('a driver seat blocks a gun behind it', () => {
    const v = truckWith(emptyWorld(), 'niva', [{ defId: 'mg', x: 1, y: 5 }]);
    const gun = itemOf(v, 'mg');
    expect(shadowHolds(cabShadow(v, gun), 0)).toBe(true);
    expect(spansHold(gunSpans(v, gun), 0)).toBe(false);
  });

  it('a gun beside the convertible hardtop cab loses the angles toward the cab, off its own lane', () => {
    const w = emptyWorld();
    const v = truckWith(w, 'convertible', []);
    const cab = rectOf(coreItem(v, 'cab'));
    const spot = freeMounts(w, v, 'mg').find((s) => s.y >= cab.y0 && s.y + 3 <= cab.y1 && (s.x + 1 <= cab.x0 || s.x >= cab.x1))!;
    putGun(w, v, 'mg', spot);
    const gun = itemOf(v, 'mg');
    const shadow = cabShadow(v, gun);
    const toward = (shadow.from + shadow.to) / 2;
    const away = toward > 0 ? -80 : 80;
    const spans = gunSpans(v, gun);
    expect(spansHold(spans, toward)).toBe(false);
    expect(spansHold(spans, 0)).toBe(true);
    expect(spansHold(spans, away)).toBe(true);
  });

  it('a tall gun never blocks itself', () => {
    const w = emptyWorld();
    const v = truckWith(w, 'hauler', []);
    putGun(w, v, 'cannon', freeMounts(w, v, 'cannon', 2).at(-1)!);
    expect(spanDegrees(gunSpans(v, itemOf(v, 'cannon')))).toBe(Math.min((partDef('cannon') as WeaponDef).arc, 360));
  });
});

describe('firing past tall parts', () => {
  it('reports a target ahead of a gun behind the cab as blocked', () => {
    const w = emptyWorld();
    const me = truckWith(w, 'longbed', [{ defId: 'mg', x: 3, y: 12 }]);
    const ahead = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], { x: 45, y: 40 });
    const gun = vehicleStats(w, me).weapons[0];
    expect(inArc(me, gun, ahead)).toBe(false);
    expect(fireBlock(w, me, gun, ahead)).toBe('blocked');
  });

  it('lets the same gun fire at a target on its open flank', () => {
    const w = emptyWorld();
    const me = truckWith(w, 'longbed', [{ defId: 'mg', x: 3, y: 12 }]);
    const beside = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], { x: 40, y: 45 });
    const gun = vehicleStats(w, me).weapons[0];
    expect(inArc(me, gun, beside)).toBe(true);
  });
});

describe('span sides', () => {
  it('counts a side when the spans reach into its quarter, not when they only touch its edge', () => {
    expect(spanSides([{ from: -180, to: 180 }])).toEqual(['front', 'rear', 'left', 'right']);
    expect(spanSides([{ from: -135, to: 135 }])).toEqual(['front', 'left', 'right']);
    expect(spanSides([{ from: 45, to: 315 }])).toEqual(['rear', 'left', 'right']);
    expect(spanSides([{ from: -30, to: 30 }])).toEqual(['front']);
    expect(spanSides([{ from: 40, to: 50 }])).toEqual(['front', 'right']);
  });
});

describe('gun blockers', () => {
  it('names the cab as what blocks a bed gun', () => {
    const v = truckWith(emptyWorld(), 'longbed', [{ defId: 'mg', x: 3, y: 12 }]);
    expect(gunBlockers(v, itemOf(v, 'mg')).map((b) => b.kind === 'part' && b.part.defId)).toEqual(['cabPickup']);
  });

  it('skips a tall part that stands only in the gun\'s blind spot', () => {
    const v = truckWith(emptyWorld(), 'longbed', [{ defId: 'shotgun', x: 5, y: 2 }]);
    expect(gunBlockers(v, itemOf(v, 'shotgun'))).toEqual([]);
  });
});

describe('gun layout', () => {
  it('scores a bed gun turned away from the cab above the same gun facing the cab', () => {
    const facingCab = truckWith(emptyWorld(), 'longbed', [{ defId: 'mg', x: 3, y: 12 }]);
    const facingAway = truckWith(emptyWorld(), 'longbed', [{ defId: 'mg', x: 3, y: 12, rot: 2 }]);
    expect(gunLayoutScore(facingAway)).toBe(3 * 361 + 270);
    expect(gunLayoutScore(facingCab)).toBeLessThan(gunLayoutScore(facingAway));
  });

  it('scores a cargo box behind two guns below a flat rack there', () => {
    const w = emptyWorld();
    const base = truckWith(w, 'hauler', []);
    const spots = freeMounts(w, base, 'mg');
    const first = spots[0];
    const second = spots.find((s) => s.x !== first.x || Math.abs(s.y - first.y) >= 3)!;
    const withGuns = () => {
      const v = truckWith(w, 'hauler', []);
      putGun(w, v, 'mg', first);
      putGun(w, v, 'mg', second);
      return v;
    };
    const behind = withGuns();
    const boxSpot = freeMounts(w, behind, 'trailerBox').find((b) => {
      const probe: GridItem = { id: 'box', x: b.x, y: b.y, rot: b.rot, kind: 'part', part: makePart(w, 'trailerBox', 0) };
      const guns = mountedItems(behind, 'weapon');
      const inArc = [-130, -90, -45, 45, 90, 130];
      return guns.every((gun) => !overlap(gun, probe)) && guns.some((gun) => inArc.some((a) => shadowHolds(shadowOf(gun, probe), a)));
    })!;
    const boxed = withGuns();
    const racked = withGuns();
    putGun(w, boxed, 'trailerBox', boxSpot);
    putGun(w, racked, 'rack', boxSpot);
    expect(gunLayoutScore(boxed)).toBeLessThan(gunLayoutScore(racked));
  });

  it('reads the open share of a gun arc: low facing the cab and a box, full once turned away', () => {
    const w = emptyWorld();
    const box = { defId: 'trailerBox', x: 1, y: 9 };
    const share = (gun: { defId: string; x: number; y: number; rot?: Rot }, extra: { defId: string; x: number; y: number }[] = []) => {
      const v = truckWith(w, 'longbed', [gun, ...extra]);
      return openArcShares(v)[0];
    };
    expect(share({ defId: 'shotgun', x: 3, y: 12 }, [box])).toBeLessThan(0.5);
    expect(share({ defId: 'shotgun', x: 3, y: 12, rot: 2 }, [box])).toBe(1);
    expect(share({ defId: 'shotgun', x: 5, y: 9, rot: 2 })).toBe(1);
  });

});

describe('aimWithin', () => {
  const forward = [{ from: -30, to: 30 }];

  it('keeps a bearing inside the span or on its edge', () => {
    expect(aimWithin(forward, 10)).toBe(10);
    expect(aimWithin(forward, 30)).toBe(30);
    expect(aimWithin(forward, -30)).toBe(-30);
  });

  it('turns an outside bearing to the nearest edge, the first edge on a tie', () => {
    expect(aimWithin(forward, 31)).toBe(30);
    expect(aimWithin(forward, -100)).toBe(-30);
    expect(aimWithin(forward, 180)).toBe(-30);
  });

  it('matches a span through the rear on both sides of 180', () => {
    const rear = [{ from: 135, to: 225 }];
    expect(aimWithin(rear, 170)).toBe(170);
    expect(aimWithin(rear, -170)).toBe(-170);
    expect(aimWithin(rear, 90)).toBe(135);
    expect(aimWithin(rear, -90)).toBe(-135);
  });

  it('picks the nearer of two spans', () => {
    const flanks = [{ from: -135, to: -45 }, { from: 45, to: 135 }];
    expect(aimWithin(flanks, 60)).toBe(60);
    expect(aimWithin(flanks, -60)).toBe(-60);
    expect(aimWithin(flanks, 20)).toBe(45);
    expect(aimWithin(flanks, -20)).toBe(-45);
  });

  it('turns all the way round in a full circle', () => {
    const full = [{ from: -180, to: 180 }];
    for (const rel of [-180, -90, 0, 45, 135, 180]) expect(aimWithin(full, rel)).toBe(rel);
  });

  it('throws on no spans', () => {
    expect(() => aimWithin([], 0)).toThrow();
  });
});

describe('gun facing', () => {
  const gunAt = (defId: string, rot: Rot) => {
    const w = emptyWorld();
    const v = truckWith(w, 'hauler', []);
    putGun(w, v, defId, freeMounts(w, v, defId, rot).at(-1)!);
    return { w, v, item: itemOf(v, defId) };
  };
  const spot = (v: Vehicle, dx: number, dy: number) => ({ x: v.pos.x + dx, y: v.pos.y + dy });

  it('measures the footprint of a part turned a half or three quarter turns like one turned none or one', () => {
    const part = makePart(emptyWorld(), 'shotgun', 0);
    const [w0, w1, w2, w3] = ([0, 1, 2, 3] as const).map((rot) => itemSize({ kind: 'part', part, rot }));
    expect(w2).toEqual(w0);
    expect(w3).toEqual(w1);
    expect(w1).toEqual({ w: w0.h, h: w0.w });
  });

  it('faces rot quarter turns clockwise from the front', () => {
    expect(([0, 1, 2, 3] as const).map((rot) => facingOf(gunAt('mg', rot).item))).toEqual([0, 90, 180, 270]);
  });

  it('centers the arc on the facing', () => {
    const bare = { ...truckWith(emptyWorld(), 'hauler', []), items: [] };
    const loose = (defId: string, rot: Rot): GridItem => ({ id: 'loose', x: 0, y: 0, rot, kind: 'part', part: makePart(emptyWorld(), defId, 0) });
    expect(gunSpans(bare, loose('shotgun', 2))).toEqual([{ from: 135, to: 225 }]);
    expect(gunSpans(bare, loose('shotgun', 1))).toEqual([{ from: 45, to: 135 }]);
    expect(gunSpans(bare, loose('mg', 2))).toEqual([{ from: 45, to: 315 }]);
    expect(spanSides(gunSpans(bare, loose('mg', 1)))).toEqual(['front', 'rear', 'right']);
    expect(spanSides(gunSpans(bare, loose('shotgun', 3)))).toEqual(['left']);
    expect(spanSides(gunSpans(bare, loose('heavyMg', 3)))).toEqual(['front', 'rear', 'left']);
  });

  it('hits a target behind with a rear-facing gun and misses one in front', () => {
    const { w, v } = gunAt('mg', 2);
    const behind = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], spot(v, -5, 0));
    const ahead = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], spot(v, 5, 0));
    const gun = vehicleStats(w, v).weapons[0];
    expect(inArc(v, gun, behind)).toBe(true);
    expect(inArc(v, gun, ahead)).toBe(false);
    expect(fireBlock(w, v, gun, ahead)).not.toBeNull();
  });

  it('turns the arc with the truck', () => {
    const { w, v } = gunAt('shotgun', 2);
    const east = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], spot(v, 5, 0));
    const gun = vehicleStats(w, v).weapons[0];
    expect(inArc(v, gun, east)).toBe(false);
    v.heading = Math.PI;
    expect(inArc(v, gun, east)).toBe(true);
  });

  it('keeps a 90 degree gun facing the rear from reaching a target ahead or on its flank', () => {
    const { w, v } = gunAt('shotgun', 2);
    const gun = vehicleStats(w, v).weapons[0];
    const flank = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], spot(v, 0, 5));
    const behind = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], spot(v, -5, 0));
    expect(inArc(v, gun, flank)).toBe(false);
    expect(inArc(v, gun, behind)).toBe(true);
  });
});

describe('lanePoint on the sides', () => {
  it('puts a side lane level with the body row of the same index, and the end lanes at the faces', () => {
    const { v } = plated();
    v.heading = 0;
    const { h } = baseGrid(v.chassisId);
    const last = h - 1;
    const { half } = spanOf(v.chassisId);
    const innerHalf = ((h - 2) * GRID_CELL) / 2;
    const along = (lane: number) => lanePoint(v, 'left', lane).x * PHYSICS.metersPerTile;
    const row = (along(1) - along(2));
    expect(row).toBeCloseTo(GRID_CELL, 5);
    expect(row).toBeCloseTo(along(2) - along(3), 5);
    expect(along(0) - along(1)).toBeCloseTo(half.x - (innerHalf - GRID_CELL / 2), 5);
    expect(along(last - 1) - along(last)).toBeCloseTo(half.x - (innerHalf - GRID_CELL / 2), 5);
  });
});
