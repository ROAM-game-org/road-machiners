import { beforeAll, describe, expect, it } from 'vitest';
import { addVehicle, editableTerrain, emptyWorld } from '../sim/testkit';
import type { MoveOrder, World } from '../sim/types';
import { angleDiff, dist } from '../sim/vec';
import { endTurn, setMoveOrder } from '../sim/world';
import { buildDrive, captureDrive, freeDrive, initPhysics, restoreDrive, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const me = (w: World) => w.vehicles[0];

function slope(grade: number, ground: 'road' | 'glass' | 'gravel', heading: number): World {
  const w = emptyWorld({ x: 40, y: 30 });
  w.terrain = structuredClone(w.terrain);
  const n = w.terrain.size;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) w.terrain.heights[j * (n + 1) + i] = i * grade;
  editableTerrain(w).types.fill(ground);
  me(w).heading = heading;
  return w;
}

function turn(w: World, d: Drive): { w: World; d: Drive } {
  let next: Drive | null = null;
  const after = endTurn(w, physicsMove(d, (r) => (next = r.next)));
  freeDrive(d);
  return { w: after, d: next! };
}

function settled(w: World, turns: number): { moved: number; turned: number } {
  let d = buildDrive(w);
  let cur = w;
  let mark = { pos: me(w).pos, heading: me(w).heading };
  for (let i = 1; i <= 8; i++) {
    ({ w: cur, d } = turn(cur, d));
    if (i === turns) mark = { pos: me(cur).pos, heading: me(cur).heading };
  }
  freeDrive(d);
  return { moved: dist(me(cur).pos, mark.pos), turned: Math.abs(angleDiff(me(cur).heading, mark.heading)) };
}

describe('brake hold', () => {
  it('holds a parked truck on gravel at the reported grade', () => {
    const { moved, turned } = settled(slope(0.2, 'gravel', (3 * Math.PI) / 4), 2);
    expect(moved).toBeLessThan(0.005);
    expect(turned).toBeLessThan(0.002);
  });

  it('holds a parked truck across a steep road', () => {
    const { moved, turned } = settled(slope(0.5, 'road', Math.PI / 2), 2);
    expect(moved).toBeLessThan(0.005);
    expect(turned).toBeLessThan(0.002);
  });

  it('still slides on glass where the tires do not grip', () => {
    const w = slope(0.5, 'glass', Math.PI / 2);
    const start = me(w).pos;
    let d = buildDrive(w);
    let cur = w;
    for (let i = 0; i < 7; i++) ({ w: cur, d } = turn(cur, d));
    freeDrive(d);
    expect(dist(me(cur).pos, start)).toBeGreaterThan(1);
  });

  it('holds a truck that came downhill to an arrived stop', () => {
    const w = slope(0.2, 'road', Math.PI);
    const order: MoveOrder = { kind: 'stopAt', dest: { x: 38, y: 30 } };
    let cur = setMoveOrder(w, order);
    let d = buildDrive(cur);
    for (let i = 0; i < 6; i++) ({ w: cur, d } = turn(cur, d));
    const at = me(cur).pos;
    for (let i = 0; i < 4; i++) ({ w: cur, d } = turn(cur, d));
    freeDrive(d);
    expect(dist(me(cur).pos, at)).toBeLessThan(0.005);
  });

  it('keeps the anchor through capture and restore', () => {
    let cur = slope(0.2, 'road', Math.PI);
    let d = buildDrive(cur);
    for (let i = 0; i < 3; i++) ({ w: cur, d } = turn(cur, d));
    const kept = captureDrive(d);
    const a = turn(cur, d);
    const b = turn(cur, restoreDrive(kept));
    expect(me(b.w).pos).toEqual(me(a.w).pos);
    freeDrive(a.d);
    freeDrive(b.d);
  });

  it('lets a rammed parked truck be shoved', () => {
    const w = emptyWorld({ x: 40, y: 30 });
    const rammer = addVehicle(w, 'raiders', 'scout', ['mg', 'stockEngine', 'ram'], { x: 34, y: 30 });
    rammer.speed = 4;
    const drive = buildDrive(w);
    let cur = w;
    let d = drive;
    let crashed = false;
    for (let i = 0; i < 3; i++) {
      let next: Drive | null = null;
      cur = endTurn(cur, physicsMove(d, (r) => {
        next = r.next;
        crashed ||= r.crashes.length > 0;
      }));
      freeDrive(d);
      d = next!;
    }
    freeDrive(d);
    expect(crashed).toBe(true);
    expect(dist(me(cur).pos, { x: 40, y: 30 })).toBeGreaterThan(0.3);
  });
});
