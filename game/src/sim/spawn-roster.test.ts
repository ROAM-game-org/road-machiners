import { describe, expect, it } from 'vitest';
import { NPCS, SPAWN } from '../data/npcs';
import { REGION } from '../data/region';
import { START_KITS } from '../data/start';
import { everyTruck, siteGap } from './sites';
import { spawnQueueNow } from './spawn';
import { newWorld } from './world';
import { TEST_MAP } from '../test/map';
import { budget } from '../test/budget';
import { reusedWorld } from '../test/world-cache';
import { defaultSetup } from './settings';

const startWorld = (seed: number) =>
  reusedWorld(`start ${seed}`, () => {
    const w = newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    spawnQueueNow(w);
    return w;
  });

const NEUTRAL_SITES = [...REGION.towns, ...REGION.locations.filter((l) => l.kind !== 'camp')];
const nearestSite = (pos: { x: number; y: number }) =>
  NEUTRAL_SITES.reduce((best, site) => (siteGap(site, pos) < siteGap(best, pos) ? site : best));

describe('NPC spawns', () => {
  it.each([1, 2, 42, 1337, 7919, 15838, 23757, 31676])('starts the whole roster on seed %i, with the dealt neutral drivers spread evenly over the sites', (seed) => {
    const guards = SPAWN.initial.filter((id) => id === 'convoy').map(() => 'convoyGuard');
    const partners = SPAWN.initial.filter((id) => NPCS[id].pairs);
    const order = Object.values(NPCS).filter((tpl) => tpl.spawn.kind === 'hollow').flatMap((tpl) => Array<string>(tpl.cap).fill(tpl.id));
    const roster = [...SPAWN.initial, ...SPAWN.startTraffic.templates, ...guards, ...partners, ...order].sort();
    const neutralSites = REGION.towns.length + REGION.locations.filter((l) => l.kind !== 'camp' && l.kind !== 'territory').length;
    const world = startWorld(seed);
    const npcs = everyTruck(world).filter((v) => v.brain);
    const followers = new Set(world.states.filter((s) => s.kind === 'escort').map((s) => s.holder));
    expect(npcs.map((v) => v.brain!.templateId).sort()).toEqual(roster);
    const perSite = new Map<string, number>();
    for (const v of npcs.filter((v) => NPCS[v.brain!.templateId].spawn.kind === 'town' && !followers.has(v.id))) {
      const id = nearestSite(v.pos).id;
      perSite.set(id, (perSite.get(id) ?? 0) + 1);
    }
    const dealt = [...perSite.values()].reduce((sum, n) => sum + n, 0) - SPAWN.startTraffic.templates.length;
    const share = Math.ceil(dealt / neutralSites);
    for (const [id, count] of perSite) {
      const traffic = id === SPAWN.startTraffic.town ? SPAWN.startTraffic.templates.length : 0;
      expect(count).toBeLessThanOrEqual(share + traffic);
    }
  }, budget(30_000));
});
