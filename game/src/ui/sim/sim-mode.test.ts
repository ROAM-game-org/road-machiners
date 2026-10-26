import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_MAP } from '../../test/map';
import type { World } from '../../sim/types';
import { SIM_TEXT } from './sim-text';
import { playerVehicle } from '../../sim/damage';
import { emptyLedger } from '../../sim/progression/orders';
import { FAR_MOVER, netWorth, playTurns } from '../../sim/progression/record';
import { startWorld } from '../../sim/progression/record-node';
import { cardOf, hudOf, logEntries, markersOf, SIM_OPTIONS, SimRun, simWorld, type Frame, type FromSim } from '../../sim/progression/sim-mode';
import { describe as describeEvent } from '../../sim/progression/turn-log';

const TURNS = 10;

function framesOf(messages: FromSim[]): Frame[] {
  return messages.flatMap((m) => (m.kind === 'frame' ? [m.frame] : []));
}

describe('simulation mode', () => {
  let start: World;
  beforeAll(() => {
    start = simWorld(TEST_MAP, 1);
  }, 120000);

  it('plays the same game as the recorder for the same seed', () => {
    const messages: FromSim[] = [];
    const run = new SimRun(start, 1, SIM_TEXT, (m: FromSim) => messages.push(m));
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
  }, 120000);

  it('writes events the game logs as the game words them, keeps the raw line, and falls back to it for the rest', () => {
    const world = start;
    const npc = world.vehicles.find((v) => v.brain)!;
    const knockout = { t: 'npcKnockout', vehicle: npc.id } as never;
    const spawn = { t: 'spawn', vehicle: npc.id } as never;
    const [knocked, spawned] = logEntries(world, [knockout, spawn], SIM_TEXT);
    expect(knocked.text).toContain(SIM_TEXT.truck(world, npc));
    expect(knocked.raw).toBe(describeEvent(world, knockout));
    expect(knocked.ids).toEqual([npc.id]);
    expect(spawned).toMatchObject({ quiet: true, ids: [npc.id], text: describeEvent(world, spawn) });
    expect(world.player.fullLog).toBeFalsy();
  });

  it('names every truck as the game does and shows the player in money, not cents', () => {
    const world = start;
    const markers = markersOf(world, SIM_TEXT);
    expect(markers.every((m) => m.name !== '' && m.name !== m.id)).toBe(true);
    const hud = hudOf(world, SIM_TEXT);
    expect(hud.money).toBe(SIM_TEXT.money(world.player.money));
    expect(hud.money).toBe(`${Math.ceil(world.player.money / 100)} M's`);
    expect(hud.worth).toBe(SIM_TEXT.money(netWorth(world)));
  });

  it('gives the player card the run ledger and net worth, and a plain card for a truck that left', () => {
    const world = start;
    const ledger = { ...emptyLedger(), fuel: -1200 };
    const card = cardOf(world, world.player.vehicleId, ledger, SIM_TEXT);
    expect(card.rows).toContainEqual(['net worth', SIM_TEXT.money(netWorth(world))]);
    expect(card.sections.find((s) => s.name === 'run ledger')?.lines).toEqual([`fuel ${SIM_TEXT.money(-1200)}`]);
    expect(cardOf(world, 'gone-truck', ledger, SIM_TEXT)).toEqual({ id: 'gone-truck', title: 'gone-truck has left the world', rows: [['id', 'gone-truck']], sections: [] });
  });

  it('shows an NPC card with its driver and goals', () => {
    const world = start;
    const npc = world.vehicles.find((v) => v.brain)!;
    const card = cardOf(world, npc.id, emptyLedger(), SIM_TEXT);
    expect(card.title).toBe(SIM_TEXT.truck(world, npc));
    expect(card.rows).toContainEqual(['faction', npc.faction]);
    expect(card.sections.find((s) => s.name === 'goals')?.lines).toHaveLength(npc.brain!.goals.length);
  });

  it('shows a card for a truck with no driver instead of stopping the run', () => {
    const world = start;
    const npc = world.vehicles.find((v) => v.brain)!;
    const driverless = { ...world, vehicles: world.vehicles.map((v) => (v.id === npc.id ? { ...v, brain: null } : v)) };
    expect(cardOf(driverless, npc.id, emptyLedger(), SIM_TEXT).title).toMatch(/with no driver$/);
  });
});
