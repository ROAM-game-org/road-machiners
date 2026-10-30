import { describe, expect, it } from 'vitest';
import { CHASSIS_FEATURES, type ChassisAbility } from '../data/chassis';
import { partDef } from '../data/parts';
import { REGION } from '../data/region';
import { TOW } from '../data/tow';
import { RULES } from '../data/rules';
import { getResources } from './resources';
import { armorOn, planLane, type Round } from './armor';
import { accelFactor, chassisAbility, chassisTopSpeed, topSpeedFactor } from './chassis-features';
import { chanceSteps } from './combat';
import { mountedItems, mountedParts } from './grid';
import { loadFactor, loadMass, vehicleMass } from './mass';
import { groundSpeed, gunCapacity, gunDrag, maxSpeedSteps, vehicleStats, weaponOn } from './stats';
import { sightRadius } from './vision';
import { addVehicle, editableTerrain, emptyWorld } from './testkit';
import { addState } from './states';
import { tileAt } from './terrain';
import type { Vehicle, World } from './types';
import { applyWear } from './wear';
import { setLoadoutMemo } from './loadout-memo';

function withAbility<T>(chassisId: string, patch: Partial<ChassisAbility> | null, run: () => T): T {
  const original = CHASSIS_FEATURES[chassisId];
  CHASSIS_FEATURES[chassisId] = patch === null ? { id: original.id } : { ...original, ...patch };
  setLoadoutMemo(false);
  try {
    return run();
  } finally {
    setLoadoutMemo(true);
    CHASSIS_FEATURES[chassisId] = original;
  }
}

const off = <T>(chassisId: string, run: () => T): T => withAbility(chassisId, null, run);

function npcAndPlayer(chassisId: string, parts: string[] = ['stockEngine']): { w: World; vehicles: Vehicle[] } {
  const w = emptyWorld();
  const npc = addVehicle(w, 'independent', chassisId, parts, { x: 50, y: 50 });
  const player = addVehicle(w, 'player', chassisId, parts, { x: 60, y: 50 });
  w.player.vehicleId = player.id;
  for (const v of [npc, player]) getResources(w, v).fuel = 10;
  return { w, vehicles: [npc, player] };
}

const MG_ROUND: Round = { damage: 10, pen: 5, blast: false, armorShare: 1 };

describe('the ability table', () => {
  it('reads null for the semi and throws on an unknown chassis', () => {
    expect(chassisAbility('semi')).toBeNull();
    expect(() => chassisAbility('nope')).toThrow();
  });

  it('gives neutral factors to a chassis without them', () => {
    expect(topSpeedFactor('scout')).toBe(1);
    expect(accelFactor('scout')).toBe(1);
    expect(chassisTopSpeed('scout')).toBe(7.8);
  });
});

describe('top speed and acceleration', () => {
  it.each([['courier', 1.25], ['lincoln', 1.15]])('lets a %s reach %s times the top speed of the same truck without it', (chassisId, factor) => {
    const { w, vehicles } = npcAndPlayer(chassisId);
    for (const v of vehicles) {
      const on = vehicleStats(w, v).maxSpeed;
      const base = off(chassisId, () => vehicleStats(w, v).maxSpeed);
      expect(on / base).toBeCloseTo(factor, 6);
      const step = maxSpeedSteps(w, v).find((s) => s.kind === 'ability');
      expect(step).toMatchObject({ id: CHASSIS_FEATURES[chassisId].id, factor });
    }
  });

  it('lets a buggy accelerate 1.25 times as fast, with no top speed step', () => {
    const { w, vehicles } = npcAndPlayer('buggy');
    for (const v of vehicles) {
      const on = vehicleStats(w, v);
      const base = off('buggy', () => vehicleStats(w, v));
      expect(on.accel / base.accel).toBeCloseTo(1.25, 6);
      expect(on.maxSpeed).toBe(base.maxSpeed);
      expect(maxSpeedSteps(w, v).some((s) => s.kind === 'ability')).toBe(false);
    }
  });
});

describe('gun power', () => {
  it.each(['wagon', 'tractor', 'loader'])('lets a %s carry its guns with less drag than the same truck without it', (chassisId) => {
    const { vehicles } = npcAndPlayer(chassisId, ['stockEngine', 'mg', 'mg', 'mg']);
    for (const v of vehicles) {
      const on = gunDrag(v, gunCapacity(v)!);
      const base = off(chassisId, () => gunDrag(v, gunCapacity(v)!));
      expect(on).toBeGreaterThan(base);
    }
  });

  it('multiplies the worn engine capacity by the chassis factor', () => {
    const { vehicles } = npcAndPlayer('loader');
    const plain = npcAndPlayer('hauler').vehicles[0];
    expect(gunCapacity(vehicles[0])! / gunCapacity(plain)!).toBeCloseTo(1.5, 9);
  });
});

describe('heavy springs', () => {
  it('counts mounted parts at half and goods in full', () => {
    const { vehicles } = npcAndPlayer('bus', ['stockEngine', 'mg']);
    for (const v of vehicles) {
      const mounted = mountedParts(v).reduce((sum, p) => sum + partDef(p.defId).mass, 0);
      expect(loadMass(v)).toBeCloseTo(vehicleMass(v) - mounted * 0.5, 6);
      expect(loadFactor(v)).toBeGreaterThan(off('bus', () => loadFactor(v)));
    }
  });

  it('leaves another chassis at its real mass', () => {
    const v = npcAndPlayer('hauler', ['stockEngine', 'mg']).vehicles[0];
    expect(loadMass(v)).toBe(vehicleMass(v));
  });
});

describe('off-road drive', () => {
  it.each(['jeep', 'niva'])('loses no speed on rough ground in a %s', (chassisId) => {
    const { w, vehicles } = npcAndPlayer(chassisId);
    for (const v of vehicles) {
      const s = vehicleStats(w, v);
      expect(s.roughCut).toBe(1);
      expect(groundSpeed(s, 0.6)).toBeCloseTo(1, 9);
    }
    const { w: w2, vehicles: others } = npcAndPlayer('scout');
    expect(groundSpeed(vehicleStats(w2, others[0]), 0.6)).toBeCloseTo(0.6, 9);
  });

  function lossOn(chassisId: string, patch: Partial<ChassisAbility> | null, ground: 'sand' | 'road'): { loss: number; rng: number } {
    return withAbility(chassisId, patch, () => {
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

  it.each(['jeep', 'niva'])('wears a %s less on sand, the same on road, with the same random draws', (chassisId) => {
    expect(lossOn(chassisId, {}, 'sand').loss).toBeLessThan(lossOn(chassisId, { offRoadWear: 1 }, 'sand').loss);
    expect(lossOn(chassisId, {}, 'road')).toEqual(lossOn(chassisId, { offRoadWear: 1 }, 'road'));
  });
});

describe('armor bonus', () => {
  const armorSum = (v: Vehicle, round: Round) =>
    (['front', 'rear', 'left', 'right'] as const).reduce((sum, side) => sum + [0, 1, 2].reduce((lanes, lane) => {
      try {
        return lanes + planLane(v, side, lane, round).reduce((a, h) => a + h.amount, 0);
      } catch {
        return lanes;
      }
    }, 0), 0);

  it.each([['van', 1], ['bukhanka', 2], ['carrier', 4], ['tractor', 2]])('adds the %s bonus of %s to every part but shields', (chassisId, bonus) => {
    const { vehicles } = npcAndPlayer(chassisId, ['stockEngine', 'mg', 'plates']);
    for (const v of vehicles) {
      for (const part of mountedParts(v)) {
        const def = partDef(part.defId);
        const base = off(chassisId, () => armorOn(v, part, false));
        const shield = def.kind === 'armor' || def.kind === 'accessory';
        expect(armorOn(v, part, false) - base, part.defId).toBe(shield ? 0 : bonus);
      }
    }
  });

  const ROUNDS: Round[] = [MG_ROUND, { damage: 12, pen: 9, blast: false, armorShare: 1 }, { damage: 40, pen: 15, blast: false, armorShare: 1 }];

  it.each(['van', 'bukhanka', 'carrier', 'tractor'])('never makes a %s take more damage from any round than without the bonus', (chassisId) => {
    for (const v of npcAndPlayer(chassisId, ['stockEngine', 'mg', 'plates']).vehicles) {
      for (const round of ROUNDS) expect(armorSum(v, round)).toBeLessThanOrEqual(off(chassisId, () => armorSum(v, round)) + 1e-9);
    }
  });

  it('lets a carrier take less damage from an MG round than the same truck without the bonus', () => {
    for (const v of npcAndPlayer('carrier', ['stockEngine', 'mg', 'plates']).vehicles) {
      expect(armorSum(v, MG_ROUND)).toBeLessThan(off('carrier', () => armorSum(v, MG_ROUND)));
    }
  });

  it('adds the sorokonoga bonus to deck parts only', () => {
    const { vehicles } = npcAndPlayer('sorokonoga', ['stockEngine', 'mg']);
    for (const v of vehicles) {
      const gun = mountedParts(v, 'weapon')[0];
      const cab = mountedParts(v, 'core').find((p) => partDef(p.defId).kind === 'core' && (partDef(p.defId) as { role: string }).role === 'cab')!;
      expect(armorOn(v, gun, false) - off('sorokonoga', () => armorOn(v, gun, false))).toBe(1);
      expect(armorOn(v, cab, false) - off('sorokonoga', () => armorOn(v, cab, false))).toBe(0);
    }
  });
});

describe('sight, range, reload and arc', () => {
  it.each([['convertible', 1.2, 1.2], ['lincoln', 1.25, 1.15]])('scales the sight and gun range of a %s', (chassisId, sight, range) => {
    const { w, vehicles } = npcAndPlayer(chassisId, ['stockEngine', 'mg']);
    for (const v of vehicles) {
      const gun = mountedItems(v, 'weapon')[0].part;
      expect(sightRadius(w, v) / off(chassisId, () => sightRadius(w, v))).toBeCloseTo(sight, 9);
      expect(weaponOn(v, gun).range / off(chassisId, () => weaponOn(v, gun).range)).toBeCloseTo(range, 9);
    }
  });

  it('widens a sorokonoga gun by 30 degrees to at most 360 and reloads a turn sooner to at least 1', () => {
    const { vehicles } = npcAndPlayer('sorokonoga', ['stockEngine', 'mg', 'cannon']);
    for (const v of vehicles) {
      for (const part of mountedParts(v, 'weapon')) {
        const own = partDef(part.defId) as { arc: number; reload: number };
        const on = weaponOn(v, part);
        expect(on.arc).toBe(Math.min(360, own.arc + 30));
        expect(on.reload).toBe(Math.max(1, own.reload - 1));
      }
    }
  });

  it('keeps range and sight on a chassis without the ability', () => {
    const { w, vehicles } = npcAndPlayer('hauler', ['stockEngine', 'mg']);
    const gun = mountedItems(vehicles[0], 'weapon')[0].part;
    expect(weaponOn(vehicles[0], gun).range).toBe((partDef(gun.defId) as { range: number }).range);
    expect(sightRadius(w, vehicles[0])).toBe(sightRadius(w, vehicles[1]));
  });
});

describe('nimble', () => {
  function oddsAgainst(chassisId: string, speed: number) {
    const w = emptyWorld();
    const me = addVehicle(w, 'player', 'wagon', ['mg', 'stockEngine'], { x: 30, y: 30 });
    w.player.vehicleId = me.id;
    const target = addVehicle(w, 'independent', chassisId, ['stockEngine'], { x: 34, y: 30 });
    target.speed = speed;
    return chanceSteps(w, me, vehicleStatsGun(w, me), target, 'body').map((s) => s.cause);
  }

  function vehicleStatsGun(w: World, me: Vehicle) {
    return vehicleStats(w, me).weapons[0];
  }

  it('lists the nimble cause on a moving buggy and not on a parked one or another chassis', () => {
    expect(oddsAgainst('buggy', 3)).toContain('nimble');
    expect(oddsAgainst('buggy', 0)).not.toContain('nimble');
    expect(oddsAgainst('scout', 3)).not.toContain('nimble');
  });

  it('counts only above the still speed', () => {
    expect(RULES.stillSpeed).toBeGreaterThan(0);
    expect(oddsAgainst('buggy', RULES.stillSpeed / 2)).not.toContain('nimble');
  });
});

describe('towing', () => {
  it.each(['tractor', 'loader', 'carrier', 'sorokonoga', 'scout'])('slows a towing %s by the tow share', (chassisId) => {
    const w = emptyWorld();
    const tower = addVehicle(w, 'independent', chassisId, ['stockEngine'], { x: 50, y: 50 });
    const other = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 52, y: 50 });
    const plain = vehicleStats(w, tower).maxSpeed;
    addState(w, 'tow', tower.id, other.id, { kind: 'tow', site: REGION.towns[0].id, fee: 0, waived: 0, hitched: true });
    expect(vehicleStats(w, tower).maxSpeed).toBeCloseTo(plain * TOW.speedShare);
  });
});
