import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PAL } from '../../render/palette';
import { PHYSICS } from '../../data/physics';
import { LOOT_LOOK, lootColor } from '../../render/lootLook';
import { emptyHidden } from '../../sim/salvage';
import { flatTerrain } from '../../sim/testkit';
import type { Obstacle, SalvageStock } from '../../sim/types';
import { ObstacleViews, paintShipGlow } from './obstacles';
import { initPhysics } from '../../phys/drive';
import { loadModels } from './models';
import { RenderScope, SightLimit } from './scope';

function groupOf(...names: string[]): THREE.Group {
  const g = new THREE.Group();
  for (const name of names) {
    const m = new THREE.MeshLambertMaterial({ color: 0x808080 });
    m.name = name;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m));
  }
  return g;
}

function materialsOf(g: THREE.Group): THREE.MeshLambertMaterial[] {
  return g.children.map((c) => (c as THREE.Mesh).material as THREE.MeshLambertMaterial);
}

describe('paintShipGlow', () => {
  it('makes ship_glow materials emissive in the ship glow and leaves others alone (IV7)', () => {
    const g = groupOf('metal', 'ship_glow');

    paintShipGlow(g);

    const [metal, glow] = materialsOf(g);
    expect(glow.emissive.getHex()).toBe(PAL.shipGlow);
    expect(glow.emissiveIntensity).toBeGreaterThan(0);
    expect(metal.emissive.getHex()).toBe(0);
    expect(metal.emissiveIntensity).toBe(1);
  });

  it('adds no light', () => {
    const g = groupOf('ship_glow');

    paintShipGlow(g);

    let lights = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Light) lights++;
    });
    expect(lights).toBe(0);
  });
});

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await initPhysics();
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

describe('loot colors on props', () => {
  const SIZE = 64;
  const S = PHYSICS.metersPerTile;
  const spot = (id: string, x: number): Obstacle => ({ id, pos: { x, y: 20 }, r: 1, kind: 'landmark', look: 'deadTruck', yaw: 0 });
  const hulkProp: Obstacle = { id: 'wreck-npc7', pos: { x: 40, y: 20 }, r: 0.9, kind: 'wreck', hulk: { chassisId: 'buggy', yaw: 0 } };
  const obstacles = [spot('a', 10), spot('b', 20), hulkProp];
  const stock = (id: string, loot: boolean, extra: Partial<SalvageStock> = {}): SalvageStock => ({
    id, pos: { x: 30, y: 50 }, radius: 1, goods: loot ? { scrap: 2 } : {}, parts: [], fuel: 0, supplies: 0, hidden: emptyHidden(), ...extra,
  });
  const world = (a: boolean, b: boolean, hulk: boolean): SalvageStock[] => [stock('a', a), stock('b', b), stock('wreck-npc7', hulk)];

  function setup(): { root: THREE.Group; views: ObstacleViews } {
    const root = new THREE.Group();
    const views = new ObstacleViews(new RenderScope(root, SIZE, new SightLimit(SIZE), true, true), flatTerrain(SIZE));
    return { root, views };
  }

  function colorsAt(root: THREE.Group, x: number, y = 20): number[] {
    root.updateMatrixWorld(true);
    const out: number[] = [];
    const at = new THREE.Vector3();
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.getWorldPosition(at);
      if (Math.abs(at.x / S - x) < 2 && Math.abs(at.z / S - y) < 2) out.push((o.material as THREE.MeshLambertMaterial).color.getHex());
    });
    return out;
  }

  it('lifts a lootable prop, leaves the empty one, and restores it once emptied', () => {
    const { root, views } = setup();
    views.sync(obstacles, world(false, false, false), []);
    const plainA = colorsAt(root, 10);
    const plainB = colorsAt(root, 20);
    const plainHulk = colorsAt(root, 40);
    expect(plainA.length).toBeGreaterThan(0);
    expect(plainHulk.length).toBeGreaterThan(0);

    views.sync(obstacles, world(true, false, true), []);
    const lifted = colorsAt(root, 10);
    expect(lifted).not.toEqual(plainA);
    lifted.forEach((hex, i) => expect([plainA[i], lootColor(plainA[i])]).toContain(hex));
    expect(colorsAt(root, 20)).toEqual(plainB);
    expect(colorsAt(root, 40)).not.toEqual(plainHulk);

    views.sync(obstacles, world(false, false, false), []);
    expect(colorsAt(root, 10)).toEqual(plainA);
    expect(colorsAt(root, 40)).toEqual(plainHulk);
  });

  it('draws a lootable hulk with more of its paint than a stripped one', () => {
    const { root, views } = setup();
    views.sync(obstacles, world(false, false, false), []);
    const stripped = colorsAt(root, 40);
    views.sync(obstacles, world(false, false, true), []);
    const saturation = (hex: number): number => Math.max(hex >> 16, (hex >> 8) & 255, hex & 255) - Math.min(hex >> 16, (hex >> 8) & 255, hex & 255);
    const chroma = (hexes: number[]): number => hexes.reduce((sum, hex) => sum + saturation(hex), 0);
    expect(chroma(colorsAt(root, 40))).toBeGreaterThan(chroma(stripped));
    expect(LOOT_LOOK.hulkPaint).toBeGreaterThan(0);
  });

  it('writes no color when nothing changed', () => {
    const { root, views } = setup();
    const salvage = world(true, false, false);
    views.sync(obstacles, salvage, []);
    let writes = 0;
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const color = (o.material as THREE.MeshLambertMaterial).color;
      const set = color.setHex.bind(color);
      color.setHex = (hex: number) => {
        writes++;
        return set(hex);
      };
    });
    views.sync(obstacles, salvage, []);
    expect(writes).toBe(0);
  });

  it('changes no emissive or geometry', () => {
    const { root, views } = setup();
    views.sync(obstacles, world(false, false, false), []);
    const shape = (): string => {
      const parts: string[] = [];
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) parts.push(`${o.geometry.uuid}:${(o.material as THREE.MeshLambertMaterial).emissive?.getHex()}`);
      });
      return parts.join();
    };
    const before = shape();
    views.sync(obstacles, world(true, true, true), []);
    expect(shape()).toBe(before);
  });

  it('draws a pile with the lifted crates', () => {
    const { root, views } = setup();
    views.sync([], [stock('pile-1', true, { pos: { x: 30, y: 30 }, pile: { until: 99, fromPlayer: true, basis: {} } })], []);
    const crates = colorsAt(root, 30, 30);
    expect(crates.length).toBeGreaterThan(0);
    views.sync([], [], []);
    expect(colorsAt(root, 30, 30)).toEqual([]);
  });

  it('throws when a lootable prop has no view', () => {
    const { views } = setup();
    expect(() => views.sync([], [stock('ghost', true)], [])).toThrow(/ghost/);
  });
});
