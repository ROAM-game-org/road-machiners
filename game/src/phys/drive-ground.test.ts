import { beforeAll, describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { emptyWorld, uniformGround } from '../sim/testkit';
import type { MoveOrder, World } from '../sim/types';
import { angleDiff, bearing, dist, type Vec } from '../sim/vec';
import { TERRAIN_TYPES } from '../data/terrain';
import { endTurn, setDirect, setMoveOrder } from '../sim/world';
import { PHYSICS } from '../data/physics';
import { bodyOf } from '../sim/body';
import { buildDrive, freeDrive, GROUND, toMps, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';
import type { VehicleFrame } from './frames';
import { turnaroundSpeed } from './turnaround';
import { budget } from '../test/budget';
import { me, ordered, play, playYielding } from '../test/drive-kit';

beforeAll(async () => {
  await initPhysics();
});

describe('physics turns', () => {
  describe('mud driving', () => {
    const order: MoveOrder = { kind: 'through', dest: { x: 60, y: 30 } };
    let mudSkill0: World;
    let roadSkill0: World;
    let mudSkill5: World;

    beforeAll(async () => {
      const w = emptyWorld();
      uniformGround(w, 'mud');
      const mud = await playYielding(setMoveOrder(w, order), 3);
      mudSkill0 = mud.w;
      freeDrive(mud.d);
      const road = await playYielding(ordered(order), 3);
      roadSkill0 = road.w;
      freeDrive(road.d);
      w.player.ranks.driving = 5;
      const skilled = await playYielding(setMoveOrder(w, order), 3);
      mudSkill5 = skilled.w;
      freeDrive(skilled.d);
    }, budget(120_000));

    it('mud covers less ground than road at the same order', () => {
      expect(me(mudSkill0).pos.x - 30).toBeLessThan(me(roadSkill0).pos.x - 30);
    });

    it('a player at driving rank 5 covers more mud than at rank 0', () => {
      expect(me(mudSkill5).pos.x).toBeGreaterThan(me(mudSkill0).pos.x);
    });
  });

  describe('glass grip', () => {
    const SPEED = 6;

    function onGround(type: 'sand' | 'glass', order: MoveOrder, turns: number): World {
      const w = emptyWorld({ x: 20, y: 40 });
      uniformGround(w, type);
      w.vehicles[0].speed = SPEED;
      const { w: after, d } = play(setMoveOrder(w, order), turns);
      freeDrive(d);
      return after;
    }

    it('only glass and the mud grounds have less than full grip', () => {
      const slippery = Object.values(TERRAIN_TYPES).filter((t) => t.grip !== 1 || t.sideGrip !== 1).map((t) => t.id);
      expect(slippery).toEqual(['mud', 'dirtyWater', 'toxic', 'glass', 'blackMud']);
    });

    function meanSkid(type: 'sand' | 'glass'): number {
      let w = emptyWorld({ x: 20, y: 40 });
      uniformGround(w, type);
      w.vehicles[0].speed = SPEED;
      w = setMoveOrder(w, { kind: 'through', dest: { x: 30, y: 70 } });
      let d = buildDrive(w);
      const frames: VehicleFrame[] = [];
      for (let i = 0; i < 3; i++) {
        let next: Drive | null = null;
        w = endTurn(w, physicsMove(d, (r) => {
          next = r.next;
          frames.push(...r.frames[w.vehicles[0].id]);
        }));
        freeDrive(d);
        d = next!;
      }
      freeDrive(d);
      const skids = frames.slice(1).flatMap((f, i) => {
        const [a, b, q] = [frames[i].pos, f.pos, f.rot];
        if (Math.hypot(b.x - a.x, b.z - a.z) * PHYSICS.stepsPerSecond < 2) return [];
        const nose = Math.atan2(2 * (q.x * q.z - q.w * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
        return [Math.abs(angleDiff(Math.atan2(b.z - a.z, b.x - a.x), nose)) * (180 / Math.PI)];
      });
      return skids.reduce((s, x) => s + x, 0) / skids.length;
    }

    it('a turning truck skids sideways on glass and holds its line on sand', () => {
      expect(meanSkid('sand')).toBeLessThan(3);
      expect(meanSkid('glass')).toBeGreaterThan(10);
    });

    it('a braking truck slides further on glass, losing only the grip share of the speed it loses on sand', () => {
      const sand = onGround('sand', { kind: 'brake' }, 1);
      const glass = onGround('glass', { kind: 'brake' }, 1);
      expect(me(glass).pos.x).toBeGreaterThan(me(sand).pos.x);
      expect((SPEED - me(glass).speed) / (SPEED - me(sand).speed)).toBeCloseTo(TERRAIN_TYPES.glass.grip / TERRAIN_TYPES.sand.grip, 1);
    });

    it('a truck turns wider on glass than on sand with the same click', () => {
      const click: MoveOrder = { kind: 'through', dest: { x: 20, y: 80 } };
      const sand = onGround('sand', click, 1);
      const glass = onGround('glass', click, 1);
      expect(Math.abs(angleDiff(me(glass).heading, Math.PI / 2))).toBeGreaterThan(Math.abs(angleDiff(me(sand).heading, Math.PI / 2)));
    });

    it('a truck takes a side click slower on glass than on sand once its weak brakes have bitten', () => {
      const click: MoveOrder = { kind: 'through', dest: { x: 24, y: 60 } };
      const sand = onGround('sand', click, 2);
      const glass = onGround('glass', click, 2);
      expect(me(glass).speed).toBeLessThan(me(sand).speed * 0.8);
    });

    it('a truck sent to a point on glass still arrives and stops', () => {
      const dest = { x: 60, y: 40 };
      const after = onGround('glass', { kind: 'stopAt', dest }, 14);
      expect(dist(me(after).pos, dest)).toBeLessThan(RULES.arriveRadius * 2);
      expect(me(after).speed).toBeLessThan(0.5);
    });
  });

  describe('turning around on a route', () => {
    const behind = { x: 12, y: 30 };

    function speedsWhileAimBehind(direct: boolean): number[] {
      let w = ordered({ kind: 'through', dest: behind }, 7.8);
      if (direct) w = setDirect(w, true);
      const speeds: number[] = [];
      let d = buildDrive(w);
      for (let i = 0; i < 4; i++) {
        let next: Drive | null = null;
        w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
        freeDrive(d);
        d = next!;
        const m = me(w);
        if (Math.abs(angleDiff(m.heading, bearing(m.pos, behind))) > Math.PI / 2) speeds.push(toMps(m.speed));
      }
      freeDrive(d);
      return speeds;
    }

    it('a fast truck whose route turns back slows to its turn speed', () => {
      const w = ordered({ kind: 'through', dest: behind }, 7.8);
      const v = me(w);
      const limit = turnaroundSpeed(bodyOf(v.chassisId), PHYSICS.truck.maxSteer, 1);
      const speeds = speedsWhileAimBehind(false);
      expect(speeds.length).toBeGreaterThan(0);
      expect(Math.max(...speeds)).toBeLessThan(limit * 1.3);
    });

    function rockLine(w: World, from: Vec, to: Vec, count: number): void {
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : i / (count - 1);
        w.obstacles = [...w.obstacles, { id: `k${w.obstacles.length}`, pos: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, r: 0.7, kind: 'rock' }];
      }
    }

    function crashesTurningBack(rocksBehind: boolean): { crashes: number; heading: number } {
      let w = ordered({ kind: 'through', dest: { x: 5, y: 34 } }, 0);
      const at = me(w).pos;
      rockLine(w, { x: at.x + 1, y: at.y + 2.5 }, { x: at.x + 5, y: at.y + 2.5 }, 6);
      rockLine(w, { x: at.x + 5, y: at.y + 2.5 }, { x: at.x + 5, y: at.y - 5 }, 8);
      if (rocksBehind) rockLine(w, { x: at.x - 1.6, y: at.y - 4 }, { x: at.x - 1.6, y: at.y + 4 }, 9);
      let d = buildDrive(w);
      let crashes = 0;
      for (let i = 0; i < 3; i++) {
        let next: Drive | null = null;
        w = endTurn(w, physicsMove(d, (r) => {
          next = r.next;
          crashes += r.crashes.filter((c) => c.b !== GROUND && !c.b.startsWith('v')).length;
        }));
        freeDrive(d);
        d = next!;
      }
      freeDrive(d);
      return { crashes, heading: me(w).heading };
    }

    it('a truck whose route lies behind, with rocks inside its forward turn, backs up before turning and does not hit them', () => {
      expect(crashesTurningBack(false).crashes).toBe(0);
    });

    it('with rocks behind it too, it turns forward as before', () => {
      const { heading } = crashesTurningBack(true);
      expect(Math.abs(angleDiff(heading, 0))).toBeGreaterThan(0.3);
    });

    it('a manual truck turning back keeps its speed', () => {
      const w = ordered({ kind: 'through', dest: behind }, 7.8);
      const limit = turnaroundSpeed(bodyOf(me(w).chassisId), PHYSICS.truck.maxSteer, 1);
      expect(Math.max(...speedsWhileAimBehind(true))).toBeGreaterThan(limit * 1.3);
    });
  });
});
