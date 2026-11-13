import { describe, expect, it } from 'vitest';
import { TERRAIN_TYPES } from '../../data/terrain';
import { restFrame, type V3, type VehicleFrame } from '../../phys/frames';
import { hulkBoxes, unitBody, unitsOf } from '../../sim/body';
import { makeVehicle } from '../../sim/factory';
import { PARTS } from '../../data/parts';
import { corePart, mountedItems, mountedParts } from '../../sim/grid';
import { editableTerrain, emptyWorld } from '../../sim/testkit';
import type { Vehicle, World } from '../../sim/types';
import { TruckFx, type TruckFxSink } from './fx';
import { startRadius } from './particles/emissions';
import { smokeAt, smokeSources, ventsOf } from './smokePoints';

type Spawn = { kind: string; at: V3 };

function recorder(): { sink: TruckFxSink; spawns: Spawn[] } {
  const spawns: Spawn[] = [];
  const note = (kind: string) => (at: V3) => void spawns.push({ kind, at: { ...at } });
  const sink: TruckFxSink = {
    smoke: note('smoke'),
    exhaust: note('exhaust'),
    steam: note('steam'),
    douseSteam: note('douse'),
    breakdownSmoke: note('breakdown'),
    dustHaze: note('haze'),
    wheelDust: note('wheelDust'),
    clod: note('clod'),
    ruts: { layTracks: () => undefined },
  };
  return { sink, spawns };
}

function sandWorld(): World {
  const w = emptyWorld();
  const looseGround = Object.keys(TERRAIN_TYPES).find((id) => TERRAIN_TYPES[id as keyof typeof TERRAIN_TYPES].dust >= 1);
  if (!looseGround) throw new Error('No loose terrain type');
  editableTerrain(w).types.fill(looseGround as never);
  return w;
}

function semi(w: World): Vehicle {
  const engine = Object.values(PARTS).find((d) => d.kind === 'engine' && d.w <= 3 && d.h <= 3)!;
  const v = makeVehicle(w, { faction: 'player', chassisId: 'semi', parts: [{ defId: engine.id, wear: 0 }], spares: [], cargo: {}, pos: { x: 40, y: 40 }, heading: 0, brain: null });
  const trailerPart = mountedItems(v).find((it) => it.part.id !== corePart(v, 'cab').id && unitsOf('semi')[1].rows[0] <= it.y)!;
  trailerPart.part.hp = 0;
  w.player.vehicleId = v.id;
  w.player.fuel = 100;
  return v;
}

function advanced(f: VehicleFrame, meters: number): VehicleFrame {
  const shift = (p: V3): V3 => ({ ...p, x: p.x + meters });
  return { ...f, pos: shift(f.pos), rear: f.rear && { ...f.rear, pos: shift(f.rear.pos) }, acc: { x: 3, y: 0, z: 0 } };
}

function clearOfRig(at: V3, origin: V3, radius: number): boolean {
  const bottom = unitBody('semi', 0).half.y;
  return hulkBoxes('semi', 0).every(({ box, x, y }) => {
    const gap = (lo: number, hi: number, p: number) => Math.max(lo - p, 0, p - hi);
    const dx = gap(box.x0 + x, box.x1 + x, at.x - origin.x);
    const dy = gap(box.z0, box.z1, at.y - origin.y + bottom);
    const dz = gap(-box.y1 + y, -box.y0 + y, at.z - origin.z);
    return Math.hypot(dx, dy, dz) >= radius - 1e-6;
  });
}

function emitted(fx: TruckFx, spawns: Spawn[], w: World, v: Vehicle, f: VehicleFrame, moving = true): Spawn[] {
  const before = spawns.length;
  fx.emit(w, v, f, moving, 1 / 30, false);
  return spawns.slice(before);
}

function standing(w: World, v: Vehicle): Spawn[] {
  const { sink, spawns } = recorder();
  const fx = new TruckFx(sink);
  const f = restFrame(w, v);
  for (let i = 0; i < 20; i++) emitted(fx, spawns, w, v, f, false);
  return spawns;
}

describe('TruckFx starting points', () => {
  it('puffs smoke, exhaust, steam, douse and haze from the cached body points, outside the drawn rig', () => {
    const w = sandWorld();
    w.player.engineHeat = 1;
    const v = semi(w);
    const { sink, spawns } = recorder();
    const fx = new TruckFx(sink);
    fx.douse();
    const vents = ventsOf(v);
    const [hurt] = smokeSources(v);
    const rest = restFrame(w, v);
    const radius: Record<string, number> = { smoke: startRadius('hurt'), exhaust: startRadius('exhaust'), steam: startRadius('steam'), douse: startRadius('douse') };
    const seen = new Set<string>();
    for (let i = 0; i < 90; i++) {
      const f = advanced(rest, i * 0.4);
      for (const s of emitted(fx, spawns, w, v, f)) {
        seen.add(s.kind);
        if (s.kind in radius) expect(clearOfRig(s.at, f.pos, radius[s.kind]), `${s.kind} at frame ${i}`).toBe(true);
        if (s.kind === 'smoke') expect(s.at).toEqual(smokeAt(hurt, f));
        if (s.kind === 'exhaust') expect(s.at).toEqual(smokeAt(vents.exhaust, f));
        if (s.kind === 'steam') expect(s.at).toEqual(smokeAt(vents.engine, f));
      }
    }
    for (const kind of ['smoke', 'exhaust', 'steam', 'douse', 'haze']) expect(seen.has(kind), kind).toBe(true);
  });

  it('starts the dust haze behind the last unit', () => {
    const w = sandWorld();
    const v = semi(w);
    const { sink, spawns } = recorder();
    const fx = new TruckFx(sink);
    const rest = restFrame(w, v);
    const hazes: Spawn[] = [];
    for (let i = 0; i < 90; i++) hazes.push(...emitted(fx, spawns, w, v, advanced(rest, i * 0.4)).filter((s) => s.kind === 'haze').map((s) => ({ ...s, at: { ...s.at, x: s.at.x - i * 0.4 } })));
    expect(hazes.length).toBeGreaterThan(0);
    const tail = Math.min(...hulkBoxes('semi', 0).map(({ box, x }) => box.x0 + x));
    for (const h of hazes) expect(h.at.x - rest.pos.x).toBeLessThan(tail);
  });

  it('puffs breakdown smoke from the engine vent when the engine is broken, beside the other broken parts', () => {
    const w = sandWorld();
    const v = semi(w);
    for (const engine of mountedParts(v, 'engine')) engine.hp = 0;
    const found = standing(w, v);
    const breakdown = found.filter((s) => s.kind === 'breakdown');
    expect(breakdown.length).toBeGreaterThan(0);
    for (const s of breakdown) expect(s.at).toEqual(smokeAt(ventsOf(v).engine, restFrame(w, v)));
    expect(found.some((s) => s.kind === 'smoke')).toBe(true);
  });

  it('puffs no engine smoke from a truck with no engine or no fuel', () => {
    const w = sandWorld();
    const v = semi(w);
    const dry = { ...v, resources: v.resources && { ...v.resources, fuel: 0 } };
    w.player.fuel = 0;
    const bare = { ...v, items: v.items.filter((it) => it.kind !== 'part' || !mountedParts(v, 'engine').includes(it.part)) };
    for (const truck of [dry, bare]) expect(standing(w, truck).filter((s) => s.kind === 'breakdown' || s.kind === 'exhaust')).toEqual([]);
  });
});
