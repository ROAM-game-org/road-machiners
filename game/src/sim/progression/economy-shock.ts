import { ECONOMY } from '../../data/goods';
import { ESSENTIAL_GOODS, PRESSURE_MAX, SHOPS } from '../../data/market';
import { START_KITS } from '../../data/start';
import { TIME } from '../../data/time';
import { wreckVehicle } from '../combat';
import { playerVehicle } from '../damage';
import { buyGood, rationing } from '../economy';
import { advanceFar } from '../far';
import { goodPrice, goodStock, pressureOf, shopState, siteOf, stockTarget, watchStock, type StockCause } from '../market';
import { yieldTo } from '../parley';
import { isOutlaw } from '../relations';
import { usesGood } from '../production';
import { shipmentOf } from '../road-news';
import { defaultSetup } from '../settings';
import { sitePads } from '../sites';
import type { Vehicle, World } from '../types';
import { dist } from '../vec';
import { endTurn, newWorld } from '../world';
import { TEST_MAP } from '../../test/map';

export type Shock = 'none' | 'robSorgut' | 'massacre' | 'pumpSurge' | 'stockpile';
export const SHOCKS: readonly Shock[] = ['none', 'robSorgut', 'massacre', 'pumpSurge', 'stockpile'];

export type DaySample = {
  day: number;
  stock: Record<string, Record<string, number>>;
  price: Record<string, Record<string, number>>;
  traders: number;
  convoys: number;
  rationingHours: Record<string, number>;
};

export type ShockRun = {
  seed: number;
  shock: Shock;
  days: number;
  shockTurn: number | null;
  samples: DaySample[];
  flows: Record<string, number>;
  pressureRange: { min: number; max: number };
  recoveryDays: Record<string, number | null>;
  margins: { from: string; to: string; good: string; margin: number }[];
};

const HAUL_CRATES = 20;
const HAUL_FUEL_PER_TILE = 0.4;
const RECOVERED_SHARE = 0.2;
const SAMPLE_TURNS = Math.round(TIME.workDayTurns / 4);

function npcsOf(world: World, templates: readonly string[]): Vehicle[] {
  return world.vehicles.filter((v) => v.brain && templates.includes(v.brain.templateId));
}

function robSorgut(world: World): boolean {
  const victims = world.vehicles.filter((v) => shipmentOf(v)?.good === 'grain');
  const robber = world.vehicles.find((v) => isOutlaw(v.faction));
  if (victims.length === 0 || !robber) return false;
  for (const victim of victims) {
    const haul = victim.items.filter((it) => it.kind === 'good' && it.good === 'grain');
    if (haul.length === 0) continue;
    yieldTo(world, victim, robber, haul);
  }
  return true;
}

function massacre(world: World): boolean {
  for (const v of npcsOf(world, ['trader', 'convoy'])) wreckVehicle(world, v);
  return true;
}

function pumpSurge(world: World): boolean {
  shopState(world, 'pump-station').event = { kind: 'surge', recipe: 'pump', until: world.turn + TIME.workDayTurns };
  return true;
}

function stockpile(world: World): World {
  const me = playerVehicle(world);
  me.pos = { ...sitePads(siteOf('granary'))[0] };
  me.speed = 0;
  world.player.money = 1000000;
  let w = world;
  while (goodStock(shopState(w, 'granary'), 'rations') > 0) {
    const room = me.items.length;
    w = buyGood(w, 'rations', 1);
    if (playerVehicle(w).items.length === room) break;
  }
  return w;
}

function applyShock(world: World, shock: Shock): { world: World; done: boolean } {
  if (shock === 'robSorgut') return { world, done: robSorgut(world) };
  if (shock === 'massacre') return { world, done: massacre(world) };
  if (shock === 'pumpSurge') return { world, done: pumpSurge(world) };
  if (shock === 'stockpile') return { world: stockpile(world), done: true };
  return { world, done: true };
}

function sample(world: World, day: number, rationingHours: Record<string, number>): DaySample {
  const stock: DaySample['stock'] = {};
  const price: DaySample['price'] = {};
  for (const shopId of Object.keys(world.shops)) {
    const state = shopState(world, shopId);
    stock[shopId] = { ...state.goods };
    price[shopId] = Object.fromEntries(SHOPS[shopId].goods.map((good) => [good, goodPrice(shopId, state, good, 'buy', ECONOMY.spread)]));
  }
  return { day, stock, price, traders: npcsOf(world, ['trader']).length, convoys: npcsOf(world, ['convoy']).length, rationingHours: { ...rationingHours } };
}

function margins(world: World): ShockRun['margins'] {
  const out: ShockRun['margins'] = [];
  for (const from of Object.values(SHOPS)) {
    for (const to of Object.values(SHOPS)) {
      if (from.id === to.id) continue;
      const tiles = dist(siteOf(from.id).pos, siteOf(to.id).pos);
      for (const good of from.goods.filter((g) => to.goods.includes(g))) {
        const buy = goodPrice(from.id, shopState(world, from.id), good, 'buy', ECONOMY.spread);
        const sell = goodPrice(to.id, shopState(world, to.id), good, 'sell', ECONOMY.spread);
        const margin = HAUL_CRATES * (sell - buy) - tiles * HAUL_FUEL_PER_TILE * ECONOMY.supplyPrice.fuel;
        if (margin > 0) out.push({ from: from.id, to: to.id, good, margin: Math.round(margin) });
      }
    }
  }
  return out.sort((a, b) => b.margin - a.margin).slice(0, 12);
}

function pressureRange(world: World, range: { min: number; max: number }): void {
  for (const shopId of Object.keys(world.shops)) {
    for (const good of SHOPS[shopId].goods) {
      const p = pressureOf(shopId, good, goodStock(shopState(world, shopId), good));
      if (p > PRESSURE_MAX || p < -PRESSURE_MAX) throw new Error(`${shopId} ${good} pressure ${p} is out of bounds`);
      range.min = Math.min(range.min, p);
      range.max = Math.max(range.max, p);
    }
  }
}

function recovery(run: DaySample[], shockDay: number | null): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (shockDay === null) return out;
  for (const shopId of Object.keys(SHOPS)) {
    for (const good of ESSENTIAL_GOODS.filter((g) => usesGood(shopId, g))) {
      const target = stockTarget(shopId, good);
      const back = run.find((d) => d.day > shockDay && Math.abs(d.stock[shopId][good] - target) <= target * RECOVERED_SHARE);
      out[`${shopId}:${good}`] = back ? Math.round((back.day - shockDay) * 100) / 100 : null;
    }
  }
  return out;
}

type Recording = {
  world: World;
  flows: Record<string, number>;
  range: { min: number; max: number };
  rationingHours: Record<string, number>;
  samples: DaySample[];
  shockTurn: number | null;
};

function startRecording(seed: number, shock: Shock): Recording {
  const world = newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
  return { world, flows: {}, range: { min: 0, max: 0 }, rationingHours: {}, samples: [], shockTurn: shock === 'none' ? null : -1 };
}

function tryShock(rec: Recording, shock: Shock, shockAt: number): void {
  if (rec.shockTurn !== -1 || rec.world.turn < shockAt) return;
  const applied = applyShock(rec.world, shock);
  rec.world = applied.world;
  if (applied.done) rec.shockTurn = rec.world.turn;
}

function noteHour(rec: Recording): void {
  pressureRange(rec.world, rec.range);
  for (const shopId of Object.keys(rec.world.shops)) if (rationing(rec.world, shopId, 'fuel')) rec.rationingHours[shopId] = (rec.rationingHours[shopId] ?? 0) + 1;
}

function playTurn(rec: Recording, onDay: (s: DaySample) => void): void {
  rec.world.player.call = null;
  rec.world = endTurn(rec.world, (x) => { for (const v of x.vehicles) advanceFar(x, v); });
  if (rec.world.turn % Math.round(TIME.workDayTurns / 24) === 0) noteHour(rec);
  if (rec.world.turn % SAMPLE_TURNS !== 0) return;
  const s = sample(rec.world, rec.world.turn / TIME.workDayTurns, rec.rationingHours);
  rec.samples.push(s);
  onDay(s);
}

function shockDayOf(rec: Recording): number | null {
  return rec.shockTurn !== null && rec.shockTurn >= 0 ? rec.shockTurn / TIME.workDayTurns : null;
}

export function playShock(seed: number, days: number, shock: Shock, shockAt: number = TIME.workDayTurns, onDay: (s: DaySample) => void = () => {}): ShockRun {
  const rec = startRecording(seed, shock);
  watchStock((_shopId, good, delta, cause: StockCause) => {
    const key = `${cause}:${good}:${delta > 0 ? 'in' : 'out'}`;
    rec.flows[key] = (rec.flows[key] ?? 0) + Math.abs(delta);
  });
  try {
    for (let turn = 0; turn < days * TIME.workDayTurns; turn++) {
      tryShock(rec, shock, shockAt);
      playTurn(rec, onDay);
    }
  } finally {
    watchStock(null);
  }
  return { seed, shock, days, shockTurn: rec.shockTurn, samples: rec.samples, flows: rec.flows, pressureRange: rec.range, recoveryDays: recovery(rec.samples, shockDayOf(rec)), margins: margins(rec.world) };
}

function table(head: string[], rows: string[][]): string[] {
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''];
}

function stockRows(run: ShockRun): string[][] {
  return Object.keys(SHOPS).flatMap((shopId) => SHOPS[shopId].goods.map((good) => [`${shopId}:${good} (target ${stockTarget(shopId, good)})`, run.samples.map((d) => d.stock[shopId][good]).join(' ')]));
}

function formatRun(run: ShockRun): string[] {
  const hours = (d: DaySample) => Object.entries(d.rationingHours).map(([s, h]) => `${s} ${h}`).join(', ') || '-';
  return [
    `## ${run.shock}, seed ${run.seed}, ${run.days} days`, '',
    `Shock turn: ${run.shockTurn ?? 'none'}. Pressure range ${run.pressureRange.min.toFixed(2)} to ${run.pressureRange.max.toFixed(2)}.`, '',
    ...table(['day', 'traders', 'convoys', 'fuel rationing hours so far'], run.samples.map((d) => [d.day.toFixed(2), `${d.traders}`, `${d.convoys}`, hours(d)])),
    ...table(['flow', 'crates per day'], Object.entries(run.flows).sort().map(([k, n]) => [k, (n / run.days).toFixed(1)])),
    ...table(['site:good', 'stock by quarter day'], stockRows(run)),
    ...table(['essential', 'days to recover within 20%'], Object.entries(run.recoveryDays).map(([k, d]) => [k, d === null ? 'not yet' : `${d}`])),
    ...table(['best route', 'margin per 20 crates after fuel (M)'], run.margins.map((m) => [`${m.good} ${m.from} to ${m.to}`, `${m.margin}`])),
  ];
}

export function formatShocks(runs: ShockRun[]): string {
  return ['# Economy shock report', '', ...runs.flatMap(formatRun)].join('\n');
}
