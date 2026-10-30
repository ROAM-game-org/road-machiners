import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { TEST_MAP } from '../test/map';
import { standardWorld } from '../test/world-cache';
import { townAt } from '../sim/sites';
import { carriedWorld } from '../sim/world';
import { carriesOnLoad, loadWorld, namedSteps, SaveError, saveOf, savedRunId } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { RELEASE_STEPS, TINY_FROM, TINY_STEPS, type NamedStep, type ReleaseStep, type SavedJson } from './save-migrations';
import { carriedSave, readCarried, rescueSave } from './save-rescue';
import FORMAT_2_120 from './save-fixtures/format-2-120.json';
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

let currentSaveJson: string | null = null;

function currentSave(): { format: unknown; world: SavedWorld } {
  if (currentSaveJson === null) {
    const world = standardWorld(1337);
    world.player.money = 4321;
    world.player.xp = 150;
    world.player.ranks.driving = 2;
    currentSaveJson = JSON.stringify(saveOf(world));
  }
  return JSON.parse(currentSaveJson);
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

  it('carries Bounty talk over as Bounty hunter and no other perk change (IV8)', () => {
    const world = { ...FORMAT_2_9, player: { ...FORMAT_2_9.player, perks: ['welder', 'bountyTalk'] } };
    expect(readCarried({ world }).perks).toEqual(['welder', 'bountyHunter']);
  });

  it('reads old formats and a fake major format', () => {
    for (const world of [FORMAT_2_0, FORMAT_2_1]) {
      const carried = readCarried({ format: { major: 2, minor: 0 }, world });
      expect(carried.money).toBe(Math.ceil(world.player.money / 3 - 1e-9));
    }
    expect(readCarried({ format: { major: 99, minor: 0 }, world: FORMAT_2_1 }).money).toBe(FORMAT_2_1.player.money);
  });

  it('turns money and cost basis from before format 2.30 into whole M, as the 29 to 30 step does', () => {
    const world = { player: { money: 1000, costBasis: { scrap: 10.5 } } };
    for (const format of [undefined, { major: 1, minor: 20 }, { major: 2, minor: 29 }]) {
      const carried = readCarried({ format, world });
      expect(carried.money, JSON.stringify(format)).toBe(334);
      expect(carried.costBasis.scrap, JSON.stringify(format)).toBeCloseTo(3.5);
    }
    const current = readCarried({ format: { major: 2, minor: 30 }, world });
    expect(current.money).toBe(10);
    expect(current.costBasis).toEqual({ scrap: 0.105 });
  });

  it('reads cents up to format 2.123 and whole M from 2.124', () => {
    const world = { player: { money: 1050, costBasis: { scrap: 150 } } };
    const cents = readCarried({ format: { major: 2, minor: 123 }, world });
    expect(cents.money).toBe(11);
    expect(cents.costBasis).toEqual({ scrap: 1.5 });
    const whole = readCarried({ format: { major: 2, minor: 124 }, world: { player: { money: 11, costBasis: { scrap: 1.5 } } } });
    expect(whole.money).toBe(11);
    expect(whole.costBasis).toEqual({ scrap: 1.5 });
  });

  it('reads garbage without throwing and keeps what is valid', () => {
    const junk = [null, undefined, [], 'x', 5, {}, { world: [] }, { world: { player: 'x' } }, { world: { player: { money: 'rich', skills: [], perks: [1, 'rebuild'], storage: [3] } } }];
    for (const raw of junk) expect(() => readCarried(raw)).not.toThrow();
    expect(readCarried(junk[8]).perks).toEqual(['rebuild']);
    expect(readCarried(junk[8]).money).toBeNull();
    expect(readCarried(junk[3]).truck).toBeNull();
  });

  it('moves the rows of a truck from before format 2.128 onto the outside armor rows, and leaves a newer truck alone', () => {
    const rows = (minor: number) => readCarried({ format: { major: 2, minor }, world: FORMAT_2_120 }).truck!.items.map((it) => it.y);
    expect(rows(127)).toEqual([0, 3, 9, 1, 1, 4, 6, 8]);
    expect(rows(128)).toEqual([0, 2, 7, 0, 0, 3, 5, 7]);
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

  it('carries money in whole M and pooled skills from a trimmed 2.1 save', () => {
    const world = { ...FORMAT_2_1, player: { ...FORMAT_2_1.player, money: 300, skills: { driving: 250, social: 700 } } };
    const carried = readCarried({ format: { major: 2, minor: 1 }, world });
    expect(carried.money).toBe(100);
    expect(carried.ranks).toEqual({ driving: 1, social: 2 });
    expect(carried.xp).toBe(50 + 100);
    const rescued = carriedWorld(carried, KIT, () => TEST_MAP, fresh);
    expect(rescued.player.money).toBe(100);
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
    expect(carried.setup).toEqual({ mode: 'chaosHighway', settings: { enemyGearGrowth: 1, damage: 1.5, fuelUse: 1, supplyUse: 1 } });
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
    expect(rescued?.world.player.quests).toEqual({ world: {}, local: {}, seen: {}, session: null, live: null });
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

    it('runs the release step for a save at its anchor, with or without folded names', () => {
      expect(ran(named(63, []))).toEqual(['release', 'c']);
      expect(ran(namedSteps([release(null)], 65, tiny, { from: 63, names: [] }))).toEqual(['release', 'c']);
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
    const world = standardWorld(1337);
    const envelope = JSON.parse(JSON.stringify(saveOf(world)));
    expect(envelope.steps).toEqual({ from: TINY_FROM, names: TINY_STEPS.map((named) => named.name) });
    const slots = makeSlots();
    slots.put('auto', { ...envelope, savedAt: 1, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(JSON.stringify(saveOf(loaded).world)).toBe(JSON.stringify(saveOf(world).world));
  });

  it('refuses a named save whose minor format is not its list start plus its names', () => {
    const world = standardWorld(1337);
    const minor = TINY_FROM + TINY_STEPS.length;
    const stored = (value: number) => {
      const slots = makeSlots();
      const envelope = JSON.parse(JSON.stringify(saveOf(world)));
      slots.put('auto', { ...envelope, format: { ...envelope.format, minor: value }, savedAt: 1, runId: 'run-1' });
      return () => loadWorld(slots, 'auto', TEST_MAP);
    };
    expect(stored(minor - 1)).toThrow(/noFormat/);
    expect(stored(minor + 1)).toThrow(/noFormat/);
    expect(stored(minor)).not.toThrow();
  });

  it('puts an unknown step of a stored save on the carry path, and a malformed list on noFormat', () => {
    const world = standardWorld(1337);
    const stored = (steps: unknown, minor = TINY_FROM + 1) => {
      const slots = makeSlots();
      const envelope = JSON.parse(JSON.stringify(saveOf(world)));
      slots.put('auto', { ...envelope, format: { ...envelope.format, minor }, steps, savedAt: 1, runId: 'run-1' });
      return () => loadWorld(slots, 'auto', TEST_MAP);
    };
    expect(stored({ from: TINY_FROM, names: ['withStepNoBuildHas'] })).toThrow(/unknownStep/);
    expect(stored({ from: TINY_FROM, names: 'withCrimes' })).toThrow(/noFormat/);
    expect(stored({ from: 1.5, names: [] })).toThrow(/noFormat/);
    expect(stored([])).toThrow(/noFormat/);
  });
});
