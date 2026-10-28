import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../data/terrain';
import { PHYSICS } from '../data/physics';
import { hulkBoxes } from './body';
import { PERK_NUMBERS, SKILL_EFFECTS } from '../data/skills';
import { WEATHER } from '../data/weather';
import { addVehicle, emptyWorld, PLAIN_KIT, practiceOf, settleStorms } from './testkit';
import { playerVehicle } from './damage';
import { propsAround } from './prop-index';
import { litFlares } from './hazards';
import { tileSteepness } from '../mapgen/bake';
import { REGION } from '../data/region';
import { dist } from './vec';
import { heightAt } from './terrain';
import type { Obstacle } from './types';
import { contactsOf, soundRange } from './detect';
import { TIME } from '../data/time';
import { sunAt } from './sun';
import { canVehicleSee, clearOverTerrain, grayRadius, grayReach, hasLineOfFire, hasLineOfSight, playerVisible, practiceContacts, refreshVision, seenPropTiles, sightLine, sightRadius, visibleTiles } from './vision';
import { TEST_MAP } from '../test/map';
import { DECKS, deckAt } from './bridge';
import type { World } from './types';
import type { Vec } from './vec';
import { newWorld } from './world';
import { reusedWorld } from '../test/world-cache';
import { defaultSetup } from './settings';
import { ICARUS_DECKS } from './bridge';

function realMapWorld(): World {
  return reusedWorld('real map without traffic', () => newWorld(1, PLAIN_KIT, TEST_MAP, defaultSetup('roaming'), false));
}

describe('vision', () => {
  it('sees an unblocked tile within radius', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const vis = visibleTiles(w, { x: 30, y: 30 });
    expect(vis.has(31 * w.size + 34)).toBe(true);
  });

  it('is blocked by an obstacle between the viewer and the tile', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.obstacles = [{ id: 'r', pos: { x: 33, y: 30 }, r: 1.2, kind: 'rock' }];
    const from = { x: 30, y: 30 };
    const near = visibleTiles(w, from);
    expect(near.has(30 * w.size + 31)).toBe(true);
    expect(near.has(30 * w.size + 36)).toBe(false);
  });

  it('sees behind a rock within the close radius', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.obstacles = [{ id: 'r', pos: { x: 31.2, y: 30.5 }, r: 1.2, kind: 'rock' }];
    const vis = visibleTiles(w, { x: 30, y: 30.5 });
    expect(vis.has(30 * w.size + 32)).toBe(true);
    expect(vis.has(30 * w.size + 35)).toBe(false);
  });

  it('lets an NPC see a vehicle behind a rock within the close radius', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.obstacles = [{ id: 'r', pos: { x: 31.2, y: 30 }, r: 1.2, kind: 'rock' }];
    const npc = { ...w.vehicles[0], id: 'npc', pos: { x: 30, y: 30 } };
    expect(canVehicleSee(w, npc, { x: 32.5, y: 30 })).toBe(true);
    expect(canVehicleSee(w, npc, { x: 35.5, y: 30 })).toBe(false);
  });

  it('does not block sight past water', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.obstacles = [{ id: 'pond', pos: { x: 33, y: 30 }, r: 1.2, kind: 'water' }];
    const vis = visibleTiles(w, { x: 30, y: 30 });
    expect(vis.has(30 * w.size + 36)).toBe(true);
  });

  it('sees over a fence but not past a shack', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const from = { x: 30, y: 30 };
    w.obstacles = [{ id: 'fence-0', pos: { x: 33, y: 30 }, r: 0.5, kind: 'landmark', look: 'fence', yaw: Math.PI / 2 }];
    const pastFence = visibleTiles(w, from).has(30 * w.size + 36);
    w.obstacles = [{ id: 'shack-0', pos: { x: 33, y: 30 }, r: 1.2, kind: 'landmark', look: 'shack', yaw: 0 }];
    const pastShack = visibleTiles(w, from).has(30 * w.size + 36);

    expect(pastFence).toBe(true);
    expect(pastShack).toBe(false);
  });

  it('lets an NPC see and a gun fire over a fence', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.obstacles = [{ id: 'fence-0', pos: { x: 33, y: 30 }, r: 0.5, kind: 'landmark', look: 'fence', yaw: Math.PI / 2 }];
    const npc = { ...w.vehicles[0], id: 'npc', pos: { x: 30, y: 30 } };

    expect(canVehicleSee(w, npc, { x: 36.5, y: 30 })).toBe(true);
    expect(hasLineOfFire(w, { x: 30, y: 30 }, { x: 36.5, y: 30 })).toBe(true);
  });

  it('is blocked by a kill wreck hulk only where its chassis reaches eye height', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const eye = TERRAIN.vision.eyeHeight * PHYSICS.metersPerTile;
    const line = (chassisId: string) => {
      w.obstacles = [{ id: 'wreck-npc7', pos: { x: 33, y: 30 }, r: 0.9, kind: 'wreck', hulk: { chassisId, yaw: Math.PI / 2 } }];
      return hasLineOfFire(w, { x: 30, y: 30 }, { x: 36.5, y: 30 });
    };
    const reachesEye = (chassisId: string) => hulkBoxes(chassisId, undefined).some(({ box: b }) => b.z0 <= eye && b.z1 >= eye && b.x0 <= 0 && b.x1 >= 0);

    expect(reachesEye('loader')).toBe(true);
    expect(reachesEye('buggy')).toBe(false);
    expect(line('loader')).toBe(false);
    expect(line('buggy')).toBe(true);
  });

  it('sees over a junk pile lower than the eye', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.obstacles = [{ id: 'junk-0', pos: { x: 33, y: 30 }, r: 1.2, kind: 'landmark', look: 'junk', yaw: 0 }];

    expect(hasLineOfFire(w, { x: 30, y: 30 }, { x: 36.5, y: 30 })).toBe(true);
  });

  it('sees over the rubble of a ruin but not through its standing wall', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.obstacles = [{ id: 'ruin-0', pos: { x: 33, y: 30 }, r: 1.2, kind: 'landmark', look: 'ruin', yaw: 0 }];
    const line = (modelY: number) => hasLineOfFire(w, { x: 28, y: 30 - modelY / 4 }, { x: 38, y: 30 - modelY / 4 });

    expect(line(-3.7)).toBe(true);
    expect(line(-3)).toBe(false);
    expect(line(0)).toBe(false);
  });

  it('sees a ruin wall that holds the target', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.obstacles = [{ id: 'ruin-0', pos: { x: 33, y: 30 }, r: 1.2, kind: 'landmark', look: 'ruin', yaw: 0 }];
    const eastWall = { x: 33 + 4 / 4, y: 30 };

    expect(hasLineOfFire(w, { x: 40, y: 30 }, eastWall)).toBe(true);
    expect(hasLineOfFire(w, { x: 26, y: 30 }, eastWall)).toBe(false);
  });

  it('respects the vision radius', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const vis = visibleTiles(w, { x: 30, y: 30 });
    const far = 30 + TERRAIN.vision.radius + 3;
    expect(vis.has(30 * w.size + far)).toBe(false);
  });

  it('keeps explored tiles marked after the player drives away', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    refreshVision(w);
    const idx = 30 * w.size + 30;
    expect(w.player.explored[idx]).toBe(1);
    w.vehicles.find((v) => v.id === w.player.vehicleId)!.pos = { x: 55, y: 55 };
    refreshVision(w);
    expect(playerVisible(w).has(idx)).toBe(false);
    expect(w.player.explored[idx]).toBe(1);
  });
});

describe('terrain line of sight', () => {
  it('a hill between viewer and tile blocks sight', async () => {
    const { heightAt } = await import('./terrain');
    const w = emptyWorld({ x: 30, y: 30 });
    w.terrain = TEST_MAP.terrain;
    const elevationAt = (_seed: number, x: number, y: number) => heightAt(w.terrain, x, y);
    let found: { a: { x: number; y: number }; b: { x: number; y: number } } | null = null;
    for (let x = 6; x < w.size - 6 && !found; x++) {
      for (let y = 2; y < w.size - 2 && !found; y++) {
        const peak = elevationAt(w.seed, x, y);
        const a = { x: x - 4, y }, b = { x: x + 4, y };
        if (peak - Math.max(elevationAt(w.seed, a.x, a.y), elevationAt(w.seed, b.x, b.y)) > TERRAIN.vision.eyeHeight) found = { a, b };
      }
    }
    expect(found, 'no hill found for this seed').not.toBeNull();
    w.obstacles = [];
    const vis = visibleTiles(w, found!.a);
    expect(vis.has(Math.floor(found!.b.y) * w.size + Math.floor(found!.b.x))).toBe(false);
  });

  it('reaches gray vision a fixed number of sight radii out', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.turn = Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => sunAt(t))!;
    expect(grayRadius(w)).toBe(TERRAIN.vision.radius * TERRAIN.vision.grayFactor);
  });

  it('keeps the gray reach of a clear day at night and in a storm, and widens it with a tourer chassis', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const day = Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => sunAt(t))!;
    w.turn = day;
    const clear = grayReach(w, w.vehicles[0]);
    expect(clear).toBe(grayRadius(w));
    w.turn = Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => !sunAt(t))!;
    w.weather = [{ id: 'w1', kind: 'storm', pos: { x: 30, y: 30 }, radius: 60, vel: { x: 0, y: 0 }, turnsLeft: 100, born: w.turn - 100 }];
    expect(grayRadius(w)).toBeLessThan(clear);
    expect(grayReach(w, w.vehicles[0])).toBe(clear);
    expect(grayReach(w, { ...w.vehicles[0], chassisId: 'lincoln' })).toBeGreaterThan(clear);
  });

  it('shrinks gray vision at night with sight', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.turn = Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => !sunAt(t))!;
    expect(grayRadius(w)).toBe(sightRadius(w, w.vehicles[0]) * TERRAIN.vision.grayFactor);
    expect(grayRadius(w)).toBeLessThan(TERRAIN.vision.radius * TERRAIN.vision.grayFactor);
  });
});

describe('contact practice', () => {
  function heardBuggy() {
    const w = emptyWorld({ x: 30, y: 30 });
    w.turn = Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => !sunAt(t))!;
    const buggy = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 45, y: 30 });
    buggy.speed = 6;
    return { w, buggy };
  }

  it('pays the player once for a newly heard truck, harder near the edge of hearing', () => {
    const { w, buggy } = heardBuggy();
    practiceContacts(w, refreshVision(w));
    const [event] = practiceOf(w, 'contact');
    expect(event.amount).toBe(1);
    expect(event.difficulty).toBeCloseTo(15 / soundRange(w, buggy));
    practiceContacts(w, refreshVision(w));
    expect(practiceOf(w, 'contact')).toHaveLength(1);
  });

  it('pays nothing for a truck in sight', () => {
    const { w, buggy } = heardBuggy();
    buggy.pos = { x: 34, y: 30 };
    practiceContacts(w, refreshVision(w));
    expect(practiceOf(w, 'contact')).toEqual([]);
  });

  it('rebuilds the view without paying, so a load awards nothing', () => {
    const { w, buggy } = heardBuggy();
    const xp = w.player.xp;
    expect(refreshVision(w).map((c) => c.vehicleId)).toEqual([buggy.id]);
    expect([practiceOf(w, 'contact'), w.player.xp]).toEqual([[], xp]);
  });

  it('pays nothing when an NPC hears a truck', () => {
    const { w, buggy } = heardBuggy();
    const trader = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 60, y: 30 });
    expect(contactsOf(w, trader, Infinity).map((c) => c.vehicleId)).toContain(buggy.id);
    expect(practiceOf(w, 'contact')).toEqual([]);
  });
});

describe('perception sight', () => {
  it('reaches farther for the player at rank 5', () => {
    const w = emptyWorld({ x: 60, y: 60 });
    const me = w.vehicles[0];
    const base = sightRadius(w, me);
    w.player.ranks.perception = 5;
    expect(sightRadius(w, me)).toBeCloseTo(base * (1 + 5 * SKILL_EFFECTS.perception.sight));
  });

  it('shows the player more tiles at rank 5', () => {
    const w = emptyWorld({ x: 60, y: 60 });
    const base = visibleTiles(w, { x: 60, y: 60 }).size;
    w.player.ranks.perception = 5;
    expect(visibleTiles(w, { x: 60, y: 60 }).size).toBeGreaterThan(base);
  });

  it('leaves NPC sight alone', () => {
    const w = emptyWorld({ x: 60, y: 60 });
    const npc = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 30 });
    const base = sightRadius(w, npc);
    w.player.ranks.perception = 5;
    expect(sightRadius(w, npc)).toBe(base);
  });
});


describe('the night eyes perk', () => {
  const night = () => Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => !sunAt(t))!;

  it('keeps the player full sight at night', () => {
    const w = emptyWorld({ x: 60, y: 60 });
    const me = w.vehicles[0];
    w.turn = night();
    expect(sightRadius(w, me)).toBeCloseTo(TERRAIN.vision.radius * TIME.nightSight);
    w.player.perks.push('nightEyes');
    expect(sightRadius(w, me)).toBeCloseTo(TERRAIN.vision.radius);
  });

  it('leaves NPC sight halved at night', () => {
    const w = emptyWorld({ x: 60, y: 60 });
    w.turn = night();
    w.player.perks.push('nightEyes');
    const npc = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 30 });
    expect(sightRadius(w, npc)).toBeCloseTo(TERRAIN.vision.radius * TIME.nightSight);
  });
});

describe('the storm rider perk', () => {
  const day = () => Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => sunAt(t))!;

  function stormWorld() {
    const w = emptyWorld({ x: 60, y: 60 });
    w.turn = day();
    w.weather = [{ id: 'w1', kind: 'storm', pos: { x: 60, y: 60 }, radius: 60, vel: { x: 0, y: 0 }, turnsLeft: 100, born: w.turn - 100 }];
    const npc = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 62, y: 60 });
    settleStorms(w);
    return { w, me: w.vehicles[0], npc };
  }

  it('keeps the player full sight in a storm', () => {
    const { w, me } = stormWorld();
    expect(sightRadius(w, me)).toBeCloseTo(TERRAIN.vision.radius * WEATHER.sim.effects.storm.sight);
    w.player.perks.push('stormRider');
    expect(sightRadius(w, me)).toBeCloseTo(TERRAIN.vision.radius);
  });

  it('leaves NPC sight cut in a storm', () => {
    const { w, npc } = stormWorld();
    w.player.perks.push('stormRider');
    expect(sightRadius(w, npc)).toBeCloseTo(TERRAIN.vision.radius * WEATHER.sim.effects.storm.sight);
  });
});

describe('a dust screen', () => {
  function screenWorld(pos: { x: number; y: number }, screen: boolean) {
    const w = emptyWorld({ x: 30, y: 30 });
    const npc = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 20, y: 30 });
    const me = w.vehicles[0];
    w.dustClouds = [{ id: 'dust', source: me.id, pos, vel: { x: 0, y: 0 }, age: 0, range: 50, ...(screen ? { screen: true as const } : {}) }];
    refreshVision(w);
    return { w, npc, me };
  }

  it('hides the player from an NPC behind it', () => {
    const { w, npc, me } = screenWorld({ x: 26, y: 30 + PERK_NUMBERS.dustScreen.radius * 0.9 }, true);
    expect(canVehicleSee(w, npc, me.pos)).toBe(false);
  });

  it('hides nothing as a plain cloud', () => {
    const { w, npc, me } = screenWorld({ x: 26, y: 30 }, false);
    expect(canVehicleSee(w, npc, me.pos)).toBe(true);
  });

  it('hides nothing off the sight line', () => {
    const { w, npc, me } = screenWorld({ x: 26, y: 30 + PERK_NUMBERS.dustScreen.radius * 1.1 }, true);
    expect(canVehicleSee(w, npc, me.pos)).toBe(true);
  });

  it('hides nothing beyond the target', () => {
    const { w, npc, me } = screenWorld({ x: 32, y: 30 }, true);
    expect(canVehicleSee(w, npc, me.pos)).toBe(true);
  });

  it('never blocks the player sight', () => {
    const { w, npc, me } = screenWorld({ x: 26, y: 30 }, true);
    expect(canVehicleSee(w, me, npc.pos)).toBe(true);
  });

  it('leaves the line of fire open', () => {
    const { w, npc, me } = screenWorld({ x: 26, y: 30 }, true);
    expect(hasLineOfFire(w, npc.pos, me.pos)).toBe(true);
  });
});

describe('sight from the wing', () => {
  const span = DECKS.find((d) => d.id === 'fallen-sun-wing')!;
  const [top, end] = [span.stations[1].at, span.stations[2].at];
  const mid = { x: (top.x + end.x) / 2, y: (top.y + end.y) / 2 };
  const across = { x: -span.axis.y, y: span.axis.x };
  const at = (p: Vec, along: number, side: number): Vec => ({ x: p.x + span.axis.x * along + across.x * side, y: p.y + span.axis.y * along + across.y * side });

  function wingWorld(): World {
    const w = realMapWorld();
    w.vehicles[0].pos = at(mid, 0, -5);
    return w;
  }
  const viewer = (w: World, pos: Vec) => addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], pos);

  it('sees a truck 15 tiles out on the furrow bank over a hull plate that hides it from the ground', () => {
    const w = wingWorld();
    const target = at(mid, 0, 15);
    const onSpan = viewer(w, mid);
    const onGround = viewer(w, at(mid, 0, 8));
    expect(deckAt(ICARUS_DECKS, onSpan.pos.x, onSpan.pos.y)?.deck.id).toBe(span.id);
    expect(deckAt(ICARUS_DECKS, onGround.pos.x, onGround.pos.y)).toBeNull();
    expect(canVehicleSee(w, onGround, target)).toBe(true);

    w.obstacles = [...w.obstacles, { id: 'plate', pos: at(mid, 0, 11), r: 1.3, kind: 'landmark', look: 'hullChunk', yaw: 0 }];

    expect(canVehicleSee(w, onGround, target)).toBe(false);
    expect(canVehicleSee(w, onSpan, target)).toBe(true);
  });

  it('sees and fires along the span over the piers under it', () => {
    const w = wingWorld();
    const piers = w.obstacles.filter((o) => o.kind === 'landmark' && o.look === 'hullDrum' && deckAt(ICARUS_DECKS, o.pos.x, o.pos.y)?.deck.id === span.id);
    expect(piers).toHaveLength(2);
    const from = at(top, 1, 0);
    const to = at(from, 15, 0);
    expect(deckAt(ICARUS_DECKS, to.x, to.y)?.deck.id).toBe(span.id);

    expect(canVehicleSee(w, viewer(w, from), to)).toBe(true);
    expect(hasLineOfFire(w, from, to)).toBe(true);
  });
});

describe('the viewshed against the line to every tile', () => {
  const world = realMapWorld();
  const t = world.terrain;
  const me = playerVehicle(world);

  function lineSeen(w: World, from: Vec, tile: Vec, props: readonly Obstacle[]): boolean {
    if (dist(from, tile) <= TERRAIN.vision.closeRadius) return true;
    const line = sightLine(w.terrain, from, tile);
    return hasLineOfSight(w.terrain, line, props, []) && clearOverTerrain(w.terrain, line);
  }

  function lineTilesIn(w: World, from: Vec, reach: number, disk: { pos: Vec; r: number }, out: Set<number>): void {
    const props = propsAround(w, 'sight', from, reach);
    for (let x = Math.max(0, Math.floor(disk.pos.x - disk.r)); x <= Math.min(w.size - 1, Math.ceil(disk.pos.x + disk.r)); x++) {
      for (let y = Math.max(0, Math.floor(disk.pos.y - disk.r)); y <= Math.min(w.size - 1, Math.ceil(disk.pos.y + disk.r)); y++) {
        const tile = { x: x + 0.5, y: y + 0.5 };
        if (dist(from, tile) <= reach && dist(disk.pos, tile) <= disk.r && lineSeen(w, from, tile, props)) out.add(y * w.size + x);
      }
    }
  }

  function lineTiles(w: World, from: Vec): Set<number> {
    const viewer = playerVehicle(w);
    const r = sightRadius(w, viewer);
    const out = new Set<number>();
    lineTilesIn(w, from, r, { pos: from, r }, out);
    const lit = sightRadius(w, viewer, true);
    if (lit > r) for (const f of litFlares(w)) if (dist(from, f.pos) - f.r < lit) lineTilesIn(w, from, lit, f, out);
    return out;
  }

  function steepSpots(count: number): Vec[] {
    const spots: { p: Vec; s: number }[] = [];
    for (let x = 40; x < t.size - 40; x += 37) for (let y = 40; y < t.size - 40; y += 37) spots.push({ p: { x: x + 0.5, y: y + 0.5 }, s: tileSteepness(t.heights, t.size, y * t.size + x) });
    return spots.sort((a, b) => b.s - a.s).slice(0, count).map((s) => s.p);
  }

  function nightTurn(): number {
    for (let turn = world.turn; ; turn++) if (!sunAt(turn)) return turn;
  }

  const roadSpots = REGION.roads.flat().filter((_, i) => i % 7 === 0);
  const propSpots = world.obstacles.filter((o) => o.kind === 'rock' || o.kind === 'building' || o.kind === 'landmark').filter((_, i) => i % 40 === 0).slice(0, 60).map((o) => ({ x: o.pos.x + 3.2, y: o.pos.y + 1.7 }));
  const deckSpots = DECKS.flatMap((d) => [d.from, d.to]);

  const GRAZE = 0.25;

  function grazes(w: World, from: Vec, tile: Vec): boolean {
    const line = sightLine(w.terrain, from, tile);
    let worst = -Infinity;
    for (let i = 1; i < 400; i++) {
      const f = i / 400;
      worst = Math.max(worst, heightAt(w.terrain, from.x + (tile.x - from.x) * f, from.y + (tile.y - from.y) * f) - (line.from + (line.to - line.from) * f));
    }
    return Math.abs(worst) <= GRAZE;
  }

  function compare(w: World, spots: readonly Vec[]): { tiles: number; differ: number; inside: number } {
    let tiles = 0, differ = 0, inside = 0;
    for (const from of spots) {
      const oracle = lineTiles(w, from);
      const seen = visibleTiles(w, from);
      const reach = Math.max(sightRadius(w, playerVehicle(w)), sightRadius(w, playerVehicle(w), true));
      tiles += Math.PI * reach * reach;
      for (const idx of new Set([...oracle, ...seen])) {
        if (oracle.has(idx) === seen.has(idx)) continue;
        differ++;
        const x = idx % w.size, y = Math.floor(idx / w.size);
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => oracle.has((y + dy) * w.size + x + dx) !== oracle.has(idx));
        if (!edge && !grazes(w, from, { x: x + 0.5, y: y + 0.5 })) inside++;
      }
    }
    return { tiles, differ, inside };
  }

  function expectClose(result: { tiles: number; differ: number; inside: number }): void {
    expect(result.differ / result.tiles).toBeLessThanOrEqual(0.005);
    expect(result.inside).toBe(0);
  }

  it('agrees with a line to every tile on roads, ridges, beside props and at deck ends', () => {
    const spots = [...roadSpots, ...steepSpots(60), ...propSpots, ...deckSpots];
    expect(spots.length).toBeGreaterThanOrEqual(250);
    expectClose(compare(world, spots));
  }, 600_000);

  it('agrees at night and under a lit flare', () => {
    const night = { ...world, turn: nightTurn(), flares: [] as World['flares'] };
    const spots = roadSpots.filter((_, i) => i % 3 === 0).slice(0, 30);
    night.flares = spots.slice(0, 10).map((p, i) => ({ id: `fl${i}`, source: me.id, pos: { x: p.x + 20, y: p.y }, r: 6, turnsLeft: 3 }));
    expectClose(compare(night, spots));
  }, 600_000);

  it('gives the same tiles for the same point whatever was computed before', () => {
    const from = roadSpots[3];
    const first = [...visibleTiles(world, from)].sort((a, b) => a - b);
    for (const p of roadSpots.slice(10, 20)) visibleTiles(world, p);
    expect([...visibleTiles(world, from)].sort((a, b) => a - b)).toEqual(first);
  });
});

describe('props the player sees', () => {
  const from = { x: 30, y: 30 };
  const landmark = (look: 'deadTree' | 'farmhouse' | 'shack', pos: Vec, yaw: number): World => {
    const w = emptyWorld(from);
    w.obstacles = [{ id: `${look}-0`, pos, r: 1.2, kind: 'landmark', look, yaw }];
    return w;
  };
  const hiddenOwnTiles = (w: World) => {
    const visible = visibleTiles(w, from);
    return { visible, seen: seenPropTiles(w, from, visible) };
  };

  it.each([
    ['deadTree', { x: 35.4, y: 30.3 }, 0.7],
    ['farmhouse', { x: 35.4, y: 30 }, 0.7],
    ['shack', { x: 35.4, y: 30 }, 0],
  ] as const)('counts a %s as seen where its own boxes hide a tile under it', (look, pos, yaw) => {
    const { visible, seen } = hiddenOwnTiles(landmark(look, pos, yaw));

    expect(seen.some((idx) => !visible.has(idx))).toBe(true);
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });

  it('counts a rock beside its own hidden tiles as seen', () => {
    const w = emptyWorld(from);
    w.obstacles = [{ id: 'r', pos: { x: 35.4, y: 30.3 }, r: 1.6, kind: 'rock' }];
    const { visible, seen } = hiddenOwnTiles(w);

    expect(seen.some((idx) => !visible.has(idx))).toBe(true);
  });

  it('leaves the rule sight of the same scene unchanged', () => {
    const w = landmark('shack', { x: 35.4, y: 30 }, 0);
    const before = [...visibleTiles(w, from)];
    seenPropTiles(w, from, new Set(before));

    expect([...visibleTiles(w, from)]).toEqual(before);
  });

  it('keeps a prop behind a shack unseen', () => {
    const w = emptyWorld(from);
    w.obstacles = [
      { id: 'shack-0', pos: { x: 33, y: 30 }, r: 1.2, kind: 'landmark', look: 'shack', yaw: 0 },
      { id: 'r', pos: { x: 39.5, y: 30.5 }, r: 1.2, kind: 'rock' },
    ];
    const { visible, seen } = hiddenOwnTiles(w);
    const rockTile = 30 * w.size + 39;

    expect(visible.has(rockTile)).toBe(false);
    expect(seen).not.toContain(rockTile);
  });

  it('keeps a prop behind a hill unseen', async () => {
    const { heightAt } = await import('./terrain');
    const w = emptyWorld(from);
    w.terrain = TEST_MAP.terrain;
    let found: { a: Vec; b: Vec } | null = null;
    for (let x = 6; x < w.size - 6 && !found; x++) {
      for (let y = 2; y < w.size - 2 && !found; y++) {
        const a = { x: x - 4, y }, b = { x: x + 4, y };
        if (heightAt(w.terrain, x, y) - Math.max(heightAt(w.terrain, a.x, a.y), heightAt(w.terrain, b.x, b.y)) > TERRAIN.vision.eyeHeight) found = { a, b };
      }
    }
    expect(found, 'no hill found for this seed').not.toBeNull();
    const visible = visibleTiles(w, found!.a);
    const behindHill = [3, 4, 5, 6, 7, 8]
      .map((d) => ({ x: Math.floor(found!.b.x) + d - 3.5, y: Math.floor(found!.b.y) + 0.5 }))
      .find((pos) => [-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => !visible.has(Math.floor(pos.y + dy) * w.size + Math.floor(pos.x + dx)))));
    expect(behindHill, 'no tile fully behind the hill').toBeDefined();
    w.obstacles = [{ id: 'r', pos: behindHill!, r: 1.2, kind: 'rock' }];

    expect(seenPropTiles(w, found!.a, visible)).toEqual([]);
  });

  it('counts a prop beside the viewer as seen', () => {
    const w = emptyWorld(from);
    w.obstacles = [{ id: 'r', pos: { x: 31.2, y: 30.5 }, r: 1.2, kind: 'rock' }];
    const { seen } = hiddenOwnTiles(w);

    expect(seen).toContain(30 * w.size + 31);
  });
});
