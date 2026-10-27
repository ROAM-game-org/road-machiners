import { SKILL_IDS } from '../../data/skills';
import { inCombat } from '../combat';
import { playerVehicle } from '../damage';
import { isKnockedOut } from '../defeat';
import { goodsCount, mountedParts } from '../grid';
import { topGoal } from '../npc-activities';
import { getResources } from '../resources';
import { worldPlaces } from '../sites';
import { vehicleStats } from '../stats';
import type { PartInstance, Vehicle, World } from '../types';
import type { Vec } from '../vec';
import { maxHp } from '../wear';
import { LEDGER_KEYS, type Ledger } from './orders';
import type { Card, CardRow, CardSection, SimText, Way } from './sim-mode';
import { snap, turnLine, type TruckSnap } from './turn-log';

const NO_WAY: Way = { dest: null, target: null, home: null };
const round = (n: number): number => Math.round(n * 10) / 10;

const listed = (name: string, lines: string[]): CardSection => ({ name, lines, rows: [] });
const table = (name: string, rows: CardRow[]): CardSection => ({ name, lines: [], rows });

export function cardOf(world: World, id: string, ledger: Ledger, text: SimText): Card {
  if (id === world.player.vehicleId) return playerCard(world, ledger, text);
  const v = world.vehicles.find((x) => x.id === id);
  return v ? npcCard(world, v, text) : goneCard(world, id, text);
}

function goneCard(world: World, id: string, text: SimText): Card {
  const v = world.removed.find((x) => x.id === id);
  return { id, title: v ? text.truck(world, v) : 'This truck', doing: 'Left the map', tags: [], stats: [], facts: [], sections: [], way: NO_WAY };
}

function driverlessCard(world: World, v: Vehicle, text: SimText): Card {
  return {
    id: v.id,
    title: text.truck(world, v),
    doing: 'No driver',
    tags: [],
    stats: [['Condition', `${snap(world, v).hp}%`]],
    facts: [['Faction', text.faction(v.faction)], ['Square', text.place(v.pos)], ...orderRow(v, text)],
    sections: [listed('States', stateLines(world, v, text)), table('Parts', partRows(v, text))],
    way: { ...NO_WAY, dest: destOf(v) },
  };
}

function npcTags(world: World, v: Vehicle, s: TruckSnap): string[] {
  const on: [string, boolean][] = [['In combat', inCombat(world, v)], ['Knocked out', isKnockedOut(v)], ['Stranded', s.stranded], ['Keeps off roads', s.offRoad]];
  return on.filter(([, yes]) => yes).map(([name]) => name);
}

export function npcCard(world: World, v: Vehicle, text: SimText): Card {
  const brain = v.brain;
  if (!brain) return driverlessCard(world, v, text);
  const res = getResources(world, v);
  const s = snap(world, v);
  return {
    id: v.id,
    title: text.truck(world, v),
    doing: text.doing(world, v),
    tags: npcTags(world, v, s),
    stats: [['Speed', text.speed(v.speed)], ['Money', text.money(res.money)], ['Condition', `${s.hp}%`], ['Fuel', text.fuel(res.fuel)], ['Supplies', `${round(res.supplies)}`], ['Health', `${round(res.health)}`]],
    facts: [
      ['Driver', text.template(brain.templateId)],
      ['Faction', text.faction(v.faction)],
      ['Traits', brain.traits.map((x) => text.trait(x)).join(', ')],
      ['Temper', text.personality(brain.personality)],
      ['Chassis', text.chassis(v.chassisId)],
      ['Square', text.place(v.pos)],
      ['Home', text.place(brain.home)],
      ...orderRow(v, text),
      ...(s.roadGap > 0 ? [['Off road', text.distance(s.roadGap)] as CardRow] : []),
    ],
    sections: [
      listed('Goals', [...brain.goals].reverse().map((g) => text.goal(world, g))),
      listed('States', stateLines(world, v, text)),
      listed('Memories', [...brain.memories].sort((a, b) => b.turn - a.turn).map((m) => text.memory(world, m))),
      table('Parts', partRows(v, text)),
      table('Cargo', goodsRows(v, text)),
    ],
    way: { dest: destOf(v), target: targetOf(world, v), home: brain.home },
  };
}

function playerTags(world: World, flags: string[]): string[] {
  const state = world.player.state === 'active' ? [] : [world.player.state === 'knockedOut' ? 'Knocked out' : 'Dead'];
  const names: Record<string, string> = { combat: 'In combat', stranded: 'Stranded', towed: 'Towed', beacon: 'Beacon on', fire: 'Auto fire' };
  return [...state, ...flags.map((f) => names[f] ?? f)];
}

function callRow(world: World, text: SimText): CardRow[] {
  const call = world.player.call;
  return call ? [['Radio', `${text.name(world, call.with)}${call.topic ? `, ${text.words(call.topic)}` : ''}`]] : [];
}

export function playerCard(world: World, ledger: Ledger, text: SimText): Card {
  const line = turnLine(world, [], ledger);
  const p = world.player;
  const me = playerVehicle(world);
  return {
    id: p.vehicleId,
    title: text.truck(world, me),
    doing: '',
    tags: playerTags(world, line.flags),
    stats: [['Speed', text.speed(me.speed)], ['Fuel', text.fuel(p.fuel)], ['Supplies', `${round(p.supplies)}`], ['Engine', text.heat(p.engineHeat)], ['Condition', `${snap(world, me).hp}%`], ['Top speed', text.speed(vehicleStats(world, me).maxSpeed)]],
    facts: [['Chassis', text.chassis(me.chassisId)], ['Square', text.place(me.pos)], ...orderRow(me, text), ...callRow(world, text), ...(line.run ? [['Run', line.run] as CardRow] : [])],
    sections: [
      listed('Contracts', p.contracts.map((c) => text.contract(c))),
      listed('Foes in sight', line.foes.map((f) => `${text.name(world, f.id)}, ${text.distance(f.dist)} away, ${f.odds}% to win`)),
      table('Ranks', SKILL_IDS.map((skill) => [text.skill(skill), `${p.ranks[skill]}`])),
      table('Money in and out', LEDGER_KEYS.filter((k) => ledger[k] !== 0).map((k) => [capital(text.words(k)), text.money(ledger[k])])),
      table('XP by source', Object.entries(p.xpBySource).filter(([, n]) => n !== 0).sort(([, a], [, b]) => b - a).map(([source, n]) => [capital(text.words(source)), `${round(n)}`])),
      table('Parts', partRows(me, text)),
      table('Cargo', goodsRows(me, text)),
    ],
    way: { ...NO_WAY, dest: destOf(me) },
  };
}

const capital = (words: string): string => words.charAt(0).toUpperCase() + words.slice(1);

function destOf(v: Vehicle): Vec | null {
  return v.order && 'dest' in v.order ? v.order.dest : null;
}

function orderRow(v: Vehicle, text: SimText): CardRow[] {
  const order = v.order;
  if (!order) return [];
  if (!('dest' in order)) return [['Order', 'Brake']];
  const how = order.kind === 'stopAt' ? 'Stop at' : 'Drive through';
  const far = Math.hypot(order.dest.x - v.pos.x, order.dest.y - v.pos.y);
  return [['Order', `${how} ${text.place(order.dest)}, ${text.distance(far)}`]];
}

function targetOf(world: World, v: Vehicle): Vec | null {
  const goal = topGoal(v);
  if (!goal) return null;
  return goal.destination ?? (goal.targetId ? placeOf(world, goal.targetId) : null);
}

function placeOf(world: World, id: string): Vec | null {
  const at = world.vehicles.find((x) => x.id === id) ?? world.salvage.find((s) => s.id === id) ?? worldPlaces(world).find((s) => s.id === id);
  return at ? at.pos : null;
}

function hpPercent(p: PartInstance): number {
  return Math.round((100 * p.hp) / maxHp(p));
}

function stateLines(world: World, v: Vehicle, text: SimText): string[] {
  return world.states.filter((s) => s.holder === v.id).map((s) => `${capital(text.state(s.kind))} with ${text.name(world, s.other)}${s.turnsLeft === null ? '' : `, ${s.turnsLeft} turns left`}`);
}

function partRows(v: Vehicle, text: SimText): CardRow[] {
  const kinds = new Map<string, number[]>();
  for (const p of mountedParts(v)) kinds.set(p.defId, [...(kinds.get(p.defId) ?? []), hpPercent(p)]);
  return [...kinds].map(([defId, hp]) => ({ defId, hp: Math.min(...hp), count: hp.length })).sort((a, b) => a.hp - b.hp).map((k) => [k.count === 1 ? text.part(k.defId) : `${k.count} ${text.part(k.defId)}`, `${k.hp}%`]);
}

function goodsRows(v: Vehicle, text: SimText): CardRow[] {
  return Object.entries(goodsCount(v)).map(([good, n]) => [text.good(good), `${n}`]);
}
