import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hangUp } from '../sim/dialogue';
import { describe, expect, it } from 'vitest';
import { START_KITS, startKit } from '../data/start';
import { chassisDef } from '../data/chassis';
import { REGION } from '../data/region';
import { CHEATS } from '../data/rules';
import { playerVehicle } from '../sim/damage';
import { advanceFar } from '../sim/far';
import { isFree } from '../sim/spawn';
import { surveySites } from '../sim/survey';
import type { World } from '../sim/types';
import { dist, type Vec } from '../sim/vec';
import { TEST_MAP } from '../test/map';
import { townAt } from '../sim/sites';
import { carriedWorld, endTurn, newWorld } from '../sim/world';
import { carriesOnLoad, loadWorld, namedSteps, SaveError, savedMisfit, saveOf, savedRunId, stepsFrom } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { RELEASE_STEPS, TINY_FROM, TINY_STEPS, type NamedStep, type ReleaseStep, type SavedJson } from './save-migrations';
import { carriedSave, readCarried, rescueSave } from './save-rescue';
import FORMAT_2_0 from './save-fixtures/format-2-0.json';
import FORMAT_2_1 from './save-fixtures/format-2-1.json';
import FORMAT_2_9 from './save-fixtures/format-2-9.json';
import ANCHORS_CARRIED from './save-fixtures/anchors-carried.json';
import { defaultSetup, repairSetup } from '../sim/settings';

const KIT = startKit('standard');
const fresh = () => 5;
const stepFrom = (minor: number) => (world: object): SavedJson => TINY_STEPS[minor - TINY_FROM].step(world as SavedJson);
const freshRun = () => 'new-run';
const makeSlots = () => new SaveSlots(memoryBackend(), new Map());

type SavedWorld = { mapHash: string; player: { vehicleId: string; money: number }; vehicles: { id: string; items: { x: number }[] }[] };

function currentSave(): { format: unknown; world: SavedWorld } {
  const world = newWorld(1337, KIT, TEST_MAP, defaultSetup('roaming'));
  world.player.money = 4321;
  world.player.xp = 150;
  world.player.ranks.driving = 2;
  return JSON.parse(JSON.stringify(saveOf(world)));
}

describe('readCarried', () => {
  it('reads a current save with another map hash', () => {
    const save = currentSave();
    save.world.mapHash = 'other';
    const carried = readCarried(save);
    expect(carried.money).toBe(4321);
    expect(carried.xp).toBe(150);
    expect(carried.ranks.driving).toBe(2);
    expect(carried.truck?.chassisId).toBe(KIT.chassis);
    expect(carried.truck?.items.some((it) => it.kind === 'part' && it.part.defId === 'mg')).toBe(true);
  });

  it('pools skill XP from before format 2.10 into ranks and spare XP', () => {
    const old = readCarried({ format: { major: 2, minor: 9 }, world: FORMAT_2_9 });
    expect(old.ranks).toEqual({ driving: 0, perception: 1, machining: 2, toughness: 5, social: 3 });
    expect(old.xp).toBe(1549);
  });

  it('reads the saved paint slot by slot, an old paint job or retired color as the save steps do, and none from a save without one', () => {
    const paint = { body: 'mint', cab: 'gold', gear: 7 };
    expect(readCarried({ world: { ...FORMAT_2_9, player: { ...FORMAT_2_9.player, paint } } }).paint).toEqual({ body: 'chalk', cab: 'gold' });
    expect(readCarried({ world: { ...FORMAT_2_9, player: { ...FORMAT_2_9.player, paint: 'mint' } } }).paint).toEqual({ body: 'chalk', cab: 'oxblood', gear: 'chalk' });
    expect(readCarried({ world: { ...FORMAT_2_9, player: { ...FORMAT_2_9.player, paint: 'bone' } } }).paint).toEqual({ body: 'tan', cab: 'olive', gear: 'tan' });
    expect(readCarried({ world: FORMAT_2_9 }).paint).toBeNull();
    expect(readCarried({ world: { player: { paint: 7 } } }).paint).toBeNull();
  });

  it.each(['plum', 'lavender', 'mint', 'rose', 'standard'])('rescues the %s paint job in the colors a migrated save gets', (preset) => {
    const old = { ...FORMAT_2_9, player: { ...FORMAT_2_9.player, paint: preset } };
    const migrated = stepFrom(96)(stepFrom(95)(structuredClone(old)));
    expect(readCarried({ world: old }).paint).toEqual(readCarried({ world: migrated }).paint);
  });

  it('rescues a paint of retired colors in the colors a migrated save gets', () => {
    const old = { ...FORMAT_2_9, player: { ...FORMAT_2_9.player, paint: { body: 'plum', cab: 'navy', gear: 'pink' } } };
    expect(readCarried({ world: old }).paint).toEqual({ body: 'oxblood', cab: 'slate', gear: 'chalk' });
    expect(readCarried({ world: stepFrom(96)(structuredClone(old)) }).paint).toEqual({ body: 'oxblood', cab: 'slate', gear: 'chalk' });
  });

  it('keeps old perks whose rank holds and drops the rest', () => {
    const world = { ...FORMAT_2_9, player: { ...FORMAT_2_9.player, perks: ['welder', 'desertRat', 'steadyAim'] } };
    const rescued = carriedWorld(readCarried({ world }), KIT, () => TEST_MAP, fresh);
    expect(rescued.player.perks).toEqual(['welder', 'desertRat']);
    expect(rescued.player.ranks.toughness).toBe(5);
  });

  it('reads old formats and a fake major format', () => {
    for (const world of [FORMAT_2_0, FORMAT_2_1]) {
      const carried = readCarried({ format: { major: 2, minor: 0 }, world });
      expect(carried.money).toBe(Math.round((world.player.money * 100) / 3));
    }
    expect(readCarried({ format: { major: 99, minor: 0 }, world: FORMAT_2_1 }).money).toBe(FORMAT_2_1.player.money);
  });

  it('turns money and cost basis from before format 2.30 into cents, as the 29 to 30 step does', () => {
    const world = { player: { money: 1000, costBasis: { scrap: 10.5 } } };
    for (const format of [undefined, { major: 1, minor: 20 }, { major: 2, minor: 29 }]) {
      const carried = readCarried({ format, world });
      expect(carried.money, JSON.stringify(format)).toBe(33333);
      expect(carried.costBasis.scrap, JSON.stringify(format)).toBeCloseTo(350);
    }
    const current = readCarried({ format: { major: 2, minor: 30 }, world });
    expect(current.money).toBe(1000);
    expect(current.costBasis).toEqual({ scrap: 10.5 });
  });

  it('reads garbage without throwing and keeps what is valid', () => {
    const junk = [null, undefined, [], 'x', 5, {}, { world: [] }, { world: { player: 'x' } }, { world: { player: { money: 'rich', skills: [], perks: [1, 'rebuild'], storage: [3] } } }];
    for (const raw of junk) expect(() => readCarried(raw)).not.toThrow();
    expect(readCarried(junk[8]).perks).toEqual(['rebuild']);
    expect(readCarried(junk[8]).money).toBeNull();
    expect(readCarried(junk[3]).truck).toBeNull();
  });

  it('drops items with float coordinates and keeps a debt', () => {
    const save = currentSave();
    const truck = save.world.vehicles.find((v) => v.id === save.world.player.vehicleId)!;
    truck.items[0].x = 1.5;
    save.world.player.money = -5;
    const carried = readCarried(save);
    expect(carried.truck!.items).toHaveLength(truck.items.length - 1);
    expect(carried.money).toBe(-5);
  });

  it('carries money in cents and pooled skills from a trimmed 2.1 save', () => {
    const world = { ...FORMAT_2_1, player: { ...FORMAT_2_1.player, money: 300, skills: { driving: 250, social: 700 } } };
    const carried = readCarried({ format: { major: 2, minor: 1 }, world });
    expect(carried.money).toBe(10000);
    expect(carried.ranks).toEqual({ driving: 1, social: 2 });
    expect(carried.xp).toBe(50 + 100);
    const rescued = carriedWorld(carried, KIT, () => TEST_MAP, fresh);
    expect(rescued.player.money).toBe(10000);
    expect(rescued.player.ranks.social).toBe(2);
  });

  it('renames the cab cores that format 2.2 replaced instead of losing them', () => {
    for (const retired of ['cabOver', 'cabRow', 'cabWide', 'cabNarrow']) {
      const part = { defId: retired, wear: 3, hp: 10, rebuilt: false };
      const save = { world: { player: { vehicleId: 'p', storage: [part] }, vehicles: [] } };
      expect(readCarried(save).storage).toEqual([{ ...part, defId: 'cabPickup' }]);
    }
  });

  it('turns a retired part and a retired good into their prices', () => {
    const save = currentSave() as unknown as { world: SavedWorld & { player: { storage: unknown[] } } };
    const truck = save.world.vehicles.find((v) => v.id === save.world.player.vehicleId)!;
    const before = truck.items.length;
    (truck.items as unknown[]).push({ kind: 'good', good: 'ghostGood', x: 0, y: 0, rot: 0 }, { kind: 'good', good: 'ghostGood', x: 1, y: 0, rot: 0 });
    save.world.player.storage.push({ defId: 'ghostPlate', wear: 1, hp: 5, rebuilt: false });
    const prices = { ghostPlate: 5000, ghostGood: 300 };
    const carried = readCarried(save, prices);
    expect(carried.refunded).toBe(5600);
    expect(carried.truck!.items).toHaveLength(before);
    expect(carried.storage).toEqual([]);
    expect(carried.money).toBe(4321);

    const world = carriedWorld(carried, KIT, () => TEST_MAP, fresh);
    expect(world.player.money).toBe(4321 + 5600);
  });

  it('refunds nothing for ids the table does not hold, and drops unknown ids', () => {
    const save = currentSave() as unknown as { world: SavedWorld & { player: { storage: unknown[] } } };
    save.world.player.storage.push({ defId: 'ghostPlate', wear: 0, hp: 0, rebuilt: false });
    const carried = readCarried(save);
    expect(carried.refunded).toBe(0);
    const world = carriedWorld(carried, KIT, () => TEST_MAP, fresh);
    expect(world.player.storage.map((p) => p.defId)).not.toContain('ghostPlate');
    expect(world.player.money).toBe(4321);
  });

  it('moves notes and quest variables that later steps renamed, and marks Hattie met', () => {
    const player = {
      notes: [{ id: 'wagonPin' }, { id: 'talkOnePin' }, { id: 'greenPit' }],
      quests: {
        world: { wagon_pin: 'sold', towed_to_bowl: true },
        local: { nose_lena: { asked_pins: true }, bowl_hattie: { hattie_sunward: true }, nose_kovac: { heard_gate_law: true, asked_gate_law: true } },
      },
    };
    const carried = readCarried({ format: { major: 2, minor: 50 }, world: { player } });
    expect(carried.notes).toEqual(['wagonRod', 'talkBrakeRod', 'greenPit']);
    expect(carried.quests.world).toEqual({ wagon_rod: 'sold', towed_to_bowl: true, hattie_met: true });
    expect(carried.quests.local).toEqual({ nose_lena: { asked_rods: true }, bowl_hattie: { hattie_glass: true }, nose_kovac: { heard_mounts: true, asked_mounts: true } });
    const current = readCarried({ format: { major: 2, minor: 89 }, world: { player } });
    expect(current.quests.world).toEqual({ wagon_pin: 'sold', towed_to_bowl: true });
  });

  it('keeps a variable that already holds its new name', () => {
    const player = { quests: { world: { wagon_pin: 'sold', wagon_rod: 'kept' }, local: {} } };
    expect(readCarried({ format: { major: 2, minor: 10 }, world: { player } }).quests.world).toEqual({ wagon_pin: 'sold', wagon_rod: 'kept' });
  });

  it('reads the first highway mode as Chaos Highway with the gear setting it lacked', () => {
    const setup = { mode: 'gauntlet', settings: { damage: 1.5, fuelUse: 1, supplyUse: 1 } };
    const carried = readCarried({ format: { major: 2, minor: 48 }, world: { setup, player: { money: 5 } } });
    expect(carried.setup).toEqual({ mode: 'furyRoad', settings: { enemyGearGrowth: 1, damage: 1.5, fuelUse: 1, supplyUse: 1 } });
    expect(repairSetup(carried.setup)).toEqual(carried.setup);
  });
});

describe('carriedSave', () => {
  it('returns the carried world and run id and writes nothing to any slot', () => {
    const slots = makeSlots();
    const save = currentSave();
    save.world.mapHash = 'other';
    slots.put('slot2', { ...save, runId: 'old-run' });
    const before = JSON.stringify(slots.get('slot2'));
    const carried = carriedSave(slots, 'slot2', TEST_MAP, KIT, fresh, freshRun)!;
    expect(carried.runId).toBe('old-run');
    expect(carried.world.player.money).toBe(4321);
    expect(JSON.stringify(slots.get('slot2'))).toBe(before);
    expect(slots.has('auto')).toBe(false);
  });

  it('names a run after the seed or makes a fresh run id, and gives null for an unreadable save', () => {
    const slots = makeSlots();
    expect(carriedSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun)).toBeNull();
    slots.put('auto', { world: { player: { money: 5 } } });
    expect(carriedSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun)!.runId).toBe('new-run');
    slots.put('auto', currentSave());
    expect(carriedSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun)!.runId).toBe('legacy-1337');
  });
});

describe('rescueSave', () => {
  it('turns a save that names the wrong kind of map into a world that then loads, in the same run', () => {
    const slots = makeSlots();
    const save = currentSave();
    save.world.mapHash = 'highway:0:21:0';
    slots.put('auto', { ...save, runId: 'old-run' });
    expect(() => loadWorld(slots, 'auto', TEST_MAP)).toThrow(/otherMap/);
    const rescued = rescueSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun, 1000)!;
    expect(townAt(rescued.world)).not.toBeNull();
    expect(rescued.world.player.money).toBe(4321);
    expect(rescued.runId).toBe('old-run');
    expect(savedRunId(slots.get('auto'))).toBe('old-run');
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded.player.xp).toBe(150);
    expect(loaded.player.ranks.driving).toBe(2);
    expect(playerVehicle(loaded).chassisId).toBe(KIT.chassis);
  });

  it('reads and writes the slot it is given', () => {
    const slots = makeSlots();
    slots.put('slot2', currentSave());
    const rescued = rescueSave(slots, 'slot2', TEST_MAP, KIT, fresh, freshRun, 1234)!;
    expect((slots.get('slot2') as { savedAt: number }).savedAt).toBe(1234);
    expect(loadWorld(slots, 'slot2', TEST_MAP)!.player.money).toBe(rescued.world.player.money);
    expect(slots.has('auto')).toBe(false);
  });

  it('carries valid world settings over to the new world and its save', () => {
    const slots = makeSlots();
    const save = currentSave() as ReturnType<typeof currentSave> & { world: { setup: unknown } };
    save.world.mapHash = 'other';
    save.world.setup = { mode: 'roaming', settings: { damage: 1.5, fuelUse: 2, supplyUse: 0.75, enemyGearGrowth: 1 } };
    slots.put('auto', save);
    rescueSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun, 1000);

    expect(loadWorld(slots, 'auto', TEST_MAP)!.setup).toEqual(save.world.setup);
  });

  it('resets bad world settings to their defaults and keeps the good ones', () => {
    const slots = makeSlots();
    const save = currentSave() as ReturnType<typeof currentSave> & { world: { setup: unknown } };
    save.world.setup = { mode: 'roaming', settings: { damage: null, fuelUse: 1.5, supplyUse: 40, enemyGearGrowth: 1 } };
    slots.put('auto', save);
    rescueSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun, 1000);

    expect(loadWorld(slots, 'auto', TEST_MAP)!.setup.settings).toEqual({ damage: 1, fuelUse: 1.5, supplyUse: 1, enemyGearGrowth: 1 });
  });

  it('gives a save from before world settings the default Roaming setup', () => {
    const slots = makeSlots();
    slots.put('auto', { format: { major: 2, minor: 1 }, world: FORMAT_2_1 });
    const rescued = rescueSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun, 1000)!;

    expect(rescued.world.setup).toEqual(defaultSetup('roaming'));
  });

  it('drops quest state this version does not know, resets a quest whose variables no longer fit, and closes any open quest', () => {
    const slots = makeSlots();
    const save = currentSave() as unknown as { format: unknown; world: SavedWorld & { player: { quests: unknown } } };
    save.world.mapHash = 'old-map';
    save.world.player.quests = {
      world: { retired_flag: true },
      local: { bowl_hattie: { paid: 'yes' }, gone_quest: { n: 1 } },
      session: { quest: 'bowl_hattie', checkpoint: 'start.hub', seed: 3 },
    };
    slots.put('auto', save);
    const rescued = rescueSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun, 2000);
    expect(rescued?.world.player.quests).toEqual({ world: {}, local: {}, session: null, live: null });
    expect(loadWorld(slots, 'auto', TEST_MAP)?.player.quests.session).toBeNull();
  });

  it('carries the notes and outcomes of a fitting chain and drops those of a quest the game raised past the save', () => {
    const slots = makeSlots();
    const save = currentSave() as unknown as { quests: Record<string, number>; world: SavedWorld & { player: { quests: unknown; notes: unknown } } };
    save.world.mapHash = 'old-map';
    save.world.player.quests = { world: { pipe_fate: 'sold', depot_thief: 'vance' }, local: { pump_pipe: { taken: true } }, session: null };
    save.world.player.notes = [{ id: 'pipeOffer', turn: 40 }, { id: 'burntConvoy', turn: 41 }, { id: 'retiredNote', turn: 42 }];
    save.quests = { ...save.quests, pump_pipe: 0 };
    slots.put('auto', save);
    const rescued = rescueSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun, 2000)!;

    expect(rescued.world.player.quests.world).toEqual({ depot_thief: 'vance' });
    expect(rescued.world.player.quests.local).toEqual({});
    expect(rescued.world.player.notes).toEqual([{ id: 'burntConvoy', turn: rescued.world.turn }]);
  });

  it('gives nothing for an unparsable or non-object save', () => {
    const slots = makeSlots();
    expect(rescueSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun, 1000)).toBeNull();
    slots.put('auto', '{"nope');
    expect(rescueSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun, 1000)).toBeNull();
    slots.put('auto', [1]);
    expect(rescueSave(slots, 'auto', TEST_MAP, KIT, fresh, freshRun, 1000)).toBeNull();
  });
});

const ANCHOR_DIR = join(__dirname, 'save-fixtures/anchors');

describe('readCarried on every shipped save', () => {
  it.each(readdirSync(ANCHOR_DIR))('reads the progression of %s as the release steps carried it', (file) => {
    const { money, xp, ranks, xpBySource, perks, knockouts, fuel, supplies, costBasis, notes, quests, run, revisions } = readCarried(JSON.parse(readFileSync(join(ANCHOR_DIR, file), 'utf8')));
    const progression = { money, xp, ranks, xpBySource: Object.fromEntries(Object.entries(xpBySource).filter(([, n]) => n !== 0)), perks, knockouts, fuel, supplies, costBasis, notes, quests, run, revisions };
    expect(progression).toEqual(ANCHORS_CARRIED[file as keyof typeof ANCHORS_CARRIED]);
  });

  it.each(readdirSync(ANCHOR_DIR))('loads %s or carries it on load, never through the save screen', (file) => {
    const slots = makeSlots();
    slots.put('auto', JSON.parse(readFileSync(join(ANCHOR_DIR, file), 'utf8')));
    try {
      loadWorld(slots, 'auto', TEST_MAP);
    } catch (error) {
      expect(error).toBeInstanceOf(SaveError);
      expect(carriesOnLoad(error as SaveError), String(error)).toBe(true);
    }
  });
});

const reachable = readdirSync(ANCHOR_DIR).filter((file) => file.endsWith('-roaming.json') && stepsFrom(Number(file.split('-')[1])) !== null);

describe('a shipped save on an older bake of the map', () => {
  it('has anchors to load', () => {
    expect(reachable).toContain('2-63-roaming.json');
  });

  it.each(reachable)('loads %s onto the current map with its place and progress kept', (file) => {
    const envelope = JSON.parse(readFileSync(join(ANCHOR_DIR, file), 'utf8')) as { format: { minor: number }; world: World & { vehicles: { id: string; pos: Vec }[] } };
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', envelope);
    const saved = envelope.world;
    const world = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(world.size).toBe(TEST_MAP.terrain.size);
    expect(world.mapHash).toBe(TEST_MAP.hash);
    expect(world.player.explored).toHaveLength(world.size ** 2);
    expect(world.events).toEqual([]);

    const me = playerVehicle(world);
    const radius = chassisDef(me.chassisId).radius;
    const oldPos = saved.vehicles.find((v) => v.id === saved.player.vehicleId)!.pos;
    const ratio = world.size / saved.size;
    const target = { x: oldPos.x * ratio, y: oldPos.y * ratio };
    expect(isFree(world, me.pos, radius, me.id)).toBe(true);
    if (isFree(world, target, radius, me.id)) expect(me.pos).toEqual(target);
    else expect(dist(me.pos, target)).toBeLessThanOrEqual(CHEATS.searchRings * CHEATS.searchStep);
    for (const v of world.vehicles) expect(isFree(world, v.pos, chassisDef(v.chassisId).radius, v.id), v.id).toBe(true);

    const carried = readCarried(envelope);
    expect(world.player.money).toBe(carried.money);
    expect(world.player.xp).toBe(carried.xp);
    const known = new Set([...REGION.towns, ...REGION.locations].map((site) => site.id));
    expect(world.player.discovered).toEqual(expect.arrayContaining(carried.discovered.filter((id) => known.has(id))));
    const held = (parts: { defId: string }[], items: { kind: string; part?: { defId: string } }[]) => [...parts.map((p) => p.defId), ...items.flatMap((it) => (it.part ? [it.part.defId] : []))].sort();
    expect(held(world.player.storage, me.items)).toEqual(held(carried.storage, carried.truck!.items));

    const stocks = new Set(world.salvage.map((s) => s.id));
    const sites = new Set(surveySites(TEST_MAP).map((s) => s.id));
    const contracts = [...world.player.contracts, ...Object.values(world.shops).flatMap((s) => s.contracts)];
    for (const c of contracts) {
      if (c.kind === 'claim') expect(stocks.has(c.stockId), c.id).toBe(true);
      if (c.kind === 'survey') expect(c.points.every((p) => sites.has(p.site)), c.id).toBe(true);
    }
    const kept = new Set(world.player.contracts.map((c) => c.id));
    expect(saved.player.contracts.filter((c) => !kept.has(c.id) && c.kind !== 'claim')).toEqual([]);
    for (const id of [...world.player.scavenged, ...world.player.rumored].filter((x) => /^(wreck|old-|story-)/.test(x))) expect(stocks.has(id), id).toBe(true);
  }, 60_000);

  it.each(reachable)('plays 20 turns of %s without a throw or a stall', (file) => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', JSON.parse(readFileSync(join(ANCHOR_DIR, file), 'utf8')));
    let w = loadWorld(slots, 'auto', TEST_MAP)!;
    const start = w.turn;
    for (let i = 0; i < 20; i++) {
      w = endTurn(w.player.call ? hangUp(w) : w, (d) => d.vehicles.forEach((v) => v.brain && advanceFar(d, v)));
      expect(w.events.filter((e) => e.t === 'stall')).toEqual([]);
    }
    expect(w.turn).toBe(start + 20);
    expect(savedMisfit(saveOf(w).world)).toBeNull();
  }, 120_000);

  it('loads a shipped save after a rebake and a removed chassis together', () => {
    const envelope = JSON.parse(readFileSync(join(ANCHOR_DIR, '2-63-roaming.json'), 'utf8')) as { world: { player: { vehicleId: string }; vehicles: { id: string; chassisId: string }[] } };
    for (const v of envelope.world.vehicles) v.chassisId = 'ghostChassis';
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', envelope);

    const world = loadWorld(slots, 'auto', TEST_MAP)!;

    const me = playerVehicle(world);
    expect(me.chassisId).toBe(START_KITS.standard.chassis);
    expect(isFree(world, me.pos, chassisDef(me.chassisId).radius, me.id)).toBe(true);
    expect(() => endTurn(world, () => {})).not.toThrow();
  }, 60_000);
});

describe('namedSteps', () => {
  const mark = (name: string): NamedStep => ({ name, step: (world) => ({ ...world, trail: [...((world.trail as string[] | undefined) ?? []), name] }) });
  const ran = (steps: readonly ((world: SavedJson) => SavedJson)[]): unknown => steps.reduce<SavedJson>((world, step) => step(world), { trail: [] }).trail;
  const release = (names: readonly string[] | null): ReleaseStep => ({ from: 63, to: 65, names, step: (world) => ({ ...world, trail: ['release'] }) });

  it('runs only the tiny steps a branch save lacks, in code order', () => {
    const tiny = [mark('a'), mark('crimes'), mark('oddFronts')];
    expect(ran(namedSteps([], 63, tiny, { from: 63, names: ['a', 'oddFronts'] }))).toEqual(['crimes']);
    expect(ran(namedSteps([], 63, tiny, { from: 63, names: [] }))).toEqual(['a', 'crimes', 'oddFronts']);
    expect(ran(namedSteps([], 63, tiny, { from: 63, names: ['a', 'crimes', 'oddFronts'] }))).toEqual([]);
  });

  it('gives a save of the accessory-layer history only the crimes step it skipped', () => {
    const names = TINY_STEPS.map((named) => named.name).filter((name) => name !== 'withCrimes');
    const crimes = TINY_STEPS.find((named) => named.name === 'withCrimes')!.step;
    expect(namedSteps(RELEASE_STEPS, TINY_FROM, TINY_STEPS, { from: TINY_FROM, names })).toEqual([crimes]);
  });

  it('refuses a name the build does not know and runs nothing', () => {
    const tiny = [mark('a'), mark('crimes')];
    const refused = () => namedSteps([], 63, tiny, { from: 63, names: ['a', 'oddFronts'] });
    expect(refused).toThrow(SaveError);
    expect(refused).toThrow(/unknownStep/);
  });

  it('flags an unknown step as carried on load', () => {
    expect(carriesOnLoad(new SaveError('unknownStep'))).toBe(true);
  });

  describe('after a fold', () => {
    const releases = [release(['a', 'b'])];
    const tiny = [mark('c')];
    const named = (from: number, names: string[]) => namedSteps(releases, 65, tiny, { from, names });

    it('skips the release step a save already holds', () => {
      expect(ran(named(63, ['a', 'b', 'c']))).toEqual([]);
      expect(ran(named(63, ['a', 'b']))).toEqual(['c']);
    });

    it('runs the release step for a save at its anchor', () => {
      expect(ran(named(63, []))).toEqual(['release', 'c']);
    });

    it('refuses a list that holds only part of the release step', () => {
      expect(() => named(63, ['a'])).toThrow(/unknownStep/);
      expect(() => named(63, ['b', 'a'])).toThrow(/unknownStep/);
    });

    it('refuses an anchor no release step starts at and a release step with no names', () => {
      expect(() => named(64, [])).toThrow(/unknownStep/);
      expect(() => namedSteps([release(null)], 65, tiny, { from: 63, names: ['a', 'b'] })).toThrow(/unknownStep/);
    });
  });

  it('writes the names of every tiny step into the save and loads it without running one', () => {
    const world = newWorld(1337, KIT, TEST_MAP, defaultSetup('roaming'));
    const envelope = JSON.parse(JSON.stringify(saveOf(world)));
    expect(envelope.steps).toEqual({ from: TINY_FROM, names: TINY_STEPS.map((named) => named.name) });
    const slots = makeSlots();
    slots.put('auto', { ...envelope, savedAt: 1, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(JSON.stringify(saveOf(loaded).world)).toBe(JSON.stringify(saveOf(world).world));
  });

  it('puts an unknown step of a stored save on the carry path, and a malformed list on noFormat', () => {
    const world = newWorld(1337, KIT, TEST_MAP, defaultSetup('roaming'));
    const stored = (steps: unknown) => {
      const slots = makeSlots();
      slots.put('auto', { ...JSON.parse(JSON.stringify(saveOf(world))), steps, savedAt: 1, runId: 'run-1' });
      return () => loadWorld(slots, 'auto', TEST_MAP);
    };
    expect(stored({ from: TINY_FROM, names: ['withStepNoBuildHas'] })).toThrow(/unknownStep/);
    expect(stored({ from: TINY_FROM, names: 'withCrimes' })).toThrow(/noFormat/);
    expect(stored({ from: 1.5, names: [] })).toThrow(/noFormat/);
    expect(stored([])).toThrow(/noFormat/);
  });
});
