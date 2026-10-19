import { describe, expect, it } from 'vitest';
import { DETECT } from '../../data/detect';
import { PHYSICS } from '../../data/physics';
import { CHASSIS } from '../../data/chassis';
import { bodyOf } from '../../sim/body';
import { dropClearance } from '../../sim/hazards';
import { advanceDust } from '../../sim/detect';
import { addVehicle, emptyWorld, flatTerrain } from '../../sim/testkit';
import type { DustCloud, Vehicle, World } from '../../sim/types';
import { cloneWorld } from '../../sim/world';
import type { VehicleView } from './vehicle';
import type { Card, FxCards } from './particles/cards';
import { DUST_LOOK, DustCloudsView, plumeShape, puffsPerCloud } from './dust';

const S = PHYSICS.metersPerTile;

function cloud(id: string, source: string, age = 0): DustCloud {
  return { id, source, pos: { x: 10, y: 10 }, vel: { x: 1, y: 0 }, age, range: 5 };
}

function worldOf(clouds: DustCloud[], seen: string[]): World {
  return { turn: 1, terrain: flatTerrain(32), dustClouds: clouds, vehicles: [], player: { vehicleId: 'me', clouds: seen } } as unknown as World;
}

function drawn(view: DustCloudsView): Card[] {
  const out: Card[] = [];
  view.draw({ lit: { push: (c: Card) => out.push(c) } } as unknown as FxCards);
  return out;
}

describe('DustCloudsView', () => {
  it('draws only the clouds the player sees and the player own clouds', () => {
    const view = new DustCloudsView();
    const clouds = [cloud('a', 'npc'), cloud('b', 'npc'), cloud('c', 'me')];
    view.update(worldOf(clouds, ['a']), flatTerrain(32), 0);
    expect(drawn(view)).toHaveLength(2 * DUST_LOOK.puffs);
  });

  it('rises with age and fades out at the end of its life', () => {
    const view = new DustCloudsView();
    view.update(worldOf([cloud('a', 'npc', 1)], ['a']), flatTerrain(32), 0);
    const young = drawn(view);
    view.update(worldOf([cloud('a', 'npc', DETECT.dust.lifetime - 0.1)], ['a']), flatTerrain(32), 0);
    const old = drawn(view);
    expect(Math.max(...old.map((c) => c.y))).toBeGreaterThan(Math.max(...young.map((c) => c.y)));
    expect(Math.max(...old.map((c) => c.alpha))).toBeLessThan(Math.max(...young.map((c) => c.alpha)));
  });

  it('never pushes more cards than the budget', () => {
    const view = new DustCloudsView();
    const many = Array.from({ length: 3000 }, (_, i) => cloud(`c${i}`, 'me'));
    view.update(worldOf(many, []), flatTerrain(32), 0);
    const cards = drawn(view);
    expect(cards.length).toBeLessThanOrEqual(DUST_LOOK.maxCards);
    expect(cards.length).toBeGreaterThan(0);
  });

  it('shrinks puffs per cloud as clouds crowd the budget', () => {
    expect(puffsPerCloud(1)).toBe(DUST_LOOK.puffs);
    expect(puffsPerCloud(DUST_LOOK.maxCards / 2)).toBe(2);
    expect(puffsPerCloud(0)).toBe(0);
  });
});

function drove(chassisId: string): { world: World; me: Vehicle } {
  const world = emptyWorld();
  const me = addVehicle(world, 'player', chassisId, [], { x: 30, y: 30 });
  world.player.vehicleId = me.id;
  me.trail = Array.from({ length: 11 }, (_, i) => ({ x: 25 + i * 0.5, y: 30, heading: 0 }));
  me.pos = { x: 30, y: 30 };
  world.dustClouds = [{ id: 'd1', source: me.id, pos: { x: 27.5, y: 30 }, vel: { x: 0, y: 0 }, age: 0, range: 5 }];
  return { world, me };
}

const viewAt = (x: number, z: number) => ({ center: () => ({ x, y: 0, z }) }) as unknown as VehicleView;
const clockAt = (before: World, progress: number, moved = false) => ({ before, progress, moved, hookedLines: new Set<string>() });

function updated(world: World, views: Map<string, VehicleView>, clock: ReturnType<typeof clockAt> | null): Card[] {
  const view = new DustCloudsView();
  view.update(world, world.terrain, 0, views, clock);
  return drawn(view);
}

describe('DustCloudsView reveal', () => {
  it('hides a cloud raised this turn until the truck rear has passed it', () => {
    const { world, me } = drove('scout');
    const before = cloneWorld(world);
    const passed = 0.5 + dropClearance(me, 0) / 2.5;
    expect(updated(world, new Map(), clockAt(before, 0))).toHaveLength(0);
    expect(updated(world, new Map(), clockAt(before, 0.5))).toHaveLength(0);
    expect(updated(world, new Map(), clockAt(before, passed + 0.05))).toHaveLength(DUST_LOOK.puffs);
  });

  it('shows it with no clock, after the move, or for an older cloud', () => {
    const { world } = drove('scout');
    const before = cloneWorld(world);
    expect(updated(world, new Map(), null)).toHaveLength(DUST_LOOK.puffs);
    expect(updated(world, new Map(), clockAt(before, 0.2, true))).toHaveLength(DUST_LOOK.puffs);
    world.dustClouds[0].age = 1;
    expect(updated(world, new Map(), clockAt(before, 0))).toHaveLength(DUST_LOOK.puffs);
  });
});

describe('DustCloudsView fit', () => {
  const byLength = Object.keys(CHASSIS).sort((a, b) => bodyOf(a).half.x - bodyOf(b).half.x);
  const ends = [byLength[0], byLength[byLength.length - 1]];

  it.each(ends.flatMap((id) => [0, 1, 3].flatMap((age) => [0.3, 1].map((tiles) => [id, tiles, age] as const))))('keeps every card of %s clear of the truck at %s tiles at cloud age %s', (id, tiles, age) => {
    const { world, me } = drove(id);
    world.dustClouds[0].age = age;
    const half = bodyOf(id).half.x;
    for (const heading of [0, Math.PI / 2]) {
      me.heading = heading;
      const truck = viewAt(27.5 * S + Math.cos(heading) * tiles * S, 30 * S + Math.sin(heading) * tiles * S);
      for (const c of updated(world, new Map([[me.id, truck]]), null)) {
        const gap = Math.hypot(c.x - truck.center().x, c.z - truck.center().z) - c.size / 2;
        expect(gap).toBeGreaterThanOrEqual(half - 1e-6);
      }
    }
  });

  it('grows back to full size as the truck drives away', () => {
    const { world, me } = drove('scout');
    const largest = (tiles: number | null) => {
      const views = new Map(tiles === null ? [] : [[me.id, viewAt((27.5 + tiles) * S, 30 * S)] as const]);
      return Math.max(...updated(world, views, null).map((c) => c.size));
    };
    expect(largest(3)).toBeGreaterThanOrEqual(largest(1));
    expect(largest(8)).toBeGreaterThanOrEqual(largest(3));
    expect(largest(8)).toBe(largest(null));
  });
});

describe('plumeShape', () => {
  const oldSize = (life: number) => DUST_LOOK.size * (1 + (DUST_LOOK.sizeGrowth - 1) * life);

  it('starts small and faint at a typical reveal age', () => {
    const shape = plumeShape(0.6);
    expect(shape.size).toBeLessThanOrEqual(DUST_LOOK.birthSize + 0.2 * (oldSize(0.6 / DETECT.dust.lifetime) - DUST_LOOK.birthSize));
    expect(shape.fade * DUST_LOOK.opacity * 1.4).toBeLessThanOrEqual(0.3 * DUST_LOOK.opacity * 1.4);
    expect(plumeShape(0).size).toBe(DUST_LOOK.birthSize);
    expect(plumeShape(0).scatter).toBe(0);
  });

  it.each([3, 5, 7.9])('matches the old curves at age %s once built', (age) => {
    const life = age / DETECT.dust.lifetime;
    const shape = plumeShape(age);
    expect(shape.size).toBeCloseTo(oldSize(life), 9);
    expect(shape.span).toBeCloseTo(DUST_LOOK.spread + DUST_LOOK.spreadGrowth * life, 9);
    expect(shape.wobble).toBe(DUST_LOOK.wobble);
    expect(shape.fade).toBeCloseTo(1 - life, 9);
  });

  it('refuses a bad age', () => {
    expect(() => plumeShape(NaN)).toThrow();
    expect(() => plumeShape(-1)).toThrow();
  });
});

function turnsOf(start: DustCloud, seen: boolean[]): World[] {
  const worlds: World[] = [];
  let world = worldOf([start], seen[0] ? [start.id] : []);
  worlds.push(world);
  for (let i = 1; i < seen.length; i++) {
    world = cloneWorld(world);
    world.turn++;
    world.seed = 7;
    world.vehicles = [];
    advanceDust(world);
    world.player.clouds = seen[i] ? world.dustClouds.map((c) => c.id) : [];
    worlds.push(world);
  }
  return worlds;
}

function frameAt(world: World, before: World | null, progress: number): Card[] {
  const view = new DustCloudsView();
  view.update(world, world.terrain, 0, new Map(), before ? clockAt(before, progress, true) : null);
  return drawn(view);
}

const meanOf = (cards: Card[], key: 'x' | 'z') => cards.reduce((s, c) => s + c[key], 0) / cards.length;
const alphaOf = (cards: Card[]) => Math.max(...cards.map((c) => c.alpha));

describe('DustCloudsView across turns', () => {
  const fresh = () => ({ ...cloud('a', 'npc', 1), pos: { x: 10, y: 10 }, vel: { x: 2, y: -1 } });

  it('keeps a cloud in place and as opaque across every turn seam', () => {
    const worlds = turnsOf(fresh(), Array(6).fill(true));
    for (let i = 1; i < worlds.length; i++) {
      const rest = frameAt(worlds[i - 1], null, 1);
      const start = frameAt(worlds[i], worlds[i - 1], 0);
      expect(Math.hypot(meanOf(start, 'x') - meanOf(rest, 'x'), meanOf(start, 'z') - meanOf(rest, 'z'))).toBeLessThan(0.01);
      expect(alphaOf(start)).toBeCloseTo(alphaOf(rest) * plumeShape(worlds[i].dustClouds[0].age).fade / plumeShape(worlds[i - 1].dustClouds[0].age + 1).fade, 6);
    }
  });

  it('moves no cloud more than its share of the turn between frames', () => {
    const worlds = turnsOf(fresh(), Array(6).fill(true));
    const frames = 60;
    for (let i = 1; i < worlds.length; i++) {
      const [was, now] = [worlds[i - 1].dustClouds[0], worlds[i].dustClouds[0]];
      const bound = ((Math.hypot(now.pos.x - was.pos.x, now.pos.y - was.pos.y) + Math.hypot(now.vel.x - was.vel.x, now.vel.y - was.vel.y)) * S * 2) / frames;
      let last = frameAt(worlds[i], worlds[i - 1], 0);
      for (let f = 1; f <= frames; f++) {
        const next = frameAt(worlds[i], worlds[i - 1], f / frames);
        expect(Math.hypot(meanOf(next, 'x') - meanOf(last, 'x'), meanOf(next, 'z') - meanOf(last, 'z'))).toBeLessThanOrEqual(bound);
        last = next;
      }
    }
  });

  it('rests on the sim position and the start and end of the playback agree', () => {
    const [was, now] = turnsOf(fresh(), [true, true]);
    const sim = now.dustClouds[0].pos;
    const rest = frameAt(now, null, 1);
    const ended = frameAt(now, was, 1);
    expect(meanOf(rest, 'x') / S).toBeCloseTo(sim.x, 0);
    expect(meanOf(rest, 'z') / S).toBeCloseTo(sim.y, 0);
    expect(meanOf(ended, 'x')).toBeCloseTo(meanOf(rest, 'x'), 6);
    expect(meanOf(ended, 'z')).toBeCloseTo(meanOf(rest, 'z'), 6);
  });

  it('fades a cloud in when the player starts to see it and out when the player stops', () => {
    const [was, now] = turnsOf(fresh(), [false, true]);
    const full = alphaOf(frameAt(now, null, 1));
    expect(alphaOf(frameAt(now, was, 0))).toBe(0);
    expect(alphaOf(frameAt(now, was, 0.5))).toBeGreaterThan(0);
    expect(alphaOf(frameAt(now, was, 0.5))).toBeLessThan(full);
    expect(alphaOf(frameAt(now, was, 1))).toBeCloseTo(full, 9);
    const [seen, lost] = turnsOf(fresh(), [true, false]);
    expect(frameAt(lost, null, 1)).toHaveLength(0);
    expect(alphaOf(frameAt(lost, seen, 0.25))).toBeGreaterThan(alphaOf(frameAt(lost, seen, 0.75)));
    expect(frameAt(lost, seen, 1)).toHaveLength(0);
  });
});
