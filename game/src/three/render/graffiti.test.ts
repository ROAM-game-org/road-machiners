import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { START_KITS } from '../../data/start';
import { SIGN_STAGES } from '../../render/sign';
import { isBreakable } from '../../sim/mapgen';
import { defaultSetup } from '../../sim/settings';
import { newWorld } from '../../sim/world';
import { dist } from '../../sim/vec';
import { TEST_MAP } from '../../test/map';
import { chooseRegionGraffiti, fitSite, GRAFFITI, GRAFFITI_PROP_LOOKS, GraffitiCandidates, graffitiLift, graffitiRegions, graffitiTarget, GRID, type GraffitiPlaced, type GraffitiRegion, type GraffitiSite, type SignFit } from './graffiti';
import { loadModels } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const world = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
const t = world.terrain;
const candidates = new GraffitiCandidates(t, world.obstacles);
const regions = graffitiRegions(world.size);
const fitOn = (site: GraffitiSite) => fitSite(t, site);
const plan = (): GraffitiPlaced<SignFit>[] => regions.flatMap((r) => chooseRegionGraffiti(r, candidates.sitesIn(r), fitOn));
const placed = plan();
const VIEW = new THREE.Vector3(1, 0.816, 1).normalize();

describe('graffiti regions', () => {
  it('cover the map once, and their targets add up to the map target', () => {
    const area = regions.reduce((sum, r) => sum + (r.rect.x1 - r.rect.x0) * (r.rect.y1 - r.rect.y0), 0);
    expect(area).toBe(world.size * world.size);
    expect(regions.reduce((sum, r) => sum + r.target, 0)).toBe(graffitiTarget(world.size));
  });

  it('choose a region the same alone as among all the others', () => {
    const busy = regions.find((r) => placed.some((p) => inside(r, p.site.pos)))!;
    const alone = chooseRegionGraffiti(busy, new GraffitiCandidates(t, world.obstacles).sitesIn(busy), fitOn);
    expect(alone.map((p) => p.site.id)).toEqual(placed.filter((p) => inside(busy, p.site.pos)).map((p) => p.site.id));
  });

  it('keep every candidate half the gap inside its region edge', () => {
    for (const r of regions) {
      const { props, cliffs } = candidates.sitesIn(r);
      for (const s of [...props, ...cliffs]) {
        expect(s.pos.x - r.rect.x0).toBeGreaterThanOrEqual(GRAFFITI.minGapTiles / 2);
        expect(r.rect.x1 - s.pos.x).toBeGreaterThanOrEqual(GRAFFITI.minGapTiles / 2);
        expect(s.pos.y - r.rect.y0).toBeGreaterThanOrEqual(GRAFFITI.minGapTiles / 2);
        expect(r.rect.y1 - s.pos.y).toBeGreaterThanOrEqual(GRAFFITI.minGapTiles / 2);
      }
    }
  });
});

function inside(r: GraffitiRegion, p: { x: number; y: number }): boolean {
  return p.x >= r.rect.x0 && p.x < r.rect.x1 && p.y >= r.rect.y0 && p.y < r.rect.y1;
}

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

  it('gives every sign one stage, never Exodus, and uses every painted stage', () => {
    for (const p of placed) expect(SIGN_STAGES).toContain(p.site.paint.stage);
    expect(new Set(placed.map((p) => p.site.paint.stage))).toEqual(new Set(['spiral', 'race', 'chaos']));
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

describe('graffitiLift', () => {
  it('is full by day, weaker but lit at night and rises with the sun', () => {
    expect(graffitiLift(2.3)).toBe(1);
    const night = graffitiLift(0.7);
    expect(night).toBeGreaterThan(0);
    expect(night).toBeLessThan(0.5);
    let last = night;
    for (let sun = 0.8; sun <= 2.4; sun += 0.1) {
      const lift = graffitiLift(sun);
      expect(lift).toBeGreaterThanOrEqual(last);
      expect(lift).toBeLessThanOrEqual(1);
      last = lift;
    }
  });
});
