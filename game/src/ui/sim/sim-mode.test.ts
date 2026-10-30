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
import { PLAYTHROUGH_OPTIONS, playthroughWorld } from '../../sim/progression/activity';
import { marketSample } from '../../sim/progression/sim-economy';
import { cardOf, hudOf, logEntries, markersOf, SimRun, simWorld, type Frame, type FromSim } from '../../sim/progression/sim-mode';

const TURNS = 10;
const SCAN_TURNS = 60;
const RAW = /[a-z][A-Z]|@|\{|\}|\b[a-z]{1,4}\d{2,}\b|\btrue\b|\bfalse\b|—|\bsomething\b|\bYou arrives\b|[a-z,] You\b|:\d/;

function framesOf(messages: FromSim[]): Frame[] {
  return messages.flatMap((m) => (m.kind === 'frame' ? [m.frame] : []));
}

describe('simulation mode', () => {
  const hour = TIME.turnsPerDay / 24;
  const SAMPLE_TURNS = Math.ceil(hour) + 1;
  let start: World;
  let harnessStart: World;
  let startJson: string;
  let played: { messages: FromSim[]; run: SimRun; atTurns: { worldJson: string; messageCount: number; history: unknown[] }[] };
  beforeAll(() => {
    start = simWorld(TEST_MAP, 1);
    startJson = JSON.stringify(start);
    harnessStart = playthroughWorld(TEST_MAP, 1, 'markov');
    const messages: FromSim[] = [];
    const run = new SimRun(start, SIM_TEXT, (m: FromSim) => messages.push(m));
    const atTurns: { worldJson: string; messageCount: number; history: unknown[] }[] = [];
    for (let i = 1; i <= SCAN_TURNS; i++) {
      run.handle({ kind: 'step' });
      if (i === TURNS || i === SAMPLE_TURNS) atTurns[i] = { worldJson: JSON.stringify(run.current().world), messageCount: messages.length, history: [...run.current().history] };
    }
    played = { messages, run, atTurns };
  }, 240000);

  it('plays the same game as the playthrough harness for the same seed', () => {
    expect(JSON.parse(JSON.stringify(harnessStart))).toEqual(JSON.parse(startJson));
    const at = played.atTurns[TURNS];
    const messages = played.messages.slice(0, at.messageCount);
    const recorded = [...playTurns(harnessStart, 'seed 1 markov', 'markov', TURNS, PLAYTHROUGH_OPTIONS, FAR_MOVER)];
    expect(JSON.parse(at.worldJson)).toEqual(JSON.parse(JSON.stringify(recorded[TURNS - 1].next)));
    const frames = framesOf(messages);
    expect(messages.some((m) => m.kind === 'failed')).toBe(false);
    expect(frames).toHaveLength(TURNS + 1);
    const last = recorded[TURNS - 1].next;
    const me = playerVehicle(last);
    const marker = frames[TURNS].markers.find((m) => m.player);
    expect(marker).toMatchObject({ x: me.pos.x, y: me.pos.y });
    expect(frames.slice(1).map((f) => f.log.length)).toEqual(recorded.map((p) => p.events.length));
  }, 120000);

  it("writes events in the game's words where it has them and in plain sim words for the rest", () => {
    const world = start;
    const npc = world.vehicles.find((v) => v.brain)!;
    const knockout = { t: 'npcKnockout', vehicle: npc.id } as never;
    const spawn = { t: 'spawn', vehicle: npc.id } as never;
    const [knocked, spawned] = logEntries(world, [knockout, spawn], SIM_TEXT);
    expect(knocked.text).toContain(SIM_TEXT.truck(world, npc));
    expect(knocked.ids).toEqual([npc.id]);
    expect(spawned).toMatchObject({ quiet: true, ids: [npc.id], text: `${SIM_TEXT.truck(world, npc)} enters the map` });    expect(world.player.fullLog).toBeFalsy();
  });

  it('names every truck as the game does and shows the player in money, not cents', () => {
    const world = start;
    const markers = markersOf(world, SIM_TEXT);
    expect(markers.every((m) => m.name !== '' && m.name !== m.id)).toBe(true);
    const hud = hudOf(world, SIM_TEXT);
    expect(hud.money).toBe(SIM_TEXT.money(world.player.money));
    expect(hud.money).toBe(`${world.player.money} M's`);
    expect(hud.worth).toBe(SIM_TEXT.money(netWorth(world)));
  });

  it('gives the player card the run ledger, and a plain card for a truck that left', () => {
    const world = start;
    const ledger = { ...emptyLedger(), fuel: -1200 };
    const card = cardOf(world, world.player.vehicleId, ledger, SIM_TEXT);
    expect(card.title).toBe('Your truck');
    expect(card.sections.find((s) => s.name === 'Money in and out')?.rows).toEqual([['Fuel', SIM_TEXT.money(-1200)]]);
    expect(cardOf(world, 'gone-truck', ledger, SIM_TEXT)).toMatchObject({ id: 'gone-truck', title: 'This truck', doing: 'Left the map', stats: [], sections: [] });
  });

  it('shows an NPC card with its driver and goals', () => {
    const world = start;
    const npc = world.vehicles.find((v) => v.brain)!;
    const card = cardOf(world, npc.id, emptyLedger(), SIM_TEXT);
    expect(card.title).toBe(SIM_TEXT.truck(world, npc));
    expect(card.facts).toContainEqual(['Faction', SIM_TEXT.faction(npc.faction)]);
    expect(card.facts).toContainEqual(['Home', SIM_TEXT.place(npc.brain!.home)]);
    expect(card.way.home).toEqual(npc.brain!.home);
    expect(card.sections.find((s) => s.name === 'Goals')?.lines).toHaveLength(npc.brain!.goals.length);
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
    expect(met.text).toBe(`${nameA} comes to your truck with a tall tale`);
    for (const e of [fired, met]) expect(e.text).not.toMatch(/[{}]|\bv\d+\b/);
  });

  it('hides routine NPC events by default but never the ones that name the player', () => {
    const world = start;
    const npc = world.vehicles.find((v) => v.brain)!;
    const hit = (b: string) => ({ t: 'collision', a: npc.id, b, impact: 2, hitsA: [], hitsB: [] }) as never;
    const [alone, withPlayer] = logEntries(world, [hit('deadTree-1'), hit(world.player.vehicleId)], SIM_TEXT);
    expect(alone.quiet).toBe(true);
    expect(withPlayer.quiet).toBe(false);
  });

  it('names the prop a truck hits and calls the player Your truck with a matching verb', () => {
    const world = start;
    const npc = world.vehicles.find((v) => v.brain)!;
    const hit = { t: 'collision', a: npc.id, b: 'deadTree-5853', impact: 2, hitsA: [], hitsB: [] } as never;
    const arrived = { t: 'arrived', vehicle: world.player.vehicleId } as never;
    const [crash, came] = logEntries(world, [hit, arrived], SIM_TEXT);
    expect(crash.text).toBe(`${SIM_TEXT.truck(world, npc)} hits a dead tree`);
    expect(came.text).toBe('Your truck arrives');
    const plea = { t: 'plea', from: npc.id, to: world.player.vehicleId, plea: 'mercy', accepted: true } as never;
    expect(logEntries(world, [plea], SIM_TEXT)[0].text).toBe(`${SIM_TEXT.truck(world, npc)} begs Your truck for mercy and gets it`);
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
    const lines = cardOf(remembering, npc.id, emptyLedger(), SIM_TEXT).sections.find((s) => s.name === 'Memories')?.lines;
    const name = SIM_TEXT.truck(world, other);
    expect(lines).toEqual([`Just now: ${name} robbed them`, `3 h ago: Saw ${name} in A1`]);
  });

  it('writes every card and log line of a played run in plain words, with no ids, code words, flags or JSON', () => {
    const { messages, run } = played;
    expect(messages.filter((m) => m.kind === 'failed')).toEqual([]);
    const { world, ledger } = run.current();
    const cards = world.vehicles.map((v) => cardOf(world, v.id, ledger, SIM_TEXT));
    const cardText = cards.flatMap((c) => [c.title, c.doing, ...c.tags, ...c.stats.flat(), ...c.facts.flat(), ...c.sections.flatMap((s) => [s.name, ...s.lines, ...s.rows.flat()])]);
    const logText = framesOf(messages).flatMap((f) => f.log.map((e) => e.text));
    const raw = [...cardText, ...logText].filter((line) => RAW.test(line));
    expect(raw).toEqual([]);
    expect(logText.length).toBeGreaterThan(SCAN_TURNS);
  }, 240000);

  it('samples money, net worth and XP once per game hour and sends the history first', () => {
    const at = played.atTurns[SAMPLE_TURNS];
    const messages = played.messages.slice(0, at.messageCount);
    expect(messages[0]).toEqual({ kind: 'history', samples: [{ turn: start.turn, money: start.player.money, worth: Math.round(netWorth(start)), xp: Math.floor(start.player.xp), market: marketSample(start), events: [] }] });
    const sampled = framesOf(messages).flatMap((f) => (f.sample ? [f.sample] : []));
    expect(sampled).toHaveLength(1);
    expect(Math.floor(sampled[0].turn / hour)).toBe(Math.floor(start.turn / hour) + 1);
    expect(at.history).toEqual([...(messages[0] as { samples: unknown[] }).samples, sampled[0]]);
  }, 120000);

  it('shows a card for a truck with no driver instead of stopping the run', () => {
    const world = start;
    const npc = world.vehicles.find((v) => v.brain)!;
    const driverless = { ...world, vehicles: world.vehicles.map((v) => (v.id === npc.id ? { ...v, brain: null } : v)) };
    expect(cardOf(driverless, npc.id, emptyLedger(), SIM_TEXT).doing).toBe('No driver');
  });
});
