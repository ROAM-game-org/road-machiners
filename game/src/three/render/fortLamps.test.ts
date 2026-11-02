import { describe, expect, it } from 'vitest';
import { Object3D, Raycaster, Vector3, type Mesh } from 'three';
import { loadModels, model } from './models';
import { buildSites, lampMount } from './sites';
import { posed } from './propInstances';
import { FORTRESS_LAMPS } from '../../data/fortress';
import { PHYSICS } from '../../data/physics';
import { REGION } from '../../data/region';
import { fortressGates, fortressPieces, fortressProps } from '../../sim/fortress';
import { propBase } from '../../sim/bridge';
import { propObstacle, propPose } from '../../sim/mapgen';
import { isFortress } from '../../sim/sites';
import { ICARUS_KEY } from '../../sim/atlas';
import type { Terrain } from '../../sim/terrain';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const S = PHYSICS.metersPerTile;
const SCONCE_REACH = 0.7;
const GATE_REACH = 0.3;
const SCONCE_TOLERANCE = 0.15;
const GATE_TOLERANCE = 0.25;
const GATE_SPOT = 0.05;
const BRACKET_DROP = 0.06;
const FORTS = [...REGION.towns, ...REGION.locations].filter(isFortress);
const FLAT: Terrain = { size: 1, heights: [0, 0, 0, 0], types: ['hardpan'], atlas: ICARUS_KEY };
const RAMP_SIZE = 1400;
const RAMP_SLOPE = 0.05;
const NEARBY = 3;
const HEIGHT_TOLERANCE = 0.02;
const RAMP: Terrain = {
  size: RAMP_SIZE,
  heights: Array.from({ length: (RAMP_SIZE + 1) ** 2 }, (_, i) => (i % (RAMP_SIZE + 1)) * RAMP_SLOPE),
  types: ['hardpan'],
  atlas: ICARUS_KEY,
};

type Head = { mesh: Mesh; world: Vector3 };

function headsOf(root: Object3D): Head[] {
  const heads: Head[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.name === 'halo' && o.parent?.userData.gateFurniture) heads.push({ mesh: o.parent as Mesh, world: o.parent.getWorldPosition(new Vector3()) });
  });
  return heads;
}

function siteRoot(built: ReturnType<typeof buildSites>, id: string): Object3D {
  const root = built.root.getObjectByName(`landmark-${id}`);
  if (!root) throw new Error(`Missing site ${id}`);
  return root;
}

function pieceModels(site: (typeof FORTS)[number], t: Terrain): Object3D {
  const all = new Object3D();
  fortressProps(site).forEach((prop, k) => {
    const o = propObstacle(prop, k);
    const pose = propPose(o);
    if (pose.model === 'hulk') return;
    const g = posed(propBase(t, o), pose);
    g.add(model(pose.model));
    all.add(g);
  });
  all.updateMatrixWorld(true);
  return all;
}

function atGateLamp(site: (typeof FORTS)[number], head: Head): boolean {
  const reach = GATE_REACH - lampMount(site, 'gate').face;
  const at = { x: head.world.x / S, y: head.world.z / S };
  return fortressGates(site).some((g) =>
    [-1, 1].some((side) => Math.hypot(g.face.x + g.out.x * reach - g.out.y * (side * g.width) / 4 - at.x, g.face.y + g.out.y * reach + g.out.x * (side * g.width) / 4 - at.y) < GATE_SPOT),
  );
}

describe('fortress lamps hang on their piece models (#498)', () => {
  it('seats every bracket inner end on a surface of the fort (IV1)', () => {
    const built = buildSites(FLAT);
    const caster = new Raycaster();
    for (const site of FORTS) {
      const models = pieceModels(site, FLAT);
      const gate = lampMount(site, 'gate');
      const heads = headsOf(siteRoot(built, site.id));
      expect(heads.length, site.id).toBeGreaterThan(0);
      for (const head of heads) {
        const atGate = atGateLamp(site, head);
        const reach = atGate ? GATE_REACH : SCONCE_REACH;
        const height = atGate ? gate.height : undefined;
        const out = new Vector3(Math.cos(head.mesh.rotation.y), 0, -Math.sin(head.mesh.rotation.y));
        const y = height === undefined ? head.world.y - (BRACKET_DROP + 0.117) * S : (height - BRACKET_DROP) * S;
        caster.set(new Vector3(head.world.x, y, head.world.z), out.clone().negate());
        const hit = caster.intersectObject(models, true)[0];
        const where = `${site.id} ${atGate ? 'gate' : 'sconce'} lamp at ${(head.world.x / S).toFixed(1)},${(head.world.z / S).toFixed(1)}`;
        expect(hit, `${where} hits nothing`).toBeDefined();
        const gap = Math.abs(hit.distance - reach * S);
        expect(gap, `${where} floats ${gap.toFixed(2)} m off its piece`).toBeLessThanOrEqual(atGate ? GATE_TOLERANCE : SCONCE_TOLERANCE);
      }
    }
  });

  it('holds every lamp at its table height over its piece base on a slope (IV2)', () => {
    const flat = buildSites(FLAT);
    const ramp = buildSites(RAMP);
    for (const site of FORTS) {
      const level = headsOf(siteRoot(flat, site.id));
      const sloped = headsOf(siteRoot(ramp, site.id));
      expect(sloped.length, site.id).toBe(level.length);
      const pieces = fortressPieces(site);
      const bases = fortressProps(site).map((prop, k) => propBase(RAMP, propObstacle(prop, k)));
      sloped.forEach((head, i) => {
        const nearby = pieces.flatMap((p, k) => (Math.hypot(p.pos.x - head.world.x / S, p.pos.y - head.world.z / S) <= NEARBY ? [bases[k]] : []));
        const heights = nearby.map((base) => head.world.y / S - base);
        expect(heights.some((h) => Math.abs(h - level[i].world.y / S) <= HEIGHT_TOLERANCE), `${site.id} lamp ${i}: ${heights.join(' ')} vs ${level[i].world.y / S}`).toBe(true);
      });
    }
  });

  it('throws when a style has no lamp mount for a piece it builds (IV4)', () => {
    const ring = FORTS.find((s) => s.id === 'granary')!;
    expect(FORTRESS_LAMPS.ring.tower).toBeUndefined();
    expect(() => lampMount(ring, 'tower')).toThrow('Fortress style ring has no lamp mount for tower');
  });
});
