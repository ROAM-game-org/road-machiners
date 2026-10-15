import { describe, expect, it } from 'vitest';
import { DETECT } from '../../data/detect';
import { PHYSICS } from '../../data/physics';
import { CHASSIS } from '../../data/chassis';
import { bodyOf } from '../../sim/body';
import { dropClearance } from '../../sim/hazards';
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

  it('glides a cloud along its velocity over the glide time', () => {
    const view = new DustCloudsView();
    const world = worldOf([cloud('a', 'npc')], ['a']);
    view.update(world, flatTerrain(32), 0);
    const before = drawn(view).reduce((s, c) => s + c.x, 0) / DUST_LOOK.puffs;
    view.update(world, flatTerrain(32), DUST_LOOK.glideSeconds * 1000);
    const after = drawn(view).reduce((s, c) => s + c.x, 0) / DUST_LOOK.puffs;
    expect(after - before).toBeCloseTo(S, 0);
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

describe('DustCloudsView build-up over time', () => {
  it('grows smoothly across turn seams for the first turns', () => {
    const view = new DustCloudsView();
    const stepMs = 1000 / 30;
    const glideMs = DUST_LOOK.glideSeconds * 1000;
    const limit = 0.05 * plumeShape(DUST_LOOK.buildTurns).size * S;
    let previous = 0;
    let previousScatter = 0;
    let previousAlpha = 0;
    for (let turn = 0; turn < DUST_LOOK.buildTurns; turn++) {
      for (let ms = 0; ms < glideMs; ms += stepMs) {
        const world = worldOf([cloud('a', 'npc', turn)], ['a']);
        world.turn = turn + 1;
        view.update(world, flatTerrain(32), turn * glideMs + ms);
        const cards = drawn(view);
        const largest = Math.max(...cards.map((c) => c.size / 1.25));
        const scatter = Math.max(...cards.map((c) => c.y)) - Math.min(...cards.map((c) => c.y));
        const alpha = Math.max(...cards.map((c) => c.alpha));
        if (turn > 0 || ms > 0) {
          expect(Math.abs(largest - previous)).toBeLessThanOrEqual(limit);
          expect(scatter).toBeGreaterThanOrEqual(previousScatter - 1e-6);
          if (turn < 1) expect(alpha).toBeGreaterThanOrEqual(previousAlpha - 1e-6);
        }
        previous = largest;
        previousScatter = scatter;
        previousAlpha = alpha;
      }
    }
  });
});
