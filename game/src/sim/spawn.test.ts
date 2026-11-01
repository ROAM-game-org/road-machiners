import { describe, expect, it } from 'vitest';
import { FIRST_NAMES, NPCS, SPAWN, SURNAMES } from '../data/npcs';
import { REGION } from '../data/region';
import { START_KITS } from '../data/start';
import { playerVehicle } from './damage';
import { everyTruck, siteGap, siteGates, sitePads } from './sites';
import { allegianceFor, groundClear, isFree, spawnNpcs, spawnQueueNow } from './spawn';
import { isCliff, tileAt } from './terrain';
import { territoryPieces } from './territory';
import { addVehicle, emptyWorld, raiseCliff, testDrive } from './testkit';
import { dist } from './vec';
import { endTurn, newWorld } from './world';
import type { QueuedSpawn } from './types';
import { TEST_MAP } from '../test/map';
import { budget } from '../test/budget';
import { reusedWorld } from '../test/world-cache';
import { defaultSetup } from './settings';

const queuedWorld = (seed: number) => reusedWorld(`queued ${seed}`, () => newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming')));
const startWorld = (seed: number) =>
  reusedWorld(`start ${seed}`, () => {
    const w = newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    spawnQueueNow(w);
    return w;
  });

const NEUTRAL_SITES = [...REGION.towns, ...REGION.locations.filter((l) => l.kind !== 'camp')];
const nearestSite = (pos: { x: number; y: number }) =>
  NEUTRAL_SITES.reduce((best, site) => (siteGap(site, pos) < siteGap(best, pos) ? site : best));

describe('ground under a spawn', () => {
  it('accepts flat open ground and refuses a cliff tile under the footprint', () => {
    const w = emptyWorld();
    const spot = { x: 80.5, y: 80.5 };
    expect(isFree(w, spot, 1, null)).toBe(true);
    raiseCliff(w, 81, 81);
    expect(isCliff(w.terrain, tileAt(w.terrain, spot))).toBe(true);
    expect(isFree(w, spot, 1, null)).toBe(false);
    expect(groundClear(w, { x: 90.5, y: 90.5 }, 1)).toBe(true);
  });

  it('ignores a cliff tile the footprint does not reach', () => {
    const w = emptyWorld();
    raiseCliff(w, 81, 81);
    expect(groundClear(w, { x: 84.5, y: 84.5 }, 0.5)).toBe(true);
  });
});

describe('NPC spawns', () => {
  it('names each driver from the pools and keeps the name through turns', () => {
    const w = startWorld(1337);
    const npcs = w.vehicles.filter((v) => v.brain);
    for (const v of npcs) {
      const [first, last] = v.brain!.driver.split(' ');
      expect(FIRST_NAMES).toContain(first);
      expect(SURNAMES).toContain(last);
    }
    expect(new Set(npcs.map((v) => v.brain!.driver)).size).toBeGreaterThan(1);
    const later = endTurn(endTurn(w, testDrive), testDrive);
    for (const v of npcs) expect(later.vehicles.find((x) => x.id === v.id)?.brain?.driver).toBe(v.brain!.driver);
  }, budget(15_000));

  it('places the first drivers by the world seed', () => {
    const spots = (seed: number) => startWorld(seed).vehicles.filter((v) => v.brain).map((v) => v.pos);
    expect(spots(1337)).toEqual(spots(1337));
    expect(spots(1337)).not.toEqual(spots(42));
  }, budget(15_000));

  it('holds the start roster in the queue with a dealt site each, and spawns only the start traffic and the Hollow cars', () => {
    const w = queuedWorld(1337);
    expect(w.spawnQueue.map((e) => e.templateId).sort()).toEqual([...SPAWN.initial].sort());
    for (const entry of w.spawnQueue) expect([...REGION.towns, ...REGION.locations].some((s) => s.id === entry.siteId)).toBe(true);
    const onMap = w.vehicles.filter((v) => v.brain).map((v) => NPCS[v.brain!.templateId]);
    const traffic = onMap.filter((tpl) => tpl.spawn.kind !== 'hollow');
    expect(traffic.map((tpl) => tpl.id)).toEqual(SPAWN.startTraffic.templates);
  }, budget(15_000));

  it('spawns one queued entry each turn until the queue is empty', () => {
    const w = queuedWorld(1337);
    const total = w.spawnQueue.length;
    expect(total).toBeGreaterThan(SPAWN.startPerTurn);
    for (let turn = 1; turn <= total; turn++) {
      const entry = w.spawnQueue[0];
      const before = w.vehicles.filter((v) => v.brain?.templateId === entry.templateId).length;
      spawnNpcs(w);
      expect(w.spawnQueue).toHaveLength(total - turn * SPAWN.startPerTurn);
      expect(w.vehicles.filter((v) => v.brain?.templateId === entry.templateId).length).toBeGreaterThan(before);
    }
  }, budget(30_000));

  it('makes a timed spawn of a template wait while the queue still holds it', () => {
    const w = emptyWorld({ x: 5, y: 5 });
    const site = queuedWorld(1337).spawnQueue.find((e) => e.templateId === 'trader')!.siteId;
    w.spawnQueue = [{ templateId: 'trader', siteId: site }, { templateId: 'trader', siteId: site }];
    w.spawnTimer.trader = 1;
    const traders = () => w.vehicles.filter((v) => v.brain?.templateId === 'trader').length;
    spawnNpcs(w);
    expect(w.spawnQueue).toHaveLength(1);
    expect(traders()).toBe(1);
    spawnNpcs(w);
    expect(w.spawnQueue).toHaveLength(0);
    expect(traders()).toBe(2);
    w.spawnTimer.trader = 1;
    spawnNpcs(w);
    expect(traders()).toBe(3);
  });

  it('starts traders at the gate of the town the start road leaves', () => {
    const w = startWorld(2);
    const town = REGION.towns.find((t) => t.id === SPAWN.startTraffic.town)!;
    const player = w.vehicles.find((v) => v.id === w.player.vehicleId)!;
    const gate = siteGates(town).reduce((a, b) => (dist(player.pos, a) <= dist(player.pos, b) ? a : b));
    const atGate = w.vehicles.filter((v) => v.brain?.templateId === 'trader' && dist(v.pos, gate) <= SPAWN.gateSpread + 3);
    expect(atGate.length).toBeGreaterThanOrEqual(SPAWN.startTraffic.templates.length);
  }, budget(15_000));

  it('starts each driver with its template wallet', () => {
    const w = startWorld(1337);
    const wallets = (templateId: string) => w.vehicles.filter((v) => v.brain?.templateId === templateId).map((v) => v.resources!.money);
    for (const id of ['trader', 'convoy', 'scavenger']) {
      expect(wallets(id).length).toBeGreaterThan(0);
      for (const money of wallets(id)) expect(money).toBe(NPCS[id].money);
    }
    expect(NPCS.trader.money).toBeGreaterThan(NPCS.scavenger.money);
  }, 15_000);

  it('starts a pair of couriers with one following the other on every seed', () => {
    for (const seed of [1, 42, 1337]) {
      const w = startWorld(seed);
      const couriers = w.vehicles.filter((v) => v.brain?.templateId === 'courier');
      expect(couriers).toHaveLength(2);
      const ids = couriers.map((c) => c.id);
      const states = w.states.filter((s) => s.kind === 'escort' && ids.includes(s.holder));
      expect(states.map((s) => [s.holder, s.other])).toEqual([[couriers[1].id, couriers[0].id]]);
    }
  }, budget(30_000));

  describe('courier respawns', () => {
    const couriersOf = (w: ReturnType<typeof emptyWorld>) => w.vehicles.filter((v) => v.brain?.templateId === 'courier');
    const tick = (w: ReturnType<typeof emptyWorld>) => {
      w.spawnTimer.courier = 1;
      spawnNpcs(w);
    };
    const far = () => emptyWorld({ x: 5, y: 5 });

    it('spawns a pair when no courier is left', () => {
      const w = far();
      tick(w);
      expect(couriersOf(w)).toHaveLength(2);
      expect(w.states.filter((s) => s.kind === 'escort')).toHaveLength(1);
    });

    it('spawns one partner for a lone courier at the site nearest it', () => {
      const w = far();
      tick(w);
      const [leader, follower] = couriersOf(w);
      w.states = [];
      w.vehicles = w.vehicles.filter((v) => v.id !== follower.id);
      tick(w);
      const partner = couriersOf(w).find((v) => v.id !== leader.id)!;
      expect(partner).toBeDefined();
      expect(w.states.some((s) => s.kind === 'escort' && s.holder === partner.id && s.other === leader.id)).toBe(true);
      expect(siteGap(nearestSite(leader.pos), partner.pos)).toBeLessThanOrEqual(SPAWN.gateSpread + 12);
    });

    it('spawns nothing at the cap, or one under it with no lone courier', () => {
      const w = far();
      tick(w);
      tick(w);
      expect(couriersOf(w)).toHaveLength(NPCS.courier.cap);
      tick(w);
      expect(couriersOf(w)).toHaveLength(NPCS.courier.cap);
      const lost = couriersOf(w).find((v) => !w.states.some((s) => s.holder === v.id))!;
      w.vehicles = w.vehicles.filter((v) => v.id !== lost.id);
      w.states = [];
      for (const v of couriersOf(w)) v.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };
      tick(w);
      expect(couriersOf(w)).toHaveLength(NPCS.courier.cap - 1);
    });
  });

  it('never respawns a driver close to the player (timed spawns)', () => {
    const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
    const w = emptyWorld(sitePads(bowl)[0]);
    for (let i = 0; i < 60; i++) {
      w.spawnTimer.trader = 1;
      spawnNpcs(w);
      const spawned = w.vehicles.filter((v) => v.brain);
      for (const v of spawned) expect(dist(v.pos, playerVehicle(w).pos)).toBeGreaterThanOrEqual(SPAWN.minPlayerDist);
      w.vehicles = w.vehicles.filter((v) => !v.brain);
    }
  });
});

describe('spawn room', () => {
  it('sends a respawn past a crowded gate', () => {
    const towns = REGION.towns;
    const open = towns[0];
    const w = emptyWorld({ x: 5, y: 5 });
    let n = 0;
    for (const site of [...towns, ...REGION.locations.filter((l) => l.kind !== 'camp' && l.kind !== 'territory')].filter((s) => s.id !== open.id)) {
      for (const gate of siteGates(site)) {
        for (let i = 0; i < SPAWN.crowd.most; i++) {
          addVehicle(w, 'independent', 'scout', [], { x: gate.x + (i % 2) * 0.1, y: gate.y + i * 0.1 });
          n++;
        }
      }
    }
    for (let i = 0; i < 30; i++) {
      w.spawnTimer.trader = 1;
      const before = w.vehicles.length;
      spawnNpcs(w);
      const fresh = w.vehicles.slice(before).find((v) => v.brain?.templateId === 'trader');
      if (fresh) {
        const crowd = w.vehicles.filter((v) => !v.brain && dist(v.pos, fresh.pos) < SPAWN.crowd.reach).length;
        expect(crowd).toBeLessThan(SPAWN.crowd.most);
        w.vehicles = w.vehicles.filter((v) => v !== fresh);
      } else expect(w.events.some((e) => e.t === 'info' && e.note.id === 'spawnBlocked')).toBe(true);
    }
  }, budget(30_000));

  it('keeps a courier partner away from the player', () => {
    const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
    const w = emptyWorld(sitePads(bowl)[0]);
    for (let i = 0; i < 20; i++) {
      w.spawnTimer.courier = 1;
      spawnNpcs(w);
      for (const v of w.vehicles.filter((x) => x.brain)) expect(dist(v.pos, playerVehicle(w).pos)).toBeGreaterThanOrEqual(SPAWN.minPlayerDist);
      w.vehicles = w.vehicles.filter((v) => !v.brain);
      w.states = [];
    }
  });

  it('staggers the first respawn of templates that share an interval', () => {
    const w = emptyWorld({ x: 5, y: 5 });
    const turns: Record<string, number[]> = {};
    for (let t = 1; t <= 300; t++) {
      const before = w.vehicles.length;
      spawnNpcs(w);
      for (const v of w.vehicles.slice(before)) (turns[v.brain!.templateId] ??= []).push(t);
      w.vehicles = w.vehicles.filter((v) => !v.brain);
      w.states = [];
    }
    expect(turns.trader[0]).toBe(NPCS.trader.interval);
    expect(turns.scavenger[0]).toBe(NPCS.scavenger.interval + NPCS.scavenger.interval / 2);
    const solo = Object.values(NPCS).filter((tpl) => tpl.spawn.kind !== 'escort' && turns[tpl.id]);
    for (const a of solo) for (const b of solo) {
      if (a.id < b.id && a.interval === b.interval) expect(turns[a.id].filter((t) => turns[b.id].includes(t))).toEqual([]);
    }
  }, budget(30_000));
});

describe('free spots', () => {
  const world = startWorld(1337);
  world.vehicles = world.vehicles.filter((v) => v.faction === 'player');
  const fallenSun = REGION.locations.find((l) => l.id === 'fallen-sun')!;
  const cage = territoryPieces(fallenSun as never).find((p) => p.look === 'shipCage')!;
  const hub = territoryPieces(fallenSun as never).find((p) => p.look === 'shipHub')!;

  it('counts the lane inside a hull a truck drives through as free, by its low boxes', () => {
    const lane = { x: cage.pos.x + Math.cos(cage.yaw) * -1.5, y: cage.pos.y + Math.sin(cage.yaw) * -1.5 };
    expect(isFree(world, lane, 0.6, null)).toBe(true);
  });

  it('keeps a solid piece and its walls taken', () => {
    expect(isFree(world, hub.pos, 0.6, null)).toBe(false);
    const wall = { x: cage.pos.x + Math.sin(cage.yaw) * 3.8, y: cage.pos.y - Math.cos(cage.yaw) * 3.8 };
    expect(isFree(world, wall, 0.6, null)).toBe(false);
  });
});

describe('NPC allegiance', () => {
  const site = (id: string) => [...REGION.towns, ...REGION.locations].find((s) => s.id === id)!;

  it('gives raiders the camp they spawn at, couriers the Guild and road drivers no faction', () => {
    const w = emptyWorld();
    expect(allegianceFor(w, NPCS.buggy, site('scrapjaw'), null)).toBe('scrapjaw');
    expect(allegianceFor(w, NPCS.gunwagon, site('kiln'), null)).toBe('kiln');
    expect(allegianceFor(w, NPCS.courier, site('bowl'), null)).toBe('guidestar');
    for (const id of ['scavenger', 'roamer', 'vulture', 'merc']) expect(allegianceFor(w, NPCS[id], site('nose'), null)).toBe('independent');
  });

  it('gives patrols and convoys their town, and a guard the faction of the convoy it escorts', () => {
    const w = emptyWorld();
    expect(allegianceFor(w, NPCS.bowlFarmer, site('bowl'), null)).toBe('bowl');
    expect(allegianceFor(w, NPCS.convoy, site('nose'), null)).toBe('nose');
    const convoy = addVehicle(w, 'nose', 'van', [], { x: 40, y: 30 });
    expect(allegianceFor(w, NPCS.convoyGuard, null, convoy)).toBe('nose');
  });

  it('falls back to the template faction with no site, which only Chaos Highway and cheats use', () => {
    const w = emptyWorld();
    expect(allegianceFor(w, NPCS.buggy, null, null)).toBe('scrapjaw');
    expect(allegianceFor(w, NPCS.trader, null, null)).toBe('independent');
    expect(allegianceFor(w, NPCS.trader, site('orchard'), null)).toBe('independent');
  });

  it('gives about one town trader in three the papers of its town, by the world seed', () => {
    const w = emptyWorld();
    const picks = Array.from({ length: 600 }, () => allegianceFor(w, NPCS.trader, site('bowl'), null));
    const share = picks.filter((f) => f === 'bowl').length / picks.length;
    expect(share).toBeGreaterThan(0.27);
    expect(share).toBeLessThan(0.4);
    expect(picks.every((f) => f === 'bowl' || f === 'independent')).toBe(true);
  });

  it('spawns a new world with town and independent traders, and Nose papers from its town', () => {
    const factions = new Set<string>();
    for (const seed of [1337, 2]) {
      for (const v of startWorld(seed).vehicles.filter((x) => x.brain?.templateId === 'trader')) factions.add(v.faction);
    }
    expect(factions.has('independent')).toBe(true);
    expect([...factions].every((f) => ['bowl', 'independent', 'nose'].includes(f))).toBe(true);
    const w = emptyWorld();
    const atNose = new Set(Array.from({ length: 600 }, () => allegianceFor(w, NPCS.trader, site('nose'), null)));
    expect([...atNose].sort()).toEqual(['independent', 'nose']);
  });
});

describe('a blocked start spawn', () => {
  const SMALL_MAP = 500;
  const siteOf = (id: string) => [...REGION.towns, ...REGION.locations].find((s) => s.id === id)!;
  const blocked: QueuedSpawn = { templateId: 'bowlFarmer', siteId: 'bowl' };
  const free: QueuedSpawn = { templateId: 'buggy', siteId: 'scrapjaw' };
  const smallWorld = () => {
    const w = emptyWorld({ x: 5, y: 5 });
    w.size = SMALL_MAP;
    w.spawnQueue = [{ ...blocked }, { ...free }, { ...free }];
    return w;
  };
  const roster = (w: ReturnType<typeof emptyWorld>) => w.vehicles.filter((v) => v.brain).map((v) => v.brain!.templateId);

  it('has a blocked entry and a free one to test with', () => {
    expect(siteOf(blocked.siteId).pos.y).toBeGreaterThan(SMALL_MAP);
    expect(siteOf(free.siteId).pos.x).toBeLessThan(SMALL_MAP);
    expect(siteOf(free.siteId).pos.y).toBeLessThan(SMALL_MAP);
  });

  it('waits in the queue while the entry behind it spawns that turn', () => {
    const w = smallWorld();
    spawnNpcs(w);
    expect(w.spawnQueue).toEqual([blocked, free]);
    expect(roster(w)).toEqual([free.templateId]);
  });

  it('spawns no more than the start rate when several entries are free', () => {
    const w = smallWorld();
    w.spawnQueue = [{ ...free }, { ...free }, { ...free }];
    spawnNpcs(w);
    expect(w.spawnQueue).toHaveLength(3 - SPAWN.startPerTurn);
    expect(roster(w)).toHaveLength(SPAWN.startPerTurn);
  });

  it('gives the same world when run twice', () => {
    const run = () => {
      const w = smallWorld();
      spawnNpcs(w);
      return w;
    };
    expect(run()).toEqual(run());
  });
});
