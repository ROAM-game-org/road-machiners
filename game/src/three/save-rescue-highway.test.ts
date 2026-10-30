import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { haulerOf, playerTrucks, playerVehicle } from '../sim/damage';
import { canDriveOn, stretchPlan, driveOn } from '../sim/chaos-highway';
import { inYard } from '../sim/outpost-gates';
import { highwayHash, mapAt } from '../sim/highway';
import { isDriveObstacle, touchesObstacle } from '../sim/mapgen';
import { defaultSetup } from '../sim/settings';
import type { Vehicle, World } from '../sim/types';
import { carriedWorld, endTurn, type Carried } from '../sim/world';
import { maxHp } from '../sim/wear';
import { TEST_MAP } from '../test/map';
import { loadWorld, SaveError, stepsFrom } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import type { SavedJson } from './save-migrations';
import { readCarried, rescueSave } from './save-rescue';
import MID_STRETCH from './save-fixtures/highway-3-mid-stretch.json';
import PAID from './save-fixtures/highway-3-paid.json';

const KIT = startKit('standard');
const fresh = () => 5;
const freshRun = () => 'new-run';

type Fixture = typeof MID_STRETCH | typeof PAID;
type SavedTruck = Fixture['world']['vehicles'][number];

function slotsWith(save: unknown): SaveSlots {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', structuredClone(save));
  return slots;
}

function savedTruck(save: Fixture, id: string): SavedTruck {
  return save.world.vehicles.find((v) => v.id === id)!;
}

function partsOf(items: readonly { kind: string; part?: { defId: string; hp: number; wear: number } }[]) {
  return items.flatMap((it) => (it.part ? [{ defId: it.part.defId, hp: Math.min(it.part.hp, maxHp({ id: 'held', ...it.part })), wear: it.part.wear }] : [])).sort((a, b) => a.defId.localeCompare(b.defId));
}

function goodsOf(items: readonly { kind: string; good?: string }[]): string[] {
  return items.flatMap((it) => (it.good ? [it.good] : [])).sort();
}

function rescued(save: Fixture): { world: World; slots: SaveSlots; report: ReturnType<typeof rescueSave> } {
  const slots = slotsWith(save);
  const report = rescueSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun, 2000);
  return { world: report!.world, slots, report };
}

function clearOfProps(world: World, truck: Vehicle): boolean {
  return world.obstacles.filter(isDriveObstacle).every((o) => !touchesObstacle(o, world.terrain, truck.pos, 1));
}

const CENTS_PER_M = 100;

function wholeM(cents: number): number {
  return Math.ceil(cents / CENTS_PER_M);
}

function expectKept(world: World, save: Fixture): void {
  const old = save.world;
  expect(world.player.money).toBe(wholeM(old.player.money));
  expect(world.player.xp).toBe(old.player.xp);
  expect(world.player.ranks).toEqual(old.player.ranks);
  expect(world.player.storage.map((p) => p.defId)).toEqual(old.player.storage.map((p) => p.defId));
  expect(world.chaosHighway!.earned).toBe(wholeM(old.furyRoad.earned));
  expect(world.chaosHighway!.wrecks).toBe(old.furyRoad.wrecks);
  for (const [truck, savedId] of [[playerVehicle(world), old.player.vehicleId], [haulerOf(world), old.furyRoad.hauler.id]] as const) {
    expect(partsOf(truck.items)).toEqual(partsOf(savedTruck(save, savedId).items));
    expect(goodsOf(truck.items)).toEqual(goodsOf(savedTruck(save, savedId).items));
  }
}

function expectWaitingAt(world: World, milestone: number): void {
  expect(world.mapHash).toBe(highwayHash(world.seed, milestone));
  expect(world.chaosHighway!.window).toBe(milestone);
  expect(world.chaosHighway!.waitingAt).toBe(milestone);
  expect(world.vehicles).toEqual(playerTrucks(world));
  for (const truck of playerTrucks(world)) {
    expect(inYard(world, truck.pos, milestone)).toBe(true);
    expect(clearOfProps(world, truck)).toBe(true);
  }
  expect(canDriveOn(world)).toBe(true);
  expect(world.chaosHighway!.groups).toEqual(stretchPlan(world, milestone + 1));
}

describe('rescueSave on a Chaos Highway run from an older highway', () => {
  it('refuses to load the v3 saves as they are', () => {
    for (const save of [MID_STRETCH, PAID]) expect(() => loadWorld(slotsWith(save), 'auto', TEST_MAP)).toThrow(SaveError);
  });

  it('puts a run caught mid-stretch back at the start of that stretch with all it earned', () => {
    const { world, slots, report } = rescued(MID_STRETCH);

    expectWaitingAt(world, MID_STRETCH.world.furyRoad.window);
    expectKept(world, MID_STRETCH);
    expect(report!.runId).toBe(MID_STRETCH.runId);
    expect(loadWorld(slots, 'auto', TEST_MAP)).toEqual({ ...world, events: [], removed: [] });
  });

  it('puts a run paid at the next outpost on that outpost, ready for the next stretch, with nothing paid twice', () => {
    const { world, slots } = rescued(PAID);

    expectWaitingAt(world, PAID.world.furyRoad.waitingAt);
    expectKept(world, PAID);
    expect(world.chaosHighway!.outposts.map((o) => [o.milestone, o.paid])).toEqual([[2, true], [3, false]]);
    expect(loadWorld(slots, 'auto', TEST_MAP)).toEqual({ ...world, events: [], removed: [] });
  });

  it('reads the wait of a run saved before the run kept one from the outpost it paid', () => {
    const { waitingAt: _waitingAt, ...run } = PAID.world.furyRoad;
    const { world } = rescued({ ...PAID, world: { ...PAID.world, furyRoad: run } } as Fixture);

    expectWaitingAt(world, PAID.world.furyRoad.waitingAt);
  });

  it('plays the stretch after the wait and awards nothing the save did not hold', () => {
    const { world } = rescued(MID_STRETCH);

    const next = endTurn(driveOn(world), () => {});

    expect(next.player.money).toBe(world.player.money);
    expect(next.player.xp).toBe(world.player.xp);
    expect(next.events.filter((e) => e.t === 'discover' || e.t === 'money' || e.t === 'outpostReached')).toEqual([]);
    expect(next.player.discovered).toEqual(expect.arrayContaining(MID_STRETCH.world.player.discovered));
  });

  it.each([
    ['names no hauler truck', (run: Record<string, unknown>) => { run.hauler = { id: 'gone', alarmUntil: null }; }],
    ['has no hauler', (run: Record<string, unknown>) => { delete run.hauler; }],
    ['has no earned money', (run: Record<string, unknown>) => { delete run.earned; }],
    ['has no wreck count', (run: Record<string, unknown>) => { run.wrecks = 'many'; }],
    ['has no window', (run: Record<string, unknown>) => { run.window = -1; }],
  ])('throws on a run that %s', (_, damage) => {
    const broken = structuredClone(MID_STRETCH);
    damage(broken.world.furyRoad as unknown as Record<string, unknown>);

    expect(() => rescueSave(slotsWith(broken), 'auto', TEST_MAP, KIT, fresh, freshRun, 2000)).toThrow(/cannot be rescued/);
  });

  it('throws on a run whose setup no longer reads as Chaos Highway', () => {
    const broken = structuredClone(MID_STRETCH) as unknown as { world: { setup: unknown } };
    broken.world.setup = { mode: 'nowhere' };

    expect(() => rescueSave(slotsWith(broken), 'auto', TEST_MAP, KIT, fresh, freshRun, 2000)).toThrow(/cannot be rescued/);
  });

  it('carries a run saved under the new name as the steps carry one under the old name', () => {
    const stepped = stepsFrom(MID_STRETCH.format.minor)!.reduce((world, step) => step(world), structuredClone(MID_STRETCH.world) as unknown as SavedJson);
    const named = { format: { major: 2, minor: 130 }, world: stepped };

    expect(stepped.chaosHighway).not.toBeUndefined();
    expect(stepped.furyRoad).toBeUndefined();
    expect(readCarried(named).run).toEqual(readCarried(MID_STRETCH).run);
    expect((readCarried(named).setup as { mode: string }).mode).toBe('chaosHighway');
  });

  it('reads the mode of a save from before format 114 as Chaos Highway', () => {
    expect(MID_STRETCH.world.setup.mode).toBe('furyRoad');
    expect((readCarried(MID_STRETCH).setup as { mode: string }).mode).toBe('chaosHighway');
  });

  it('starts a fresh run for a save from before the hauler', () => {
    const old = structuredClone(MID_STRETCH) as unknown as { format: { minor: number }; world: { furyRoad: Record<string, unknown> } };
    old.format.minor = 59;
    delete old.world.furyRoad.hauler;

    expect(readCarried(old).run).toBeNull();
  });

  it('starts a fresh run for a save whose run older rules dropped', () => {
    const old = structuredClone(MID_STRETCH) as unknown as { world: { furyRoad: unknown } };
    old.world.furyRoad = null;

    const { world } = rescued(old as unknown as Fixture);

    expectWaitingAt(world, 0);
    expect(world.player.money).toBe(wholeM(MID_STRETCH.world.player.money));
  });
});

describe('a carried run start', () => {
  const carried = readCarried(MID_STRETCH);

  it.each([1, 2, 7, 21, 4242])('parks both trucks clear on the pad of each start outpost of seed %i', (seed) => {
    for (const from of [0, 1, 2, 3]) {
      const run: Carried['run'] = { ...carried.run!, from };
      const world = carriedWorld({ ...carried, seed, run }, KIT, (setup, s, window) => mapAt(setup, s, window, TEST_MAP), fresh);
      expect(world.setup.mode).toBe(defaultSetup('chaosHighway').mode);
      expectWaitingAt(world, from);
    }
  });
});
