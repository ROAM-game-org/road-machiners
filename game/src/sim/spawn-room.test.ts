import { describe, expect, it } from 'vitest';
import { NPCS, SPAWN } from '../data/npcs';
import { REGION } from '../data/region';
import { playerVehicle } from './damage';
import { siteGates, sitePads } from './sites';
import { spawnNpcs } from './spawn';
import { addVehicle, emptyWorld } from './testkit';
import { dist } from './vec';
import type { QueuedSpawn } from './types';
import { budget } from '../test/budget';

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
