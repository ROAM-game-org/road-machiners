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

describe('resumed projectile flights', () => {
  it('shows a flight at its saved age without firing the gun again', async () => {
    const { Scene } = await import('three');
    const { Projectiles } = await import('./projectiles');
    const scene = new Scene();
    const projectiles = new Projectiles(scene, () => {});
    let fired = 0, landed = 0;
    projectiles.launch({ spec: PROJECTILES.mg, muzzle: () => ({ pos: { x: 0, y: 1, z: 0 }, dir: { x: 1, y: 0, z: 0 } }), plan: { delayMs: 0, flightMs: 1000, elapsedMs: 500, land: { x: 10, y: 1, z: 0 }, impact: 'none' }, onFire: () => fired++, onLand: () => landed++, ground: () => 0 });
    projectiles.tick(0);
    expect(scene.children[0].visible).toBe(true);
    expect(scene.children[0].position.x).toBeCloseTo(5, 6);
    expect(fired).toBe(0);
    projectiles.tick(0.5);
    expect(landed).toBe(1);
    expect(scene.children).toHaveLength(0);
  });

  it('removes the old flight before rebuilding the next turn', async () => {
    const { Scene } = await import('three');
    const { Projectiles } = await import('./projectiles');
    const scene = new Scene();
    const projectiles = new Projectiles(scene, () => {});
    projectiles.launch({ spec: PROJECTILES.mg, muzzle: () => ({ pos: { x: 0, y: 1, z: 0 }, dir: { x: 1, y: 0, z: 0 } }), plan: { delayMs: 0, flightMs: 1000, land: { x: 10, y: 1, z: 0 }, impact: 'none' }, onFire: () => {}, onLand: () => { throw new Error('Clearing a flight must not land it'); }, ground: () => 0 });
    projectiles.clearFlights();
    projectiles.tick(1);
    expect(scene.children).toHaveLength(0);
  });
});
