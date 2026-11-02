
import { describe, expect, it } from 'vitest';
import { PAINT } from '../../data/chassis';
import { restFrame } from '../../phys/drive';
import { aimWithin, gunSpans } from '../../sim/armor';
import { makePart, newId } from '../../sim/factory';
import { facingOf } from '../../sim/grid';
import type { GridItem, Rot, Vehicle, World } from '../../sim/types';
import { freeMounts } from '../../test/layout-spots';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import { angleDiff, DEG } from '../../sim/vec';
import { loadModels } from './models';
import { signedDegrees, sweepOf } from './gunClearance';
import { VehicleView } from './vehicle';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

type PartItem = Extract<GridItem, { kind: 'part' }>;
type Mounted = { w: World; v: Vehicle; item: PartItem };

function mountGun(gun: string, chassis: string, rot: Rot, headingDeg = 0): Mounted {
  const w = emptyWorld();
  const v = addVehicle(w, 'scrapjaw', chassis, ['stockEngine'], { x: 40, y: 40 }, headingDeg * DEG);
  const spot = freeMounts(w, v, gun, rot)[0];
  if (!spot) throw new Error(`${chassis} has no deck spot for ${gun} at rot ${rot}`);
  const item: PartItem = { id: newId(w, 'i'), kind: 'part', part: makePart(w, gun, 0), ...spot };
  v.items.push(item);
  return { w, v, item };
}

function drawn({ w, v, item }: Mounted, headingDeg: number, aimDeg: number | null): number {
  const view = new VehicleView(v, true, PAINT.standard, 'world');
  view.pose(restFrame(w, v), 0.016);
  view.aim(() => (aimDeg === null ? null : aimDeg * DEG));
  const { dir } = view.muzzle(item.part.id);
  return angleDiff(headingDeg * DEG, Math.atan2(dir.z, dir.x)) / DEG;
}

describe('turret aim', () => {
  it.each([0, 90, -135])('a 60 degree gun at heading %i keeps in-arc aim and stops at the arc edge', (heading) => {
    const rel = (deg: number) => drawn(mountGun('longRifle', 'scout', 0, heading), heading, heading + deg);
    expect(rel(10)).toBeCloseTo(10, 1);
    expect(rel(-30)).toBeCloseTo(-30, 1);
    expect(rel(31)).toBeCloseTo(30, 1);
    expect(rel(-100)).toBeCloseTo(-30, 1);
  });

  it.each([0, 90, -135])('a machine gun at heading %i points at any bearing its spans allow', (heading) => {
    const gun = mountGun('mg', 'scout', 1, heading);
    const spans = gunSpans(gun.v, gun.item);
    expect(spans.length).toBeGreaterThan(0);
    for (const deg of [-170, -90, 0, 60, 135, 180]) {
      expect(drawn(gun, heading, heading + deg)).toBeCloseTo(aimWithin(spans, deg), 1);
    }
  });

  it.each([1, 2, 3] as const)('a turret at rot %i rests at the allowed bearing nearest its facing', (rot) => {
    const gun = mountGun('mg', 'longbed', rot);
    const spans = gunSpans(gun.v, gun.item);
    const facing = facingOf(gun.item) > 180 ? facingOf(gun.item) - 360 : facingOf(gun.item);
    expect(drawn(gun, 0, null)).toBeCloseTo(aimWithin(spans, facing), 1);
  });

  it('keeps a rear-facing machine gun aim inside its rotated arc', () => {
    const gun = mountGun('mg', 'scout', 2);
    const spans = gunSpans(gun.v, gun.item);
    for (const deg of [-170, 100, 180]) {
      expect(Math.abs(drawn(gun, 0, deg))).toBeCloseTo(Math.abs(aimWithin(spans, deg)), 1);
    }
  });

  it('rests inside its spans with no target', () => {
    const gun = mountGun('longRifle', 'scout', 0);
    const spans = gunSpans(gun.v, gun.item);
    expect(drawn(gun, 0, null)).toBeCloseTo(aimWithin(spans, 0), 1);
  });
});

describe('sweepOf', () => {
  it('keeps the spans of a turning gun', () => {
    const spans = [{ from: -45, to: 45 }];
    expect(sweepOf(spans, true, 90)).toBe(spans);
  });

  it('rests a fixed gun on its facing', () => {
    expect(sweepOf([{ from: -45, to: 45 }], false, 90)).toEqual([{ from: 90, to: 90 }]);
    expect(sweepOf([], true)).toEqual([{ from: 0, to: 0 }]);
  });
});

describe('signedDegrees', () => {
  it.each([[0, 0], [90, 90], [180, 180], [270, -90], [-90, -90], [450, 90]])('maps %i to %i', (deg, want) => {
    expect(signedDegrees(deg)).toBe(want);
  });
});
