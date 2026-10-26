import { describe, expect, it } from 'vitest';
import { TEST_MAP } from '../../test/map';
import { playerVehicle } from '../damage';
import { emptyLedger } from './orders';
import { FAR_MOVER, netWorth, playTurns } from './record';
import { startWorld } from './record-node';
import { cardOf, logEntries, SIM_OPTIONS, SimRun, simWorld, type Frame, type FromSim } from './sim-mode';

const TURNS = 20;

function framesOf(messages: FromSim[]): Frame[] {
  return messages.flatMap((m) => (m.kind === 'frame' ? [m.frame] : []));
}

describe('simulation mode', () => {
  it('plays the same game as the recorder for the same seed', () => {
    const messages: FromSim[] = [];
    const run = new SimRun(simWorld(TEST_MAP, 1), 1, (m) => messages.push(m));
    for (let i = 0; i < TURNS; i++) run.handle({ kind: 'step' });
    const recorded = [...playTurns(startWorld(1), 'seed 1 markov', 'markov', TURNS, SIM_OPTIONS, FAR_MOVER)];
    const frames = framesOf(messages);
    expect(messages.some((m) => m.kind === 'failed')).toBe(false);
    expect(frames).toHaveLength(TURNS + 1);
    const last = recorded[TURNS - 1].next;
    const me = playerVehicle(last);
    const marker = frames[TURNS].markers.find((m) => m.player);
    expect(marker).toMatchObject({ x: me.pos.x, y: me.pos.y });
    expect(frames.slice(1).map((f) => f.log.length)).toEqual(recorded.map((p) => p.events.length));
  });

  it('turns every event into one log entry naming the trucks it mentions', () => {
    const world = simWorld(TEST_MAP, 1);
    const npc = world.vehicles.find((v) => v.brain)!;
    const entries = logEntries(world, [{ t: 'npcKnockout', vehicle: npc.id } as never, { t: 'weather' } as never]);
    expect(entries.map((e) => e.ids)).toEqual([[npc.id], []]);
    expect(entries.map((e) => e.quiet)).toEqual([false, true]);
  });

  it('gives the player card the run ledger and net worth, and a plain card for a truck that left', () => {
    const world = simWorld(TEST_MAP, 1);
    const ledger = { ...emptyLedger(), fuel: -12 };
    const card = cardOf(world, world.player.vehicleId, ledger);
    expect(card.rows).toContainEqual(['net worth', `${Math.round(netWorth(world))}`]);
    expect(card.sections.find((s) => s.name === 'run ledger')?.lines).toEqual(['fuel -12']);
    expect(cardOf(world, 'gone-truck', ledger)).toEqual({ id: 'gone-truck', title: 'gone-truck is no longer in the world', rows: [], sections: [] });
  });

  it('shows an NPC card with its driver and goals', () => {
    const world = simWorld(TEST_MAP, 1);
    const npc = world.vehicles.find((v) => v.brain)!;
    const card = cardOf(world, npc.id, emptyLedger());
    expect(card.title).toBe(`${npc.id} ${npc.brain!.templateId} ${npc.brain!.driver}`);
    expect(card.rows).toContainEqual(['faction', npc.faction]);
    expect(card.sections.find((s) => s.name === 'goals')?.lines).toHaveLength(npc.brain!.goals.length);
  });
});
