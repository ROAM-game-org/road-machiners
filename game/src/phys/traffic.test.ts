
import { beforeAll, describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { hangUp } from '../sim/dialogue';
import { mountedParts } from '../sim/grid';
import type { World } from '../sim/types';
import { endTurn, newWorld, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';
import { TEST_MAP } from '../test/map';
import { budget } from '../test/budget';
import { defaultSetup } from '../sim/settings';

beforeAll(async () => {
  await initPhysics();
});

describe('invariants under AI traffic', () => {
  let w: World;
  let d: Drive;

  beforeAll(() => {
    w = setMoveOrder(newWorld(11, START_KITS.standard, TEST_MAP, defaultSetup('roaming')), { kind: 'stopAt', dest: { x: 45, y: 15 } });
    d = buildDrive(w);
  });

  async function runTurns(turns: number): Promise<void> {
    for (let i = 0; i < turns; i++) {
      if (w.player.call) w = hangUp(w);
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      for (const v of w.vehicles) for (const p of mountedParts(v)) expect(p.hp).toBeGreaterThanOrEqual(0);
      for (const k of ['fuel', 'supplies', 'health', 'money'] as const) expect(w.player[k]).toBeGreaterThanOrEqual(0);
    }
  }

  it('no negative HP, fuel, supplies, health or money over the first 27 turns', () => runTurns(27), budget(360_000));
  it('no negative HP, fuel, supplies, health or money over turns 28 to 54', () => runTurns(27), budget(360_000));
  it('no negative HP, fuel, supplies, health or money over turns 55 to 80', async () => {
    await runTurns(26);
    freeDrive(d);
  }, budget(360_000));
});
