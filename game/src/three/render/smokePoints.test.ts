import { describe, expect, it } from 'vitest';
import { restFrame, type VehicleFrame } from '../../phys/frames';
import { CHASSIS, EXHAUST_VENT } from '../../data/chassis';
import { cellRect, hulkBoxes, isRig, unitBody, unitsOf } from '../../sim/body';
import { PARTS } from '../../data/parts';
import { bareVehicle, makePart, makeVehicle, newId } from '../../sim/factory';
import { baseGrid, corePart, gridOf, isMounted, itemCells, mountedItems, mountedParts, MOUNT_CELLS, mountSpots } from '../../sim/grid';
import { defaultSetup } from '../../sim/settings';
import { PLAIN_KIT } from '../../sim/testkit';
import type { GridItem, Vehicle } from '../../sim/types';
import { maxHp } from '../../sim/wear';
import { newWorld } from '../../sim/world';
import { TEST_MAP } from '../../test/map';
import { hazeStartRadius } from './fx';
import { startRadius } from './particles/emissions';
import { smokeAt, smokeSources, ventsOf, type BodyPoint } from './smokePoints';

const world = newWorld(1337, PLAIN_KIT, TEST_MAP, defaultSetup('roaming'));

function truck(chassisId: string): Vehicle {
  return bareVehicle(structuredClone(world), { faction: 'player', chassisId, pos: { x: 40, y: 40 }, heading: 0, brain: null });
}

function centerOf(v: Vehicle, partId: string): { unit: number; x: number; z: number } {
  const item = mountedItems(v).find((it) => it.part.id === partId);
  if (!item) throw new Error(`No mounted part ${partId}`);
  const r = cellRect(v.chassisId, itemCells(item));
  return { unit: r.unit, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
}

function others(v: Vehicle, unit: number, count: number) {
  const cabId = corePart(v, 'cab').id;
  const found = mountedItems(v).filter((it) => it.part.id !== cabId && centerOf(v, it.part.id).unit === unit);
  if (found.length < count) throw new Error(`${v.chassisId} has only ${found.length} non-cab parts on unit ${unit}`);
  return found.slice(0, count).map((it) => it.part);
}

describe('smoke sources', () => {
  it('has none on a healthy truck', () => {
    expect(smokeSources(truck('scout'))).toEqual([]);
  });

  it('has one at the center of each broken part', () => {
    const v = truck('scout');
    const broken = others(v, 0, 2);
    for (const p of broken) p.hp = 0;
    const found = smokeSources(v);
    expect(found).toHaveLength(2);
    for (const p of broken) {
      const item = mountedItems(v).find((it) => it.part.id === p.id)!;
      const r = cellRect('scout', itemCells(item));
      expect(found).toContainEqual(expect.objectContaining({ unit: 0, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, damage: 1 }));
    }
  });

  it('smokes a broken armor plate on the tractor rows where the model has no surface', () => {
    const v = truck('tractor');
    const plate = makePart(world, 'steelPlate', 0);
    const probe: GridItem = { id: 'i-probe', x: 0, y: 0, rot: 0, kind: 'part', part: plate };
    const spots = mountSpots(gridOf(v), v.items, probe, MOUNT_CELLS.armor);
    spots.forEach((spot, n) => v.items.push({ id: `i-plate-${n}`, x: spot.x, y: spot.y, rot: spot.rot, kind: 'part', part: { ...makePart(world, 'steelPlate', 0), hp: 0 } }));
    expect(smokeSources(v).length).toBeGreaterThanOrEqual(spots.length);
  });

  it('adds the cab when it is under 35 percent', () => {
    const v = truck('scout');
    const cab = corePart(v, 'cab');
    cab.hp = Math.floor(maxHp(cab) * 0.2);
    const found = smokeSources(v);
    expect(found).toHaveLength(1);
    const at = centerOf(v, cab.id);
    expect(found[0]).toMatchObject({ unit: at.unit, x: at.x, z: at.z });
    expect(found[0].damage).toBeCloseTo(1 - cab.hp / maxHp(cab));
  });

  it('leaves the cab quiet at 35 percent or more', () => {
    const v = truck('scout');
    const cab = corePart(v, 'cab');
    cab.hp = Math.ceil(maxHp(cab) * 0.35);
    expect(smokeSources(v)).toEqual([]);
  });

  it('puts a broken trailer part on unit 1 and places it by the rear frame', () => {
    const v = truck('sorokonoga');
    const [part] = others(v, 1, 1);
    part.hp = 0;
    const [source] = smokeSources(v);
    const at = centerOf(v, part.id);
    expect(source).toMatchObject({ unit: 1, x: at.x, z: at.z });
    const f = restFrame(world, v);
    expect(f.rear).toBeDefined();
    const rear = f.rear!;
    const yaw = Math.PI / 2;
    const turned: VehicleFrame = { ...f, rear: { ...rear, rot: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) } } };
    const p = smokeAt(source, turned);
    expect(p.x).toBeCloseTo(rear.pos.x + source.z, 5);
    expect(p.y).toBeCloseTo(rear.pos.y + source.y, 5);
    expect(p.z).toBeCloseTo(rear.pos.z - source.x, 5);
  });

  it('puts a front part at the front frame with its full rotation', () => {
    const v = truck('scout');
    const [part] = others(v, 0, 1);
    part.hp = 0;
    const [source] = smokeSources(v);
    const f = restFrame(world, v);
    const yaw = Math.PI / 2;
    const turned: VehicleFrame = { ...f, rot: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) } };
    const p = smokeAt(source, turned);
    expect(p.x).toBeCloseTo(f.pos.x + source.z, 5);
    expect(p.z).toBeCloseTo(f.pos.z - source.x, 5);
  });

  it('throws for a trailer source with no rear frame', () => {
    const v = truck('sorokonoga');
    expect(() => smokeAt({ unit: 1, x: 0, y: 0, z: 0 }, { ...restFrame(world, v), rear: undefined })).toThrow(/unit 1/);
  });
});

type Ball = { x: number; y: number; z: number; radius: number };

function frontFrame(chassisId: string, p: BodyPoint, radius: number): Ball {
  const bottom = unitBody(chassisId, 0).half.y;
  return { x: unitsOf(chassisId)[p.unit].offset + p.x, y: p.y + bottom, z: p.z, radius };
}

function clearOfBody(chassisId: string, ball: Ball): boolean {
  return hulkBoxes(chassisId, isRig(chassisId) ? 0 : undefined).every(({ box, x, y }) => {
    const gap = (lo: number, hi: number, at: number) => Math.max(lo - at, 0, at - hi);
    const dx = gap(box.x0 + x, box.x1 + x, ball.x);
    const dz = gap(-box.y1 + y, -box.y0 + y, ball.z);
    const dy = gap(box.z0, box.z1, ball.y);
    return Math.hypot(dx, dy, dz) >= ball.radius - 1e-6;
  });
}

function engineRadius(scale: number): number {
  return Math.max(startRadius('steam', scale), startRadius('breakdown', scale));
}

function tailOf(chassisId: string): number {
  return Math.min(...hulkBoxes(chassisId, isRig(chassisId) ? 0 : undefined).map(({ box, x }) => box.x0 + x));
}

const crowd = structuredClone(world);

function crowded(chassisId: string): Vehicle {
  return bareVehicle(crowd, { faction: 'player', chassisId, pos: { x: 40, y: 40 }, heading: 0, brain: null });
}

function brokenTruck(chassisId: string): Vehicle {
  const v = crowded(chassisId);
  for (const item of mountedItems(v)) item.part.hp = 0;
  return v;
}

function trailed(chassisId: string, ball: Ball): Ball[] {
  const steps = Math.ceil((ball.x - tailOf(chassisId)) / 0.1);
  return Array.from({ length: steps + 1 }, (_, i) => ({ ...ball, x: ball.x - i * 0.1 }));
}

describe('starting points clear the drawn body', () => {
  for (const chassisId of Object.keys(CHASSIS)) {
    it(`${chassisId}: every smoke point and its trail stay outside the drawn boxes`, () => {
      const v = brokenTruck(chassisId);
      const sources = smokeSources(v);
      expect(sources.length).toBeGreaterThan(0);
      const vents = ventsOf(v);
      const douseCorners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ ...vents.douse, x: vents.douse.x + sx * vents.douse.halfX, z: vents.douse.z + sz * vents.douse.halfZ })));
      const balls = [
        ...sources.map((p) => frontFrame(chassisId, p, startRadius('hurt', vents.ventScale))),
        frontFrame(chassisId, vents.exhaust, startRadius('exhaust', vents.ventScale)),
        ...douseCorners.map((p) => frontFrame(chassisId, p, startRadius('douse'))),
      ];
      for (const ball of balls) for (const step of trailed(chassisId, ball)) expect(clearOfBody(chassisId, step), `${chassisId} ball at x ${step.x.toFixed(2)} y ${step.y.toFixed(2)} z ${step.z.toFixed(2)}`).toBe(true);
      const engine = frontFrame(chassisId, vents.engine, engineRadius(vents.ventScale));
      expect(clearOfBody(chassisId, engine), `${chassisId} engine ball at y ${engine.y.toFixed(2)}`).toBe(true);
    });

    it(`${chassisId}: the dust haze starts behind the last unit`, () => {
      const last = unitsOf(chassisId).at(-1)!;
      const { hazeBack } = ventsOf(crowded(chassisId));
      const axle = Math.min(...[unitBody(chassisId, last.index)].map((b) => -b.wheelX));
      const ball: Ball = { x: last.offset + axle - hazeBack - hazeStartRadius(), y: -unitBody(chassisId, 0).half.y + unitBody(chassisId, 0).wheelY + 0.8 + unitBody(chassisId, 0).half.y, z: 0, radius: hazeStartRadius() };
      expect(clearOfBody(chassisId, ball)).toBe(true);
    });
  }

  it('starts the smoke of a broken trailer part above the trailer top', () => {
    const v = crowded('semi');
    const [part] = others(v, 1, 1);
    part.hp = 0;
    const [source] = smokeSources(v);
    const top = Math.max(...hulkBoxes('semi', 0).filter(({ x }) => x < 0).map(({ box }) => box.z1)) - unitBody('semi', 0).half.y;
    expect(source.y).toBeGreaterThanOrEqual(top + startRadius('hurt') - 1e-6);
  });
});

describe('smoke sources on armor plates', () => {
  it.each(Object.keys(CHASSIS))('puts a source over every broken armor plate of the %s', (id) => {
    const v = truck(id);
    const grid = baseGrid(id);
    const plate = Object.values(PARTS).find((d) => d.kind === 'armor' && d.w === 1 && d.h === 1);
    if (!plate) throw new Error('No 1x1 armor plate');
    const plates: GridItem[] = [];
    for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
      const item: GridItem = { id: newId(world, 'i'), kind: 'part', x, y, rot: 0, part: makePart(world, plate.id, 0) };
      if (isMounted(id, item)) plates.push(item);
    }
    expect(plates.length).toBeGreaterThan(0);
    for (const item of plates) if (item.kind === 'part') item.part.hp = 0;
    v.items.push(...plates);
    expect(smokeSources(v).length).toBeGreaterThanOrEqual(plates.length);
  });
});

function footprintTop(chassisId: string, p: BodyPoint, radius: number): number {
  const at = unitsOf(chassisId)[p.unit].offset + p.x;
  const under = hulkBoxes(chassisId, isRig(chassisId) ? 0 : undefined).filter(({ box, x, y }) => box.x0 + x < at + radius && box.x1 + x > at - radius && -box.y1 + y < p.z + radius && -box.y0 + y > p.z - radius);
  return Math.max(...under.map(({ box }) => box.z1)) - unitBody(chassisId, 0).half.y;
}

describe('engine vent per chassis', () => {
  it.each(Object.keys(CHASSIS))('starts the %s engine smoke on the drawn top over its engine bay', (id) => {
    const { engine, ventScale } = ventsOf(crowded(id));
    const radius = engineRadius(ventScale);
    expect(engine.y - radius).toBeCloseTo(footprintTop(id, engine, radius), 6);
  });

  it('starts the scout engine smoke on its hood, under its roof', () => {
    const { engine } = ventsOf(crowded('scout'));
    const roof = Math.max(...hulkBoxes('scout', undefined).map(({ box }) => box.z1)) - unitBody('scout', 0).half.y;
    expect(engine.y).toBeLessThan(roof);
  });

  it('starts the sorokonoga engine smoke on its deck behind the cab-over cab, under the cab top', () => {
    const { engine } = ventsOf(crowded('sorokonoga'));
    const cabTop = Math.max(...hulkBoxes('sorokonoga', 0).filter(({ box, x }) => x === 0 && box.x0 >= 0).map(({ box }) => box.z1)) - unitBody('sorokonoga', 0).half.y;
    expect(engine.y).toBeLessThan(cabTop);
  });

  it('leaves a broken engine to the engine vent', () => {
    const v = makeVehicle(crowd, { faction: 'player', chassisId: 'scout', parts: [{ defId: 'stockEngine', wear: 0 }], spares: [], cargo: {}, pos: { x: 40, y: 40 }, heading: 0, brain: null });
    const [engine] = mountedParts(v, 'engine');
    engine.hp = 0;
    expect(smokeSources(v)).toEqual([]);
  });
});

describe('exhaust vent per chassis', () => {
  it('has a vent entry for every chassis', () => {
    for (const id of Object.keys(CHASSIS)) expect(EXHAUST_VENT[id], id).toBeDefined();
  });

  it('seats the scout tailpipe at the tail, below the roof, and keeps the semi stack and size', () => {
    const scout = ventsOf(crowded('scout'));
    const roof = Math.max(...hulkBoxes('scout', undefined).map(({ box }) => box.z1)) - unitBody('scout', 0).half.y;
    expect(scout.exhaust.y).toBeLessThan(roof - 0.3);
    expect(scout.exhaust.x).toBeLessThanOrEqual(tailOf('scout') + 1e-6);
    expect(scout.ventScale).toBeLessThan(1);
    expect(ventsOf(crowded('semi')).ventScale).toBe(1);
  });

  it('scales the spawn radius with the scale', () => {
    expect(startRadius('exhaust', 0.5)).toBeCloseTo(startRadius('exhaust') / 2);
  });
});
