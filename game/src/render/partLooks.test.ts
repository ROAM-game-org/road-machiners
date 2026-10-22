import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { GOOD_IDS, PARCEL } from '../data/goods';
import { PARTS, type PartKind } from '../data/parts';
import type { PartInstance } from '../sim/types';
import { maxHp } from '../sim/wear';
import {
  BODY_PARTS, DENT_MAX, itemTone, PART_MODELS, WEAPON_POOLS, WEAR_LOOK_STEPS, WORN_GRAY, baseModel, breakSignature, columnTops, dentOffset, dentsOf, grayShare, grayed, partModel,
  wearShare, weaponLook, wearLookStep, type DentSurface, type ItemTone, type Point,
} from './partLooks';

const weaponIds = Object.values(PARTS).filter((d) => d.kind === 'weapon').map((d) => d.id);
const otherIds = Object.values(PARTS).filter((d) => d.kind !== 'weapon' && !BODY_PARTS.has(d.id)).map((d) => d.id);

describe('part looks', () => {
  it('gives every non-weapon part def and every good a model, except parts the body draws', () => {
    for (const id of [...otherIds, ...GOOD_IDS]) expect(() => partModel(id), id).not.toThrow();
    expect(Object.keys(PART_MODELS).sort()).toEqual([...otherIds, ...GOOD_IDS, PARCEL.id].sort());
  });

  it('gives every weapon def a pool with a model in each required slot', () => {
    expect(Object.keys(WEAPON_POOLS).sort()).toEqual([...weaponIds].sort());
    for (const id of weaponIds) {
      const pool = WEAPON_POOLS[id];
      expect(pool.mount.length, id).toBeGreaterThan(0);
      expect(pool.receiver.length, id).toBeGreaterThan(0);
      expect(pool.barrel.length, id).toBeGreaterThan(0);
    }
  });

  it('gives every chassis a base model', () => {
    for (const id of Object.keys(CHASSIS)) expect(baseModel(id, 0), id).toBe(`base_${id}`);
    expect(baseModel('semi', 1)).toBe('base_semi_rear');
    expect(() => baseModel('nope', 0)).toThrow();
    expect(() => baseModel('scout', 1)).toThrow();
  });

  it('throws on an unknown id', () => {
    expect(() => partModel('nope')).toThrow();
    expect(() => partModel('mg')).toThrow();
    expect(() => partModel('cab')).toThrow();
    expect(() => weaponLook('p1', 'nope')).toThrow();
  });

  it('gives one part id the same weapon look every time', () => {
    for (const id of weaponIds) expect(weaponLook('part-17', id)).toEqual(weaponLook('part-17', id));
  });

  it('picks every slot from the def pool', () => {
    for (const id of weaponIds) {
      const pool = WEAPON_POOLS[id];
      for (let i = 0; i < 20; i++) {
        const look = weaponLook(`p${i}`, id);
        expect(pool.mount).toContain(look.mount);
        expect(pool.receiver).toContain(look.receiver);
        expect(pool.barrel).toContain(look.barrel);
        if (pool.extra.length === 0) expect(look.extra).toBeNull();
        else expect(pool.extra).toContain(look.extra);
      }
    }
  });

  it('gives 50 ids more than one look for a weapon with larger pools', () => {
    const looks = new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(weaponLook(`p${i}`, 'mg'))));
    expect(looks.size).toBeGreaterThan(1);
  });
});

function part(hp: number, wear = 0): PartInstance {
  return { id: 'p1', defId: 'wheel', hp, wear };
}

describe('wearLookStep', () => {
  it('is 0 at full HP and the last step only at 0 HP', () => {
    const p = part(0);
    p.hp = maxHp(p);
    expect(wearLookStep(p)).toBe(0);
    p.hp = 1;
    expect(wearLookStep(p)).toBe(WEAR_LOOK_STEPS - 1);
    p.hp = 0;
    expect(wearLookStep(p)).toBe(WEAR_LOOK_STEPS);
  });

  it('never drops as HP drops, against a worn max HP', () => {
    for (const wear of [0, 1, 2]) {
      const p = part(0, wear);
      const max = maxHp(p);
      let last = -1;
      for (let hp = max; hp >= 0; hp--) {
        p.hp = hp;
        const step = wearLookStep(p);
        expect(step).toBeGreaterThanOrEqual(last);
        last = step;
      }
      p.hp = max;
      expect(wearLookStep(p)).toBe(0);
    }
  });

  it('throws on a zero max HP', () => {
    expect(() => wearLookStep({ ...part(0), defId: 'wheel', wear: 1000 })).toThrow();
  });
});

describe('grayed', () => {
  const dist = (hex: number): number =>
    [16, 8, 0].reduce((sum, sh) => sum + Math.abs(((hex >> sh) & 255) - ((WORN_GRAY >> sh) & 255)), 0);
  it('returns the color at share 0 and WORN_GRAY at share 1', () => {
    for (const hex of [0xff0000, 0x000000, 0xffffff]) {
      expect(grayed(hex, 0)).toBe(hex);
      expect(grayed(hex, 1)).toBe(WORN_GRAY);
    }
  });
  it('never moves away from WORN_GRAY as the share grows', () => {
    for (const hex of [0xff0000, 0x000000, 0xffffff]) {
      let last = Infinity;
      for (const share of [0, 0.25, 0.5, 0.75, 1]) {
        const d = dist(grayed(hex, share));
        expect(d).toBeLessThanOrEqual(last);
        last = d;
      }
    }
    expect(grayShare(0)).toBe(0);
    expect(grayShare(WEAR_LOOK_STEPS)).toBeGreaterThan(grayShare(1));
  });
});

describe('dents', () => {
  const grid = (): Point[] => {
    const points: Point[] = [];
    for (let x = -2; x <= 2; x += 0.5) for (let y = 0; y <= 1.5; y += 0.5) for (let z = -1; z <= 1; z += 0.5) points.push({ x, y, z });
    return points;
  };
  const points = grid();
  const box = { min: { x: -2, y: 0, z: -1 }, max: { x: 2, y: 1.5, z: 1 } };
  const surface = (keepOut: DentSurface['keepOut'] = []): DentSurface => ({ box, points, tops: columnTops(points), keepOut });

  it('grows faster early, so half HP shows most of the damage', () => {
    expect(wearShare(0)).toBe(0);
    expect(wearShare(WEAR_LOOK_STEPS)).toBe(1);
    expect(wearShare(2)).toBeGreaterThan(0.5);
    expect(grayShare(2) / grayShare(WEAR_LOOK_STEPS)).toBeGreaterThan(0.5);
  });

  it('has no dents at step 0 and the same dents on every rebuild', () => {
    expect(dentsOf('a', 0, surface())).toEqual([]);
    expect(dentsOf('a', 2, surface())).toEqual(dentsOf('a', 2, surface()));
    expect(dentsOf('b', 2, surface())).not.toEqual(dentsOf('a', 2, surface()));
  });

  it('keeps every lower step dent at a higher step', () => {
    for (let step = 1; step < WEAR_LOOK_STEPS; step++) {
      const lo = dentsOf('a', step, surface());
      const hi = dentsOf('a', step + 1, surface());
      expect(hi.length).toBeGreaterThan(lo.length);
      expect(hi.slice(0, lo.length)).toEqual(lo);
    }
  });

  it('only pushes inward and down, never past the depth cap', () => {
    for (const id of ['a', 'b', 'c', 'd']) {
      const dents = dentsOf(id, WEAR_LOOK_STEPS, surface());
      expect(dents.some((d) => d.axis === 'y')).toBe(true);
      for (const p of points) {
        const d = dentOffset(dents, surface(), p);
        expect(d.y).toBeLessThanOrEqual(0);
        expect(d.x * p.x).toBeLessThanOrEqual(0);
        expect(d.z * p.z).toBeLessThanOrEqual(0);
        for (const v of [d.x, d.y, d.z]) expect(Math.abs(v)).toBeLessThanOrEqual(DENT_MAX);
      }
    }
  });

  it('never moves a point under something that stands on the part', () => {
    const keepOut = [{ min: { x: -2, y: 1.5, z: -1 }, max: { x: 0, y: 2, z: 1 } }];
    const dents = dentsOf('a', WEAR_LOOK_STEPS, surface(keepOut));
    for (const p of points.filter((q) => q.x <= 0)) expect(dentOffset(dents, surface(keepOut), p)).toEqual({ x: 0, y: 0, z: 0 });
    expect(points.some((p) => dentOffset(dents, surface(keepOut), p).y < 0)).toBe(true);
  });
});

describe('breakSignature', () => {
  it('follows the part kind', () => {
    for (const def of Object.values(PARTS)) {
      const sig = breakSignature(def);
      if (def.kind === 'weapon') expect(sig).toBe('ammo');
      else if (def.kind === 'core' && def.role === 'wheel') expect(sig).toBe('air');
      else if (def.kind === 'core' && def.role === 'tank') expect(sig).toBe('fire');
      else if (def.kind === 'store' && def.holds === 'fuel') expect(sig).toBe('fire');
      else expect(sig).toBeNull();
    }
    expect(breakSignature(PARTS.jerrycans)).toBe('fire');
  });
});

const KIND_TONES: Record<PartKind, ItemTone> = {
  weapon: 'weapon',
  armor: 'armor',
  cargo: 'cargo',
  engine: 'other',
  core: 'other',
  scanner: 'other',
  store: 'other',
  utility: 'other',
};

describe('item tones', () => {
  it.each(Object.values(PARTS).map((d) => [d.id, d.kind] as const))('give part %s (%s) its kind tone', (id, kind) => {
    expect(itemTone(id)).toBe(KIND_TONES[kind]);
  });

  it('give every good the cargo tone', () => {
    expect(GOOD_IDS.map(itemTone)).toEqual(GOOD_IDS.map(() => 'cargo'));
  });

  it('give built-in body parts the other tone', () => {
    expect([...BODY_PARTS].map(itemTone)).toEqual([...BODY_PARTS].map(() => 'other'));
  });

  it('fail on an id that is neither a part nor a good', () => {
    expect(() => itemTone('noSuchThing')).toThrow(/noSuchThing/);
  });
});
