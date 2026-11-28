import { describe, expect, it, vi } from 'vitest';
import { emptyHidden } from './salvage';
import { toldWreckWay, toldWrecks } from './rumors';
import { directionsFromSite, toldInFull } from './directions';
import { atlasOf } from './atlas';
import { CONTRACTS } from '../data/market';
import { dist } from './vec';
import { nearestRoadPoints, roadNetworkOf } from './road-network';
import { emptyWorld } from './testkit';
import type { SalvageStock } from './types';

function wreck(id: string): SalvageStock {
  return { id, pos: { x: 50, y: 30 }, radius: 0.6, goods: { scrap: 2 }, parts: [], hidden: emptyHidden() };
}

describe('told wrecks', () => {
  it('lists the wrecks the player was told of, newest told first', () => {
    const w = emptyWorld();
    w.salvage = [wreck('wreck1'), wreck('wreck2'), wreck('wreck3'), wreck('wreck4')];
    w.player.rumored = ['wreck3', 'wreck1', 'wreck2'];

    expect(toldWrecks(w).map((s) => s.id)).toEqual(['wreck2', 'wreck1', 'wreck3']);
  });

  it('leaves out a wreck the player searched and one gone from the world', () => {
    const w = emptyWorld();
    w.salvage = [wreck('wreck1'), wreck('wreck2')];
    w.player.rumored = ['wreck1', 'wreck2', 'wreck9'];
    w.player.scavenged = ['wreck2'];

    expect(toldWrecks(w).map((s) => s.id)).toEqual(['wreck1']);
  });

  it('lists a wreck told twice once', () => {
    const w = emptyWorld();
    w.salvage = [wreck('wreck1'), wreck('wreck2')];
    w.player.rumored = ['wreck1', 'wreck2', 'wreck1'];

    expect(toldWrecks(w).map((s) => s.id)).toEqual(['wreck1', 'wreck2']);
  });
});

describe('the way to a told wreck', () => {
  function wreckAt(w: ReturnType<typeof emptyWorld>, town: string): SalvageStock {
    const home = atlasOf(w.terrain).towns.find((t) => t.id === town);
    if (!home) throw new Error(town);
    const road = nearestRoadPoints(roadNetworkOf(w), { x: home.pos.x + 300, y: home.pos.y + 300 }, Infinity, 1)[0].pos;
    return { ...wreck('wreck1'), pos: { x: road.x + 20, y: road.y } };
  }

  it('gives the way from the nearest town whose way is told in full', () => {
    const w = emptyWorld();
    const stock = wreckAt(w, 'bowl');
    const way = toldWreckWay(w, stock);
    const towns = atlasOf(w.terrain).towns.slice().sort((a, b) => dist(a.pos, stock.pos) - dist(b.pos, stock.pos));

    expect(way.kind).toBe('way');
    if (way.kind !== 'way') return;
    const steps = directionsFromSite(w, way.town, { kind: 'spot', pos: stock.pos, clue: 'wreck' });
    expect(way.steps).toEqual(steps);
    expect(toldInFull(way.steps)).toBe(true);
    for (const nearer of towns.slice(0, towns.findIndex((t) => t.id === way.town))) {
      expect(toldInFull(directionsFromSite(w, nearer.id, { kind: 'spot', pos: stock.pos, clue: 'wreck' }))).toBe(false);
    }
  });

  it('falls back to a rounded bearing from the nearest town when no way is told in full', async () => {
    vi.resetModules();
    vi.doMock('./directions', async (original) => ({ ...(await original<typeof import('./directions')>()), directionsFromSite: () => [{ do: 'noRoad', octant: 0, span: 'near' }] }));
    const { toldWreckWay: mocked } = await import('./rumors');
    const w = emptyWorld();
    const stock = wreckAt(w, 'bowl');
    const way = mocked(w, stock);
    vi.doUnmock('./directions');

    expect(way.kind).toBe('bearing');
    if (way.kind !== 'bearing') return;
    const nearest = atlasOf(w.terrain).towns.slice().sort((a, b) => dist(a.pos, stock.pos) - dist(b.pos, stock.pos))[0];
    expect(way.town).toBe(nearest.id);
    expect(way.tiles % CONTRACTS.claim.clueStepTiles).toBeCloseTo(0, 6);
    expect(Math.abs(way.rad / (Math.PI / 4) - Math.round(way.rad / (Math.PI / 4)))).toBeLessThan(1e-9);
  });

  it('throws when the map has no town', () => {
    const w = emptyWorld();
    const stock = wreckAt(w, 'bowl');
    const atlas = atlasOf(w.terrain);
    const saved = [...atlas.towns];
    (atlas.towns as unknown[]).length = 0;
    try {
      expect(() => toldWreckWay(w, stock)).toThrow();
    } finally {
      (atlas.towns as unknown[]).push(...saved);
    }
  });

  it('can start from every town on the map', () => {
    const w = emptyWorld();
    for (const town of atlasOf(w.terrain).towns) {
      expect(() => directionsFromSite(w, town.id, { kind: 'spot', pos: wreckAt(w, 'bowl').pos, clue: 'wreck' })).not.toThrow();
    }
  });
});
