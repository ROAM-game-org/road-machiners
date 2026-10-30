import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { advanceFar } from './far';
import { corePart, mountedParts } from './grid';
import { onRouteRoad, terrainNav } from './nav/layer';
import { topGoal } from './npc-activities';
import { routeStyle } from './off-road';
import { sitePads } from './sites';
import { addVehicle, editableTerrain, emptyWorld, npcBrain } from './testkit';
import { npcHomeSite } from './tow';
import type { TraitId } from '../data/npcs';
import type { Faction, NpcActivity, Vehicle, World } from './types';
import { dist } from './vec';
import { endTurn } from './world';
import { worldLine } from './progression/turn-log';
import { TEST_MAP } from '../test/map';
import { TIME } from '../data/time';

function driver(w: World, faction: Faction, goal: NpcActivity['kind'] | null): Vehicle {
  const v = addVehicle(w, faction, 'buggy', ['mg', 'stockEngine'], { x: 40, y: 30 });
  v.brain = npcBrain('test', { x: 60, y: 60 }, faction === 'scrapjaw' || faction === 'kiln' ? ['raider'] : []);
  if (goal) v.brain.goals = [{ kind: goal, targetId: null, destination: { x: 60, y: 60 }, phase: 'travel', reason: 'tripToSite' }];
  return v;
}

describe('routeStyle', () => {
  it('holds for a raider that retreats or flees', () => {
    const w = emptyWorld();
    expect(routeStyle(w, driver(w, 'scrapjaw', 'retreat'))).toBe('hidden');
    expect(routeStyle(w, driver(w, 'scrapjaw', 'flee'))).toBe('hidden');
  });

  it('holds for a stranded raider whatever its goal', () => {
    const w = emptyWorld();
    const dry = driver(w, 'scrapjaw', 'sell');
    dry.resources!.fuel = 0;
    const geared = driver(w, 'scrapjaw', 'fight');
    corePart(geared, 'transmission').hp = 0;
    const engineless = driver(w, 'scrapjaw', null);
    mountedParts(engineless, 'engine')[0].hp = 0;
    expect([dry, geared, engineless].map((v) => routeStyle(w, v))).toEqual(['hidden', 'hidden', 'hidden']);
  });

  it('leaves a healthy raider not hunting on the roads', () => {
    const w = emptyWorld();
    for (const goal of ['sell', 'fight', null] as const) expect(routeStyle(w, driver(w, 'scrapjaw', goal))).toBe('road');
  });

  it('sends a raider out on a raid, a patrol or an investigation off the roads', () => {
    const w = emptyWorld();
    for (const goal of ['raid', 'patrol', 'investigate'] as const) {
      const v = driver(w, 'scrapjaw', goal);
      v.brain!.traits = ['raider'];
      expect(routeStyle(w, v)).toBe('hidden');
    }
  });

  it('leaves other factions and the player on the roads', () => {
    const w = emptyWorld();
    const trader = driver(w, 'independent', 'travel');
    trader.resources!.fuel = 0;
    expect(routeStyle(w, trader)).toBe('road');
    expect(routeStyle(w, driver(w, 'nose', 'flee'))).toBe('road');
    w.player.fuel = 0;
    expect(routeStyle(w, w.vehicles[0])).toBe('road');
  });

  it('gives scavengers and roamers the cut style and every other trade the road', () => {
    const w = emptyWorld();
    const styleOf = (trait: TraitId) => {
      const v = driver(w, 'independent', 'travel');
      v.brain!.traits = [trait];
      return routeStyle(w, v);
    };
    expect([styleOf('scavenger'), styleOf('roamer')]).toEqual(['cut', 'cut']);
    for (const trait of ['trader', 'courier', 'guard', 'lawman', 'merc'] as const) expect(styleOf(trait), trait).toBe('road');
  });

  it('keeps a raider scavenger hidden while it flees and cut otherwise', () => {
    const w = emptyWorld();
    const flee = driver(w, 'scrapjaw', 'flee');
    flee.brain!.traits = ['raider', 'scavenger'];
    expect(routeStyle(w, flee)).toBe('hidden');
    const idle = driver(w, 'scrapjaw', 'sell');
    idle.brain!.traits = ['raider', 'scavenger'];
    expect(routeStyle(w, idle)).toBe('cut');
  });
});

describe('routeStyle for the Sunward', () => {
  const atHour = (hour: number): number => Math.ceil(1 + (hour - TIME.startHour) * (TIME.turnsPerDay / 24));

  function member(w: World): Vehicle {
    const v = driver(w, 'sunward', 'explore');
    v.brain = { ...npcBrain('cavalcade', { x: 60, y: 60 }, ['cultist']), goals: v.brain!.goals };
    return v;
  }

  it('sends a member off the roads by day and lets it take them at night', () => {
    const w = emptyWorld();
    const car = member(w);
    w.turn = atHour(15);
    expect(routeStyle(w, car)).toBe('hidden');
    w.turn = atHour(21);
    expect(routeStyle(w, car)).toBe('road');
  });

  it('leaves a trader on the roads by day and by night', () => {
    const w = emptyWorld();
    const trader = driver(w, 'independent', 'travel');
    for (const hour of [15, 21]) {
      w.turn = atHour(hour);
      expect(routeStyle(w, trader)).toBe('road');
    }
  });

  it('lets a member take the roads once the order has fallen', () => {
    const w = emptyWorld();
    const car = member(w);
    w.turn = atHour(15);
    w.sunward!.collapsed = w.turn;
    expect(routeStyle(w, car)).toBe('road');
  });
});

describe('the recorder world log', () => {
  it('tells which trucks keep off roads and which stand on a road', () => {
    const w = emptyWorld();
    w.turn = 20;
    const runner = driver(w, 'scrapjaw', 'flee');
    const healthy = driver(w, 'scrapjaw', 'sell');
    const trucks = worldLine(w, [])!.trucks!;
    expect(trucks.find((t) => t.id === runner.id)).toMatchObject({ style: 'hidden', onRoad: true });
    expect(trucks.find((t) => t.id === healthy.id)).toMatchObject({ style: 'road', onRoad: true });
  });
});

describe('raiders keeping off roads in the turn pipeline', () => {
  const kilnAt = REGION.locations.find((l) => l.id === 'kiln')!.pos;
  const nearKiln = (dx: number, dy: number) => ({ x: kilnAt.x + dx, y: kilnAt.y + dy });
  function campRoad(): World {
    const w = emptyWorld();
    const t = editableTerrain(w);
    for (let i = 0; i < t.types.length; i++) {
      const x = (i % t.size) + 0.5;
      const y = Math.floor(i / t.size) + 0.5;
      t.types[i] = Math.abs(x - (kilnAt.x - 5)) < 3 && y > kilnAt.y - 180 && y < kilnAt.y + 4 ? 'road' : 'hardpan';
    }
    return w;
  }

  function raider(w: World, pos: { x: number; y: number }): Vehicle {
    const v = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], pos, Math.PI / 2);
    v.brain = npcBrain('buggy', pos, ['raider']);
    return v;
  }

  function play(w: World, turns: number, each: (w: World) => boolean | void): World {
    for (let i = 0; i < turns; i++) {
      w = endTurn(w, (x) => {
        for (const v of x.vehicles) advanceFar(x, v);
      });
      if (each(w)) break;
    }
    return w;
  }

  const byId = (w: World, id: string) => w.vehicles.find((v) => v.id === id)!;
  const onRoad = (w: World, v: Vehicle) => onRouteRoad(terrainNav(w.terrain), v.pos.x, v.pos.y);

  it('takes a raider retreating after a knockout beside the road to its camp, where it lies up to refit', () => {
    let w = campRoad();
    const id = raider(w, nearKiln(-5, -35)).id;
    const start = byId(w, id);
    start.defeat = { phase: 'retreat', turns: 3, unseen: 0, foes: [], gaveUp: true };
    const pad = sitePads(npcHomeSite(TEST_MAP, start)!)[0];
    const road: number[] = [];
    let turn = 0;
    w = play(w, 14, (w) => {
      const v = byId(w, id);
      turn++;
      if (v.brain!.goals.at(-1)?.kind === 'rearm') return true;
      if (v.order) expect(v.brain!.farRoute?.style).toBe('hidden');
      if (onRoad(w, v)) road.push(turn);
    });
    expect(Math.max(0, ...road)).toBeLessThanOrEqual(4);
    const v = byId(w, id);
    expect(v.brain!.goals.at(-1)?.kind).toBe('rearm');
    expect(dist(v.pos, pad)).toBeLessThan(3);
  }, 120_000);

  it('sends a stranded raider beside the road while a stranded trader and a raider not hunting keep their roads', () => {
    let w = campRoad();
    const dry = raider(w, nearKiln(-5, -80));
    dry.resources!.fuel = 0;
    const trader = addVehicle(w, 'independent', 'hauler', ['stockEngine'], nearKiln(-4, -130), Math.PI / 2);
    trader.brain = npcBrain('trader', trader.pos, ['trader']);
    trader.resources!.fuel = 0;
    const patrol = raider(w, nearKiln(-5, -160));
    patrol.brain!.goals = [{ kind: 'sell', targetId: 'kiln', destination: nearKiln(-5, -10), phase: 'travel', reason: 'patrolTown' }];
    w = play(w, 7, (w) => {
      expect(byId(w, trader.id).brain!.farRoute?.style).toBe('road');
      expect(byId(w, patrol.id).brain!.farRoute?.style).toBe('road');
      expect(onRoad(w, byId(w, patrol.id))).toBe(true);
      expect(byId(w, dry.id).brain!.farRoute?.style).toBe('hidden');
    });
    expect(topGoal(byId(w, dry.id))?.kind).toBe('resupply');
    expect(onRoad(w, byId(w, dry.id))).toBe(false);
    byId(w, patrol.id).resources!.fuel = 0;
    w = play(w, 6, () => {});
    expect(byId(w, patrol.id).brain!.farRoute?.style).toBe('hidden');
    expect(onRoad(w, byId(w, patrol.id))).toBe(false);
  }, 120_000);
});
