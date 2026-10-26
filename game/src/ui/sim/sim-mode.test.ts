import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_MAP } from '../../test/map';
import type { World } from '../../sim/types';
import { TIME } from '../../data/time';
import { mountedParts } from '../../sim/grid';
import { partName } from '../../text/names';
import { resolve } from '../../text/resolve';
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
    const run = new SimRun(start, SIM_TEXT, (m: FromSim) => messages.push(m));
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

  it("writes events in the game's words where it has them and in plain sim words for the rest, and keeps the raw line", () => {
    const world = start;
    const npc = world.vehicles.find((v) => v.brain)!;
    const knockout = { t: 'npcKnockout', vehicle: npc.id } as never;
    const spawn = { t: 'spawn', vehicle: npc.id } as never;
    const [knocked, spawned] = logEntries(world, [knockout, spawn], SIM_TEXT);
    expect(knocked.text).toContain(SIM_TEXT.truck(world, npc));
    expect(knocked.raw).toBe(describeEvent(world, knockout));
    expect(knocked.ids).toEqual([npc.id]);
    expect(spawned).toMatchObject({ quiet: true, ids: [npc.id], text: `${SIM_TEXT.truck(world, npc)} enters the map` });    expect(world.player.fullLog).toBeFalsy();
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

  it('writes NPC fights and events the game never words as sentences with truck and part names, never raw ids or JSON', () => {
    const world = start;
    const [a, b] = world.vehicles.filter((v) => v.brain);
    const gun = mountedParts(a).find((p) => p.defId !== '')!;
    const round = (hit: boolean) => ({ hit, crit: false, offset: 0, struck: null, hits: [], blast: [], burst: null });
    const shot = { t: 'shot', shooter: a.id, weapon: gun.id, target: b.id, aim: 'body', chance: 0.5, damageChance: 0.5, side: 'front', rounds: [round(true), round(false), round(true)] } as never;
    const encounter = { t: 'encounter', vehicle: a.id, encounter: 'tallTale' } as never;
    const [fired, met] = logEntries(world, [shot, encounter], SIM_TEXT);
    const nameA = SIM_TEXT.truck(world, a);
    expect(fired.text).toBe(`${nameA} fires ${resolve(partName(gun.defId), 'en').toLowerCase()} at ${SIM_TEXT.truck(world, b)}, 2 of 3 hit`);
    expect(met.text).toBe(`Encounter: vehicle ${nameA}, encounter tall tale`);
    for (const e of [fired, met]) expect(e.text).not.toMatch(/[{}]|\bv\d+\b/);
  });

  it('writes memories newest first as sentences with their age in game hours', () => {
    const world = start;
    const [npc, other] = world.vehicles.filter((v) => v.brain);
    const hour = TIME.turnsPerDay / 24;
    const memories = [
      { turn: world.turn - 3 * hour, fact: { kind: 'sighting' as const, vehicle: other.id, at: { x: 10.4, y: 20.6 }, heading: 0 } },
      { turn: world.turn, fact: { kind: 'wronged' as const, by: other.id, deed: 'robbed' as const } },
    ];
    const remembering = { ...world, vehicles: world.vehicles.map((v) => (v.id === npc.id ? { ...v, brain: { ...v.brain!, memories } } : v)) };
    const lines = cardOf(remembering, npc.id, emptyLedger(), SIM_TEXT).sections.find((s) => s.name === 'memories')?.lines;
    const name = SIM_TEXT.truck(world, other);
    expect(lines).toEqual([`Just now: ${name} robbed them`, `3 h ago: Saw ${name} at 10, 21`]);
  });

  it('shows a card for a truck with no driver instead of stopping the run', () => {
    const world = start;
    const npc = world.vehicles.find((v) => v.brain)!;
    const driverless = { ...world, vehicles: world.vehicles.map((v) => (v.id === npc.id ? { ...v, brain: null } : v)) };
    expect(cardOf(driverless, npc.id, emptyLedger(), SIM_TEXT).title).toMatch(/with no driver$/);
  });
});
