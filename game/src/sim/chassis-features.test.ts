import { describe, expect, it } from 'vitest';
import { CHASSIS, CHASSIS_FEATURES, PLAYER_CHASSIS, type ChassisFeatureId } from '../data/chassis';
import { PARTS, partDef } from '../data/parts';
import { REGION } from '../data/region';
import { TOW } from '../data/tow';
import { RULES } from '../data/rules';
import { getResources } from './resources';
import { soundRange } from './detect';
import { corePart, coreParts, gridOf, mountedParts, cargoRowsOn, cargoCellsGained } from './grid';
import { makePart } from './factory';
import { mountPart } from './inventory';
import { repairPlan } from './repair';
import { groundSpeed, vehicleStats } from './stats';
import { addState } from './states';
import { spillDeadRows } from './spill';
import { addVehicle, editableTerrain, emptyWorld } from './testkit';
import { tileAt } from './terrain';
import type { Vehicle, World } from './types';
import { applyWear, maxHp } from './wear';
import { REPAIR } from '../data/wear';
import { addGoods } from './inventory';

function withFeature<T>(chassisId: string, feature: ChassisFeatureId | null, run: () => T): T {
  const def = CHASSIS[chassisId];
  const original = def.feature;
  def.feature = feature;
  try {
    return run();
  } finally {
    def.feature = original;
  }
}

const cargoIds = Object.values(PARTS).filter((p) => p.kind === 'cargo').map((p) => p.id);
const bedChassis = PLAYER_CHASSIS.filter((id) => CHASSIS[id].feature === 'cargoBed');

function npcAndPlayer(chassisId: string): { w: World; vehicles: Vehicle[] } {
  const w = emptyWorld();
  const npc = addVehicle(w, 'independent', chassisId, ['stockEngine'], { x: 50, y: 50 });
  const player = addVehicle(w, 'player', chassisId, ['stockEngine'], { x: 60, y: 50 });
  w.player.vehicleId = player.id;
  for (const v of [npc, player]) getResources(w, v).fuel = 10;
  return { w, vehicles: [npc, player] };
}

describe('junk-built', () => {
  it.each(['scout', 'wagon'])('patches the wheel, transmission and tank of a %s to full, the cab to the field cap', (chassisId) => {
    const { w, vehicles } = npcAndPlayer(chassisId);
    for (const v of vehicles) {
      addGoods(w, v, 'parts', 99);
      for (const role of CHASSIS_FEATURES.junkBuilt.fullPatchRoles) {
        const part = coreParts(v, role as 'wheel')[0];
        part.hp = 1;
        expect(repairPlan(w, v, part.id).hp, `${role} on ${v.id}`).toBeCloseTo(maxHp(part) - 1, 5);
      }
      const cab = corePart(v, 'cab');
      cab.hp = 1;
      expect(repairPlan(w, v, cab.id).hp).toBeCloseTo(maxHp(cab) * REPAIR.fieldCapShare - 1, 5);
    }
  });

  it('leaves a jeep wheel at the field cap', () => {
    const { w, vehicles } = npcAndPlayer('jeep');
    for (const v of vehicles) {
      addGoods(w, v, 'parts', 99);
      const wheel = coreParts(v, 'wheel')[0];
      wheel.hp = 1;
      expect(repairPlan(w, v, wheel.id).hp).toBeCloseTo(maxHp(wheel) * REPAIR.fieldCapShare - 1, 5);
    }
  });
});

describe('light frame', () => {
  function lossOn(chassisId: string, feature: ChassisFeatureId | null, ground: 'sand' | 'road'): { loss: number; rng: number } {
    return withFeature(chassisId, feature, () => {
      let loss = 0;
      let rng = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const w = emptyWorld();
        w.rngState = seed;
        const v = addVehicle(w, 'independent', chassisId, ['stockEngine'], { x: 50, y: 50 });
        v.trail = [{ x: 50, y: 50, heading: 0 }, { x: 56, y: 50, heading: 0 }];
        v.speed = 6;
        editableTerrain(w).types[tileAt(w.terrain, { x: 53, y: 50 })] = ground;
        const before = mountedParts(v).reduce((a, p) => a + p.hp, 0);
        applyWear(w);
        loss += before - mountedParts(v).reduce((a, p) => a + p.hp, 0);
        rng += w.rngState;
      }
      return { loss, rng };
    });
  }

  it.each(['buggy', 'convertible'])('wears a %s less on sand and the same on road', (chassisId) => {
    expect(lossOn(chassisId, 'lightFrame', 'sand').loss).toBeLessThan(lossOn(chassisId, null, 'sand').loss);
    expect(lossOn(chassisId, 'lightFrame', 'road')).toEqual(lossOn(chassisId, null, 'road'));
  });

  it('draws the same random rolls with and without the feature', () => {
    const w1 = emptyWorld();
    const w2 = emptyWorld();
    const run = (w: World, feature: ChassisFeatureId | null) =>
      withFeature('buggy', feature, () => {
        const v = addVehicle(w, 'independent', 'buggy', ['stockEngine'], { x: 50, y: 50 });
        v.trail = [{ x: 50, y: 50, heading: 0 }, { x: 50.01, y: 50, heading: 0 }];
        v.speed = 0.01;
        applyWear(w);
        return w.rngState;
      });
    expect(run(w1, 'lightFrame')).toBe(run(w2, null));
  });
});

describe('quiet engine', () => {
  it.each(['courier', 'lincoln'])('lets a %s be heard from two thirds as far as the same truck without it', (chassisId) => {
    const { w, vehicles } = npcAndPlayer(chassisId);
    for (const v of vehicles) {
      v.speed = RULES.limpSpeed + 2;
      const quiet = soundRange(w, v);
      const loud = withFeature(chassisId, null, () => soundRange(w, v));
      expect(quiet).toBeCloseTo(loud * CHASSIS_FEATURES.quietEngine.soundShare, 6);
      expect(quiet).toBeGreaterThan(0);
    }
  });
});

describe('off-road drive', () => {
  it('stacks with the driving skill by multiplying the losses', () => {
    const { w, vehicles } = npcAndPlayer('jeep');
    for (const v of vehicles) {
      const s = vehicleStats(w, v);
      expect(s.roughCut).toBe(CHASSIS_FEATURES.offRoad.roughCut);
      expect(groundSpeed(s, 0.6)).toBeCloseTo(1 - 0.4 * (1 - s.roughSkill) * 0.5, 9);
      expect(groundSpeed({ ...s, roughSkill: 0.2 }, 0.6)).toBeCloseTo(1 - 0.4 * 0.8 * 0.5, 9);
    }
    const { w: w2, vehicles: others } = npcAndPlayer('scout');
    expect(groundSpeed(vehicleStats(w2, others[0]), 0.6)).toBeCloseTo(0.6, 9);
  });
});

describe('heavy hitch', () => {
  function towingTop(chassisId: string): { plain: number; towing: number; steps: string[] } {
    const w = emptyWorld();
    const tower = addVehicle(w, 'independent', chassisId, ['stockEngine'], { x: 50, y: 50 });
    const other = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 52, y: 50 });
    const plain = vehicleStats(w, tower).maxSpeed;
    addState(w, 'tow', tower.id, other.id, { kind: 'tow', site: REGION.towns[0].id, fee: 0, waived: 0, hitched: true });
    return { plain, towing: vehicleStats(w, tower).maxSpeed, steps: [] };
  }

  it.each(['tractor', 'loader', 'carrier'])('keeps the full top speed of a towing %s', (chassisId) => {
    const r = towingTop(chassisId);
    expect(r.towing).toBe(r.plain);
  });

  it('still slows a towing scout by the tow share', () => {
    const r = towingTop('scout');
    expect(r.towing).toBeCloseTo(r.plain * TOW.speedShare);
  });
});

describe('cargo bed', () => {
  it('adds a row to a frame and none to panniers', () => {
    expect(cargoRowsOn('van', 'lightFrame')).toBe(partDef('lightFrame').kind === 'cargo' ? (partDef('lightFrame') as { extraRows: number }).extraRows + 1 : 0);
    expect(cargoRowsOn('scout', 'lightFrame')).toBe(5);
    expect(cargoRowsOn('van', 'panniers')).toBe(1);
    expect(cargoRowsOn('scout', 'panniers')).toBe(1);
  });

  it('throws on a part that is not cargo', () => {
    expect(() => cargoRowsOn('van', 'mg')).toThrow();
  });

  it('grows a working van grid by six rows and the same frame on a truck without the bed by five', () => {
    const w = emptyWorld();
    const van = addVehicle(w, 'independent', 'van', [], { x: 50, y: 50 });
    const baseVan = gridOf(van).h;
    expect(mountPart(w, van, makePart(w, 'lightFrame', 0))).toBe(true);
    expect(gridOf(van).h - baseVan).toBe(6);
    withFeature('hauler', null, () => {
      const hauler = addVehicle(w, 'independent', 'hauler', [], { x: 55, y: 50 });
      const base = gridOf(hauler).h;
      expect(mountPart(w, hauler, makePart(w, 'lightFrame', 0))).toBe(true);
      expect(gridOf(hauler).h - base).toBe(5);
    });
  });

  it('makes six dead rows of a broken frame and spills goods off all of them', () => {
    const w = emptyWorld();
    const van = addVehicle(w, 'independent', 'van', [], { x: 50, y: 50 });
    mountPart(w, van, makePart(w, 'lightFrame', 0));
    const frame = mountedParts(van, 'cargo')[0];
    const g = gridOf(van);
    addGoods(w, van, 'scrap', g.w * 6);
    frame.hp = 0;
    const dead = gridOf(van);
    expect(dead.h - dead.deadFrom).toBe(6);
    spillDeadRows(w);
    const lastRow = dead.h - 1;
    expect(van.items.some((it) => it.kind !== 'part' && it.y >= dead.deadFrom && lastRow >= it.y)).toBe(false);
  });

  it.each(bedChassis)('keeps the shop card honest on a %s', (chassisId) => {
    for (const defId of cargoIds) {
      const w = emptyWorld();
      const v = addVehicle(w, 'independent', chassisId, [], { x: 50, y: 50 });
      const before = gridOf(v).h;
      if (!mountPart(w, v, makePart(w, defId, 0))) continue;
      expect(gridOf(v).h - before, defId).toBe(cargoRowsOn(chassisId, defId));
      expect(cargoCellsGained(chassisId, defId)).toBe(cargoRowsOn(chassisId, defId) * gridOf(v).w - partDef(defId).w * partDef(defId).h);
    }
  });

  it.each(bedChassis)('still lets a frame beat small carriers on the same four cells on a %s', (chassisId) => {
    const small = cargoIds.filter((id) => partDef(id).w * partDef(id).h < CHASSIS_FEATURES.cargoBed.minCells);
    const bestSmall = Math.max(...small.map((id) => cargoRowsOn(chassisId, id) / (partDef(id).w * partDef(id).h)));
    for (const id of cargoIds.filter((c) => partDef(c).w * partDef(c).h === 4 && (partDef(c) as { extraRows: number }).extraRows >= 5)) {
      expect(cargoRowsOn(chassisId, id)).toBeGreaterThan(bestSmall * 4);
    }
  });
});
