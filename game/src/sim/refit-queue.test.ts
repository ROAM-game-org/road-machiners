import { describe, expect, it } from 'vitest';
import { chassisDef } from '../data/chassis';
import { partDef } from '../data/parts';
import { RULES } from '../data/rules';
import { PERK_NUMBERS } from '../data/skills';
import { WORK } from '../data/utilities';
import { knockOutNpc } from './defeat';
import { corePart, findSpot, gridOf, MOUNT_CELLS, type Spot } from './grid';
import { makePart } from './factory';
import { addGoods, mountPart, plannedRefit, plannedRefitTurns, plannedTruck, queueRefit, startRefit } from './inventory';
import { advanceJobs } from './jobs';
import { lootBlocker, takeFromTruck } from './salvage';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { GameEvent, GridItem, RefitJob, Vehicle, World } from './types';
import { refreshVision } from './vision';

const FIELD_TURNS = Math.ceil(RULES.refitTurnsPerPart * WORK.noCraneTime);

function downed(parts = ['mg', 'stockEngine', 'scrapSheet', 'ceramicTile']): { w: World; raider: Vehicle } {
  const w = emptyWorld();
  w.vehicles[0].items = w.vehicles[0].items.filter((it) => it.kind !== 'good');
  const gap = chassisDef('scout').radius + chassisDef('buggy').radius + 0.2;
  const raider = addVehicle(w, 'scrapjaw', 'buggy', parts, { x: 30 + gap, y: 30 });
  raider.brain = npcBrain('buggy', raider.pos, ['raider']);
  corePart(raider, 'cab').hp = 0;
  knockOutNpc(w, raider);
  refreshVision(w);
  return { w, raider };
}

const me = (w: World) => w.vehicles[0];

function refitOf(v: Vehicle): RefitJob {
  if (v.job?.kind !== 'refit') throw new Error(`${v.id} runs no refit`);
  return v.job;
}
const raiderOf = (w: World, id: string) => w.vehicles.find((v) => v.id === id)!;

function partOn(v: Vehicle, defId: string): Extract<GridItem, { kind: 'part' }> {
  const item = v.items.find((it) => it.kind === 'part' && it.part.defId === defId);
  if (item?.kind !== 'part') throw new Error(`No ${defId} on ${v.id}`);
  return item;
}

function spareSpot(w: World, item: GridItem): Spot {
  const planned = plannedTruck(w, me(w));
  const avoid = item.kind === 'part' ? MOUNT_CELLS[partDef(item.part.defId).kind] : null;
  const spot = findSpot(gridOf(planned), planned.items, { ...item, id: 'probe' }, null, avoid);
  if (!spot) throw new Error('No spare spot');
  return spot;
}

function take(w: World, raiderId: string, defId: string): World {
  const item = partOn(raiderOf(w, raiderId), defId);
  return takeFromTruck(w, raiderId, item.id, spareSpot(w, item));
}

function strip(w: World, raiderId: string, defIds: string[]): World {
  return defIds.reduce((next, defId) => take(next, raiderId, defId), w);
}

function holds(v: Vehicle, defId: string): boolean {
  return v.items.some((it) => it.kind === 'part' && it.part.defId === defId);
}

function turnsUntilIdle(w: World, limit = 100): number {
  for (let turn = 1; turn <= limit; turn++) {
    w.events = [];
    advanceJobs(w);
    if (me(w).job === null) return turn;
  }
  throw new Error('The refit never ended');
}

function jobEvents(w: World): Extract<GameEvent, { t: 'job' }>[] {
  return w.events.filter((e): e is Extract<GameEvent, { t: 'job' }> => e.t === 'job');
}

describe('stripping a knocked-out truck in one visit', () => {
  it('queues every mounted part behind the first and takes them all off, one step after another', () => {
    const { w, raider } = downed();
    const queued = strip(w, raider.id, ['mg', 'stockEngine', 'scrapSheet', 'ceramicTile']);
    expect(me(queued).job).toMatchObject({ kind: 'refit', turnsLeft: FIELD_TURNS });
    expect(refitOf(me(queued)).queue).toHaveLength(3);
    expect(turnsUntilIdle(queued)).toBe(4 * FIELD_TURNS);
    const taken = raider.items.flatMap((it) => (it.kind === 'part' && partDef(it.part.defId).kind !== 'core' ? [it.part.id] : []));
    expect(taken).toHaveLength(4);
    expect(taken.every((id) => me(queued).items.some((it) => it.kind === 'part' && it.part.id === id))).toBe(true);
    expect(raiderOf(queued, raider.id).items.some((it) => it.kind === 'part' && taken.includes(it.part.id))).toBe(false);
  });

  it('starts the next step in the same turn the last one ends, with no command', () => {
    const { w, raider } = downed();
    const queued = strip(w, raider.id, ['mg', 'stockEngine']);
    for (let turn = 1; turn < FIELD_TURNS; turn++) advanceJobs(queued);
    queued.events = [];
    advanceJobs(queued);
    expect(jobEvents(queued).map((e) => e.outcome)).toEqual(['done', 'started']);
    expect(me(queued).job).toMatchObject({ pickup: { partId: partOn(raiderOf(queued, raider.id), 'stockEngine').part.id }, turnsLeft: FIELD_TURNS, queue: [] });
  });

  it('ends on the same turn as the same parts taken by hand, one job after another', () => {
    const queuedTurns = turnsUntilIdle(strip(downed().w, downed().raider.id, ['mg', 'stockEngine', 'scrapSheet']));
    let { w } = downed();
    const raiderId = downed().raider.id;
    let byHand = 0;
    for (const defId of ['mg', 'stockEngine', 'scrapSheet']) {
      w = take(w, raiderId, defId);
      byHand += turnsUntilIdle(w);
    }
    expect(queuedTurns).toBe(byHand);
  });

  it('takes one turn a part with the Cannibal perk, queued as by hand', () => {
    const { w, raider } = downed();
    w.player.perks = ['cannibal'];
    const queued = strip(w, raider.id, ['mg', 'stockEngine', 'scrapSheet']);
    expect(turnsUntilIdle(queued)).toBe(3 * PERK_NUMBERS.cannibal.turns);
  });

  it('works each step with the patcher crane on the truck, queued as by hand', () => {
    const { w, raider } = downed();
    if (!mountPart(w, me(w), makePart(w, 'patcherCrane', 0))) throw new Error('No deck cell for the crane');
    const queued = strip(w, raider.id, ['mg', 'stockEngine']);
    const crane = Math.ceil((RULES.refitTurnsPerPart * WORK.noCraneTime) / WORK.craneSpeed);
    expect(crane).toBeLessThan(FIELD_TURNS);
    expect(plannedRefit(queued, me(queued)).steps.map((s) => s.work)).toEqual([crane]);
    expect(turnsUntilIdle(queued)).toBe(2 * crane);
  });
});

describe('what a queued step may claim', () => {
  it('refuses a part an earlier step already takes', () => {
    const { w, raider } = downed();
    const queued = take(w, raider.id, 'mg');
    const gun = partOn(raiderOf(queued, raider.id), 'mg');
    expect(() => takeFromTruck(queued, raider.id, gun.id, spareSpot(queued, gun))).toThrow('Refused: partQueued');
  });

  it('refuses a cell an earlier step fills', () => {
    const { w, raider } = downed();
    const gun = partOn(raiderOf(w, raider.id), 'mg');
    const spot = spareSpot(w, gun);
    const queued = takeFromTruck(w, raider.id, gun.id, spot);
    const engine = partOn(raiderOf(queued, raider.id), 'stockEngine');
    expect(() => takeFromTruck(queued, raider.id, engine.id, spot)).toThrow(/Refused: badLayout/);
  });

  it('keeps loose goods refused while a refit runs', () => {
    const { w, raider } = downed();
    addGoods(w, raider, 'scrap', 1);
    const queued = take(w, raider.id, 'mg');
    const crate = raiderOf(queued, raider.id).items.find((it) => it.kind === 'good')!;
    expect(() => takeFromTruck(queued, raider.id, crate.id, spareSpot(queued, crate))).toThrow('Refused: refitRunning');
  });

  it('throws on a step that changes nothing', () => {
    const { w } = downed();
    expect(() => queueRefit(w, me(w), { moves: [], pickup: null })).toThrow('The layout changes nothing');
  });
});

describe('a queue that cannot go on', () => {
  it('drops the whole queue when the truck drives off, and applies no later step', () => {
    const { w, raider } = downed();
    const queued = strip(w, raider.id, ['mg', 'stockEngine', 'scrapSheet']);
    advanceJobs(queued);
    me(queued).speed = 5;
    advanceJobs(queued);
    expect(me(queued).job).toBeNull();
    me(queued).speed = 0;
    for (let turn = 0; turn < 4 * FIELD_TURNS; turn++) advanceJobs(queued);
    expect(['mg', 'stockEngine', 'scrapSheet'].every((defId) => holds(raiderOf(queued, raider.id), defId))).toBe(true);
  });

  it('skips a step whose part another hand took, names why, and runs the next one', () => {
    const { w, raider } = downed();
    const queued = strip(w, raider.id, ['mg', 'stockEngine', 'scrapSheet']);
    const target = raiderOf(queued, raider.id);
    target.items = target.items.filter((it) => it.kind !== 'part' || it.part.defId !== 'stockEngine');
    for (let turn = 1; turn < FIELD_TURNS; turn++) advanceJobs(queued);
    queued.events = [];
    advanceJobs(queued);
    expect(jobEvents(queued).map((e) => e.outcome)).toEqual(['done', 'skipped', 'started']);
    expect(jobEvents(queued)[1]).toMatchObject({ reason: { id: 'truckPartGone' } });
    expect(turnsUntilIdle(queued)).toBe(FIELD_TURNS);
    expect(holds(me(queued), 'scrapSheet')).toBe(true);
  });
});

describe('own moves queued behind a pickup', () => {
  it('plans a move against the layout the queue leaves and prices it on that layout', () => {
    const { w, raider } = downed();
    const queued = take(w, raider.id, 'mg');
    const planned = plannedTruck(queued, me(queued));
    const pickup = refitOf(me(queued)).pickup;
    const newGun = planned.items.find((it) => it.id === pickup?.itemId)!;
    const mount = findSpot(gridOf(planned), planned.items, { ...newGun, id: 'probe' }, MOUNT_CELLS.weapon, null);
    if (!mount) throw new Error('No free gun mount');
    const layout = { [newGun.id]: mount };
    expect(plannedRefitTurns(queued, me(queued), layout)).toBe(FIELD_TURNS);
    const next = startRefit(queued, layout);
    expect(refitOf(me(next)).queue).toHaveLength(1);
    expect(turnsUntilIdle(next)).toBe(2 * FIELD_TURNS);
    expect(me(next).items.find((it) => it.id === newGun.id)).toMatchObject(mount);
  });

  it('applies a cargo-only plan the moment its turn comes', () => {
    const { w, raider } = downed();
    me(w).items.push({ id: 'crate', kind: 'good', good: 'scrap', x: 0, y: gridOf(me(w)).h - 1, rot: 0 });
    const queued = take(w, raider.id, 'mg');
    const crate = me(queued).items.find((it) => it.id === 'crate')!;
    const to = spareSpot(queued, crate);
    const next = startRefit(queued, { crate: to });
    expect(me(next).items.find((it) => it.id === 'crate')).toMatchObject({ x: crate.x, y: crate.y });
    expect(turnsUntilIdle(next)).toBe(FIELD_TURNS);
    expect(me(next).items.find((it) => it.id === 'crate')).toMatchObject(to);
  });
});

describe('the loot hold of a queue', () => {
  it('keeps a truck the player queued work on theirs while an NPC stands ready to loot it', () => {
    const { w, raider } = downed();
    const second = addVehicle(w, 'scrapjaw', 'buggy', ['mg'], { x: 30, y: 30 + chassisDef('scout').radius + chassisDef('buggy').radius + 0.2 });
    second.brain = npcBrain('buggy', second.pos, ['raider']);
    corePart(second, 'cab').hp = 0;
    knockOutNpc(w, second);
    const queued = take(take(w, raider.id, 'mg'), second.id, 'mg');
    const looter = addVehicle(queued, 'independent', 'scout', ['mg'], { x: 30 - 2, y: 30 + 3 });
    looter.brain = npcBrain('scavenger', looter.pos, ['scavenger']);
    looter.brain.goals = [{ kind: 'loot', targetId: second.id, destination: null, phase: 'act', reason: 'tripToSite' }];
    expect(lootBlocker(queued, looter, second.id)?.id).toBe(me(queued).id);
  });
});
