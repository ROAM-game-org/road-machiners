import { describe, expect, it } from 'vitest';
import { NPCS } from '../../data/npcs';
import { generateNpcLoadout } from '../../sim/npc-loadout';
import { makeVehicle } from '../../sim/factory';
import { emptyWorld, npcBrain } from '../../sim/testkit';
import { fallbackFaction } from '../../sim/spawn';
import type { Vehicle } from '../../sim/types';
import { PAINT } from '../../data/chassis';
import { SLOW, gunContacts, headCount, mountedGuns } from '../../test/gun-clearance-kit';
import { unitOfCells } from '../../sim/body';
import { itemCells } from '../../sim/grid';
import { baseModel } from '../../render/partLooks';
import { model } from './models';
import { clearOver, gunStack, type Box2, type RestGun } from './gunStack';
import { restGunOf, VehicleView } from './vehicle';

function rolled(templateId: string, seed: number): Vehicle {
  const t = NPCS[templateId];
  const world = { ...emptyWorld(), rngState: seed * 7 + 3 };
  const l = generateNpcLoadout(world, t, null, 'loaded');
  return makeVehicle(world, { ...l, faction: fallbackFaction(t), brain: npcBrain(t.id, { x: 50, y: 50 }, t.traits), pos: { x: 50, y: 50 }, heading: 0 });
}

function sample(): { label: string; v: Vehicle }[] {
  const out: { label: string; v: Vehicle }[] = [];
  for (const id of Object.keys(NPCS)) {
    for (let seed = 1; seed <= 6; seed++) {
      try {
        out.push({ label: `${id}#${seed}`, v: rolled(id, seed) });
      } catch {
        continue;
      }
    }
  }
  return out;
}

const box = (x0: number, x1: number, z0: number, z1: number): Box2 => ({ x0, x1, z0, z1 });

function gun(id: string, at: { col: number; row: number; x: number; z: number; reach: number; side?: number }): RestGun {
  const half = 0.25;
  const pivot = { x: at.x, z: at.z };
  return {
    id,
    unit: 0,
    col: at.col,
    row: at.row,
    pivot,
    cells: box(at.x - 0.25, at.x + 0.25, at.z - 0.5, at.z + 0.5),
    receiver: box(at.x - half, at.x + half, at.z - half, at.z + half),
    barrel: box(at.x + half, at.x + at.reach, at.z - 0.05, at.z + 0.05),
    receiverTop: 0.4,
    barrelTop: 0.3,
  };
}

describe('gunStack', () => {
  it('puts a gun whose barrel lies over another gun above it', () => {
    const rear = gun('rear', { col: 0, row: 0, x: 0, z: 0, reach: 2 });
    const front = gun('front', { col: 1, row: 0, x: 1, z: 0.4, reach: 1.4 });
    const stack = gunStack([front, rear]);
    expect(stack.order).toEqual(['front', 'rear']);
    expect(stack.below.get('rear')).toEqual(['front']);
    expect(stack.levels.get('rear')).toBe(1);
    expect(stack.levels.get('front')).toBe(0);
  });

  it('puts the shorter gun lower when only receivers meet', () => {
    const short = gun('short', { col: 0, row: 0, x: 0, z: 0, reach: 0.6 });
    const long = gun('long', { col: 1, row: 0, x: 0.3, z: 0, reach: 1.8 });
    expect(gunStack([long, short]).order).toEqual(['short', 'long']);
  });

  it('puts the gun with a post under another gun lower', () => {
    const post = gun('post', { col: 0, row: 0, x: 0, z: 2, reach: 0.6 });
    const across = gun('across', { col: 0, row: 1, x: -1, z: 2, reach: 2.4 });
    expect(gunStack([across, post]).order).toEqual(['post', 'across']);
  });

  it('resolves a ring of three guns that each reach another post and lists one pair', () => {
    const ring = (id: string, x: number, z: number, receiver: Box2): RestGun => ({
      id, unit: 0, col: 0, row: 0, pivot: { x, z }, cells: box(x - 0.05, x + 0.05, z - 0.05, z + 0.05), receiver, barrel: box(x + 0.01, x + 0.02, z, z + 0.01), receiverTop: 0.4, barrelTop: 0.3,
    });
    const a = ring('a', 0, 0, box(-0.2, 2.2, -0.2, 0.2));
    const b = ring('b', 2, 0, box(0.8, 2.2, -0.2, 1.9));
    const c = ring('c', 1, 1.7, box(-0.2, 1.2, -0.2, 1.9));
    const stack = gunStack([a, b, c]);
    expect(stack.order).toHaveLength(3);
    expect(stack.unresolved).toHaveLength(1);
  });

  it('leaves guns far apart alone', () => {
    const a = gun('a', { col: 0, row: 0, x: 0, z: 0, reach: 1 });
    const b = gun('b', { col: 5, row: 0, x: 5, z: 0, reach: 1 });
    const stack = gunStack([a, b]);
    expect(stack.below.get('a')).toEqual([]);
    expect(stack.below.get('b')).toEqual([]);
  });

  it('never stacks guns on different units', () => {
    const a = gun('a', { col: 0, row: 0, x: 0, z: 0, reach: 2 });
    const b = { ...gun('b', { col: 0, row: 0, x: 0.5, z: 0, reach: 2 }), unit: 1 };
    expect(gunStack([a, b]).levels.get('b')).toBe(0);
  });

  it('clears only the lower part it lies over', () => {
    const rear = gun('rear', { col: 0, row: 0, x: 0, z: 0, reach: 2 });
    const front = gun('front', { col: 1, row: 0, x: 1, z: 0.4, reach: 1.4 });
    expect(clearOver(rear, front, 1)).toBeCloseTo(1.4);
    expect(clearOver(rear, { ...front, cells: box(9, 10, 9, 10), receiver: box(9, 10, 9, 10), barrel: box(9, 10, 9, 10) }, 1)).toBe(-Infinity);
  });
});

function restGunsOf(v: Vehicle): Map<string, RestGun> {
  return new Map(mountedGuns(v).map((g) => [g.id, restGunOf(v, g, model(baseModel(v.chassisId, unitOfCells(v.chassisId, itemCells(g)).index)))]));
}

function headY(v: Vehicle, id: string): number {
  const view = new VehicleView(v, true, PAINT.standard, 'world');
  view.root.updateMatrixWorld(true);
  return (view.root.getObjectByName(`${id} head`) as { position: { y: number } }).position.y;
}

describe('gun heights', () => {
  it.each([['vulture', 2], ['gunwagon', 3], ['merc', 3]])('%s#%i: a gun that meets no other keeps its height and one that does stands higher', (templateId, seed) => {
    const v = rolled(templateId, seed);
    const rests = restGunsOf(v);
    const stack = gunStack([...rests.values()]);
    for (const g of mountedGuns(v)) {
      const alone = headY({ ...v, items: v.items.filter((it) => it === g || !mountedGuns(v).includes(it as never)) }, g.id);
      const full = headY(v, g.id);
      if ((stack.below.get(g.id) ?? []).length === 0) expect(full).toBeCloseTo(alone, 6);
      else expect(full).toBeGreaterThanOrEqual(alone - 1e-6);
    }
  }, SLOW);

  it('stands the slug cannon over the shotgun on the reported hauler', () => {
    const v = rolled('vulture', 2);
    const [shotgun, slug] = ['shotgun', 'slugCannon'].map((d) => mountedGuns(v).find((g) => g.part.defId === d));
    expect(shotgun && slug).toBeTruthy();
    expect(headY(v, (slug as { id: string }).id)).toBeGreaterThan(headY(v, (shotgun as { id: string }).id));
  }, SLOW);

  it('gives the same heights whatever the order of the items', () => {
    const v = rolled('gunwagon', 3);
    const flipped = { ...v, items: [...v.items].reverse() };
    for (const g of mountedGuns(v)) expect(headY(flipped, g.id)).toBeCloseTo(headY(v, g.id), 6);
  }, SLOW);
});

describe('guns on one truck at rest', () => {
  it('never meet on NPC loadouts of every template', () => {
    const problems: string[] = [];
    for (const { label, v } of sample()) {
      for (const mode of ['world', 'portrait'] as const) problems.push(...gunContacts(v, mode).map((p) => `${label} ${mode} ${p}`));
    }
    expect(problems).toEqual([]);
  }, SLOW);

  it('keep every mounted gun drawn', () => {
    const problems: string[] = [];
    for (const { label, v } of sample()) {
      const heads = headCount(new VehicleView(v, true, PAINT.standard, 'world'));
      if (heads !== mountedGuns(v).length) problems.push(`${label}: ${heads} heads for ${mountedGuns(v).length} guns`);
    }
    expect(problems).toEqual([]);
  }, SLOW);

  it('keep the reported pair apart', () => {
    const v = rolled('vulture', 2);
    expect(gunContacts(v, 'world')).toEqual([]);
  }, SLOW);
});
