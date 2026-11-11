import { describe, expect, it } from 'vitest';
import { restFrame, type VehicleFrame } from '../../phys/frames';
import { cellRect } from '../../sim/body';
import { bareVehicle } from '../../sim/factory';
import { corePart, itemCells, mountedItems } from '../../sim/grid';
import { defaultSetup } from '../../sim/settings';
import { PLAIN_KIT } from '../../sim/testkit';
import type { Vehicle } from '../../sim/types';
import { maxHp } from '../../sim/wear';
import { newWorld } from '../../sim/world';
import { TEST_MAP } from '../../test/map';
import { smokeAt, smokeSources } from './smokePoints';

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
    expect(() => smokeAt({ unit: 1, x: 0, y: 0, z: 0, damage: 1 }, { ...restFrame(world, v), rear: undefined })).toThrow(/unit 1/);
  });
});
