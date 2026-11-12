
import { PAINT, PALETTE, type TruckPaint } from '../../data/chassis';
import { GANG_PAINT, paintOf, TEMPLATE_PAINT } from '../../render/palette';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { startKit } from '../../data/start';
import { partDef } from '../../data/parts';
import { wheelMounts } from '../../phys/body';
import { BODY_PARTS, WEAR_LOOK_STEPS, wearLookStep } from '../../render/partLooks';
import { bodyOf } from '../../sim/body';
import { playerVehicle } from '../../sim/damage';
import { mountedParts } from '../../sim/grid';
import { PLAIN_KIT } from '../../sim/testkit';
import type { Vehicle } from '../../sim/types';
import { maxHp } from '../../sim/wear';
import { newWorld } from '../../sim/world';
import { TEST_MAP } from '../../test/map';
import { drawnWheelPoints } from '../../render/partLooks';
import { baseModel } from '../../render/partLooks';
import { loadModels, model } from './models';
import { dent, signatureOf, VehicleView } from './vehicle';
import { BODY_PAINT_SATURATION, bodyPaint, CHAR, charShare } from './truckMesh';
import { defaultSetup } from '../../sim/settings';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

function truck(): Vehicle {
  return playerVehicle(newWorld(1337, PLAIN_KIT, TEST_MAP, defaultSetup('roaming')));
}

function withHp(v: Vehicle, partId: string, hp: number): Vehicle {
  const items = structuredClone(v.items);
  for (const it of items) if (it.kind === 'part' && it.part.id === partId) it.part.hp = hp;
  return { ...v, items };
}

function paintedPart(v: Vehicle) {
  return mountedParts(v).find((p) => BODY_PARTS.has(p.defId) && maxHp(p) > 1)!;
}

function colors(view: VehicleView): string {
  const hexes = new Set<number>();
  view.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial)) return;
    const tint = o.geometry.getAttribute('color');
    if (!o.material.vertexColors || !tint) return void hexes.add(o.material.color.getHex());
    for (let i = 0; i < tint.count; i++) hexes.add(new THREE.Color(tint.getX(i), tint.getY(i), tint.getZ(i)).getHex());
  });
  return [...hexes].sort().join(',');
}

describe('part wear look', () => {
  it('rebuilds the signature when a part crosses a look step, not inside one', () => {
    const v = truck();
    const part = mountedParts(v)[0];
    const max = maxHp(part);
    part.hp = max;
    const full = signatureOf(v, PAINT.standard);
    part.hp = max - 1;
    const first = signatureOf(v, PAINT.standard);
    expect(first).not.toBe(full);
    part.hp = max - 2;
    expect(signatureOf(v, PAINT.standard)).toBe(first);
    part.hp = 0;
    expect(signatureOf(v, PAINT.standard)).not.toBe(first);
    part.hp = max;
    expect(signatureOf(v, PAINT.standard)).toBe(full);
    expect(WEAR_LOOK_STEPS).toBeGreaterThan(2);
  });

  it('fades a worn truck and gives the original colors back on repair', () => {
    const v = truck();
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    const clean = colors(view);
    const part = paintedPart(v);
    const max = maxHp(part);
    view.update(withHp(v, part.id, 1), true, PAINT.standard);
    expect(colors(view)).not.toBe(clean);
    view.update(withHp(v, part.id, max), true, PAINT.standard);
    expect(colors(view)).toBe(clean);
  });

  it('keeps the old look while a budgeted rebuild runs in steps, then shows the new look in the same root', () => {
    const v = truck();
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    const clean = colors(view);
    const root = view.root;
    const worn = withHp(v, paintedPart(v).id, 1);
    const oneStep = { take: () => ((oneStep.left -= 1) >= 0), ready: () => true, left: 0 };
    let calls = 0;
    while (colors(view) === clean) {
      oneStep.left = 1;
      view.update(worn, true, PAINT.standard, oneStep);
      calls++;
      expect(calls).toBeLessThan(24);
    }
    expect(calls).toBeGreaterThan(3);
    expect(view.root).toBe(root);
    expect(colors(view)).toBe(colors(new VehicleView(worn, true, PAINT.standard, 'world')));
    const meshes = (view.root.children.length);
    oneStep.left = 1;
    view.update(worn, true, PAINT.standard, oneStep);
    expect(oneStep.left).toBe(1);
    expect(view.root.children.length).toBe(meshes);
  });

  it('keeps the old look after the new one is built until its shaders are ready', () => {
    const v = truck();
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    const clean = colors(view);
    const worn = withHp(v, paintedPart(v).id, 1);
    const budget = { take: () => true, ready: () => budget.compiled, compiled: false };
    view.update(worn, true, PAINT.standard, budget);
    view.update(worn, true, PAINT.standard, budget);
    expect(colors(view)).toBe(clean);
    budget.compiled = true;
    view.update(worn, true, PAINT.standard, budget);
    expect(colors(view)).not.toBe(clean);
  });

  it('draws the new-game truck with a nearly broken engine and a worn body', () => {
    const v = playerVehicle(newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming')));
    const step = (defId: string) => wearLookStep(mountedParts(v).find((p) => p.defId === defId)!);
    expect(step('stockEngine')).toBe(WEAR_LOOK_STEPS - 1);
    expect(step('cabBroad')).toBeGreaterThan(0);
    expect(colors(new VehicleView(v, true, PAINT.standard, 'world'))).not.toBe(colors(new VehicleView(truck(), true, PAINT.standard, 'world')));
  });

  it('wears the body with the cab part and restores it on repair', () => {
    const v = truck();
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    const clean = colors(view);
    const full = signatureOf(v, PAINT.standard);
    const cab = mountedParts(v).find((p) => BODY_PARTS.has(p.defId))!;
    const max = maxHp(cab);
    const worn = withHp(v, cab.id, max - 1);
    expect(signatureOf(worn, PAINT.standard)).not.toBe(full);
    view.update(worn, true, PAINT.standard);
    expect(colors(view)).not.toBe(clean);
    const repaired = withHp(v, cab.id, max);
    view.update(repaired, true, PAINT.standard);
    expect(signatureOf(repaired, PAINT.standard)).toBe(full);
    expect(colors(view)).toBe(clean);
  });

  it('answers a world point for every mounted part, a wheel at its mount', () => {
    const v = truck();
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    view.pose({ pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, acc: { x: 0, y: 0, z: 0 }, wheels: wheelMounts(bodyOf(v.chassisId), 0).map(() => ({ suspension: 0, steer: 0, spin: 0, ground: true })) }, 0.016);
    for (const p of mountedParts(v)) expect(view.partPoint(p.id), p.id).toBeDefined();
    const mounts = drawnWheelPoints(bodyOf(v.chassisId), 0);
    const wheels = mountedParts(v, 'core').filter((p) => p.defId.startsWith('wheel'));
    expect(wheels.length).toBe(mounts.length);
    for (const w of wheels) {
      const at = view.partPoint(w.id);
      expect(Math.min(...mounts.map((m) => Math.hypot(at.x - m.x, at.z - m.z)))).toBeLessThan(0.1);
    }
    expect(() => view.partPoint('nope')).toThrow();
  });
});

describe('paint job look', () => {
  const npc = (v: Vehicle, templateId: string): Vehicle => ({ ...v, faction: 'independent', brain: { ...({} as NonNullable<Vehicle['brain']>), templateId } });
  const PAINTS: TruckPaint[] = [PAINT.standard, { ...PAINT.standard, body: 'oxblood' }, { ...PAINT.standard, cab: 'oxblood' }, { ...PAINT.standard, gear: 'oxblood' }];

  it('keys the rebuild on each of the three colors on its own', () => {
    const v = truck();
    const sigs = PAINTS.map((paint) => signatureOf(v, paint));
    expect(new Set(sigs).size).toBe(PAINTS.length);
  });

  it('paints the body and the gear apart', () => {
    const v = truck();
    const view = new VehicleView(v, true, { body: 'oxblood', cab: 'slate', gear: 'chalk' }, 'world');
    const drawn = colors(view);
    expect(drawn).toContain(String(bodyPaint(PALETTE.oxblood)));
    expect(drawn).toContain(String(bodyPaint(PALETTE.chalk)));
    expect(drawn).not.toContain(String(bodyPaint(PALETTE.tan)));
  });

  it('repaints the player truck at once and keeps the wear look on top', () => {
    const v = truck();
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    const standard = colors(view);
    const gearOnly: TruckPaint = { ...PAINT.standard, gear: 'chalk' };
    view.update(v, true, gearOnly);
    const mint = colors(view);
    expect(mint).not.toBe(standard);
    expect(mint).toContain(String(bodyPaint(PALETTE.chalk)));
    expect(mint).toContain(String(bodyPaint(PALETTE.tan)));
    const part = paintedPart(v);
    view.update(withHp(v, part.id, 1), true, gearOnly);
    expect(colors(view)).not.toBe(mint);
  });

  it('keeps the role paint of every NPC whatever the player paint', () => {
    const base = truck();
    for (const templateId of Object.keys(TEMPLATE_PAINT)) {
      const role = TEMPLATE_PAINT[templateId];
      for (const paint of PAINTS) expect(paintOf(npc(base, templateId), paint)).toEqual({ body: role.top, cab: role.cab, gear: role.top });
    }
    for (const gang of ['scrapjaw', 'kiln'] as const) {
      const role = GANG_PAINT[gang];
      for (const paint of PAINTS) expect(paintOf({ ...base, faction: gang }, paint)).toEqual({ body: role.top, cab: role.cab, gear: role.top });
    }
  });

  it('throws on a paint the build does not know', () => {
    expect(() => paintOf(truck(), { ...PAINT.standard, body: 'gold' } as unknown as TruckPaint)).toThrow(/gold/);
  });
});

describe('worn wheel look', () => {
  function wheelParts(v: Vehicle) {
    return mountedParts(v, 'core').filter((p) => {
      const def = partDef(p.defId);
      return def.kind === 'core' && def.role === 'wheel';
    });
  }

  function wheelDepths(v: Vehicle): number[] {
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    const wheels = new Set(wheelParts(v).map((p) => p.id));
    const depths: number[] = [];
    view.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !wheels.has(o.userData.partId)) return;
      const z = o.geometry.getAttribute('position');
      let deepest = 0;
      for (let i = 0; i < z.count; i++) deepest = Math.max(deepest, Math.abs(z.getZ(i)));
      depths.push(deepest);
    });
    return depths;
  }

  it('keeps the tire inside the rim face on a worn wheel, so no black bar crosses the hub', () => {
    const v = truck();
    const fresh = wheelDepths(v);
    for (const part of wheelParts(v)) part.hp = 1;
    expect(fresh.length).toBeGreaterThan(0);
    expect(wheelDepths(v)).toEqual(fresh);
  });
});

describe('body paint', () => {
  it('mutes the body paint and keeps the cab color at full strength', () => {
    const drawn = colors(new VehicleView(truck(), true, { body: 'oxblood', cab: 'slate', gear: 'oxblood' }, 'world')).split(',').map(Number);
    expect(drawn).toContain(bodyPaint(PALETTE.oxblood));
    expect(drawn).not.toContain(PALETTE.oxblood);
    expect(drawn).toContain(PALETTE.slate);
    const saturation = (hex: number) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).s;
    expect(saturation(bodyPaint(PALETTE.oxblood))).toBeCloseTo(saturation(PALETTE.oxblood) * BODY_PAINT_SATURATION, 2);
  });
});

describe('broken part look', () => {
  function partColors(view: VehicleView, partId: string): THREE.Color[] {
    const found: THREE.Color[] = [];
    view.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh && o.userData.partId === partId && o.material instanceof THREE.MeshLambertMaterial)) return;
      const tint = o.geometry.getAttribute('color');
      if (!o.material.vertexColors || !tint) return void found.push(o.material.color.clone());
      for (let i = 0; i < tint.count; i++) found.push(new THREE.Color(tint.getX(i), tint.getY(i), tint.getZ(i)));
    });
    return found;
  }

  it('burns every color of a broken part toward char', () => {
    const v = truck();
    const part = mountedParts(v).find((p) => maxHp(p) > 1 && partColors(new VehicleView(v, true, PAINT.standard, 'world'), p.id).length > 0)!;
    const healthy = partColors(new VehicleView(v, true, PAINT.standard, 'world'), part.id);
    const broken = partColors(new VehicleView(withHp(v, part.id, 0), true, PAINT.standard, 'world'), part.id);
    expect(broken.length).toBe(healthy.length);
    const char = new THREE.Color(CHAR);
    healthy.forEach((c, i) => {
      const expected = c.clone().lerp(char, charShare(WEAR_LOOK_STEPS));
      expect(broken[i].r).toBeCloseTo(expected.r, 2);
      expect(broken[i].g).toBeCloseTo(expected.g, 2);
      expect(broken[i].b).toBeCloseTo(expected.b, 2);
    });
  });
});

describe('dents', () => {
  const positions = (obj: THREE.Object3D, material: string): number[] => {
    const found: number[] = [];
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === material) found.push(...o.geometry.getAttribute('position').array);
    });
    return found;
  };

  it('dents the body panels and leaves the flush trim strip on top of them', () => {
    const obj = model(baseModel('scout', 0));
    const [paint, trim] = [positions(obj, 'paint'), positions(obj, 'trim')];
    dent(obj, 'p1', WEAR_LOOK_STEPS - 1, { top: true, keepOut: [] });
    expect(trim.length).toBeGreaterThan(0);
    expect(positions(obj, 'paint')).not.toEqual(paint);
    expect(positions(obj, 'trim')).toEqual(trim);
  });
});
