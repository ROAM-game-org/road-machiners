import { describe, expect, it } from 'vitest';
import { PARTS } from '../../data/parts';
import { blastRadiusOf, PROJECTILES, projectileOf, roundSpec } from './projectiles';

describe('projectileOf', () => {
  it('has a projectile look for every weapon', () => {
    for (const def of Object.values(PARTS)) if (def.kind === 'weapon') expect(() => projectileOf(def.id)).not.toThrow();
  });

  it('fails loud for a weapon with no projectile look', () => {
    expect(() => projectileOf('laser')).toThrow(/No projectile look/);
  });

  it('explodes only rounds with splash', () => {
    expect(blastRadiusOf('grenadeLauncher')).toBeGreaterThan(0);
    expect(blastRadiusOf('cannon')).toBeGreaterThan(0);
    expect(blastRadiusOf('mg')).toBe(0);
    expect(blastRadiusOf('harpoon')).toBe(0);
    expect(() => blastRadiusOf('stockEngine')).toThrow();
  });

  it('flies a cannon shell slower than a machine gun round', () => {
    expect(projectileOf('cannon').speed).toBeLessThan(projectileOf('mg').speed);
  });
});

describe('roundSpec', () => {
  it('throws one casing per shotgun shell and one per round of other guns', () => {
    const casings = (id: string) => [0, 1, 2].map((k) => roundSpec(PROJECTILES[id], k).casing);
    expect(casings('shotgun')).toEqual(['small', null, null]);
    expect(casings('mg')).toEqual(['small', 'small', 'small']);
  });
});
