import { beforeAll, describe, expect, it } from 'vitest';
import { economyOf, StockFlows, type Economy } from '../../sim/progression/sim-economy';
import { sampleOf, simWorld } from '../../sim/progression/sim-mode';
import type { World } from '../../sim/types';
import { TEST_MAP } from '../../test/map';
import { hoursSince, lineAlertsOf, MarketHistory, needsOf, rankedAlerts, whyShort } from './economy-reads';
import { SIM_TEXT } from './sim-text';

function emptied(world: World, shop: string, good: string): World {
  const copy = structuredClone(world);
  copy.shops[shop].goods[good] = 0;
  return copy;
}

describe('economy reads', () => {
  let world: World;
  beforeAll(() => {
    world = simWorld(TEST_MAP, 1);
  }, 120000);

  const read = (w: World): Economy => economyOf(w, new StockFlows(w.turn), SIM_TEXT);

  it('says a line stopped for lack of an input and names the input with what is held', () => {
    const forge = emptied(world, 'nose', 'scrap');
    const economy = read(forge);
    const nose = economy.shops.find((s) => s.id === 'nose')!;
    const made = nose.goods.find((g) => g.good === 'tools')!;
    const why = whyShort(economy, nose, made);
    expect(why).toContain(`2 ${SIM_TEXT.good('scrap')}, has 0`);
    expect(lineAlertsOf(economy).some((a) => a.shop.id === 'nose' && a.why === why)).toBe(true);
  });

  it('says every maker is out, then that nobody hauls, then that haulers were robbed, then what is on the way', () => {
    const economy0 = read(world);
    const edge = economy0.edges.find((e) => !economy0.shops.find((s) => s.id === e.toId)!.lines.some((l) => l.outputGoods.includes(e.good)))!;
    const makers = economy0.edges.filter((e) => e.good === edge.good && e.toId === edge.toId).map((e) => e.fromId);
    let drained = world;
    for (const maker of makers) drained = emptied(drained, maker, edge.good);
    const out = read(drained);
    const town = out.shops.find((s) => s.id === edge.toId)!;
    const good = town.goods.find((g) => g.good === edge.good)!;
    expect(whyShort(out, town, good)).toContain('out of it too');
    const stocked = structuredClone(world);
    stocked.shops[makers[0]].goods[edge.good] = 40;
    stocked.vehicles = stocked.vehicles.map((v) => (v.brain ? { ...v, brain: { ...v.brain, goals: v.brain.goals.map((g) => ({ ...g, shipment: undefined })) } } : v));
    const quiet = read(stocked);
    expect(whyShort(quiet, town, good)).toContain('No truck hauls it here');
    stocked.roadNews = [{ turn: stocked.turn, kind: 'robbed', good: edge.good, units: 4, from: makers[0], to: edge.toId }];
    expect(whyShort(read(stocked), town, good)).toContain('Haulers lost 4 crates');
  });

  it('says only salvage fills a good no town makes', () => {
    const economy = read(world);
    const shop = economy.shops.find((s) => s.goods.some((g) => g.found && !economy.edges.some((e) => e.good === g.good && e.toId === s.id)))!;
    const good = shop.goods.find((g) => g.found && !economy.edges.some((e) => e.good === g.good && e.toId === shop.id))!;
    expect(whyShort(economy, shop, good)).toContain('Only salvage');
  });

  it('lists empty goods before short ones', () => {
    const shop = read(world).shops[0];
    const [first, second] = shop.goods;
    const drained = emptied(world, shop.id, first.good);
    drained.shops[shop.id].goods[second.good] = Math.max(1, second.shortBelow);
    const economy = read(drained);
    const history = new MarketHistory();
    history.reset([sampleOf(drained, drained.turn)]);
    const needs = needsOf(economy, history);
    const empties = needs.filter((n) => n.empty);
    expect(empties.map((n) => n.good.good)).toContain(first.good);
    expect(needs.slice(0, empties.length).every((n) => n.empty)).toBe(true);
    expect(needs.some((n) => !n.empty && n.good.good === second.good)).toBe(second.shortBelow >= 1);
  });

  it('ranks an empty good first, then stopped lines, then short goods by how far below', () => {
    const forge = emptied(world, 'nose', 'scrap');
    const other = forge.shops['bowl'] ? 'bowl' : Object.keys(forge.shops).find((id) => id !== 'nose')!;
    const goods = Object.keys(forge.shops[other].goods);
    forge.shops[other].goods[goods[0]] = 0;
    const economy = read(forge);
    const history = new MarketHistory();
    history.reset([sampleOf(forge, forge.turn)]);
    const ranked = rankedAlerts(needsOf(economy, history), lineAlertsOf(economy));
    const kinds = ranked.map((a) => (a.kind === 'line' ? 'line' : a.need.empty ? 'empty' : 'short'));
    expect(kinds[0]).toBe('empty');
    expect(kinds).toContain('line');
    const order = ['empty', 'line', 'short'];
    expect(kinds.map((k) => order.indexOf(k))).toEqual([...kinds.map((k) => order.indexOf(k))].sort((a, b) => a - b));
    const shorts = ranked.flatMap((a) => (a.kind === 'need' && !a.need.empty ? [a.need.good.pressure] : []));
    expect(shorts).toEqual([...shorts].sort((a, b) => b - a));
  });

  it('counts the hours a stock has held, and none when it has recovered', () => {
    const series = { turns: [0, 19, 38, 57], stock: [5, 0, 0, 0], buy: [1, 1, 1, 1], events: [] };
    expect(hoursSince(series, (s) => s <= 0)).toBe(Math.round(38 / (450 / 24)));
    expect(hoursSince({ ...series, stock: [0, 0, 0, 4] }, (s) => s <= 0)).toBe(0);
  });

  it('keeps the history of a resumed run and appends the current point', () => {
    const economy = read(world);
    const shop = economy.shops[0];
    const good = shop.goods[0];
    const history = new MarketHistory();
    history.reset([sampleOf(world, world.turn)]);
    const series = history.series(shop.id, good, { ...economy, turn: world.turn + 19 });
    expect(series.turns).toEqual([world.turn, world.turn + 19]);
    expect(series.stock).toEqual([good.stock, good.stock]);
    expect(series.buy).toEqual([good.buy, good.buy]);
  });
});
