import { describe, expect, it } from 'vitest';
import { ECONOMY, GOODS } from '../data/goods';
import { CHAOS_HIGHWAY, HIGHWAY } from '../data/modes';
import { REPAIR } from '../data/wear';
import { playerVehicle } from './damage';
import { driveOn } from './chaos-highway';
import { yardSpots } from './outpost-gates';
import { milestoneAt, roadPoint } from './highway';
import { chaosHighwayWorld, parkInYard } from './testkit';
import { corePart, goodsCount, mountedParts } from './grid';
import { startRepair } from './jobs';
import { repairPlan } from './repair';
import { skillEffect } from './progress';
import { partDef } from '../data/parts';
import { outpostBuyGood, outpostBuyPart, outpostBuySupply, outpostGoodPrice, outpostPartPrice, outpostRepairAll, outpostRepairBasics, outpostRepairPart, outpostRepaint, outpostSellGood, outpostSellPart, outpostGoodSellPrice, haulerTakes } from './outposts';
import { partRepairCost, paintPrice } from './economy';
import { PALETTE_IDS } from '../data/chassis';
import { canStowPart, stowPart } from './inventory';
import { haulerOf } from './damage';
import { addGoods } from './inventory';
import type { PartInstance, World } from './types';
import { maxHp } from './wear';
import { endTurn } from './world';

const still = () => {};

function atOutpost(): World {
  const w = chaosHighwayWorld();
  parkInYard(w, 1);
  return endTurn(w, still);
}

function fittingStock(w: World): PartInstance {
  const part = w.chaosHighway!.outposts[1].stock.find((p) => canStowPart(playerVehicle(w), p));
  if (!part) throw new Error('Nothing in stock fits the truck');
  return part;
}

function batter(w: World): void {
  for (const part of mountedParts(playerVehicle(w))) part.hp = Math.floor(maxHp(part) / 2);
}

describe('outpost services', () => {
  it('repairs every part for the garage price', () => {
    const w = atOutpost();
    batter(w);
    w.player.money = 10_000_000;
    const money = w.player.money;

    const after = outpostRepairAll(w);

    expect(mountedParts(playerVehicle(after)).every((p) => p.hp === maxHp(p))).toBe(true);
    expect(after.player.money).toBeLessThan(money);
  });

  it('repairs only the core parts for the basics price', () => {
    const w = atOutpost();
    batter(w);

    const after = outpostRepairBasics(w);
    const me = playerVehicle(after);

    expect(corePart(me, 'cab').hp).toBe(maxHp(corePart(me, 'cab')));
    expect(mountedParts(me, 'weapon').some((p) => p.hp < maxHp(p))).toBe(true);
  });

  it('repairs one part for the part price and leaves the rest', () => {
    const w = atOutpost();
    batter(w);
    w.player.money = 10_000_000;
    const [target, other] = mountedParts(playerVehicle(w));
    const price = partRepairCost(w, target);
    const otherHp = other.hp;

    const after = outpostRepairPart(w, target.id);
    const me = playerVehicle(after);

    expect(mountedParts(me).find((p) => p.id === target.id)!.hp).toBe(maxHp(target));
    expect(mountedParts(me).find((p) => p.id === other.id)!.hp).toBe(otherHp);
    expect(after.player.money).toBe(w.player.money - price);
  });

  it('refuses a missing part, a junk part and a poor player', () => {
    const w = atOutpost();
    batter(w);
    const part = mountedParts(playerVehicle(w), 'weapon')[0];
    expect(() => outpostRepairPart(w, 'nope')).toThrow(/No truck part/);
    w.player.money = 0;
    expect(() => outpostRepairPart(w, part.id)).toThrow();
    part.hp = 0;
    part.wear = 100;
    w.player.money = 10_000_000;
    expect(() => outpostRepairPart(w, part.id)).toThrow(/junk|No truck part/);
  });

  it('repairs a broken engine with the basics for the shown price', () => {
    const w = atOutpost();
    const engine = mountedParts(playerVehicle(w)).find((p) => partDef(p.defId).kind === 'engine')!;
    engine.hp = 1;
    const money = w.player.money;

    const after = outpostRepairBasics(w);

    const fixed = mountedParts(playerVehicle(after)).find((p) => p.id === engine.id)!;
    expect(fixed.hp).toBe(maxHp(fixed));
    expect(after.player.money).toBeLessThan(money);
  });

  it('sells fuel at the town price', () => {
    const w = atOutpost();
    w.player.fuel -= 10;
    const money = w.player.money;

    const after = outpostBuySupply(w, 'fuel', 10);

    expect(after.player.fuel).toBe(w.player.fuel + 10);
    expect(after.player.money).toBe(money - ECONOMY.supplyPrice.fuel * 10);
  });

  it('sells a stock part into storage and off the shelf', () => {
    const w = atOutpost();
    w.player.money = 10_000_000;
    const part = fittingStock(w);
    const price = outpostPartPrice(w, part);

    const after = outpostBuyPart(w, part.id);

    expect(after.chaosHighway!.outposts[1].stock.map((p) => p.id)).not.toContain(part.id);
    expect(after.player.storage.map((p) => p.id)).toEqual([part.id]);
    expect(after.player.money).toBe(w.player.money - price);
  });

  it('sells parts for field patching at a markup', () => {
    const w = atOutpost();
    const held = goodsCount(playerVehicle(w)).parts ?? 0;

    const after = outpostBuyGood(w, 2);

    expect(goodsCount(playerVehicle(after)).parts).toBe(held + 2);
    expect(after.player.money).toBe(w.player.money - outpostGoodPrice() * 2);
    expect(outpostGoodPrice()).toBe(Math.ceil(GOODS.parts.value * CHAOS_HIGHWAY.goodsMarkup));
  });

  it('carries a bought part in storage into the next stretch', () => {
    let w = atOutpost();
    w.player.money = 10_000_000;
    const part = fittingStock(w);
    w = driveOn(outpostBuyPart(w, part.id));
    const me = playerVehicle(w);
    me.pos = roadPoint(w.seed, w.chaosHighway!.window, milestoneAt(w.seed, 1) + 30, HIGHWAY.road.lanes[1]);

    w = endTurn(w, still);

    expect(w.chaosHighway!.window).toBe(1);
    expect(w.player.storage.map((p) => p.id)).toEqual([part.id]);
  });

  it('patches a broken engine in the field with bought parts, up to the field cap', () => {
    let w = atOutpost();
    w.player.money = 10_000_000;
    const engine = mountedParts(playerVehicle(w), 'engine')[0];
    engine.hp = 0;
    const plan = repairPlan(w, playerVehicle(w), engine.id);
    w = outpostBuyGood(w, plan.needed - plan.parts);
    w.player.autoRepair = false;
    w = startRepair(w, engine.id);
    for (let i = 0; i < 30 && playerVehicle(w).job; i++) w = endTurn(w, still);

    const patched = mountedParts(playerVehicle(w), 'engine')[0];
    const cap = Math.min(1, REPAIR.fieldCapShare + skillEffect(w, playerVehicle(w), 'machining', 'fieldCap'));
    expect(patched.hp).toBeCloseTo(maxHp(patched) * cap, 0);
  });
});

describe('outpost commands off the pad', () => {
  const commands: [string, (w: World) => World][] = [
    ['repair all', outpostRepairAll],
    ['repair basics', outpostRepairBasics],
    ['repair a part', (w) => outpostRepairPart(w, mountedParts(playerVehicle(w))[0].id)],
    ['buy fuel', (w) => outpostBuySupply(w, 'fuel', 1)],
    ['buy a part', (w) => outpostBuyPart(w, w.chaosHighway!.outposts[1].stock[0].id)],
    ['buy parts', (w) => outpostBuyGood(w, 1)],
    ['sell a part', (w) => outpostSellPart(w, mountedParts(playerVehicle(w))[0].id)],
    ['sell parts', (w) => outpostSellGood(w, 1)],
    ['repaint', (w) => outpostRepaint(w, { body: 'chalk', cab: 'chalk', gear: 'chalk' })],
  ];

  it.each(commands)('refuse to %s away from the pad', (_name, command) => {
    const w = atOutpost();
    playerVehicle(w).pos = { x: 20, y: 20 };

    expect(() => command(w)).toThrow(/outpost/);
  });

  it.each(commands)('refuse to %s at an outpost not reached yet', (_name, command) => {
    const w = chaosHighwayWorld();
    const me = playerVehicle(w);
    me.pos = yardSpots(w, 1).truck;
    me.speed = 0;
    w.player.fuel -= 5;

    expect(() => command(w)).toThrow(/outpost/);
  });

  it.each(commands)('refuse to %s on the move', (_name, command) => {
    const w = atOutpost();
    playerVehicle(w).speed = 3;
    w.player.fuel -= 5;

    expect(() => command(w)).toThrow(/outpost/);
  });
});

describe('outpost selling, paint and rebuild', () => {
  function withBoughtPart(): { w: World; part: PartInstance } {
    const w = atOutpost();
    w.player.money = 10_000_000;
    const part = fittingStock(w);
    return { w: outpostBuyPart(w, part.id), part };
  }

  it('buys a stored part back below the price it was bought at and restocks the outpost', () => {
    const { w, part } = withBoughtPart();
    const money = w.player.money;

    const after = outpostSellPart(w, part.id);

    expect(after.player.storage).toEqual([]);
    expect(after.chaosHighway!.outposts[1].stock.map((p) => p.id)).toContain(part.id);
    expect(after.player.money).toBeGreaterThan(money);
    expect(after.player.money - money).toBeLessThan(outpostPartPrice(after, part));
  });

  it('loses money on buying then selling every part in stock', () => {
    const w = atOutpost();
    w.player.money = 10_000_000;
    for (const part of w.chaosHighway!.outposts[1].stock) {
      const sold = outpostSellPart(outpostBuyPart(w, part.id), part.id);
      expect(sold.player.money).toBeLessThan(w.player.money);
    }
  });

  it('sells a spare from the hauler when the hauler is named, and never a mounted part', () => {
    const w = atOutpost();
    const hauler = haulerOf(w);
    const spare = w.chaosHighway!.outposts[1].stock.find((p) => haulerTakes(p) && canStowPart(hauler, p))!;
    expect(stowPart(w, hauler, spare)).toBe(true);
    const mounted = mountedParts(playerVehicle(w))[0];

    const after = outpostSellPart(w, spare.id, hauler.id);

    expect(haulerOf(after).items.some((it) => it.kind === 'part' && it.part.id === spare.id)).toBe(false);
    expect(after.chaosHighway!.outposts[1].stock.map((p) => p.id)).toContain(spare.id);
    expect(() => outpostSellPart(w, mounted.id)).toThrow(/No sellable part/);
    expect(() => outpostSellPart(w, spare.id)).toThrow(/No sellable part/);
  });

  it('sells the parts good below the buy price and refuses more than held', () => {
    const w = atOutpost();
    addGoods(w, playerVehicle(w), 'parts', 3);
    const held = goodsCount(playerVehicle(w)).parts;
    const money = w.player.money;

    const after = outpostSellGood(w, 2);

    expect(goodsCount(playerVehicle(after)).parts).toBe(held - 2);
    expect(after.player.money).toBe(money + outpostGoodSellPrice(w) * 2);
    expect(outpostGoodSellPrice(w)).toBeLessThan(outpostGoodPrice());
    expect(() => outpostSellGood(w, held + 1)).toThrow();
    expect(() => outpostSellGood(w, 0)).toThrow();
  });

  it('repaints both trucks at the paint price', () => {
    const w = atOutpost();
    const paint = { ...w.player.paint, body: PALETTE_IDS.find((id) => id !== w.player.paint.body)! };
    const price = paintPrice(w);
    const money = w.player.money;

    const after = outpostRepaint(w, paint);

    expect(after.player.paint).toEqual(paint);
    expect(after.player.money).toBe(money - price);
    expect(() => outpostRepaint(after, paint)).toThrow(/already/);
  });

  it('rebuilds a junk part only with the rebuild perk', () => {
    const w = atOutpost();
    w.player.money = 10_000_000;
    const part = mountedParts(playerVehicle(w), 'weapon')[0];
    part.hp = 0;
    part.wear = 100;
    expect(() => outpostRepairPart(w, part.id)).toThrow();

    w.player.perks = ['rebuild'];
    const after = outpostRepairPart(w, part.id);

    expect(mountedParts(playerVehicle(after)).find((p) => p.id === part.id)!.hp).toBeGreaterThan(0);
  });
});
