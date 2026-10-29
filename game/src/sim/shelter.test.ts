import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { addVehicle, emptyWorld, npcBrain, startCombat, testDrive } from './testkit';
import { canEnter, enterSite, everyTruck, isSheltered, leaveSite, shelteredAt, shelterNew, sitePads } from './sites';
import { addState } from './states';
import { playerVehicle } from './damage';
import { aliveOf } from './spawn';
import { cloneWorld, endTurn } from './world';
import type { CrimeCase, GoalReason, NpcActivity, Vehicle, World } from './types';
import { dist, type Vec } from './vec';

const BOWL = REGION.towns.find((t) => t.id === 'bowl')!;
const PAD = sitePads(BOWL)[0];

function quietAt(pos: Vec): World {
  const w = emptyWorld(pos);
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  return w;
}

function bowlWorld(): { w: World; car: Vehicle } {
  const w = quietAt({ x: BOWL.pos.x - BOWL.radius - 30, y: BOWL.pos.y });
  const car = trader(w, PAD);
  return { w, car };
}

function trader(w: World, pos: Vec): Vehicle {
  const v = addVehicle(w, 'independent', 'scout', ['stockEngine'], { ...pos }, 0);
  v.brain = npcBrain('trader', v.pos, ['trader']);
  v.speed = 0;
  return v;
}

function raider(w: World, pos: Vec): Vehicle {
  const v = addVehicle(w, 'scrapjaw', 'scout', ['stockEngine'], { ...pos }, 0);
  v.brain = npcBrain('raider', v.pos, ['raider']);
  return v;
}

function nearPad(k: number): Vec {
  return { x: PAD.x + 8 + k * 3, y: PAD.y + 6 };
}

describe('entering a site', () => {
  it('lets a truck parked on the pad enter, keeping its id, items and money', () => {
    const { w, car } = bowlWorld();
    car.resources!.money = 321;
    const items = structuredClone(car.items);

    enterSite(w, car, BOWL);

    expect(w.vehicles.some((v) => v.id === car.id)).toBe(false);
    expect(isSheltered(w, car.id)).toBe(true);
    expect(shelteredAt(w, BOWL.id).map((v) => v.id)).toEqual([car.id]);
    expect(everyTruck(w).filter((v) => v.id === car.id)).toHaveLength(1);
    expect(w.removed.map((v) => v.id)).toEqual([car.id]);
    expect(w.events).toContainEqual({ t: 'enteredSite', vehicle: car.id, site: BOWL.id });
    const inside = shelteredAt(w, BOWL.id)[0];
    expect(inside.items).toEqual(items);
    expect(inside.resources!.money).toBe(321);
  });

  it('refuses a truck off the pad', () => {
    const { w, car } = bowlWorld();
    car.pos = { x: PAD.x + 20, y: PAD.y + 20 };

    expect(canEnter(w, car, BOWL)).toBe(false);
    expect(() => enterSite(w, car, BOWL)).toThrow(/cannot enter/);
  });

  it('refuses a truck still rolling', () => {
    const { w, car } = bowlWorld();
    car.speed = 3;

    expect(canEnter(w, car, BOWL)).toBe(false);
  });

  it('refuses a truck in a fight', () => {
    const { w, car } = bowlWorld();
    startCombat(w, raider(w, nearPad(0)), car);

    expect(canEnter(w, car, BOWL)).toBe(false);
  });

  it('refuses a truck that any state names, whoever holds it', () => {
    const { w, car } = bowlWorld();
    const other = raider(w, nearPad(0));
    addState(w, 'sizedUp', other.id, car.id, { kind: 'none' });

    expect(canEnter(w, car, BOWL)).toBe(false);
  });

  it('refuses a truck on the radio with the player', () => {
    const { w, car } = bowlWorld();
    w.player.call = { with: car.id } as World['player']['call'];

    expect(canEnter(w, car, BOWL)).toBe(false);
  });

  it('refuses a truck an open player contract names', () => {
    const { w, car } = bowlWorld();
    w.player.contracts.push({ id: 'ct-s', shop: 'bowl', kind: 'search', target: car.id, driver: 'Jed Cobb', template: 'trader', lead: { at: car.pos, turn: 1 }, reward: 10, deadline: 999, window: 99, tier: 1, delivered: false } as World['player']['contracts'][number]);

    expect(canEnter(w, car, BOWL)).toBe(false);
  });

  it('throws on a truck that is already inside', () => {
    const { w, car } = bowlWorld();
    enterSite(w, car, BOWL);

    expect(() => enterSite(w, car, BOWL)).toThrow(/already inside/);
  });
});

describe('leaving a site', () => {
  it('puts the same truck back on the pad, facing away from the site', () => {
    const { w, car } = bowlWorld();
    enterSite(w, car, BOWL);
    w.events = [];

    expect(leaveSite(w, car.id)).toBe(true);

    const out = w.vehicles.find((v) => v.id === car.id)!;
    expect(w.sheltered).toEqual([]);
    expect(dist(out.pos, PAD)).toBeLessThan(REGION.sites.pad.width / 2);
    const away = Math.atan2(out.pos.y - BOWL.pos.y, out.pos.x - BOWL.pos.x);
    expect(Math.abs(Math.atan2(Math.sin(out.heading - away), Math.cos(out.heading - away)))).toBeLessThan(0.01);
    expect(out.speed).toBe(0);
    expect(w.events).toEqual([{ t: 'leftSite', vehicle: car.id, site: BOWL.id }]);
  });

  it('lets only one truck out of a site per turn', () => {
    const { w, car } = bowlWorld();
    const second = trader(w, PAD);
    enterSite(w, car, BOWL);
    w.vehicles = w.vehicles.filter((v) => v !== second);
    shelterNew(w, second, BOWL);
    w.events = [];

    expect(leaveSite(w, car.id)).toBe(true);
    expect(leaveSite(w, second.id)).toBe(false);
    expect(isSheltered(w, second.id)).toBe(true);
    w.events = [];
    expect(leaveSite(w, second.id)).toBe(true);
  });

  it('waits while every exit spot on the pad is taken', () => {
    const { w, car } = bowlWorld();
    enterSite(w, car, BOWL);
    for (const pad of sitePads(BOWL)) {
      const a = Math.atan2(pad.y - BOWL.pos.y, pad.x - BOWL.pos.x);
      for (const k of [-1, 0, 1]) addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: pad.x - Math.sin(a) * k * 2.4, y: pad.y + Math.cos(a) * k * 2.4 }, 0);
    }
    w.events = [];

    expect(leaveSite(w, car.id)).toBe(false);
    expect(isSheltered(w, car.id)).toBe(true);
  });

  it('throws for a truck that is not inside', () => {
    const { w, car } = bowlWorld();

    expect(() => leaveSite(w, car.id)).toThrow(/not inside/);
  });
});

describe('a sheltered truck', () => {
  it('still counts toward its template', () => {
    const { w, car } = bowlWorld();
    const before = aliveOf(w, NPCS.trader);
    enterSite(w, car, BOWL);

    expect(aliveOf(w, NPCS.trader)).toBe(before);
  });

  it('keeps its place across a world clone', () => {
    const { w, car } = bowlWorld();
    enterSite(w, car, BOWL);

    expect(cloneWorld(w).sheltered).toEqual(w.sheltered);
  });
});

type GoalFate = { reason: GoalReason; fate: 'dropped' | 'ignored' };

const NAMING_GOALS: Record<NpcActivity['kind'], GoalFate | null> = {
  scavenge: null, prowl: null, sell: null, trade: null, resupply: null, raid: null, repair: null, retreat: null, rearm: null, travel: null, claim: null, muster: null,
  fight: { reason: 'fightHostile', fate: 'dropped' },
  flee: { reason: 'escapeAttacker', fate: 'ignored' },
  wait: { reason: 'waitTow', fate: 'ignored' },
  investigate: { reason: 'heardHostile', fate: 'dropped' },
  tow: { reason: 'towStranded', fate: 'dropped' },
  loot: { reason: 'lootDowned', fate: 'dropped' },
  patch: { reason: 'patchTruck', fate: 'dropped' },
  meet: { reason: 'meetStranger', fate: 'dropped' },
  patrol: { reason: 'keepVigil', fate: 'ignored' },
  explore: { reason: 'dragToLight', fate: 'ignored' },
  follow: { reason: 'followLeader', fate: 'dropped' },
  sizeUp: { reason: 'sizingUp', fate: 'dropped' },
  pursue: { reason: 'bountyHunt', fate: 'dropped' },
};

function holdingGoal(kind: NpcActivity['kind'], reason: GoalReason): { w: World; car: Vehicle; holder: Vehicle } {
  const { w, car } = bowlWorld();
  const holder = kind === 'pursue' || kind === 'patrol' ? trader(w, nearPad(0)) : raider(w, nearPad(0));
  holder.brain!.goals = [{ kind, targetId: car.id, destination: { ...car.pos }, phase: 'travel', reason, perceived: w.turn }];
  return { w, car, holder };
}

function runTurns(w: World, turns: number): World {
  let world = w;
  for (let i = 0; i < turns; i++) world = endTurn(world, testDrive);
  return world;
}

describe('links to a sheltered truck', () => {
  const kinds = (Object.entries(NAMING_GOALS) as [NpcActivity['kind'], GoalFate | null][]).flatMap(([kind, f]) => (f ? [{ kind, ...f }] : []));

  it.each(kinds)('runs on with a $kind goal that names it, which is $fate', ({ kind, reason, fate }) => {
    const { w, car, holder } = holdingGoal(kind, reason);
    enterSite(w, car, BOWL);

    const after = runTurns(w, 2);

    const brain = after.vehicles.find((v) => v.id === holder.id)!.brain!;
    expect(brain.goals.some((g) => g.targetId === car.id)).toBe(fate === 'ignored');
    expect(isSheltered(after, car.id)).toBe(true);
  });

  it('runs on while another truck has noticed, tracked or been attacked by it', () => {
    const { w, car } = bowlWorld();
    const other = raider(w, nearPad(0));
    other.brain!.noticed[`preySeen:${car.id}`] = w.turn;
    other.brain!.attackers[car.id] = true;
    other.brain!.tracks[car.id] = { at: { ...car.pos }, turn: w.turn, sighted: true, seenSince: w.turn, choice: null, chosenInSight: false };
    enterSite(w, car, BOWL);

    expect(() => runTurns(w, 2)).not.toThrow();
  });

  it('runs on while a crime case and the player\'s talk name it', () => {
    const { w, car } = bowlWorld();
    w.crimes.push({ id: 'case-x', crime: `1:${car.id}:${playerVehicle(w).id}:robbed`, offense: 'robbed', target: car.id, victim: playerVehicle(w).id, issuer: { kind: 'faction', faction: 'bowl' }, reporters: [], site: 'bowl', at: { ...car.pos }, turn: 1, filed: 1, owed: 10, restitution: 0, escrow: 0, status: 'open', closed: null, hunter: null, retryAt: null, offered: null, known: true, posse: 'lone', lead: { at: { ...car.pos }, turn: 1, heading: null } } as CrimeCase);
    w.player.talked[car.id] = {};
    enterSite(w, car, BOWL);

    expect(() => runTurns(w, 2)).not.toThrow();
  });

  it('hands a moment its driver held to a truck still out', () => {
    const { w, car } = bowlWorld();
    const other = trader(w, nearPad(0));
    other.brain!.personality = car.brain!.personality;
    w.moments!.fromTheWest.driver = car.id;
    enterSite(w, car, BOWL);

    expect(w.moments!.fromTheWest.driver).not.toBe(car.id);
    expect(() => runTurns(w, 2)).not.toThrow();
  });
});
