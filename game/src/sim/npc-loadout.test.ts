import { describe, expect, it, onTestFinished } from 'vitest';
import { NPC_UTILITY_PARTS } from '../data/npc-utilities';
import { CHASSIS } from '../data/chassis';
import { GEAR_LEVELS, GEAR_SCORE, NPCS, type GearLevel, type NpcTemplate, type Weighted } from '../data/npcs';
import { partDef, type UtilityDef, type WeaponDef } from '../data/parts';
import { openArcShares } from './armor';
import { makeVehicle } from './factory';
import { fuelCap } from './stats';
import { goodsCount, gridOf, isMounted, mountedParts, placementError } from './grid';
import { itemMass, vehicleMass } from './mass';
import { generateNpcLoadout } from './npc-loadout';
import { cargoRoom, removeGoods } from './inventory';
import { CRATE_MASS } from '../data/goods';
import { emptyWorld, npcBrain } from './testkit';
import { fallbackFaction } from './spawn';
import { budget } from '../test/budget';
import { describeLoadout, fixture, gearCost, loadoutOf, useLoadoutFixture } from './npc-loadout-kit';

useLoadoutFixture();

describe('NPC equipment generation', () => {
  it.each(Object.values(NPCS))('fits $id equipment and cargo within its gear money and rated mass', (template) => {
    for (let seed = 1; seed <= 8; seed++) {
      const world = { ...fixture, rngState: seed };
      const loadout = loadoutOf(world, template);
      const v = makeVehicle(world, { ...loadout, faction: fallbackFaction(template), brain: null, pos: { x: 50, y: 50 }, heading: 0 });
      expect(mountedParts(v, 'engine')).toHaveLength(1);
      for (const item of v.items) expect(placementError(gridOf(v), v.items, item, item.id)).toBeNull();
      const loose = v.items.filter((item) => item.kind === 'part' && !isMounted(v.chassisId, item));
      expect(loose).toHaveLength(loadout.spares.length);
      expect(goodsCount(v)).toEqual(loadout.cargo);
      expect(vehicleMass(v)).toBeLessThanOrEqual(CHASSIS[v.chassisId].ratedMass);
      expect(gearCost(loadout.parts)).toBeLessThanOrEqual(GEAR_LEVELS[loadout.level].money);
      expect(v.resources?.money).toBe(fixture.player.money);
      expect(v.resources?.fuel).toBe(fuelCap(v));
    }
  });

  it('loads a trader with crates of one mass, within its rated mass', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const world = { ...fixture, rngState: seed };
      const loadout = loadoutOf(world, NPCS.trader);
      const v = makeVehicle(world, { ...loadout, faction: fallbackFaction(NPCS.trader), brain: null, pos: { x: 50, y: 50 }, heading: 0 });
      const crates = Object.values(loadout.cargo).reduce((sum, n) => sum + n, 0);
      expect(crates).toBeGreaterThan(0);
      const goodsMass = v.items.filter((it) => it.kind === 'good').reduce((sum, it) => sum + itemMass(it), 0);
      expect(goodsMass).toBe(crates * CRATE_MASS);
      expect(vehicleMass(v)).toBeLessThanOrEqual(CHASSIS[v.chassisId].ratedMass);
    }
  });

  it.each(['tractor', 'hauler', 'bus'])('leaves a trader on a %s room for a crate once it sells its goods', (chassisId) => {
    for (let seed = 1; seed <= 12; seed++) {
      const world = { ...fixture, rngState: seed, marketRng: { rngState: seed * 7919 + 1 } };
      const loadout = loadoutOf(world, NPCS.trader, chassisId);
      const v = makeVehicle(world, { ...loadout, faction: fallbackFaction(NPCS.trader), brain: npcBrain('trader', { x: 50, y: 50 }, ['trader']), pos: { x: 50, y: 50 }, heading: 0 });
      for (const [good, n] of Object.entries(goodsCount(v))) if (good !== 'parts') removeGoods(v, good, n);
      expect(cargoRoom(v), `seed ${seed} ${loadout.level} ${describeLoadout(v)}`).toBeGreaterThan(0);
    }
  });

  it.each(Object.values(NPCS))('gives $id only guns that keep half their arc', (template) => {
    for (let seed = 1; seed <= 8; seed++) {
      const world = { ...fixture, rngState: seed };
      const loadout = loadoutOf(world, template);
      const v = makeVehicle(world, { ...loadout, faction: fallbackFaction(template), brain: null, pos: { x: 50, y: 50 }, heading: 0 });
      for (const share of openArcShares(v)) expect(share, describeLoadout(v)).toBeGreaterThanOrEqual(GEAR_SCORE.minOpenArcShare);
    }
  });

  it.each([
    ['unknown cargo', (t: NpcTemplate) => { t.loadout.goods = [{ value: { good: 'missing', count: 1 }, weight: 1 }]; }],
    ['wrong part kind', (t: NpcTemplate) => { t.loadout.cargoPart = [{ value: 'stockEngine', weight: 1 }]; }],
    ['negative count', (t: NpcTemplate) => { t.loadout.goods = [{ value: { good: 'scrap', count: -1 }, weight: 1 }]; }],
    ['empty chassis pool', (t: NpcTemplate) => { t.loadout.chassis = []; }],
    ['unknown chassis', (t: NpcTemplate) => { t.loadout.chassis = [{ value: 'missing', weight: 1 }]; }],
    ['invalid optional weight', (t: NpcTemplate) => { t.loadout.cargoPart = [{ value: null, weight: 0 }]; }],
    ['an unknown gear level', (t: NpcTemplate) => { t.loadout.levels = [{ value: 'shiny' as GearLevel, weight: 1 }]; }],
    ['no firepower or armor priority', (t: NpcTemplate) => { t.loadout.priorities = { ...t.loadout.priorities, firepower: 0, armor: 0 }; }],
    ['impossible optional part', (t: NpcTemplate) => { t.loadout.chassis = [{ value: 'tiny', weight: 1 }]; t.loadout.cargoPart = [{ value: 'heavyFrame', weight: 1 }]; }],
    ['impossible cargo', (t: NpcTemplate) => { t.loadout.goods = [{ value: { good: 'scrap', count: 1000 }, weight: 1 }]; }],
    ['a core part in the spare pool', (t: NpcTemplate) => { t.loadout.spares = { pool: [{ value: 'cab', weight: 1 }], count: [{ value: 1, weight: 1 }] }; }],
    ['a negative spare count', (t: NpcTemplate) => { t.loadout.spares = { pool: [{ value: null, weight: 1 }], count: [{ value: -1, weight: 1 }] }; }],
  ] as const)('fails loudly on %s without changing the input world', (_name, invalidate) => {
    const world = { ...fixture };
    const template = structuredClone(NPCS.buggy);
    invalidate(template);
    expect(() => generateNpcLoadout(world, template)).toThrow();
    expect(world).toEqual(fixture);
  });
});

describe('raider gear levels', () => {
  it('never roll the poor level', () => {
    for (const template of Object.values(NPCS).filter((t) => t.traits.includes('raider'))) {
      expect(template.loadout.levels.map((l) => l.value), template.id).not.toContain('poor');
    }
  });
});

function withUtilityPool(templateId: string, pool: Weighted<string | null>[]): void {
  const saved = NPC_UTILITY_PARTS[templateId];
  NPC_UTILITY_PARTS[templateId] = pool;
  onTestFinished(() => { NPC_UTILITY_PARTS[templateId] = saved; });
}

describe('NPC utility parts', () => {
  const utilitiesOf = (parts: { defId: string }[]) => parts.filter((p) => partDef(p.defId).kind === 'utility').map((p) => p.defId);

  it('rejects a utility pool that names a part of another kind', () => {
    withUtilityPool('merc', [{ value: 'mg', weight: 1 }, { value: null, weight: 1 }]);

    expect(() => generateNpcLoadout(emptyWorld(), NPCS.merc)).toThrow(/utility/);
  });

  it('rejects a template with no utility pool', () => {
    const template: NpcTemplate = { ...structuredClone(NPCS.merc), id: 'nobody' };

    expect(() => generateNpcLoadout(emptyWorld(), template)).toThrow(/no utility pool/);
  });

  it.each(Object.values(NPCS))('mounts at most one utility on $id, from its own pool', (template) => {
    const pool = NPC_UTILITY_PARTS[template.id].map((entry) => entry.value);
    for (let seed = 1; seed <= 8; seed++) {
      const utilities = utilitiesOf(loadoutOf({ ...fixture, rngState: seed }, template).parts);
      expect(utilities.length, `seed ${seed}`).toBeLessThanOrEqual(1);
      for (const id of utilities) expect(pool, `seed ${seed}`).toContain(id);
    }
  });

  it('mounts the utilities its pool offers over many rolls', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) for (const id of utilitiesOf(loadoutOf({ ...fixture, rngState: seed }, NPCS.scavenger).parts)) seen.add(id);

    expect([...seen].sort()).toEqual(['patcherCrane', 'scrapersKnife']);
  }, budget(120_000));

  it('puts a utility on most NPC trucks across templates', () => {
    const shares = Object.values(NPCS).map((template) => {
      let withUtility = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const parts = loadoutOf({ ...fixture, rngState: seed }, template).parts;
        if (parts.some((p) => (partDef(p.defId) as UtilityDef | WeaponDef).kind === 'utility' || (partDef(p.defId) as WeaponDef).line !== undefined)) withUtility++;
      }
      return withUtility / 8;
    });

    expect(shares.reduce((sum, share) => sum + share, 0) / shares.length).toBeGreaterThanOrEqual(0.5);
  }, budget(120_000));

  it('mounts the claymore ram on some gunwagons', () => {
    let rams = 0;
    for (let seed = 1; seed <= 80 && rams === 0; seed++) rams += loadoutOf({ ...fixture, rngState: seed }, NPCS.gunwagon).parts.filter((p) => p.defId === 'claymoreRam').length;

    expect(rams).toBeGreaterThan(0);
  }, budget(120_000));
});
