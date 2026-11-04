import { describe, expect, it } from 'vitest';
import { gunSpans } from '../../sim/armor';
import { gunOf } from '../../sim/combat';
import { mountedItems } from '../../sim/grid';
import { vehicleStats } from '../../sim/stats';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import { hoverArcs, iconSpot, vehicleOrigins, WeaponRangeView } from './weaponRange';

function raiderWithGun() {
  const world = emptyWorld();
  const raider = addVehicle(world, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 33, y: 30 });
  return { world, raider };
}

describe('hoverArcs', () => {
  it('gives each working gun the spans the sim allows and its range', () => {
    const { world, raider } = raiderWithGun();
    const weapons = vehicleStats(world, raider).weapons;

    const arcs = hoverArcs(world, raider, weapons);

    expect(arcs).toHaveLength(weapons.length);
    expect(arcs[0].spans).toEqual(gunSpans(raider, mountedItems(raider, 'weapon')[0]));
    expect(arcs[0].spent).toBe(false);
  });

  it('draws no arc for a gun with no hit points', () => {
    const { world, raider } = raiderWithGun();
    const weapons = vehicleStats(world, raider).weapons;
    weapons[0].part.hp = 0;

    expect(hoverArcs(world, raider, weapons)).toEqual([]);
  });

  it('marks an empty gun spent', () => {
    const { world, raider } = raiderWithGun();
    const weapons = vehicleStats(world, raider).weapons;
    gunOf(weapons[0].part).ammo = 0;

    expect(hoverArcs(world, raider, weapons)[0].spent).toBe(true);
  });

  it('marks a cooling gun spent', () => {
    const { world, raider } = raiderWithGun();
    const weapons = vehicleStats(world, raider).weapons;
    gunOf(weapons[0].part).cooldown = 1;

    expect(hoverArcs(world, raider, weapons)[0].spent).toBe(true);
  });
});

describe('iconSpot', () => {
  it('sits at the middle of the widest span at half range', () => {
    const spot = iconSpot([{ from: -10, to: 10 }, { from: 60, to: 180 }], 20, []);

    expect(spot).toEqual({ angle: 120, distance: 10 });
  });

  it('moves out along the radius when another icon holds the spot', () => {
    const spans = [{ from: -45, to: 45 }];
    const first = iconSpot(spans, 20, []);

    const second = iconSpot(spans, 20, [first]);

    expect(second.angle).toBe(first.angle);
    expect(second.distance).toBeGreaterThan(first.distance);
  });

  it('leaves an icon alone when the spots are far apart', () => {
    const first = iconSpot([{ from: -45, to: 45 }], 20, []);

    const second = iconSpot([{ from: 90, to: 180 }], 20, [first]);

    expect(second.distance).toBe(10);
  });
});

describe('WeaponRangeView.set', () => {
  function fillOf(view: WeaponRangeView) {
    return view.root.children[0] as unknown as { geometry: unknown };
  }

  it('keeps the fan geometry when the reaches are equal', () => {
    const { world, raider } = raiderWithGun();
    const weapons = vehicleStats(world, raider).weapons;
    const view = new WeaponRangeView(0xffffff, 1);
    view.set(world.terrain, vehicleOrigins(raider), weapons);
    const fill = fillOf(view).geometry;
    const edge = view.root.children[1];

    view.set(world.terrain, vehicleOrigins(raider), weapons);

    expect(fillOf(view).geometry).toBe(fill);
    expect(view.root.children[1]).toBe(edge);
    expect(view.root.visible).toBe(true);
  });

  it('rebuilds the fan when the origin moves', () => {
    const { world, raider } = raiderWithGun();
    const weapons = vehicleStats(world, raider).weapons;
    const view = new WeaponRangeView(0xffffff, 1);
    view.set(world.terrain, vehicleOrigins(raider), weapons);
    const fill = fillOf(view).geometry;

    raider.pos = { x: raider.pos.x + 1, y: raider.pos.y };
    view.set(world.terrain, vehicleOrigins(raider), weapons);

    expect(fillOf(view).geometry).not.toBe(fill);
  });

  it('rebuilds the fan when the heading or a span changes', () => {
    const { world, raider } = raiderWithGun();
    const weapons = vehicleStats(world, raider).weapons;
    const view = new WeaponRangeView(0xffffff, 1);
    const origins = vehicleOrigins(raider);
    view.set(world.terrain, origins, weapons);
    const first = fillOf(view).geometry;

    view.set(world.terrain, [{ pos: origins[0].pos, heading: origins[0].heading + 0.1 }], weapons);
    const turned = fillOf(view).geometry;
    const wider = [{ ...weapons[0], spans: weapons[0].spans.map((s) => ({ from: s.from, to: s.to + 10 })) }];
    view.set(world.terrain, [{ pos: origins[0].pos, heading: origins[0].heading + 0.1 }], wider);

    expect(turned).not.toBe(first);
    expect(fillOf(view).geometry).not.toBe(turned);
  });

  it('hides for an empty list and shows again for the same reaches', () => {
    const { world, raider } = raiderWithGun();
    const weapons = vehicleStats(world, raider).weapons;
    const view = new WeaponRangeView(0xffffff, 1);
    view.set(world.terrain, vehicleOrigins(raider), weapons);

    view.set(world.terrain, vehicleOrigins(raider), []);
    expect(view.root.visible).toBe(false);
    view.set(world.terrain, vehicleOrigins(raider), weapons);
    expect(view.root.visible).toBe(true);
  });
});
