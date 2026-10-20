import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { initPhysics } from '../../phys/drive';
import { REGION } from '../../data/region';
import { FORT_MODELS } from '../../sim/fortress';
import { atlasOf } from '../../sim/atlas';
import { highwayMap } from '../../sim/highway';
import { defaultSetup } from '../../sim/settings';
import { newWorld } from '../../sim/world';
import { START_KITS } from '../../data/start';
import type { Obstacle } from '../../sim/types';
import { standardWorld } from '../../test/world-cache';
import { budget } from '../../test/budget';
import { PlayClock } from '../play-clock';
import { loadModels } from './models';
import { ObstacleViews } from './obstacles';
import { RenderScope, SightLimit } from './scope';
import { SiteReveal } from './site-reveal';
import { SiteLights } from './siteLights';
import { addSites } from './sites';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await initPhysics();
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

function build() {
  const world = standardWorld(1337);
  const root = new THREE.Group();
  const scope = new RenderScope(root, world.size, new SightLimit(world.size), true, true);
  const built = addSites(world.terrain, scope, new PlayClock(100));
  const lights = new SiteLights(new THREE.Scene(), built, { worldSize: world.size, maxTextureSize: 4096 });
  const reveal = new SiteReveal(built.roots, lights);
  const views = new ObstacleViews(scope, world.terrain, () => {}, (id, obj) => {
    reveal.addFortPiece(id, obj);
    pieces.set(obj, id);
  });
  const pieces = new Map<THREE.Object3D, string>();
  const forts = world.obstacles.filter((o): o is Extract<Obstacle, { kind: 'landmark' }> => o.kind === 'landmark' && FORT_MODELS.has(o.look));
  views.sync(forts, [], []);
  return { world, built, reveal, lights, pieces };
}

describe('SiteReveal', () => {
  it('hides an unfound town whole, then shows it once found, then hides it again for an older world', () => {
    const { world, built, reveal, pieces } = build();
    const bowl = built.roots.get('bowl')!;
    const bowlPieces = [...pieces].filter(([, id]) => id === 'bowl').map(([obj]) => obj);
    expect(bowlPieces.length).toBeGreaterThan(0);
    reveal.sync(world);
    expect(bowl.visible).toBe(false);
    expect(bowlPieces.every((o) => !o.visible)).toBe(true);
    reveal.sync({ ...world, player: { ...world.player, discovered: ['bowl'] } });
    expect(bowl.visible).toBe(true);
    expect(bowlPieces.every((o) => o.visible)).toBe(true);
    expect(built.roots.get('nose')!.visible).toBe(false);
    reveal.sync(world);
    expect(bowl.visible).toBe(false);
    expect(bowlPieces.every((o) => !o.visible)).toBe(true);
  }, budget(60_000));

  it('lights only the lamps and work lights of found towns', () => {
    const { world, lights } = build();
    const spy: string[][] = [];
    const real = lights.reveal.bind(lights);
    lights.reveal = (ids) => {
      spy.push([...ids]);
      real(ids);
    };
    const reveal = new SiteReveal(new Map(), lights);
    reveal.sync({ ...world, player: { ...world.player, discovered: ['bowl'] } });
    expect(spy).toEqual([['bowl']]);
  }, budget(60_000));

  it('shows every site on a map with no exploration', () => {
    const world = newWorld(3, START_KITS.furyRoad, highwayMap(3, 0), defaultSetup('furyRoad'));
    const lights = new SiteLights(new THREE.Scene(), { lights: [], lamps: [] }, { worldSize: 8, maxTextureSize: 4096 });
    const roots = new Map([...atlasOf(world.terrain).towns].map((t) => [t.id, new THREE.Group()]));
    new SiteReveal(roots, lights).sync(world);
    expect([...roots.values()].every((r) => r.visible)).toBe(true);
  }, budget(60_000));
});
