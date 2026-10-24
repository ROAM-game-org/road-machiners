
import { describe, expect, it } from 'vitest';
import { CHASSIS } from './chassis';
import { PHYSICS } from './physics';
import SHAPES from './truck-shapes.json';
import { cellRect, engineAnchor, restOn } from '../sim/body';

const FILES = import.meta.glob<string>('/public/models/base_*.glb', { query: '?url&inline', import: 'default' });
const DATA_URL = 'data:model/gltf-binary;base64,';

function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

async function readModel(name: string): Promise<Uint8Array> {
  const load = FILES[`/public/models/${name}.glb`];
  if (load === undefined) throw new Error(`Model public/models/${name}.glb is missing`);
  const url = await load();
  if (!url.startsWith(DATA_URL)) throw new Error(`Model ${name}.glb did not inline as base64 data`);
  return Uint8Array.from(atob(url.slice(DATA_URL.length)), (c) => c.charCodeAt(0));
}

describe('truck shapes', () => {
  const names = Object.keys(SHAPES) as (keyof typeof SHAPES)[];

  it('has a shape for the base model of every chassis and the rear unit of every rig', () => {
    const rears = Object.values(CHASSIS).flatMap((c) => (c.coupling ? [`base_${(PHYSICS.couplings as Record<string, { rear: { model: string } }>)[c.look].rear.model}`] : []));
    expect(names.sort()).toEqual([...Object.keys(CHASSIS).map((id) => `base_${id}`), ...rears].sort());
  });

  it.each(names)('%s matches its model file', async (name) => {
    expect(SHAPES[name].hash).toBe(fnv1a(await readModel(name)));
  });

  it.each(names)('%s has boxes with positive size', (name) => {
    const boxes = SHAPES[name].boxes;
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.x1).toBeGreaterThan(b.x0);
      expect(b.y1).toBeGreaterThan(b.y0);
      expect(b.z1).toBeGreaterThan(b.z0);
    }
  });

  it.each(names)('%s has a 0.1 m height map with geometry under every collision box center', (name) => {
    const { heights, boxes } = SHAPES[name];
    expect(heights.cell).toBe(0.1);
    for (const b of boxes) {
      const i = Math.floor((b.x0 + b.x1) / 2 / heights.cell) - heights.i0;
      const j = Math.floor((b.y0 + b.y1) / 2 / heights.cell) - heights.j0;
      expect(heights.top[i]?.[j], `${name} box center`).toEqual(expect.any(Number));
    }
  });
});

type Profile = { x: number; top: number }[];

function profileOf(name: keyof typeof SHAPES): Profile {
  const { heights } = SHAPES[name];
  const columns = heights.top.map((row, i) => {
    let top = -Infinity;
    row.forEach((cm, j) => {
      const y = ((heights.j0 + j + 0.5) * heights.cell);
      if (cm !== null && Math.abs(y) <= 0.6) top = Math.max(top, cm / 100);
    });
    return { x: (heights.i0 + i + 0.5) * heights.cell, top };
  });
  return columns.filter((c) => c.top > -Infinity).sort((a, b) => b.x - a.x);
}

const NEAR = 0.05;

function stationsOf(profile: Profile, ground: number) {
  const nose = profile[0].x;
  const tail = profile[profile.length - 1].x;
  const length = nose - tail;
  const top = Math.max(...profile.map((p) => p.top));
  const at = (x: number) => profile.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best)).top;
  const hoodLevel = at(nose - 0.15 * length);
  const hoodEnd = profile.find((p) => Math.abs(p.top - hoodLevel) > NEAR && p.x < nose - 0.15 * length)?.x ?? tail;
  const roofCols = profile.filter((p) => top - p.top <= NEAR);
  const deckLevel = at(tail + 0.1 * length);
  const deckEnd = [...profile].reverse().find((p) => p.top - deckLevel > NEAR && p.x > tail + 0.1 * length)?.x ?? nose;
  return {
    height: top - ground,
    hood: (nose - hoodEnd) / length,
    roof: (roofCols[0].x - roofCols[roofCols.length - 1].x) / length,
    deck: (deckEnd - tail) / length,
    roofStart: (nose - roofCols[0].x) / length,
    noseDrop: top - at(nose - 0.02 * length),
    tailDrop: top - at(tail + 0.03 * length),
  };
}

type Band = [number, number];
type Reference = { height: Band; hood?: Band; roof: Band; deck?: Band; roofStart?: Band; noseDrop?: Band; tailDrop?: Band };

const REFERENCE: Record<'lincoln' | 'niva' | 'bukhanka' | 'semi' | 'scout' | 'longbed' | 'courier' | 'hauler' | 'tractor' | 'jeep' | 'carrier' | 'loader' | 'bus' | 'buggy' | 'van', Reference> = {
  lincoln: { height: [1.56, 1.8], hood: [0.34, 0.42], roof: [0.14, 0.24], deck: [0.22, 0.3] },
  niva: { height: [1.89, 2.19], hood: [0.22, 0.28], roof: [0.55, 1], tailDrop: [0, 0.1] },
  bukhanka: { height: [2.34, 2.7], roof: [0.75, 1], roofStart: [0, 0.12], noseDrop: [0.15, 9], tailDrop: [0, 0.15] },
  semi: { height: [5.1, 5.4], hood: [0.1, 0.19], roof: [0.7, 0.77], roofStart: [0.23, 0.3] },
  scout: { height: [2.03, 2.14], roofStart: [0.42, 0.45], roof: [0.13, 0.17], deck: [0.39, 0.43], noseDrop: [0.64, 0.78] },
  longbed: { height: [2.55, 2.75], hood: [0.19, 0.25], roof: [0.1, 0.16], roofStart: [0.25, 0.31], deck: [0.53, 0.6] },
  courier: { height: [1.7, 1.8], roofStart: [0.42, 0.5], roof: [0.11, 0.2], noseDrop: [0.65, 0.9], tailDrop: [0.38, 0.62] },
  hauler: { height: [2.55, 2.71], roofStart: [0.07, 0.12], roof: [0.21, 0.27], deck: [0.58, 0.66] },
  tractor: { height: [2.9, 3.2], hood: [0.327, 0.361], roofStart: [0.353, 0.39], roof: [0.161, 0.179], deck: [0.443, 0.489] },
  jeep: { height: [1.95, 2.05], roofStart: [0.31, 0.37], roof: [0.18, 0.26], noseDrop: [0.9, 1.05], tailDrop: [0.95, 1.15] },
  buggy: { height: [1.7, 1.82], roof: [0.27, 0.33], noseDrop: [0.65, 0.8], tailDrop: [0.08, 0.2] },
  carrier: { height: [1.95, 2.15], roofStart: [0.15, 0.19], roof: [0.66, 0.74], noseDrop: [0.65, 0.85], tailDrop: [0.35, 0.6] },
  loader: { height: [3.35, 3.55], roof: [0.21, 0.29], roofStart: [0.4, 0.5], noseDrop: [2.4, 3.1], tailDrop: [0.8, 1.2] },
  bus: { height: [2.95, 3.05], roofStart: [0.86, 0.93], roof: [0.04, 0.1] },
  van: { height: [2.22, 2.32], roofStart: [0.27, 0.36], roof: [0.6, 0.73], tailDrop: [0, 0.1] },
};

type ShapeName = keyof typeof SHAPES;

function straightUnits(id: string): { name: ShapeName; offset: number }[] {
  const coupling = (PHYSICS.couplings as Record<string, { rear: { model: string }; pivotFront: number; pivotRear: number }>)[id];
  const front = { name: `base_${id}` as ShapeName, offset: 0 };
  return coupling ? [front, { name: `base_${coupling.rear.model}` as ShapeName, offset: coupling.pivotFront - coupling.pivotRear }] : [front];
}

function straightProfile(id: string): Profile {
  const columns = new Map<number, { x: number; top: number }>();
  for (const { name, offset } of straightUnits(id)) {
    for (const p of profileOf(name)) {
      const key = Math.round((p.x + offset) * 10);
      const known = columns.get(key);
      if (!known || known.top < p.top) columns.set(key, { x: key / 10, top: p.top });
    }
  }
  return [...columns.values()].sort((a, b) => b.x - a.x);
}

describe('trucks built from a reference photo keep its proportions', () => {
  it.each(['lincoln', 'niva', 'bukhanka', 'semi', 'scout', 'longbed', 'courier', 'hauler', 'tractor', 'jeep', 'carrier', 'loader', 'bus', 'buggy', 'van'] as const)('%s', (id) => {
    const body = PHYSICS.bodies[id === 'scout' ? 'pickup' : id];
    const ground = body.wheelY - PHYSICS.truck.suspensionRest - body.wheelRadius;
    const got = stationsOf(straightProfile(id), ground);
    const misses: string[] = [];
    for (const [key, band] of Object.entries(REFERENCE[id]) as [keyof Reference, Band][]) {
      if (got[key] < band[0] || got[key] > band[1]) misses.push(`${key} ${got[key].toFixed(3)} outside ${band[0]}..${band[1]}`);
    }
    expect(misses).toEqual([]);
  });
});

describe('the carrier armored car', () => {
  const boxes = SHAPES.base_carrier.boxes;
  const along = Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0));
  const across = Math.max(...boxes.map((b) => b.y1)) - Math.min(...boxes.map((b) => b.y0));
  const { wheelX } = PHYSICS.bodies.carrier;
  const near = (got: number, want: number) => Math.abs(got - want) / want;

  it('keeps the V-100 Commando: 5.85 m long, 1.028 times the real car, and widened like the scout to 0.496 of its length', () => {
    expect(Math.abs(along - 5.85)).toBeLessThanOrEqual(0.05);
    expect(near(across / along, 0.496)).toBeLessThanOrEqual(0.05);
  });

  it('bunches its wheels near the middle like the V-100: a wheelbase of 0.469 of the length and an overhang of 0.265 at each end', () => {
    expect(near((2 * wheelX) / along, 0.469)).toBeLessThanOrEqual(0.05);
    expect(near((along / 2 - wheelX) / along, 0.265)).toBeLessThanOrEqual(0.05);
  });
});

describe('the patrol buggy', () => {
  const buggy = PHYSICS.bodies.buggy;
  const ground = buggy.wheelY - PHYSICS.truck.suspensionRest - buggy.wheelRadius;
  const tire = 2 * buggy.wheelRadius;
  const { heights, boxes } = SHAPES.base_buggy;
  const columns = heights.top.flatMap((row, i) => row.flatMap((cm, j) => (cm === null ? [] : [{ x: (heights.i0 + i + 0.5) * heights.cell, y: (heights.j0 + j + 0.5) * heights.cell, top: cm / 100 }])));
  const crownOver = (wheelX: number) => Math.max(...columns.filter((c) => Math.abs(c.x - wheelX) <= 0.15 && Math.abs(Math.abs(c.y) - buggy.wheelZ) <= 0.1).map((c) => c.top)) - ground;
  const along = Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0));
  const row = along / CHASSIS.buggy.layout.length;
  const deckRows = CHASSIS.buggy.layout.flatMap((cells, y) => (cells.includes('D') ? [y] : []));
  const deckBack = along / 2 - (Math.max(...deckRows) + 1) * row;

  it('keeps its 3.9 m body on the photo\'s wheelbase of 0.557 of its length', () => {
    expect(Math.abs(along - 3.9)).toBeLessThanOrEqual(0.05);
    expect(Math.abs((2 * buggy.wheelX) / along / 0.557 - 1)).toBeLessThanOrEqual(0.05);
  });

  it('crowns its deep rear fenders 1.2 to 1.32 tire diameters over the ground, over the rear tires', () => {
    expect(crownOver(-buggy.wheelX) / tire).toBeGreaterThanOrEqual(1.2);
    expect(crownOver(-buggy.wheelX) / tire).toBeLessThanOrEqual(1.32);
  });

  it('stands nothing behind its deck rows over the roof, so guns on the roof keep short posts', () => {
    const roof = Math.max(...columns.filter((c) => c.x >= deckBack).map((c) => c.top));
    const behind = Math.max(...columns.filter((c) => c.x < deckBack - heights.cell).map((c) => c.top));
    expect(behind).toBeLessThanOrEqual(roof);
  });
});

describe('the scout pickup', () => {
  it('keeps the HiLux blueprint: 5.2 m long, with a width to length of 0.423 across its flares', () => {
    const boxes = SHAPES.base_scout.boxes;
    const along = Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0));
    const across = Math.max(...boxes.map((b) => b.y1)) - Math.min(...boxes.map((b) => b.y0));
    expect(Math.abs(along - 5.2)).toBeLessThanOrEqual(0.05);
    expect(across / along).toBeGreaterThanOrEqual(0.41);
    expect(across / along).toBeLessThanOrEqual(0.44);
  });

  const { heights } = SHAPES.base_scout;
  const pickup = PHYSICS.bodies.pickup;
  const ground = pickup.wheelY - PHYSICS.truck.suspensionRest - pickup.wheelRadius;
  const columns = heights.top.flatMap((row, i) => row.flatMap((cm, j) => (cm === null ? [] : [{ x: (heights.i0 + i + 0.5) * heights.cell, y: (heights.j0 + j + 0.5) * heights.cell, top: cm / 100 }])));

  it('keeps the blueprint beltline: the bed rail 1.47 to 1.58 m over the ground', () => {
    const tail = Math.min(...columns.map((c) => c.x));
    const nose = Math.max(...columns.map((c) => c.x));
    const station = tail + 0.2 * (nose - tail);
    const rail = Math.max(...columns.filter((c) => Math.abs(c.x - station) <= 0.2 && Math.abs(c.y) >= 0.85 && Math.abs(c.y) <= 1.05).map((c) => c.top));
    expect(rail - ground).toBeGreaterThanOrEqual(1.47);
    expect(rail - ground).toBeLessThanOrEqual(1.58);
  });

  it('closes the hood round the engine footprint', () => {
    const engineCells = CHASSIS.scout.layout.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'E' ? [{ x, y }] : [])));
    const { rect } = restOn('scout', cellRect('scout', engineCells));
    const anchor = engineAnchor('scout');
    const margin = 0.05;
    const half = { x: (rect.x1 - rect.x0) / 2 + margin, y: (rect.z1 - rect.z0) / 2 + margin };
    const inHole = (c: { x: number; y: number }) => Math.abs(c.x - anchor.x) <= half.x && Math.abs(-c.y - anchor.z) <= half.y;
    const open = columns.filter((c) => c.x >= 0.9 && c.x <= 2.3 && Math.abs(c.y) <= 1.0 && !inHole(c) && c.top < 0.15);
    expect(open.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}: ${c.top.toFixed(2)}`)).toEqual([]);
  });
});

describe('the utility van', () => {
  it('keeps the 125 in Chevrolet G20 at the scout\'s 1.077 scale: 5.53 m long, with a width to length of 0.39', () => {
    const boxes = SHAPES.base_van.boxes;
    const along = Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0));
    const across = Math.max(...boxes.map((b) => b.y1)) - Math.min(...boxes.map((b) => b.y0));
    expect(Math.abs(along - 5.53)).toBeLessThanOrEqual(0.05);
    expect(across / along).toBeGreaterThanOrEqual(0.375);
    expect(across / along).toBeLessThanOrEqual(0.405);
  });
});

describe('the courier Baja Bug', () => {
  it('keeps the Baja Bug at scout scale: 4.1 m long and 1.86 m across its fenders', () => {
    const boxes = SHAPES.base_courier.boxes;
    const along = Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0));
    const across = Math.max(...boxes.map((b) => b.y1)) - Math.min(...boxes.map((b) => b.y0));
    expect(Math.abs(along - 4.1)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(across - 1.86)).toBeLessThanOrEqual(0.03);
  });
});

describe('the hauler GAZ-66', () => {
  const boxes = SHAPES.base_hauler.boxes;
  const along = Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0));
  const across = Math.max(...boxes.map((b) => b.y1)) - Math.min(...boxes.map((b) => b.y0));

  it('copies the GAZ-66 photographs at the scout scale: 6.09 m long, with a width to length of 0.46 to 0.50 across its face', () => {
    expect(Math.abs(along - 6.09)).toBeLessThanOrEqual(0.05);
    expect(across / along).toBeGreaterThanOrEqual(0.46);
    expect(across / along).toBeLessThanOrEqual(0.5);
  });

  it('stays narrower than the semi', () => {
    const semi = SHAPES.base_semi.boxes;
    expect(across).toBeLessThan(Math.max(...semi.map((b) => b.y1)) - Math.min(...semi.map((b) => b.y0)));
  });

  it('carries its bed floor 1.35 to 1.45 m over the ground', () => {
    const { heights } = SHAPES.base_hauler;
    const body = PHYSICS.bodies.hauler;
    const ground = body.wheelY - PHYSICS.truck.suspensionRest - body.wheelRadius;
    const station = -along / 4;
    const floor = heights.top.flatMap((row, i) =>
      row.flatMap((cm, j) => {
        const x = (heights.i0 + i + 0.5) * heights.cell;
        const y = (heights.j0 + j + 0.5) * heights.cell;
        return cm !== null && Math.abs(x - station) <= 0.2 && Math.abs(y) <= 0.6 ? [cm / 100] : [];
      }),
    );
    expect(floor.length).toBeGreaterThan(0);
    expect(Math.min(...floor) - ground).toBeGreaterThanOrEqual(1.35);
    expect(Math.max(...floor) - ground).toBeLessThanOrEqual(1.45);
  });

  it('is a flatbed with no walls: behind the headboard and its braces nothing stands more than 0.06 m over the deck', () => {
    const { heights } = SHAPES.base_hauler;
    const body = PHYSICS.bodies.hauler;
    const ground = body.wheelY - PHYSICS.truck.suspensionRest - body.wheelRadius;
    const rows = heights.top.flatMap((row, i) => {
      const x = (heights.i0 + i + 0.5) * heights.cell;
      return x < 0 && x > -along / 2 + 0.1 ? row.flatMap((cm) => (cm === null ? [] : [cm / 100 - ground])) : [];
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(Math.max(...rows)).toBeLessThanOrEqual(1.46);
  });
});

describe('the tractor', () => {
  it('keeps the W900L day cab at one scale: 6.2 to 6.43 m long, with a width to length of 0.411 across its fenders and tanks', () => {
    const boxes = SHAPES.base_tractor.boxes;
    const along = Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0));
    const across = Math.max(...boxes.map((b) => b.y1)) - Math.min(...boxes.map((b) => b.y0));
    expect(along).toBeGreaterThanOrEqual(6.2);
    expect(along).toBeLessThanOrEqual(6.43);
    expect(Math.abs(across / along - 0.411)).toBeLessThanOrEqual(0.02);
  });
});

describe('the jeep field car', () => {
  const boxes = SHAPES.base_jeep.boxes;
  const along = Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0));
  const across = Math.max(...boxes.map((b) => b.y1)) - Math.min(...boxes.map((b) => b.y0));

  it('keeps the Type 82 footprint at 1.217 scale: 4.55 m long, with a width to length of 0.43', () => {
    expect(Math.abs(along - 4.55)).toBeLessThanOrEqual(0.05);
    expect(across / along).toBeGreaterThanOrEqual(0.41);
    expect(across / along).toBeLessThanOrEqual(0.44);
  });

  it('keeps the Type 82 wheelbase share of 0.64 of its length', () => {
    expect((2 * PHYSICS.bodies.jeep.wheelX) / along).toBeGreaterThanOrEqual(0.62);
    expect((2 * PHYSICS.bodies.jeep.wheelX) / along).toBeLessThanOrEqual(0.66);
  });

  it('keeps the Type 82 beltline: the door tops 1.2 to 1.3 m over the ground', () => {
    const { heights } = SHAPES.base_jeep;
    const jeep = PHYSICS.bodies.jeep;
    const ground = jeep.wheelY - PHYSICS.truck.suspensionRest - jeep.wheelRadius;
    const columns = heights.top.flatMap((row, i) => row.flatMap((cm, j) => (cm === null ? [] : [{ x: (heights.i0 + i + 0.5) * heights.cell, y: (heights.j0 + j + 0.5) * heights.cell, top: cm / 100 }])));
    const tail = Math.min(...columns.map((c) => c.x));
    const nose = Math.max(...columns.map((c) => c.x));
    const station = tail + 0.2 * (nose - tail);
    const belt = Math.max(...columns.filter((c) => Math.abs(c.x - station) <= 0.2 && Math.abs(c.y) >= 0.8 && Math.abs(c.y) <= 0.95).map((c) => c.top));
    expect(belt - ground).toBeGreaterThanOrEqual(1.2);
    expect(belt - ground).toBeLessThanOrEqual(1.3);
  });
});

describe('the hauler semi', () => {
  it('keeps a real rig to pickup ratio to the scout: 20.5 m along and 3.1 m across, about 3.9 scouts long and 1.41 wide', () => {
    const extent = (id: string) => {
      const boxes = straightUnits(id).flatMap(({ name, offset }) => SHAPES[name].boxes.map((b) => ({ ...b, x0: b.x0 + offset, x1: b.x1 + offset })));
      return { along: Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0)), across: Math.max(...boxes.map((b) => b.y1)) - Math.min(...boxes.map((b) => b.y0)) };
    };
    const semi = extent('semi');
    const scout = extent('scout');
    expect(Math.abs(semi.along - 20.5)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(semi.across - 3.1)).toBeLessThanOrEqual(0.05);
    expect(semi.along / scout.along).toBeGreaterThan(3.7);
    expect(semi.across / scout.across).toBeGreaterThan(1.25);
  });
});

describe('the LAZ bus', () => {
  const boxes = SHAPES.base_bus.boxes;
  const nose = Math.max(...boxes.map((b) => b.x1));
  const tail = Math.min(...boxes.map((b) => b.x0));
  const bus = PHYSICS.bodies.bus;
  const ground = bus.wheelY - PHYSICS.truck.suspensionRest - bus.wheelRadius;

  it('is the LAZ-695 cut to the grid: 8.5 m along and 2.6 m across', () => {
    const across = Math.max(...boxes.map((b) => b.y1)) - Math.min(...boxes.map((b) => b.y0));
    expect(nose - tail).toBeGreaterThanOrEqual(8.45);
    expect(nose - tail).toBeLessThanOrEqual(8.55);
    expect(across).toBeGreaterThanOrEqual(2.55);
    expect(across).toBeLessThanOrEqual(2.65);
  });

  it('sets its wheels in from long overhangs on the LAZ wheelbase share of 46%', () => {
    const wheelbase = 2 * bus.wheelX;
    expect(wheelbase).toBeGreaterThanOrEqual(3.8);
    expect(wheelbase).toBeLessThanOrEqual(4.0);
    expect(Math.abs(nose - bus.wheelX - (-bus.wheelX - tail))).toBeLessThanOrEqual(0.1);
  });

  it('keeps a flat roof 2.92 to 2.98 m up over every deck row clear of the engine hatch', () => {
    const profile = profileOf('base_bus');
    const at = (x: number) => profile.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best)).top;
    const step = (nose - tail) / CHASSIS.bus.layout.length;
    const rows = [1, 2, 3, 4, 5, 6, 7, 10].map((y) => ({ y, roof: at(nose - (y + 0.5) * step) - ground }));
    expect(rows.filter((r) => r.roof < 2.92 || r.roof > 2.98).map((r) => `row ${r.y}: ${r.roof.toFixed(3)}`)).toEqual([]);
  });
});
