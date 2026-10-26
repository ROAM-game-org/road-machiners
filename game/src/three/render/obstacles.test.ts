import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PAL } from '../../render/palette';
import { PHYSICS } from '../../data/physics';
import { CHASSIS } from '../../data/chassis';
import { LOOT_LOOK, lightnessOf, lootColor, lootContrast } from '../../render/lootLook';
import { emptyHidden } from '../../sim/salvage';
import { emptyWorld, flatTerrain } from '../../sim/testkit';
import { TERRITORIES, WRECK_LOOKS } from '../../data/territory';
import type { LandmarkLook, Obstacle, SalvageStock } from '../../sim/types';
import { aimedBreach, BOW_BREACH, buildProp, lootSwatchesOf, ObstacleViews, paintShipGlow, REACTOR_GLOW } from './obstacles';
import { initPhysics } from '../../phys/drive';
import { loadModels, model } from './models';
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

  it('restores every swatch bit-exact and matches a never-lootable twin', () => {
    const { root, views } = setup();
    const twin = setup();
    views.sync(obstacles, world(false, false, false), []);
    twin.views.sync(obstacles, world(false, false, false), []);
    views.sync(obstacles, world(true, true, true), []);
    views.sync(obstacles, world(false, false, false), []);
    for (const x of [10, 20, 40]) expect(colorsAt(root, x)).toEqual(colorsAt(twin.root, x));
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial) expect(o.material.emissive.getHex()).toBe(0);
    });
  });

  it('draws every surface of every lootable model clearly brighter', () => {
    const terrain = flatTerrain(SIZE);
    const looks: LandmarkLook[] = [...WRECK_LOOKS, 'house', 'ruin', 'silo', 'waterTower', 'gasStation'].filter((look): look is LandmarkLook => look !== 'rock');
    const props: Obstacle[] = [
      ...looks.map((look, i): Obstacle => ({ id: `look-${look}`, pos: { x: 10 + i, y: 20 }, r: 1, kind: 'landmark', look, yaw: 0 })),
      ...Object.keys(CHASSIS).map((chassisId, i): Obstacle => ({ id: `wreck-hulk${i}`, pos: { x: 10 + i, y: 30 }, r: 0.9, kind: 'wreck', hulk: { chassisId, yaw: 0 } })),
    ];
    const cases = [...props.map((prop) => ({ id: prop.id, view: buildProp(terrain, prop) })), { id: 'pile', view: model('crates') }];
    for (const { id, view } of cases) {
      const swatches = lootSwatchesOf(view);
      expect(swatches.length, id).toBeGreaterThan(0);
      for (const { plain, loot } of swatches) {
        expect(lootContrast(plain, loot), `${id} ${plain.toString(16)}`).toBeGreaterThanOrEqual(LOOT_LOOK.minContrast);
        expect(lightnessOf(loot), id).toBeGreaterThan(lightnessOf(plain));
      }
    }
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

  it('keeps a pile in its own scope chunk, away from the map origin', () => {
    const root = new THREE.Group();
    const limit = new SightLimit(SIZE);
    const scope = new RenderScope(root, SIZE, limit, true, true);
    const views = new ObstacleViews(scope, flatTerrain(SIZE));
    views.sync([], [stock('pile-2', true, { pos: { x: 60, y: 60 }, pile: { until: 99, fromPlayer: true, basis: {} } })], []);
    limit.set({ x: 0, y: 0, z: 0 }, 3 * PHYSICS.metersPerTile);
    const camera = new THREE.OrthographicCamera(-2000, 2000, 2000, -2000, -5000, 5000);
    scope.update(camera);
    expect(root.children.filter((c) => c.name.startsWith('scope-chunk'))).toHaveLength(0);
  });

  it('throws when a lootable prop has no view', () => {
    const { views } = setup();
    expect(() => views.sync([], [stock('ghost', true)], [])).toThrow(/ghost/);
  });
});

describe('roadside props broken at load', () => {
  const SIZE = 64;
  const S = PHYSICS.metersPerTile;
  const sign: Obstacle = { id: 'roadSign-7', pos: { x: 20, y: 20 }, r: 0.25, kind: 'landmark', look: 'roadSign', yaw: 0.3 };

  function meshesAt(root: THREE.Group): number {
    root.updateMatrixWorld(true);
    let found = 0;
    const at = new THREE.Vector3();
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.getWorldPosition(at);
      if (Math.abs(at.x / S - sign.pos.x) < 4 && Math.abs(at.z / S - sign.pos.y) < 4) found++;
    });
    return found;
  }

  it('topples a sign broken at load, then stands it again once it has grown back', () => {
    const root = new THREE.Group();
    const views = new ObstacleViews(new RenderScope(root, SIZE, new SightLimit(SIZE), true, true), flatTerrain(SIZE));
    views.sync([], [], [{ obstacle: sign, turn: 0 }]);
    const toppled = meshesAt(root);
    expect(toppled).toBeGreaterThan(0);

    views.sync([sign], [], []);
    const standing = meshesAt(root);
    expect(standing).toBeGreaterThan(0);

    views.sync([sign], [], []);
    expect(meshesAt(root)).toBe(standing);
  });
});

describe('reactor light', () => {
  const S = PHYSICS.metersPerTile;
  const SIZE = 128;
  const BOW_SITE = { x: 60, y: 60 };
  const bowPiece = TERRITORIES['fallen-sun'].wreck?.pieces.find((p) => p.look === 'shipBow');
  const reactorAt = TERRITORIES['fallen-sun'].reactor;
  if (!bowPiece || !reactorAt) throw new Error('The Fallen Sun has no bow or no reactor');
  const bow: Obstacle = { id: 'bow', pos: BOW_SITE, r: bowPiece.r, kind: 'landmark', look: 'shipBow', yaw: bowPiece.yaw };
  const reactor: Obstacle = {
    id: 'reactor',
    pos: { x: BOW_SITE.x + reactorAt.at.x - bowPiece.at.x, y: BOW_SITE.y + reactorAt.at.y - bowPiece.at.y },
    r: reactorAt.radius,
    kind: 'landmark',
    look: 'reactor',
    yaw: 0,
  };

  function built(): { bowGroup: THREE.Object3D; reactorGroup: THREE.Object3D; root: THREE.Group } {
    const terrain = flatTerrain(SIZE);
    const root = new THREE.Group();
    const bowGroup = buildProp(terrain, bow);
    const reactorGroup = buildProp(terrain, reactor);
    root.add(bowGroup, reactorGroup);
    root.updateMatrixWorld(true);
    return { bowGroup, reactorGroup, root };
  }

  function lightsOf(g: THREE.Object3D): THREE.Light[] {
    const found: THREE.Light[] = [];
    g.traverse((o) => {
      if (o instanceof THREE.Light) found.push(o);
    });
    return found;
  }

  function hullMeshes(bowGroup: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    bowGroup.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const solid = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      solid.matrixWorld.copy(o.matrixWorld);
      solid.matrixAutoUpdate = false;
      meshes.push(solid);
    });
    return meshes;
  }

  type Sample = { at: THREE.Vector3; normal: THREE.Vector3; twoSided: boolean };

  function hullSamples(bowGroup: THREE.Object3D): Sample[] {
    const out: Sample[] = [];
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    bowGroup.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.attributes.position;
      const index = o.geometry.index;
      const count = index ? index.count : pos.count;
      const at = (i: number): number => (index ? index.getX(i) : i);
      const twoSided = (Array.isArray(o.material) ? o.material[0] : o.material).side === THREE.DoubleSide;
      for (let i = 0; i + 2 < count; i += 3) {
        a.fromBufferAttribute(pos, at(i)).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, at(i + 1)).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, at(i + 2)).applyMatrix4(o.matrixWorld);
        const normal = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
        out.push({ at: a.clone().add(b).add(c).divideScalar(3), normal, twoSided });
      }
    });
    return out;
  }

  function groundSamples(around: THREE.Vector3, reach: number, y: number): Sample[] {
    const out: Sample[] = [];
    for (let x = -reach; x <= reach; x++) {
      for (let z = -reach; z <= reach; z++) {
        out.push({ at: new THREE.Vector3(around.x + x, y, around.z + z), normal: new THREE.Vector3(0, 1, 0), twoSided: false });
      }
    }
    return out;
  }

  function reaches(light: THREE.Light, sample: Sample): boolean {
    const from = light.getWorldPosition(new THREE.Vector3());
    const toSample = sample.at.clone().sub(from);
    const range = (light as THREE.PointLight | THREE.SpotLight).distance;
    if (toSample.length() > range) return false;
    const toLight = toSample.clone().negate();
    const facing = sample.normal.dot(toLight);
    if (!sample.twoSided && facing <= 0) return false;
    if (sample.twoSided && Math.abs(facing) < 1e-6) return false;
    if (!(light instanceof THREE.SpotLight)) return true;
    const aim = light.target.getWorldPosition(new THREE.Vector3()).sub(from);
    return toSample.angleTo(aim) <= light.angle;
  }

  function leaks(): { found: THREE.Vector3[]; reached: number } {
    const { bowGroup, reactorGroup, root } = built();
    const lights = [aimedBreach(bowGroup), ...lightsOf(reactorGroup)];
    const hull = hullMeshes(bowGroup);
    const ground = bowGroup.getWorldPosition(new THREE.Vector3()).y;
    const raycaster = new THREE.Raycaster();
    const found: THREE.Vector3[] = [];
    let reached = 0;
    for (const light of lights) {
      const from = light.getWorldPosition(new THREE.Vector3());
      const range = (light as THREE.PointLight).distance;
      const samples = [...hullSamples(bowGroup), ...groundSamples(from, Math.ceil(range), ground)];
      for (const sample of samples) {
        if (!reaches(light, sample)) continue;
        reached++;
        const ray = sample.at.clone().sub(from);
        const length = ray.length();
        raycaster.set(from, ray.normalize());
        raycaster.far = length;
        const hit = raycaster.intersectObjects(hull, false)[0];
        if (hit && hit.distance < length - 0.05) found.push(sample.at);
      }
    }
    root.clear();
    return { found, reached };
  }

  it('lights nothing the bow hides from it (IV1)', () => {
    const { found, reached } = leaks();
    expect(reached).toBeGreaterThan(50);
    expect(found.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`).slice(0, 10)).toEqual([]);
  }, 120000);

  it('puts the light in the breach mouth, aimed out of it (IV2)', () => {
    const { bowGroup } = built();
    const spot = aimedBreach(bowGroup);
    const inverse = bowGroup.matrixWorld.clone().invert();
    const apex = spot.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
    const centre = new THREE.Vector3(BOW_BREACH.along, BOW_BREACH.height, BOW_BREACH.out);
    expect(apex.distanceTo(centre)).toBeLessThanOrEqual(BOW_BREACH.radius);
    const aim = spot.target.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).sub(apex);
    const outward = new THREE.Vector3(0, 0, 1);
    expect(aim.angleTo(outward) + spot.angle).toBeLessThan(Math.PI / 2);
  });

  it('lights the floor where the reactor core reaches out of the breach', () => {
    const { bowGroup, reactorGroup, root } = built();
    const light = reactorAt.hazard?.core?.light;
    if (!light) throw new Error('The Fallen Sun reactor has no breach light');
    const spot = aimedBreach(bowGroup);
    const centre = reactorGroup.getWorldPosition(new THREE.Vector3());
    centre.x += (light.at.x - reactorAt.at.x) * S;
    centre.z += (light.at.y - reactorAt.at.y) * S;
    centre.y = bowGroup.getWorldPosition(new THREE.Vector3()).y;
    const floor: Sample = { at: centre, normal: new THREE.Vector3(0, 1, 0), twoSided: false };
    expect(reaches(spot, floor)).toBe(true);
    const from = spot.getWorldPosition(new THREE.Vector3());
    const ray = centre.clone().sub(from);
    const raycaster = new THREE.Raycaster(from, ray.clone().normalize(), 0, ray.length());
    expect(raycaster.intersectObjects(hullMeshes(bowGroup), false)).toEqual([]);
    const inBow = centre.clone().applyMatrix4(bowGroup.matrixWorld.clone().invert());
    expect(inBow.z).toBeGreaterThan(BOW_BREACH.out);
    expect(Math.abs(inBow.x - BOW_BREACH.along)).toBeLessThan(BOW_BREACH.radius);
    root.clear();
  });

  it('stands the reactor inside the bow, behind the breach (IV3)', () => {
    const { bowGroup, reactorGroup } = built();
    const inBow = reactorGroup.getWorldPosition(new THREE.Vector3()).applyMatrix4(bowGroup.matrixWorld.clone().invert());
    expect(Math.hypot(inBow.y - BOW_BREACH.height, inBow.z)).toBeLessThan(BOW_BREACH.out);
    expect(inBow.z).toBeGreaterThan(0);
    expect(Math.abs(inBow.x - BOW_BREACH.along)).toBeLessThan(BOW_BREACH.radius);
  });

  it('casts no shadow, gives the reactor no light and lights the bow from one shared spot outside it (IV4, IV6)', () => {
    const { bowGroup, reactorGroup } = built();
    expect(lightsOf(reactorGroup)).toEqual([]);
    expect(lightsOf(bowGroup)).toEqual([]);
    expect(aimedBreach(bowGroup).castShadow).toBe(false);
  });

  it('keeps one breach light in the scene whether a bow is near or not, so the light count never changes', () => {
    const root = new THREE.Group();
    const views = new ObstacleViews(new RenderScope(root, SIZE, new SightLimit(SIZE), true, true), flatTerrain(SIZE));
    const spots = () => { let n = 0; root.traverse((o) => { if (o instanceof THREE.SpotLight) n++; }); return n; };
    expect(spots()).toBe(1);
    views.sync([bow, reactor], [], []);
    views.play(null, null, emptyWorld(), {}, 0.1);
    expect(spots()).toBe(1);
  });

  it('pulses the rod and the light together (IV5)', () => {
    const root = new THREE.Group();
    const views = new ObstacleViews(new RenderScope(root, SIZE, new SightLimit(SIZE), true, true), flatTerrain(SIZE));
    views.sync([bow, reactor], [], []);
    const world = emptyWorld();
    const near = { pos: { x: BOW_SITE.x * S, y: 0, z: BOW_SITE.y * S }, rot: { x: 0, y: 0, z: 0, w: 1 }, acc: { x: 0, y: 0, z: 0 }, wheels: [] };
    views.play(null, null, world, { [world.player.vehicleId]: near }, 1.3);
    let rod = 0;
    let light = 0;
    root.traverse((o) => {
      if (o instanceof THREE.SpotLight) light = o.intensity;
      if (o instanceof THREE.Mesh && (o.material as THREE.MeshLambertMaterial).name === 'glow') rod = (o.material as THREE.MeshLambertMaterial).emissiveIntensity;
    });
    expect(rod).toBeGreaterThan(0);
    expect(light).toBeGreaterThan(0);
    expect(rod / REACTOR_GLOW.emissive).toBeCloseTo(light / REACTOR_GLOW.intensity, 6);
  });
});
