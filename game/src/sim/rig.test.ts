import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { PHYSICS } from '../data/physics';
import { cellCenter, couplingOf, isRig, unitsOf } from './body';
import { bendLimit, bendOf, bendStep, cellWorld, checkBend, checkRigs, footprint, localToWorld, rigBoxes, rigDiscs, tailReach, unitPoses, worldToLocal } from './rig';
import type { Pose } from './types';
import { dist } from './vec';

const S = PHYSICS.metersPerTile;
const RIG = Object.keys(CHASSIS).find(isRig)!;
const coupling = couplingOf(RIG)!;
const posed = (bend: number, heading = 0.3) => ({ chassisId: RIG, pos: { x: 50, y: 40 }, heading, bend });

describe('unit poses', () => {
  it('gives a rigid truck one unit at its own pose', () => {
    const v = { chassisId: 'scout', pos: { x: 3, y: 4 }, heading: 1 };
    expect(unitPoses(v)).toEqual([{ unit: 0, pos: { x: 3, y: 4 }, heading: 1 }]);
  });

  it('hangs the rear unit off the pivot, turned by the bend', () => {
    const [front, rear] = unitPoses(posed(0.4));
    expect(front.pos).toEqual({ x: 50, y: 40 });
    expect(rear.heading).toBeCloseTo(0.3 - 0.4, 12);
    const pivotOfFront = localToWorld(posed(0.4), 0, { x: coupling.pivotFront, z: 0 });
    const pivotOfRear = localToWorld(posed(0.4), 1, { x: coupling.pivotRear, z: 0 });
    expect(dist(pivotOfFront, pivotOfRear)).toBeLessThan(1e-9);
  });

  it('lines the units up straight at bend 0, the rear unit behind by its offset', () => {
    const [front, rear] = unitPoses(posed(0, 0));
    expect(rear.pos.x - front.pos.x).toBeCloseTo(unitsOf(RIG)[1].offset / S, 12);
    expect(rear.pos.y).toBeCloseTo(front.pos.y, 12);
  });

  it('fails loud on a rig without a bend and on a rigid truck with one', () => {
    expect(() => unitPoses({ chassisId: RIG, pos: { x: 0, y: 0 }, heading: 0 })).toThrow(/no bend/);
    expect(() => bendOf({ chassisId: 'scout', pos: { x: 0, y: 0 }, heading: 0, bend: 0 })).toThrow(/has a bend/);
  });

  it('throws on a bend past the coupling limit and its tolerance', () => {
    expect(() => checkBend(posed(bendLimit(RIG)))).not.toThrow();
    expect(() => checkBend(posed(bendLimit(RIG) + coupling.bendTolerance * 2))).toThrow(/past its limit/);
  });

  it('checks every saved truck and hulk at load', () => {
    expect(() => checkRigs({ vehicles: [{ ...posed(0), bend: undefined } as never], obstacles: [] })).toThrow(/no bend/);
    expect(() => checkRigs({ vehicles: [], obstacles: [{ id: 'w', pos: { x: 0, y: 0 }, r: 1, kind: 'wreck', hulk: { chassisId: RIG, yaw: 0 } }] })).toThrow(/no bend/);
    expect(() => checkRigs({ vehicles: [], obstacles: [{ id: 'w', pos: { x: 0, y: 0 }, r: 1, kind: 'wreck', hulk: { chassisId: 'bus', yaw: 0, bend: 0 } }] })).toThrow(/no rig/);
  });
});

describe('cell to world', () => {
  it('puts a trailer cell on the rear unit and turns it with the bend', () => {
    const { h } = { h: CHASSIS[RIG].layout.length };
    const y = h - 3;
    const straight = cellWorld(posed(0), 3, y);
    const bent = cellWorld(posed(0.6), 3, y);
    expect(straight.unit).toBe(1);
    expect(bent.heading).toBeCloseTo(0.3 - 0.6, 12);
    expect(dist(straight.point, bent.point)).toBeGreaterThan(1);
  });

  it('leaves a cab cell where it was whatever the bend', () => {
    const a = cellWorld(posed(0), 3, 2);
    const b = cellWorld(posed(0.6), 3, 2);
    expect(a.unit).toBe(0);
    expect(dist(a.point, b.point)).toBeLessThan(1e-9);
  });

  it('turns world points back into the local frame of the unit', () => {
    const v = posed(-0.5);
    const local = cellCenter(RIG, 4, 20);
    const back = worldToLocal(v, local.unit, localToWorld(v, local.unit, local));
    expect(back.x).toBeCloseTo(local.x, 9);
    expect(back.z).toBeCloseTo(local.z, 9);
  });
});

describe('bend step', () => {
  const ahead = (p: Pose, d: number, turn = 0): Pose => ({ x: p.x + Math.cos(p.heading + turn) * d, y: p.y + Math.sin(p.heading + turn) * d, heading: p.heading + turn });

  it('keeps a straight rig straight on a straight drive', () => {
    let pose: Pose = { x: 0, y: 0, heading: 0.2 };
    let bend = 0;
    for (let i = 0; i < 40; i++) {
      const next = ahead(pose, 0.25);
      bend = bendStep(RIG, bend, pose, next);
      pose = next;
    }
    expect(Math.abs(bend)).toBeLessThan(1e-9);
  });

  it('bends the rig toward the turn side while it turns and lets the trailer line up again after', () => {
    let pose: Pose = { x: 0, y: 0, heading: 0 };
    let bend = 0;
    for (let i = 0; i < 12; i++) {
      const next = ahead(pose, 0.25, 0.05);
      bend = bendStep(RIG, bend, pose, next);
      pose = next;
    }
    expect(bend).toBeGreaterThan(0.1);
    for (let i = 0; i < 200; i++) {
      const next = ahead(pose, 0.25);
      bend = bendStep(RIG, bend, pose, next);
      pose = next;
    }
    expect(Math.abs(bend)).toBeLessThan(0.02);
  });

  it('runs the bend away in reverse and stops it at the limit', () => {
    let pose: Pose = { x: 0, y: 0, heading: 0 };
    let bend = 0.1;
    for (let i = 0; i < 400; i++) {
      const next = ahead(pose, -0.25);
      bend = bendStep(RIG, bend, pose, next);
      pose = next;
    }
    expect(bend).toBeCloseTo(bendLimit(RIG), 9);
  });

  it('drags the rear axle along the line to the new pivot, as the tow bar does', () => {
    const from: Pose = { x: 0, y: 0, heading: 0 };
    const to: Pose = { x: 0.2, y: 0.05, heading: 0.15 };
    const bend = bendStep(RIG, 0, from, to);
    const reach = (coupling.pivotRear + coupling.rear.wheelX) / S;
    const pivot = (p: Pose) => ({ x: p.x + Math.cos(p.heading) * (coupling.pivotFront / S), y: p.y + Math.sin(p.heading) * (coupling.pivotFront / S) });
    const oldAxle = { x: pivot(from).x - reach, y: pivot(from).y };
    const rear = to.heading - bend;
    const newAxle = { x: pivot(to).x - Math.cos(rear) * reach, y: pivot(to).y - Math.sin(rear) * reach };
    const cross = (newAxle.x - pivot(to).x) * (oldAxle.y - pivot(to).y) - (newAxle.y - pivot(to).y) * (oldAxle.x - pivot(to).x);
    expect(Math.abs(cross)).toBeLessThan(1e-9);
    expect(bend).toBeGreaterThan(0);
  });
});

describe('rig footprint', () => {
  it('lays discs along both units that cover every box corner of a bent rig', () => {
    const v = posed(0.7);
    const discs = rigDiscs(v);
    expect(discs.length).toBeGreaterThan(2);
    for (const box of rigBoxes(v)) {
      for (const a of [-1, 1]) {
        const end = { x: box.center.x + box.axis.x * box.half.x * a, y: box.center.y + box.axis.y * box.half.x * a };
        expect(discs.some((d) => dist(d.pos, end) <= d.r + 1e-9)).toBe(true);
      }
    }
  });

  it('gives a rigid truck the one disc of its route radius', () => {
    expect(rigDiscs({ chassisId: 'scout', pos: { x: 1, y: 2 }, heading: 0 })).toEqual([{ pos: { x: 1, y: 2 }, r: CHASSIS.scout.radius }]);
  });

  it('reaches from the front unit to the tail of the trailer', () => {
    expect(tailReach(RIG)).toBeGreaterThan(unitsOf(RIG)[1].body.half.x / S);
    expect(footprint(RIG)).toBeCloseTo(tailReach(RIG), 9);
  });
});
