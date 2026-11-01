import { describe, expect, it } from 'vitest';
import { ESCORT_JOB, SHOPS } from '../data/market';
import { NPC_BEHAVIOR, NPCS } from '../data/npcs';
import { PARTS } from '../data/parts';
import { playerVehicle } from './damage';
import { awaitsEscort, escortBlocked, escortFit, escortReward, escortShare, escortStatus, heldEscort, holdEscort, postEscortOffer, routeThreat, traderWaits, type EscortContract } from './escort-job';
import { acceptContract, advanceContracts, advanceShops, siteOf } from './market';
import { addGoods } from './inventory';
import { settleCashThreat, settleThreat } from './parley';
import { sitePads } from './sites';
import { getResources } from './resources';
import { addState, stateOf } from './states';
import { addVehicle, emptyWorld, npcBrain, startCombat, testDrive } from './testkit';
import type { GameEvent, NpcActivity, Vehicle, World } from './types';
import { dist } from './vec';
import { endTurn } from './world';
import { callVehicle, chooseOption, currentOptions, hangUp } from './dialogue';
import { asksOf, chooseText } from './dialogue-testkit';
import { entryText } from '../text/resolve';
import { lineKey } from '../text/names';
import { refreshVision } from './vision';
import type { LineId } from '../data/dialogue';

const RECORDED_THREATS =
  'bowl>nose=2 bowl>salvage-yard=2 bowl>granary=3 bowl>pump-station=3 bowl>dustwell=3 bowl>green-pit=2 nose>bowl=2 nose>salvage-yard=1 nose>granary=3 nose>pump-station=2 nose>dustwell=3 nose>green-pit=2 salvage-yard>bowl=2 salvage-yard>nose=1 salvage-yard>granary=1 salvage-yard>pump-station=3 salvage-yard>dustwell=3 salvage-yard>green-pit=2 granary>bowl=3 granary>nose=3 granary>salvage-yard=1 granary>pump-station=2 granary>dustwell=2 granary>green-pit=3 pump-station>bowl=3 pump-station>nose=2 pump-station>salvage-yard=3 pump-station>granary=2 pump-station>dustwell=2 pump-station>green-pit=3 dustwell>bowl=3 dustwell>nose=3 dustwell>salvage-yard=3 dustwell>granary=2 dustwell>pump-station=2 dustwell>green-pit=3 green-pit>bowl=2 green-pit>nose=2 green-pit>salvage-yard=2 green-pit>granary=3 green-pit>pump-station=3 green-pit>dustwell=3';
const BOWL = siteOf('bowl');
const NOSE = siteOf('nose');

function waitGoal(): NpcActivity {
  return { kind: 'wait', targetId: null, destination: null, phase: 'act', reason: 'awaitEscort', until: ESCORT_JOB.postTurns };
}

function sellGoal(): NpcActivity {
  return { kind: 'sell', targetId: 'nose', destination: { ...NOSE.pos }, phase: 'travel', reason: 'deliverCargo', shipment: { good: 'fuelDrums', from: 'bowl', to: 'nose' } };
}

function setup(): { w: World; trader: Vehicle; offer: EscortContract } {
  const w = emptyWorld(sitePads(BOWL)[0]);
  const pad = sitePads(BOWL)[0];
  const pos = { x: pad.x + 20, y: pad.y };
  const trader = addVehicle(w, 'independent', 'hauler', ['stockEngine'], pos);
  trader.brain = npcBrain('trader', pos, ['trader']);
  trader.brain.goals = [sellGoal(), waitGoal()];
  addGoods(w, trader, 'fuelDrums', 3);
  postEscortOffer(w, trader, 'bowl', 'nose');
  const offer = w.shops.bowl.contracts.find((c): c is EscortContract => c.kind === 'escort')!;
  return { w, trader, offer };
}

function traderIn(w: World, trader: Vehicle): Vehicle {
  return w.vehicles.find((v) => v.id === trader.id)!;
}

function take(w: World, offer: EscortContract): World {
  return acceptContract(w, offer.id);
}

function knockOut(v: Vehicle): void {
  v.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };
}

function tick(w: World, turns = 1): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < turns; i++) {
    w.turn++;
    w.events = [];
    advanceContracts(w);
    events.push(...w.events);
  }
  return events;
}

function leave(w: World, trader: Vehicle, gap: number): void {
  trader.pos = { x: playerVehicle(w).pos.x + gap, y: playerVehicle(w).pos.y };
}

describe('route threat', () => {
  it('is 1 to 3 for every pair of shops and is cached', () => {
    const w = emptyWorld();
    const ids = Object.keys(SHOPS);
    const table: string[] = [];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        const threat = routeThreat(w, a, b);
        expect([1, 2, 3]).toContain(threat);
        expect(routeThreat(w, a, b)).toBe(threat);
        table.push(`${a}>${b}=${threat}`);
      }
    }
    expect(table.length).toBe(ids.length * (ids.length - 1));
  });

  it('keeps every shop pair\'s value', () => {
    const w = emptyWorld();
    const ids = Object.keys(SHOPS);
    const table = ids.flatMap((a) => ids.filter((b) => b !== a).map((b) => `${a}>${b}=${routeThreat(w, a, b)}`));
    expect(table.join(' ')).toBe(RECORDED_THREATS);
  });
});

describe('escort reward', () => {
  it('grows with the threat of the road', () => {
    expect(escortReward('bowl', 'nose', 1)).toBeLessThan(escortReward('bowl', 'nose', 2));
    expect(escortReward('bowl', 'nose', 2)).toBeLessThan(escortReward('bowl', 'nose', 3));
  });
});

describe('the board offer', () => {
  it('names the trader, the road, the reward and a departure time', () => {
    const { w, trader, offer } = setup();
    expect(offer).toMatchObject({ kind: 'escort', client: trader.id, to: 'nose', shop: 'bowl' });
    expect(offer.deadline).toBe(w.turn + ESCORT_JOB.postTurns);
    expect(offer.reward).toBe(escortReward('bowl', 'nose', offer.threat));
  });

  it('closes when the trader stops waiting', () => {
    const { w, trader, offer } = setup();
    expect(awaitsEscort(trader)).toBe(true);
    trader.brain!.goals.pop();
    w.turn++;
    advanceShops(w);
    expect(w.shops.bowl.contracts.some((c) => c.id === offer.id)).toBe(false);
  });
});

describe('the danger gate', () => {
  it('lets an armed truck take the job', () => {
    const { w, offer } = setup();
    expect(escortFit(w, offer).fit).toBe(true);
    expect(escortBlocked(w, offer)).toBeNull();
  });

  it('refuses a truck that could not beat the client', () => {
    const { w, offer } = setup();
    const me = playerVehicle(w);
    me.items = me.items.filter((it) => it.kind !== 'part' || PARTS[it.part.defId].kind !== 'weapon');
    expect(escortFit(w, offer).fit).toBe(false);
    expect(escortBlocked(w, offer)).toBe('weak');
    expect(() => acceptContract(w, offer.id)).toThrow(/weak/);
  });
});

describe('taking the job', () => {
  it('moves the offer to the player and binds an escort state with no fee', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    const held = heldEscort(next)!;
    expect(held.id).toBe(offer.id);
    expect(next.shops.bowl.contracts.some((c) => c.id === offer.id)).toBe(false);
    const state = stateOf(next, 'escort', playerVehicle(next).id, trader.id)!;
    expect(state.data).toMatchObject({ kind: 'escort', site: 'nose', fee: 0 });
    expect(held.span).toBeCloseTo(dist(trader.pos, NOSE.pos));
  });

  it('holds one escort at a time', () => {
    const { w, offer } = setup();
    const next = take(w, offer);
    const second = setupSecond(next);
    expect(escortBlocked(next, second)).toBe('escorting');
  });

  it('throws when the trader no longer waits', () => {
    const { w, trader, offer } = setup();
    trader.brain!.goals.pop();
    expect(() => take(w, offer)).toThrow(/no longer waiting/);
  });
});

function setupSecond(w: World): EscortContract {
  const pad = playerVehicle(w).pos;
  const pos = { x: pad.x + 25, y: pad.y + 5 };
  const other = addVehicle(w, 'independent', 'hauler', ['stockEngine'], pos);
  other.brain = npcBrain('trader', pos, ['trader']);
  other.brain.goals = [sellGoal(), waitGoal()];
  postEscortOffer(w, other, 'bowl', 'nose');
  return w.shops.bowl.contracts.find((c): c is EscortContract => c.kind === 'escort' && c.client === other.id)!;
}

describe('the abandonment clock', () => {
  it('fails the job after graceTurns apart and pays nothing', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    leave(next, traderIn(next, trader), ESCORT_JOB.apartGap + 10);
    const money = next.player.money;
    const events = tick(next, ESCORT_JOB.graceTurns - 1);
    expect(heldEscort(next)).not.toBeNull();
    expect(events.some((e) => e.t === 'contract' && e.outcome === 'apart')).toBe(true);
    const last = tick(next, 1);
    expect(heldEscort(next)).toBeNull();
    expect(last.some((e) => e.t === 'escortEnded' && e.end === 'strayed')).toBe(true);
    expect(last.some((e) => e.t === 'contract' && e.outcome === 'failed')).toBe(true);
    expect(next.player.money).toBe(money);
  });

  it('resets when the trucks are together again', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    leave(next, traderIn(next, trader), ESCORT_JOB.apartGap + 10);
    tick(next, 20);
    expect(heldEscort(next)!.apart).toBe(20);
    leave(next, traderIn(next, trader), 10);
    tick(next, 1);
    expect(heldEscort(next)!.apart).toBe(0);
  });

  it('does not run while the trucks fight', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    leave(next, traderIn(next, trader), ESCORT_JOB.apartGap + 10);
    const foe = addVehicle(next, 'scrapjaw', 'buggy', [], { x: 200, y: 200 });
    startCombat(next, foe, traderIn(next, trader));
    tick(next, ESCORT_JOB.graceTurns + 5);
    expect(heldEscort(next)!.apart).toBe(0);
  });

  it('does not run while the player is stranded, and the stuck clock runs instead', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    getResources(next, playerVehicle(next)).fuel = 0;
    leave(next, traderIn(next, trader), ESCORT_JOB.apartGap + 10);
    tick(next, 30);
    const held = heldEscort(next)!;
    expect(held.apart).toBe(0);
    expect(held.stuck).toBe(30);
    expect(escortStatus(next, held)).toBe('stuck');
  });

  it('does not run under a hold order', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    leave(next, traderIn(next, trader), ESCORT_JOB.apartGap + 10);
    holdEscort(next, heldEscort(next)!);
    tick(next, ESCORT_JOB.graceTurns - 1);
    expect(heldEscort(next)!.apart).toBe(0);
    expect(escortStatus(next, heldEscort(next)!)).toBe('holding');
  });

  it('lapses a hold at holdTurns', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    holdEscort(next, heldEscort(next)!);
    tick(next, ESCORT_JOB.holdTurns + 1);
    expect(heldEscort(next)!.holdUntil).toBeNull();
    expect(trader.id).toBeTruthy();
  });
});

describe('a helpless player', () => {
  it('releases the job with a share once stuckTurns pass', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    const held = heldEscort(next)!;
    traderIn(next, trader).pos = { x: trader.pos.x + 100, y: trader.pos.y };
    tick(next, 1);
    const togetherAfter = held.together;
    getResources(next, playerVehicle(next)).fuel = 0;
    const money = next.player.money;
    const events = tick(next, ESCORT_JOB.stuckTurns);
    expect(heldEscort(next)).toBeNull();
    expect(events.some((e) => e.t === 'escortEnded' && e.end === 'stuck')).toBe(true);
    expect(events.some((e) => e.t === 'contract' && e.outcome === 'released')).toBe(true);
    expect(next.player.money).toBe(money + Math.round(offer.reward * clampShare(togetherAfter, held.span)));
  });

  it('releases at once when the player is knocked out', () => {
    const { w, offer } = setup();
    const next = take(w, offer);
    knockOut(playerVehicle(next));
    const events = tick(next, 1);
    expect(heldEscort(next)).toBeNull();
    expect(events.some((e) => e.t === 'escortEnded' && e.end === 'knockedOut')).toBe(true);
  });
});

function clampShare(together: number, span: number): number {
  return Math.min(1, Math.max(0, 1 - together / span));
}

describe('the share', () => {
  it('stays between nothing and the reward and uses the last together distance', () => {
    const { w, offer } = setup();
    const next = take(w, offer);
    const held = heldEscort(next)!;
    held.together = held.span;
    expect(escortShare(held)).toBe(0);
    held.together = held.span / 2;
    expect(escortShare(held)).toBeCloseTo(0.5);
    held.together = 0;
    expect(escortShare(held)).toBe(1);
    held.together = held.span * 3;
    expect(escortShare(held)).toBe(0);
  });
});

describe('the outcomes', () => {
  it('pays the full reward when the trader arrives while together', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    traderIn(next, trader).pos = { ...sitePads(NOSE)[0] };
    playerVehicle(next).pos = { x: sitePads(NOSE)[0].x - 5, y: sitePads(NOSE)[0].y };
    const money = next.player.money;
    const events = tick(next, 1);
    expect(heldEscort(next)).toBeNull();
    expect(next.player.money).toBe(money + offer.reward);
    expect(events.filter((e) => e.t === 'money')).toHaveLength(1);
    expect(events.some((e) => e.t === 'escortEnded' && e.end === 'arrived')).toBe(true);
    expect(events.some((e) => e.t === 'escortPaid')).toBe(false);
  });

  it('pays a share when the trader arrives while they are apart', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    const held = heldEscort(next)!;
    held.together = held.span / 2;
    traderIn(next, trader).pos = { ...sitePads(NOSE)[0] };
    playerVehicle(next).pos = { x: NOSE.pos.x - 100, y: NOSE.pos.y };
    const money = next.player.money;
    const events = tick(next, 1);
    expect(events.some((e) => e.t === 'escortEnded' && e.end === 'apartAtArrival')).toBe(true);
    expect(next.player.money).toBe(money + Math.round(offer.reward / 2));
  });

  it('pays a share when the trader is knocked out', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    heldEscort(next)!.together = heldEscort(next)!.span / 4;
    knockOut(next.vehicles.find((v) => v.id === trader.id)!);
    const money = next.player.money;
    const events = tick(next, 1);
    expect(events.some((e) => e.t === 'escortEnded' && e.end === 'lost')).toBe(true);
    expect(next.player.money).toBe(money + Math.round(offer.reward * 0.75));
  });

  it('fails the job and pays nothing when the trucks turn hostile', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    startCombat(next, playerVehicle(next), traderIn(next, trader));
    const hostile = next.states.length;
    expect(hostile).toBeGreaterThan(0);
    const money = next.player.money;
    next.states.push({ id: 'feud-x', kind: 'feud', holder: trader.id, other: playerVehicle(next).id, turnsLeft: 10, born: next.turn, data: { kind: 'feud', robbery: false } });
    const events = tick(next, 1);
    expect(events.some((e) => e.t === 'escortEnded' && e.end === 'hostile')).toBe(true);
    expect(next.player.money).toBe(money);
  });

  it('pays a share when a third truck takes every crate of the client', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    heldEscort(next)!.together = heldEscort(next)!.span / 4;
    const client = traderIn(next, trader);
    client.items = client.items.filter((it) => it.kind !== 'good');
    client.brain!.goals = [];
    const money = next.player.money;
    const events = tick(next, 1);
    expect(events.filter((e) => e.t === 'escortEnded' && e.end === 'cargoLost')).toHaveLength(1);
    expect(next.player.money).toBe(money + Math.round(offer.reward * 0.75));
    expect(heldEscort(next)).toBeNull();
    expect(next.player.pastContracts.filter((r) => r.contract.id === offer.id)).toHaveLength(1);
    expect(stateOf(next, 'escort', playerVehicle(next).id, trader.id)).toBeNull();
  });

  it('runs on when the client keeps some crates', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    const client = traderIn(next, trader);
    client.items.splice(client.items.findIndex((it) => it.kind === 'good'), 1);
    tick(next, 1);
    expect(heldEscort(next)).not.toBeNull();
  });

  for (const settle of [settleThreat, settleCashThreat]) {
    it(`fails the job with no pay when the player robs the client (${settle.name})`, () => {
      const { w, trader, offer } = setup();
      const next = take(w, offer);
      settle(next, traderIn(next, trader), 'comply');
      const money = next.player.money;
      const events = tick(next, 1);
      expect(events.some((e) => e.t === 'escortEnded' && e.end === 'hostile')).toBe(true);
      expect(next.player.money).toBe(money);
      expect(heldEscort(next)).toBeNull();
    });
  }

  it('does not hold a robbery from before the escort against the player', () => {
    const { w, trader, offer } = setup();
    settleThreat(w, trader, 'comply');
    w.turn += 3;
    w.states = w.states.filter((s) => s.kind !== 'trade' && s.kind !== 'handover');
    const next = take(w, offer);
    const client = traderIn(next, trader);
    client.items = client.items.filter((it) => it.kind !== 'good');
    client.brain!.goals = [];
    const events = tick(next, 1);
    expect(events.some((e) => e.t === 'escortEnded' && e.end === 'cargoLost')).toBe(true);
  });

  it('throws when the escort state vanished with nothing to explain it', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    next.states = next.states.filter((s) => s.kind !== 'escort');
    expect(() => tick(next, 1)).toThrow(/lost its state/);
    expect(trader.id).toBeTruthy();
  });
});

describe('the trader waits for a player escort', () => {
  it('brakes while the player is behind it, at any distance, and drives on when the player is ahead', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    const me = playerVehicle(next);
    const leader = next.vehicles.find((v) => v.id === trader.id)!;
    leader.pos = { x: NOSE.pos.x - 200, y: NOSE.pos.y };
    me.pos = { x: NOSE.pos.x - 300, y: NOSE.pos.y };
    expect(traderWaits(next, leader, me)).toBe(true);
    me.pos = { x: NOSE.pos.x - 100, y: NOSE.pos.y };
    expect(traderWaits(next, leader, me)).toBe(false);
    me.pos = { x: NOSE.pos.x - 190, y: NOSE.pos.y };
    expect(dist(me.pos, leader.pos)).toBeLessThan(NPC_BEHAVIOR.escortWaitGap);
    expect(traderWaits(next, leader, me)).toBe(false);
  });

  it('waits for a stranded player at any distance', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    const me = playerVehicle(next);
    getResources(next, me).fuel = 0;
    const leader = next.vehicles.find((v) => v.id === trader.id)!;
    leader.pos = { x: me.pos.x + 10, y: me.pos.y };
    expect(traderWaits(next, leader, me)).toBe(true);
    leader.pos = { x: me.pos.x + ESCORT_JOB.apartGap + 10, y: me.pos.y };
    expect(traderWaits(next, leader, me)).toBe(true);
  });

  it('waits for a player on a rope 60 tiles off', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    const me = playerVehicle(next);
    const leader = next.vehicles.find((v) => v.id === trader.id)!;
    leader.pos = { x: me.pos.x + 60, y: me.pos.y };
    addState(next, 'drag', 'dragger', me.id, { kind: 'drag', drop: { x: me.pos.x, y: me.pos.y } });
    expect(traderWaits(next, leader, me)).toBe(true);
  });

  it('stops waiting once the stuck contract is released', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    const me = playerVehicle(next);
    getResources(next, me).fuel = 0;
    const leader = traderIn(next, trader);
    leader.pos = { x: me.pos.x + ESCORT_JOB.apartGap + 30, y: me.pos.y };
    tick(next, ESCORT_JOB.stuckTurns - 1);
    expect(traderWaits(next, traderIn(next, trader), playerVehicle(next))).toBe(true);
    tick(next, 1);
    expect(heldEscort(next)).toBeNull();
    expect(traderWaits(next, traderIn(next, trader), playerVehicle(next))).toBe(false);
  });

  it('waits under a hold', () => {
    const { w, trader, offer } = setup();
    const next = take(w, offer);
    holdEscort(next, heldEscort(next)!);
    const leader = next.vehicles.find((v) => v.id === trader.id)!;
    expect(traderWaits(next, leader, playerVehicle(next))).toBe(true);
  });
});

describe('on the turn pipeline', () => {
  function follow(trader: Vehicle): (next: World) => void {
    return (next) => {
      const me = playerVehicle(next);
      const lead = next.vehicles.find((v) => v.id === trader.id)!;
      me.order = dist(me.pos, lead.pos) > 6 ? { kind: 'stopAt', dest: { ...lead.pos } } : { kind: 'brake' };
    };
  }

  it('lets a trader that finds no taker leave alone once its wait is over', () => {
    const { w, trader, offer } = setup();
    for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
    let next = w;
    for (let i = 0; i < ESCORT_JOB.postTurns + 3; i++) {
      if (next.player.call) next = hangUp(next);
      next = endTurn(next, testDrive);
    }
    const live = traderIn(next, trader);
    expect(live.brain!.goals.some((g) => g.kind === 'wait')).toBe(false);
    expect(next.shops.bowl.contracts.some((c) => c.id === offer.id)).toBe(false);
  });

  it('ends the wait of a trader whose offer the player took, and the trip goes on', () => {
    const { w, trader, offer } = setup();
    let next = take(w, offer);
    next = endTurn(next, testDrive);
    next = endTurn(next, testDrive);
    const live = traderIn(next, trader);
    expect(live.brain!.goals.some((g) => g.kind === 'wait')).toBe(false);
    expect(live.brain!.goals[0].kind).toBe('sell');
  });

  it('runs a whole escort from the board to the pay without the player waiting long', () => {
    const { w, trader, offer } = setup();
    for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
    const money = w.player.money;
    let next = take(w, offer);
    const drive = follow(trader);
    let parked = 0;
    let turns = 0;
    const events: GameEvent[] = [];
    while (heldEscort(next) && turns < 600) {
      if (next.player.call) next = hangUp(next);
      next = endTurn(next, (n) => {
        drive(n);
        testDrive(n);
      });
      events.push(...next.events);
      turns++;
      if (playerVehicle(next).speed === 0) parked++;
    }
    expect(heldEscort(next)).toBeNull();
    expect(events.some((e) => e.t === 'escortEnded' && e.end === 'arrived')).toBe(true);
    expect(next.player.money).toBe(money + offer.reward);
    expect(events.some((e) => e.t === 'stall')).toBe(false);
    expect(parked / turns).toBeLessThan(0.1);
  });
});

describe('hold and go on the radio', () => {
  const en = (line: LineId): string => entryText('en', lineKey(line));

  function call(w: World, trader: Vehicle): World {
    refreshVision(w);
    return callVehicle(w, trader.id);
  }

  function texts(w: World): string[] {
    return [...currentOptions(w).map((o) => en(o.line)), ...asksOf(w)];
  }

  it('offers the hold order only to the client of a held escort, and the go order only under a hold', () => {
    const { w, trader, offer } = setup();
    const before = call(w, trader);
    expect(texts(before)).not.toContain("Wait here. I'll scout the road ahead.");
    const next = take(w, offer);
    const live = traderIn(next, trader);
    live.pos = { x: playerVehicle(next).pos.x + 10, y: playerVehicle(next).pos.y };
    let open = call(next, live);
    expect(texts(open)).toContain("Wait here. I'll scout the road ahead.");
    expect(texts(open)).not.toContain("Let's move.");
    open = chooseText(open, "Wait here. I'll scout the road ahead.");
    open = chooseOption(open, 0);
    expect(heldEscort(open)!.holdUntil).not.toBeNull();
    open = call(open, traderIn(open, trader));
    expect(texts(open)).toContain("Let's move.");
    open = chooseText(open, "Let's move.");
    open = chooseOption(open, 0);
    expect(heldEscort(open)!.holdUntil).toBeNull();
  });
});
