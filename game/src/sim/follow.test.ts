import { describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { playerVehicle } from './damage';
import { followedId, followError, followTruck, planPlayerFollow, stopFollowing, trailOrder } from './follow';
import { fallbackFaction } from './spawn';
import { NPCS } from '../data/npcs';
import { addVehicle, emptyWorld, npcBrain, startCombat } from './testkit';
import type { MoveOrder, Vehicle, World } from './types';
import { dist } from './vec';
import { refreshVision } from './vision';
import { endTurn, setDirect, setMoveOrder } from './world';

function withTrader(): { w: World; me: Vehicle; trader: Vehicle } {
  const w = emptyWorld();
  const me = playerVehicle(w);
  const trader = addVehicle(w, fallbackFaction(NPCS.convoy), 'hauler', ['mg', 'workhorseDiesel', 'haulingRack'], { x: me.pos.x + 12, y: me.pos.y });
  trader.brain = npcBrain('convoy', trader.pos, ['supplier']);
  trader.speed = RULES.parkedSpeed * 4;
  refreshVision(w);
  return { w, me, trader };
}

function turnRaider(trader: Vehicle): void {
  trader.faction = 'scrapjaw';
  trader.brain = npcBrain('merc', trader.pos, ['raider']);
}

const orderOf = (w: World): MoveOrder | null => playerVehicle(w).order;
const endedOf = (w: World) => w.events.filter((e) => e.t === 'followEnded');

function following(): { w: World; me: Vehicle; trader: Vehicle } {
  const s = withTrader();
  const w = followTruck(s.w, s.trader.id);
  return { w, me: playerVehicle(w), trader: w.vehicles.find((v) => v.id === s.trader.id)! };
}

describe('followTruck', () => {
  it('sets the trail order that names the target', () => {
    const { w, trader } = following();
    const order = orderOf(w);
    expect(order && order.kind !== 'brake' && order.follow).toBe(trader.id);
    expect(followedId(w)).toBe(trader.id);
    expect(order).toMatchObject({ ...trailOrder(w, playerVehicle(w), trader), follow: trader.id });
  });

  it('leaves manual driving', () => {
    const s = withTrader();
    const manual = setDirect(s.w, true);
    expect(playerVehicle(followTruck(manual, s.trader.id)).direct).toBe(false);
  });

  it('refuses a truck out of sight, a hostile truck and a knocked-out one', () => {
    const far = withTrader();
    far.trader.pos = { x: far.me.pos.x + 900, y: far.me.pos.y };
    refreshVision(far.w);
    expect(followError(far.w, far.trader.id)).toEqual({ id: 'followLost' });

    const hostile = withTrader();
    turnRaider(hostile.trader);
    expect(followError(hostile.w, hostile.trader.id)).toEqual({ id: 'followHostile' });

    const down = withTrader();
    down.trader.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };
    expect(followError(down.w, down.trader.id)).toEqual({ id: 'followDowned' });
    expect(() => followTruck(down.w, down.trader.id)).toThrow('Refused');
  });

  it('throws for an unknown id and for the player own truck', () => {
    const { w, me } = withTrader();
    expect(() => followError(w, 'nobody')).toThrow();
    expect(() => followError(w, me.id)).toThrow();
  });
});

describe('ending a follow', () => {
  it('drops follow on a ground click, brake and manual driving', () => {
    const { w } = following();
    expect(followedId(setMoveOrder(w, { kind: 'stopAt', dest: { x: 1, y: 1 } }))).toBeNull();
    expect(followedId(setMoveOrder(w, { kind: 'brake' }))).toBeNull();
    expect(followedId(setDirect(w, true))).toBeNull();
  });

  it('stopFollowing leaves a plain stop at the spot and says nothing', () => {
    const { w } = following();
    const spot = (orderOf(w) as { dest: { x: number; y: number } }).dest;
    const stopped = stopFollowing(w);
    expect(orderOf(stopped)).toEqual({ kind: 'stopAt', dest: spot });
    expect(endedOf(stopped)).toEqual([]);
  });

  it.each([
    ['gone', (s: ReturnType<typeof following>) => { s.w.vehicles = s.w.vehicles.filter((v) => v.id !== s.trader.id); }],
    ['lost', (s: ReturnType<typeof following>) => { s.trader.pos = { x: s.me.pos.x + 900, y: s.me.pos.y }; refreshVision(s.w); }],
    ['downed', (s: ReturnType<typeof following>) => { s.trader.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false }; }],
    ['hostile', (s: ReturnType<typeof following>) => turnRaider(s.trader)],
  ] as const)('ends once and plainly when the target is %s', (why, act) => {
    const s = following();
    const spot = (orderOf(s.w) as { dest: { x: number; y: number } }).dest;
    act(s);
    planPlayerFollow(s.w);
    expect(orderOf(s.w)).toEqual({ kind: 'stopAt', dest: spot });
    expect(endedOf(s.w)).toEqual([{ t: 'followEnded', vehicle: s.trader.id, why }]);
    planPlayerFollow(s.w);
    expect(endedOf(s.w)).toHaveLength(1);
  });

  it('keeps following through combat that does not involve the target', () => {
    const s = following();
    const foe = addVehicle(s.w, 'scrapjaw', 'buggy', ['mg'], { x: s.me.pos.x, y: s.me.pos.y + 20 });
    startCombat(s.w, foe, s.me);
    planPlayerFollow(s.w);
    expect(followedId(s.w)).toBe(s.trader.id);
  });

  it('throws when the player order names the player truck', () => {
    const { w, me } = withTrader();
    me.order = { kind: 'stopAt', dest: { ...me.pos }, follow: me.id };
    expect(() => planPlayerFollow(w)).toThrow();
  });
});

describe('a follow order in a turn', () => {
  it('re-aims each turn and never arrives', () => {
    const { w, trader } = following();
    trader.speed = 0;
    let next = w;
    for (let i = 0; i < 6; i++) next = endTurn(next, () => {});
    expect(next.events.some((e) => e.t === 'arrived')).toBe(false);
    expect(followedId(next)).toBe(trader.id);
    expect(dist(playerVehicle(next).pos, next.vehicles.find((v) => v.id === trader.id)!.pos)).toBeLessThan(15);
  });
});
