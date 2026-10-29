import { describe, expect, it } from 'vitest';
import { FIRST_NAMES, NPCS, SPAWN, SURNAMES } from '../data/npcs';
import { REGION } from '../data/region';
import { START_KITS } from '../data/start';
import { playerVehicle } from './damage';
import { siteGap, siteGates, sitePads } from './sites';
import { allegianceFor, isFree, spawnNpcs } from './spawn';
import { territoryPieces } from './territory';
import { addVehicle, emptyWorld, testDrive } from './testkit';
import { dist } from './vec';
import { endTurn, newWorld } from './world';
import { TEST_MAP } from '../test/map';
import { budget } from '../test/budget';
import { reusedWorld } from '../test/world-cache';
import { defaultSetup } from './settings';

const startWorld = (seed: number) => reusedWorld(`start ${seed}`, () => newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming')));

const NEUTRAL_SITES = [...REGION.towns, ...REGION.locations.filter((l) => l.kind !== 'camp')];
const nearestSite = (pos: { x: number; y: number }) =>
  NEUTRAL_SITES.reduce((best, site) => (siteGap(site, pos) < siteGap(best, pos) ? site : best));

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

  it('starts the whole roster on every seed, with the dealt neutral drivers spread evenly over the sites', () => {
    const guards = SPAWN.initial.filter((id) => id === 'convoy').map(() => 'convoyGuard');
    const partners = SPAWN.initial.filter((id) => NPCS[id].pairs);
    const order = Object.values(NPCS).filter((tpl) => tpl.spawn.kind === 'hollow').flatMap((tpl) => Array<string>(tpl.cap).fill(tpl.id));
    const roster = [...SPAWN.initial, ...SPAWN.startTraffic.templates, ...guards, ...partners, ...order].sort();
    const neutralSites = REGION.towns.length + REGION.locations.filter((l) => l.kind !== 'camp' && l.kind !== 'territory').length;
    for (const seed of [1, 2, 42, 1337, 7919, 15838, 23757, 31676]) {
      const world = startWorld(seed);
      const npcs = world.vehicles.filter((v) => v.brain);
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
    }
  }, budget(60_000));

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
