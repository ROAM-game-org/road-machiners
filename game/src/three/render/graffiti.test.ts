import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { START_KITS } from '../../data/start';
import { SIGN_STAGES } from '../../render/sign';
import { isBreakable } from '../../sim/mapgen';
import { defaultSetup } from '../../sim/settings';
import { newWorld } from '../../sim/world';
import { dist } from '../../sim/vec';
import { TEST_MAP } from '../../test/map';
import { chooseGraffiti, fitSite, GRAFFITI, GRAFFITI_PROP_LOOKS, graffitiSites, graffitiTarget, GRID, type GraffitiPlaced, type SignFit } from './graffiti';
import { loadModels } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const world = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
const t = world.terrain;
const sites = graffitiSites(t, world.obstacles);
const plan = (): GraffitiPlaced<SignFit>[] => chooseGraffiti(world.size, sites, (site) => fitSite(t, site));
const placed = plan();
const VIEW = new THREE.Vector3(1, 0.816, 1).normalize();

describe('graffiti placement', () => {
  it('is the same on every run', () => {
    const again = plan();
    expect(again.map((p) => [p.site.id, p.site.paint, p.fit.positions])).toEqual(placed.map((p) => [p.site.id, p.site.paint, p.fit.positions]));
  });

  it('stays rare and never above the map rate', () => {
    const target = graffitiTarget(world.size);
    expect(placed.length).toBeLessThanOrEqual(target);
    expect(placed.length).toBeGreaterThanOrEqual(target / 3);
    expect(placed.length / (world.size * world.size)).toBeLessThanOrEqual(1 / GRAFFITI.tilesPerSign);
  });

  it('keeps every sign apart from the others', () => {
    for (const a of placed) for (const b of placed) if (a !== b) expect(dist(a.site.pos, b.site.pos)).toBeGreaterThanOrEqual(GRAFFITI.minGapTiles);
  });

  it('gives every sign one stage, and uses all four stages', () => {
    for (const p of placed) expect(SIGN_STAGES).toContain(p.site.paint.stage);
    expect(new Set(placed.map((p) => p.site.paint.stage))).toEqual(new Set(SIGN_STAGES));
  });

  it('spreads over the whole map, not only near spawn', () => {
    const half = world.size / 2;
    const quadrants = new Set(placed.map((p) => `${p.site.pos.x < half}-${p.site.pos.y < half}`));
    expect(quadrants.size).toBe(4);
  });

  it('puts props only on permanent, flat-faced kinds and mixes in cliffs', () => {
    const props = placed.filter((p) => p.site.obstacle !== null);
    expect(props.length).toBeGreaterThan(0);
    expect(placed.length - props.length).toBeGreaterThan(0);
    for (const p of props) {
      const o = p.site.obstacle!;
      expect(o.kind).toBe('landmark');
      expect(isBreakable(o)).toBe(false);
      expect(o.kind === 'landmark' && GRAFFITI_PROP_LOOKS.has(o.look)).toBe(true);
    }
  });

  it('faces the camera and lies in one piece on the surface', () => {
    for (const { fit } of placed) {
      expect(fit.normal.dot(VIEW)).toBeGreaterThanOrEqual(0.45);
      expect(fit.positions.length).toBe((GRID + 1) ** 2 * 3);
      for (const v of fit.positions) expect(Number.isFinite(v)).toBe(true);
      for (let k = 0; k < fit.normals.length; k += 3) expect(new THREE.Vector3(fit.normals[k], fit.normals[k + 1], fit.normals[k + 2]).dot(VIEW)).toBeGreaterThanOrEqual(0.2);
      const first = new THREE.Vector3(fit.positions[0], fit.positions[1], fit.positions[2]);
      const last = new THREE.Vector3(fit.positions[fit.positions.length - 3], fit.positions[fit.positions.length - 2], fit.positions[fit.positions.length - 1]);
      expect(first.distanceTo(last)).toBeGreaterThan(fit.size * 0.9);
      expect(first.distanceTo(last)).toBeLessThan(fit.size * Math.SQRT2 * 1.3);
    }
  });

  it('keeps cliff signs next to the cliff tile they came from', () => {
    for (const { site, fit } of placed.filter((p) => p.site.obstacle === null)) expect(Math.hypot(fit.center.x / 4 - site.pos.x, fit.center.z / 4 - site.pos.y)).toBeLessThan(4);
  });
});
