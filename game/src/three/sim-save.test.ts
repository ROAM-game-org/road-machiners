import { describe, expect, it } from 'vitest';
import { playerVehicle } from '../sim/damage';
import { emptyLedger } from '../sim/progression/orders';
import { SimRun, simWorld, type FromSim } from '../sim/progression/sim-mode';
import { TEST_MAP } from '../test/map';
import { SIM_TEXT } from '../ui/sim/sim-text';
import { memoryBackend, SaveSlots } from './save-db';
import { resumedRun, SIM_SLOT, simEnvelope } from './sim-save';

const TURNS = 3;

describe('sim run saves', () => {
  it('saves a run in the game save format and resumes the same world and ledger, which plays on', async () => {
    const run = new SimRun(simWorld(TEST_MAP, 2), SIM_TEXT, () => {});
    for (let i = 0; i < TURNS; i++) run.handle({ kind: 'step' });
    const { world, ledger } = run.current();
    const slots = await SaveSlots.open(memoryBackend(), null, 'sim-test', [SIM_SLOT]);
    slots.put(SIM_SLOT, simEnvelope(world, ledger, 1));
    const resumed = resumedRun(slots, TEST_MAP)!;
    expect(resumed.ledger).toEqual(ledger);
    expect(resumed.world).toMatchObject({ seed: world.seed, turn: world.turn });
    expect(resumed.world.player.money).toBe(world.player.money);
    expect(playerVehicle(resumed.world).pos).toEqual(playerVehicle(world).pos);
    expect(resumed.world.vehicles.map((v) => v.id)).toEqual(world.vehicles.map((v) => v.id));
    const messages: FromSim[] = [];
    const again = new SimRun(resumed.world, SIM_TEXT, (m) => messages.push(m), resumed.ledger);
    again.handle({ kind: 'step' });
    expect(messages.filter((m) => m.kind === 'failed')).toEqual([]);
    expect(again.current().world.turn).toBe(world.turn + 1);
  }, 240000);

  it('has no save for a run whose player is dead', () => {
    const world = simWorld(TEST_MAP, 2);
    const dead = { ...world, player: { ...world.player, state: 'dead' as const } };
    expect(() => simEnvelope(dead, emptyLedger(), 1)).toThrow(/dead/);
  }, 120000);
});
