import { describe, expect, it } from 'vitest';
import { MAP_SCALE, onOrchardRoad, REGION } from '../data/region';
import { TERRAIN } from '../data/terrain';
import { PHYSICS } from '../data/physics';
import { setMoveOrder } from './world';
import { dist, polylineDist, type Vec } from './vec';
import { siteGap } from './sites';
import { discoverSites, revealedSites } from './locations';
import { refreshVision } from './vision';
import { bodyOf } from './body';
import { standardWorld } from '../test/world-cache';
import { newWorld } from './world';
import { START_KITS } from '../data/start';
import { defaultSetup } from './settings';
import { atlasOf, atlasSites } from './atlas';
import { highwayMap } from './highway';
import { budget } from '../test/budget';

const original = [
  [16, 94], [102, 35], [22.8, 56.8], [33.8, 32], [50, 32.8],
  [81, 75.6], [71.8, 89], [40.7, 51.7], [64, 54], [82, 52.2],
  [22, 14], [66, 76],
];

describe('Icarus exploration distances', () => {
  it('multiplies every pairwise destination distance by the map scale', () => {
    const sites = [...REGION.towns, ...REGION.locations];
    expect(sites).toHaveLength(original.length);
    for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) {
      expect(Math.abs(dist(sites[i].pos, sites[j].pos) - Math.hypot(original[i][0] - original[j][0], original[i][1] - original[j][1]) * MAP_SCALE)).toBeLessThan(1);
    }
  });

  it('starts off the trunk road facing it, the road in grey vision past clear sight, out of clear sight of every site', () => {
    const world = standardWorld(1337);
    const player = world.vehicles.find((v) => v.id === world.player.vehicleId)!;
    refreshVision(world);
    discoverSites(world);
    expect(world.player.discovered).toEqual([]);
    const gray = TERRAIN.vision.radius * TERRAIN.vision.grayFactor;
    const toRoad = polylineDist(player.pos, REGION.roads[REGION.playerStart.road]);
    expect(toRoad).toBeLessThan(gray);
    expect(toRoad).toBeGreaterThan(TERRAIN.vision.radius * 2);
    const ahead = { x: player.pos.x + Math.cos(player.heading) * gray, y: player.pos.y + Math.sin(player.heading) * gray };
    expect(polylineDist(ahead, REGION.roads[REGION.playerStart.road])).toBeLessThan(gray - toRoad + REGION.roadWidth);
    for (const site of [...REGION.towns, ...REGION.locations]) expect(siteGap(site, player.pos)).toBeGreaterThan(TERRAIN.vision.radius);
  }, budget(15_000));

  it('gives settlements human-scale footprints and an outside starting point', () => {
    const truckLength = bodyOf('scout').half.x * 2;
    for (const town of REGION.towns) {
      expect(town.radius * 2 * PHYSICS.metersPerTile / truckLength).toBeGreaterThan(40);
      for (const site of REGION.locations) expect(dist(town.pos, site.pos)).toBeGreaterThan(town.radius + site.radius);
    }
    const bowl = REGION.towns.find((town) => town.id === 'bowl')!;
    expect(TERRAIN.features.craters[0].radius).toBeGreaterThan(bowl.radius);
  });

  it('shares immutable terrain between turns without sharing mutable state', () => {
    const world = standardWorld(1337);
    const next = setMoveOrder(world, { kind: 'stopAt', dest: { x: 100, y: 440 } });
    expect(next.terrain).toBe(world.terrain);
    expect(Object.isFrozen(next.terrain.heights)).toBe(true);
    expect(next.player).not.toBe(world.player);
    expect(next.vehicles).not.toBe(world.vehicles);
    expect(world.vehicles[0].order).toBeNull();
  }, budget(60_000));
});

describe('discovering an outlined territory', () => {
  const orchard = REGION.locations.find((l) => l.id === 'orchard')!;
  const tileAt = (size: number, p: Vec): number => Math.floor(p.y) * size + Math.floor(p.x);
  const at = (s: number, c: number): Vec => ({ x: orchard.pos.x + onOrchardRoad(s, c).x, y: orchard.pos.y + onOrchardRoad(s, c).y });

  it('discovers the orchard from one seen tile of its north-west pocket', () => {
    const world = standardWorld(1337);
    world.player.visible = [tileAt(world.terrain.size, at(60, 30))];
    discoverSites(world);
    expect(world.player.discovered).toEqual(['orchard']);
  }, budget(15_000));

  it('does not discover it from a tile inside its bounding radius but past its outline', () => {
    const world = standardWorld(1337);
    const beyond = at(-30, 44);
    expect(dist(beyond, orchard.pos)).toBeLessThan(orchard.radius);
    world.player.visible = [tileAt(world.terrain.size, beyond)];
    discoverSites(world);
    expect(world.player.discovered).toEqual([]);
  }, budget(15_000));
});

describe('which sites the player knows', () => {
  const bowl = REGION.towns.find((t) => t.id === 'bowl')!;

  it('leaves out an undiscovered site out of sight', () => {
    const world = standardWorld(1337);
    expect(revealedSites(world).has('bowl')).toBe(false);
  }, budget(15_000));

  it('takes in every site when the map has no exploration', () => {
    const world = newWorld(3, START_KITS.furyRoad, highwayMap(3, 0), defaultSetup('furyRoad'));
    expect(revealedSites(world).size).toBe(atlasSites(atlasOf(world.terrain)).length);
  }, budget(15_000));

  it('takes in a discovered site', () => {
    const world = standardWorld(1337);
    world.player.discovered = ['bowl'];
    expect(revealedSites(world).has('bowl')).toBe(true);
  }, budget(15_000));

  it('takes in a site whose area is in sight without discovering it', () => {
    const world = standardWorld(1337);
    world.player.visible = [Math.floor(bowl.pos.y) * world.terrain.size + Math.floor(bowl.pos.x)];
    expect(revealedSites(world).has('bowl')).toBe(true);
    expect(world.player.discovered).toEqual([]);
  }, budget(15_000));
});
