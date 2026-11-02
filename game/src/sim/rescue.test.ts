import { describe, expect, it } from 'vitest';
import { CONTRACTS } from '../data/market';
import { NPCS } from '../data/npcs';
import { CONDITION } from '../data/wear';
import { agreeAid, readyAid, startAid } from './aid';
import { playerVehicle } from './damage';
import { mountedParts } from './grid';
import { acceptContract, advanceShops, deliverContract, rollContract, siteOf, type Contract } from './market';
import { agreePatch, patchPlan } from './patch';
import { addGoods } from './inventory';
import { isRescueCandidate, namedClients, rescueClients, rescueNeed, rollRescue, type Rescue } from './rescue';
import { defaultSetup } from './settings';
import { addState, declareFeud, towData } from './states';
import { fuelCap } from './stats';
import { addVehicle, emptyWorld, npcBrain, practiceOf } from './testkit';
import { hitchNpc, playerTowing, releaseNpc } from './tow';
import type { GameEvent, Vehicle, World } from './types';
import { sitePads } from './sites';
import { endTurn, update } from './world';

function hold(w: World): void {
  for (const v of w.vehicles) {
    if (v.trail.length === 0) v.trail = [{ ...v.pos, heading: v.heading }, { ...v.pos, heading: v.heading }];
    if (v.brain) v.order = null;
  }
}
const bowl = siteOf('bowl');
const SHOP = { id: 'bowl', pos: bowl.pos };

type Breakdown = 'fuel' | 'repair' | 'tow';

function scene(breakdown: Breakdown, offset = 30): { w: World; npc: Vehicle } {
  const w = emptyWorld(sitePads(bowl)[0]);
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  for (const shop of Object.values(w.shops)) shop.contracts = [];
  const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: bowl.pos.x + offset, y: bowl.pos.y }, Math.PI);
  npc.brain = npcBrain('trader', npc.pos, ['trader']);
  npc.resources!.fuel = breakdown === 'fuel' ? 0 : fuelCap(npc);
  npc.resources!.money = 5000;
  const engine = mountedParts(npc, 'engine')[0];
  if (breakdown !== 'fuel') engine.hp = 0;
  if (breakdown === 'tow') engine.wear = CONDITION.maxWear + 1;
  return { w, npc };
}

const find = (w: World, id: string) => w.vehicles.find((v) => v.id === id)!;
const none: ReadonlySet<string> = new Set();

function posted(w: World): Rescue {
  const clients = rescueClients(w, SHOP);
  const c = rollContract(w, SHOP, { clients });
  if (c?.kind !== 'rescue') throw new Error('No rescue was posted');
  w.shops.bowl.contracts = [c];
  return c;
}

function held(breakdown: Breakdown): { w: World; npc: Vehicle; c: Rescue } {
  const { w, npc } = scene(breakdown);
  const c = posted(w);
  return { w: acceptContract(w, c.id), npc, c };
}

function alongside(w: World, npc: Vehicle): void {
  const me = playerVehicle(w);
  me.pos = { x: find(w, npc.id).pos.x - 4, y: npc.pos.y };
  me.speed = 0;
  me.order = null;
}

function toShop(w: World): void {
  const me = playerVehicle(w);
  me.pos = { ...sitePads(bowl)[0] };
  me.speed = 0;
  me.order = null;
}

function run(w: World, turns: number, done: (w: World) => boolean = () => false): { w: World; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (let i = 0; i < turns && !done(w); i++) {
    if (w.player.call) w = update(w, (d) => { d.player.call = null; });
    const ready = readyAid(w);
    if (ready) w = startAid(w, ready.holder);
    events.push(...w.events);
    w = endTurn(w, hold);
    events.push(...w.events);
  }
  return { w, events };
}

const heldRescue = (w: World): Rescue => w.player.contracts.find((c): c is Rescue => c.kind === 'rescue')!;
const outcomes = (events: GameEvent[]) => events.flatMap((e) => (e.t === 'contract' ? [e.outcome] : []));
const fuelGift = (fuel: number, supplies = 0) => ({ giver: 'player' as const, fuel, supplies, price: 0, free: true });

describe('posting a rescue', () => {
  it('names a stranded trader near the shop with the need its breakdown calls for', () => {
    for (const breakdown of ['fuel', 'repair', 'tow'] as const) {
      const { w, npc } = scene(breakdown);
      const c = posted(w);
      expect(c).toMatchObject({ kind: 'rescue', client: npc.id, driver: 'Jed Cobb', need: breakdown, fulfilled: false, tier: 1 });
      expect(Math.hypot(c.area.x - npc.pos.x, c.area.y - npc.pos.y)).toBeLessThanOrEqual(CONTRACTS.rescue.areaOffset);
      expect(c.reward).toBeGreaterThan(0);
      expect(c.deadline).toBe(w.turn + c.window);
    }
  });

  it('never names a raider, a knocked-out truck, a truck on a rope, a far truck or an already named one', () => {
    const { w, npc } = scene('fuel');
    expect(isRescueCandidate(w, npc, none)).toBe(true);
    expect(isRescueCandidate(w, npc, new Set([npc.id]))).toBe(false);
    const raider = scene('fuel').npc;
    raider.faction = 'scrapjaw';
    raider.brain!.traits = ['raider'];
    expect(isRescueCandidate(w, raider, none)).toBe(false);
    npc.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: true };
    expect(isRescueCandidate(w, npc, none)).toBe(false);
    npc.defeat = undefined;
    const tower = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: npc.pos.x + 5, y: npc.pos.y });
    addState(w, 'tow', tower.id, npc.id, { kind: 'tow', site: 'bowl', fee: 0, waived: 0, hitched: true });
    expect(isRescueCandidate(w, npc, none)).toBe(false);
    const far = scene('fuel', CONTRACTS.rescue.range + 40);
    expect(rescueClients(far.w, SHOP)).toEqual([]);
  });

  it('lets a driver with a fine truck stay unnamed', () => {
    const { w, npc } = scene('fuel');
    npc.resources!.fuel = fuelCap(npc);
    expect(rescueClients(w, SHOP)).toEqual([]);
    expect(() => rescueNeed(w, npc)).toThrow(/not stranded/);
  });

  it('refuses to roll a rescue for a driver that needs none', () => {
    const { w, npc } = scene('fuel');
    npc.resources!.fuel = fuelCap(npc);
    expect(() => rollRescue(w, SHOP, [npc], 'ct-x')).toThrow(/not a stranded driver/);
  });

  it('names a driver on one board only', () => {
    const { w } = scene('fuel');
    const c = posted(w);
    expect(namedClients(w)).toEqual(new Set([c.client]));
    expect(rescueClients(w, SHOP)).toEqual([]);
  });

  it('is posted by a restock when a stranded driver is near', () => {
    let rescues = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { w, npc } = scene('fuel');
      w.marketRng.rngState = seed;
      w.shops.bowl.restockAt = w.turn;
      advanceShops(w);
      for (const c of w.shops.bowl.contracts) if (c.kind === 'rescue') {
        rescues++;
        expect(c.client).toBe(npc.id);
      }
    }
    expect(rescues).toBeGreaterThan(0);
  });

  it('posts none in a mode without rescue', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { w } = scene('fuel');
      w.setup = defaultSetup('chaosHighway');
      w.marketRng.rngState = seed;
      w.shops.bowl.restockAt = w.turn;
      advanceShops(w);
      expect(w.shops.bowl.contracts.some((c: Contract) => c.kind === 'rescue')).toBe(false);
    }
  });
});

describe('holding a rescue', () => {
  it('pays nothing for accepting or for driving beside the client', () => {
    const { w, npc } = held('fuel');
    const money = w.player.money;
    alongside(w, npc);
    const r = run(w, 5);
    expect(r.w.player.money).toBe(money);
    expect(heldRescue(r.w).fulfilled).toBe(false);
  });

  it('keeps the posted driver from jumping away while the offer stands, and not afterwards', () => {
    const named = scene('fuel', 60);
    const c = posted(named.w);
    const stalls = (w: World) => run(w, 140).events.filter((e) => e.t === 'stall');
    expect(stalls(named.w)).toEqual([]);
    const unnamed = scene('fuel', 60);
    expect(c.window).toBeGreaterThan(140);
    unnamed.w.player.state = 'active';
    expect(stalls(unnamed.w).length).toBeGreaterThan(0);
  });

  it('takes an offer off the board the turn its client recovers', () => {
    const { w, npc } = scene('fuel');
    posted(w);
    expect(w.shops.bowl.contracts).toHaveLength(1);
    find(w, npc.id).resources!.fuel = fuelCap(npc);
    const next = endTurn(w, hold);
    expect(next.shops.bowl.contracts).toHaveLength(0);
  });
});

describe('a fuel rescue', () => {
  it('is met when fuel gets the driver moving, and pays once at the shop', () => {
    let { w, npc, c } = held('fuel');
    alongside(w, npc);
    w = update(w, (d) => { agreeAid(d, find(d, npc.id), fuelGift(5)); });
    const r = run(w, 12, (x) => heldRescue(x).fulfilled);
    expect(outcomes(r.events)).toContain('fulfilled');
    w = r.w;
    expect(heldRescue(w).fulfilled).toBe(true);
    const money = w.player.money;
    expect(find(w, npc.id).resources!.fuel).toBeGreaterThan(0);
    toShop(w);
    w = deliverContract(w, c.id);
    expect(w.player.money).toBe(money + c.reward);
    expect(practiceOf(w, 'contract')).toHaveLength(1);
    expect(w.player.contracts).toHaveLength(0);
    expect(() => deliverContract(w, c.id)).toThrow(/No active contract/);
  });

  it('is not met by supplies alone', () => {
    let { w, npc } = held('fuel');
    alongside(w, npc);
    w = update(w, (d) => { agreeAid(d, find(d, npc.id), fuelGift(0, 3)); });
    const r = run(w, 12);
    expect(heldRescue(r.w).fulfilled).toBe(false);
    expect(outcomes(r.events)).not.toContain('fulfilled');
  });

  it('is not met by fuel for a driver whose engine is dead', () => {
    let { w, npc } = held('repair');
    alongside(w, npc);
    find(w, npc.id).resources!.fuel = 0;
    w = update(w, (d) => { agreeAid(d, find(d, npc.id), fuelGift(5)); });
    const r = run(w, 12);
    expect(heldRescue(r.w).fulfilled).toBe(false);
  });

  it('refuses a claim while unmet', () => {
    const { w, c } = held('fuel');
    toShop(w);
    expect(() => deliverContract(w, c.id)).toThrow(/not met yet/);
  });
});

describe('a tow rescue', () => {
  for (const free of [true, false]) {
    it(`is met when the ${free ? 'free' : 'paid'} tow reaches the site, and pays once`, () => {
      let { w, npc, c } = held('tow');
      alongside(w, npc);
      w = update(w, (d) => { hitchNpc(d, find(d, npc.id), free); });
      const site = siteOf(towData(playerTowing(w)!).site);
      expect(heldRescue(w).fulfilled).toBe(false);
      playerVehicle(w).pos = { ...sitePads(site)[0] };
      const r = run(w, 4, (x) => heldRescue(x).fulfilled);
      expect(outcomes(r.events)).toContain('fulfilled');
      w = r.w;
      const money = w.player.money;
      toShop(w);
      w = deliverContract(w, c.id);
      expect(w.player.money).toBe(money + c.reward);
      expect(w.player.contracts).toHaveLength(0);
    });
  }

  it('is still waiting when the player drops the tow halfway', () => {
    let { w, npc } = held('tow');
    alongside(w, npc);
    w = update(w, (d) => { hitchNpc(d, find(d, npc.id), true); });
    w = update(w, (d) => { releaseNpc(d, find(d, npc.id)); });
    const r = run(w, 3);
    expect(heldRescue(r.w).fulfilled).toBe(false);
    expect(outcomes(r.events)).toEqual([]);
  });
});

describe('a repair rescue', () => {
  it('is met when a patch gets the engine going', () => {
    let { w, npc } = held('repair');
    alongside(w, npc);
    addGoods(w, playerVehicle(w), 'parts', 5);
    w = update(w, (d) => {
      const plan = patchPlan(d, { patcher: playerVehicle(d), client: find(d, npc.id) });
      agreePatch(d, find(d, npc.id), { kind: 'deal', deal: 'free', patcher: 'player', price: 0, parts: plan.parts, turns: plan.turns });
    });
    const r = run(w, 30, (x) => heldRescue(x).fulfilled);
    expect(outcomes(r.events)).toContain('fulfilled');
  });
});

describe('endings that pay nothing', () => {
  function endsWith(mutate: (w: World, npc: Vehicle) => void, outcome: string): void {
    const { w, npc } = held('fuel');
    const money = w.player.money;
    mutate(w, npc);
    const next = endTurn(w, hold);
    expect(outcomes(next.events)).toEqual([outcome]);
    expect(next.player.contracts).toHaveLength(0);
    expect(next.player.money).toBe(money);
    expect(practiceOf(next, 'contract')).toEqual([]);
  }

  it('lapses when another truck takes the client on its rope', () => {
    endsWith((w, npc) => {
      const tower = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: npc.pos.x + 5, y: npc.pos.y });
      addState(w, 'tow', tower.id, npc.id, { kind: 'tow', site: 'bowl', fee: 0, waived: 0, hitched: true });
    }, 'lapsed');
  });

  it('lapses when the driver gets going by itself', () => {
    endsWith((w, npc) => { find(w, npc.id).resources!.fuel = fuelCap(npc); }, 'lapsed');
  });

  it('lapses when the driver is knocked out', () => {
    endsWith((w, npc) => { find(w, npc.id).defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: true }; }, 'lapsed');
  });

  it('lapses when the driver is gone', () => {
    endsWith((w, npc) => { w.vehicles = w.vehicles.filter((v) => v.id !== npc.id); }, 'lapsed');
  });

  it('fails when the player turns on the driver', () => {
    endsWith((w, npc) => { declareFeud(w, playerVehicle(w), npc.id); }, 'failed');
  });

  it('fails when the window runs out', () => {
    endsWith((w) => { heldRescue(w).deadline = w.turn; }, 'failed');
  });
});
