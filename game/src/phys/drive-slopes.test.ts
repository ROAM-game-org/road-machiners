import { beforeAll, describe, expect, it } from 'vitest';
import { makeVehicle } from '../sim/factory';
import { addGoods } from '../sim/inventory';
import { loadFactor } from '../sim/mass';
import { mountedParts } from '../sim/grid';
import { emptyWorld } from '../sim/testkit';
import { dist } from '../sim/vec';
import { setMoveOrder } from '../sim/world';
import { budget } from '../test/budget';
import { freeDrive, initPhysics } from './drive';
import { me, play, playYielding } from '../test/drive-kit';

const HILL_GRADE = 0.2;
const LIMP_GRADE = 0.35;

beforeAll(async () => {
  await initPhysics();
});

describe('physics slopes', () => {
    it('a parked truck without an order brakes instead of rolling faster down a slope', () => {
      const w = emptyWorld({ x: 40, y: 30 });
      w.terrain = structuredClone(w.terrain);
      const n = w.terrain.size;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) w.terrain.heights[j * (n + 1) + i] = i * HILL_GRADE;
      me(w).heading = Math.PI;
      const { w: after, d } = play(w, 8);
      freeDrive(d);
      expect(me(after).speed).toBeLessThan(0.05);
      expect(dist(me(after).pos, { x: 40, y: 30 })).toBeLessThan(0.6);
    });

    it('a fully loaded hauler still climbs a hill', async () => {
      const w0 = emptyWorld({ x: 26, y: 30 });
      w0.terrain = structuredClone(w0.terrain);
      const n = w0.terrain.size;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) w0.terrain.heights[j * (n + 1) + i] = Math.max(0, i - 28) * HILL_GRADE;
      const hauler = makeVehicle(w0, { faction: 'player', chassisId: 'hauler', parts: ['mg', 'stockEngine', 'plates', 'trailerBox'].map((defId) => ({ defId, wear: 0 })), spares: [], cargo: {}, pos: { x: 26, y: 30 }, heading: 0, brain: null });
      w0.vehicles[0] = { ...hauler, id: me(w0).id };
      addGoods(w0, me(w0), 'scrap', 999);
      expect(loadFactor(me(w0))).toBeLessThan(1);
      w0.player.fuel = 999;
      const { w } = await playYielding(setMoveOrder(w0, { kind: 'through', dest: { x: 58, y: 30 } }), 8);
      expect(me(w).pos.x).toBeGreaterThan(30);
      expect(me(w).speed).toBeGreaterThan(0.5);
    }, budget(240_000));

    it('a limping courier crawls up a bank as steep as any chassis limps up', async () => {
      const w0 = emptyWorld({ x: 26, y: 30 });
      w0.terrain = structuredClone(w0.terrain);
      const n = w0.terrain.size;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) w0.terrain.heights[j * (n + 1) + i] = Math.max(0, i - 28) * LIMP_GRADE;
      const courier = makeVehicle(w0, { faction: 'player', chassisId: 'courier', parts: [{ defId: 'stockEngine', wear: 0 }], spares: [], cargo: {}, pos: { x: 26, y: 30 }, heading: 0, brain: null });
      w0.vehicles[0] = { ...courier, id: me(w0).id };
      mountedParts(me(w0), 'engine')[0].hp = 0;
      const { w } = await playYielding(setMoveOrder(w0, { kind: 'through', dest: { x: 58, y: 30 } }), 12);
      expect(me(w).pos.x).toBeGreaterThan(32);
      expect(me(w).speed).toBeGreaterThan(0.5);
    }, budget(240_000));
});
