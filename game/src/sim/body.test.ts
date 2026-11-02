import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { PHYSICS } from '../data/physics';
import { partDef, type CoreDef } from '../data/parts';
import BASELINE from './body-baseline.json';
import { CLIP_TOLERANCE, GRID_CELL, bodyOf, bodyRows, cellSteps, rideOf, cellCenter, cellRect, engineBay, engineFloor, highestUnder, hulkBoxes, isRig, lanesAt, restOn, roofSpot, spanOf, surfaceAt, surfaceSamples, unitBody, unitOfRow, unitsOf } from './body';
import { restBend } from './rig';
import TRUCK_SHAPES from '../data/truck-shapes.json';
import { baseGrid } from './grid';

const ids = Object.keys(CHASSIS);
const CLEAR = 0.15;

const coreCellsOf = (id: string, role: CoreDef['role']) => CHASSIS[id].core.flatMap((c) => {
  const def = partDef(c.defId) as CoreDef;
  if (def.role !== role) return [];
  const w = c.rot === 1 ? def.h : def.w;
  const h = c.rot === 1 ? def.w : def.h;
  return Array.from({ length: w * h }, (_, i) => ({ x: c.x + (i % w), y: c.y + Math.floor(i / w) }));
});
const cellsOf = (id: string, letter: string) => CHASSIS[id].layout.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === letter ? [{ x, y }] : [])));

describe('body from the base model', () => {
  it('sizes the scout from the bounds of its model boxes', () => {
    const b = bodyOf('scout');
    expect(b.half.x).toBeCloseTo(2.6);
    expect(b.half.z).toBeCloseTo(1.11);
  });

  it('keeps half extents, boxes and wheel mounts of every unit at the values recorded before the grid split', () => {
    const keys = ids.flatMap((id) => unitsOf(id).map((u) => (u.index === 0 ? id : `${id}/${u.index}`)));
    expect(Object.keys(BASELINE).sort()).toEqual(keys.sort());
    for (const key of keys) {
      const [id, unit] = key.split('/');
      const was = BASELINE[key as keyof typeof BASELINE];
      const b = unitBody(id, Number(unit ?? 0));
      expect(b.half.x, id).toBeCloseTo(was.half.x, 6);
      expect(b.half.y, id).toBeCloseTo(was.half.y, 6);
      expect(b.half.z, id).toBeCloseTo(was.half.z, 6);
      expect(b.wheelX, id).toBeCloseTo(was.wheelX, 6);
      expect(b.wheelZ, id).toBeCloseTo(was.wheelZ, 6);
      expect(b.boxes.length, id).toBe(was.boxes.length);
      b.boxes.forEach((box, i) => {
        for (const axis of ['x', 'y', 'z'] as const) {
          expect(box.at[axis], `${id} box ${i}`).toBeCloseTo(was.boxes[i].at[axis], 6);
          expect(box.half[axis], `${id} box ${i}`).toBeCloseTo(was.boxes[i].half[axis], 6);
        }
      });
    }
  });

  it('keeps every collider box inside the chassis bottom and the roof limit', () => {
    for (const b of ids.flatMap((id) => unitsOf(id).map((u) => u.body))) {
      const id = 'unit';
      const roof = PHYSICS.truckRoof - rideOf(b);
      expect(b.boxes.length, id).toBeGreaterThan(0);
      for (const box of b.boxes) {
        expect(box.at.y - box.half.y, id).toBeGreaterThanOrEqual(-b.half.y - 1e-9);
        expect(box.at.y + box.half.y, id).toBeLessThanOrEqual(roof + 1e-9);
      }
    }
  });
});

const COM_HEIGHT: Record<string, number> = {
  pickup: 0.45, hauler: 0.7, buggy: 0.4, wagon: 0.75, courier: 0.3, van: 0.5, longbed: 0.65, carrier: 0.75, tractor: 0.85,
  jeep: 0.4, convertible: 0.32, bus: 0.8, niva: 0.4, bukhanka: 0.6, lincoln: 0.32, semi: 1.1, sorokonoga: 0.65, loader: 0.95,
};

describe('centre of mass', () => {
  it('keeps every truck\'s centre of mass at its pinned height over flat ground at rest, whatever its wheels', () => {
    for (const id of ids) {
      for (const { body: b } of unitsOf(id)) expect(rideOf(b) + b.comY, id).toBeCloseTo(COM_HEIGHT[CHASSIS[id].look], 6);
    }
  });
});

describe('grid projection', () => {
  it('steps inner cells by one square cell and hangs the whole grid past the model outline by at most half a cell on each side', () => {
    for (const id of ids) {
      const { w, h } = baseGrid(id);
      const { half } = spanOf(id);
      const first = cellCenter(id, 1, 1);
      const next = cellCenter(id, 2, 2);
      expect(first.x - next.x, id).toBeCloseTo(GRID_CELL, 9);
      expect(next.z - first.z, id).toBeCloseTo(GRID_CELL, 9);
      expect((h - 2) * GRID_CELL, id).toBeLessThanOrEqual(2 * half.x + GRID_CELL + 1e-9);
      expect((w - 2) * GRID_CELL, id).toBeLessThanOrEqual(2 * half.z + GRID_CELL + 1e-9);
    }
  });

  it('puts the side armor columns on the side faces and the first and last rows on the nose and tail faces', () => {
    for (const id of ids) {
      const { w, h } = baseGrid(id);
      const { center, half } = spanOf(id);
      const all = unitsOf(id);
      const left = cellRect(id, [{ x: 0, y: 2 }]);
      expect(left.z0, id).toBeCloseTo(-half.z);
      expect(left.z1, id).toBeCloseTo(-half.z);
      expect(left.x1 - left.x0, id).toBeGreaterThan(0);
      const right = cellRect(id, [{ x: w - 1, y: 2 }]);
      expect(right.z0, id).toBeCloseTo(half.z);
      expect(right.z1, id).toBeCloseTo(half.z);
      const nose = cellRect(id, [{ x: 2, y: 0 }]);
      expect(nose.x0, id).toBeCloseTo(center + half.x - all[0].offset);
      expect(nose.x1, id).toBeCloseTo(center + half.x - all[0].offset);
      expect(nose.z1 - nose.z0, id).toBeGreaterThan(0);
      const tail = cellRect(id, [{ x: 2, y: h - 1 }]);
      expect(tail.unit, id).toBe(all.length - 1);
      expect(tail.x0, id).toBeCloseTo(center - half.x - all[all.length - 1].offset);
      expect(tail.x1, id).toBeCloseTo(center - half.x - all[all.length - 1].offset);
    }
  });

  it('projects the union of several cells', () => {
    const one = cellRect('scout', [{ x: 2, y: 2 }]);
    const two = cellRect('scout', [{ x: 2, y: 2 }, { x: 3, y: 3 }]);
    expect(two.x1).toBeCloseTo(one.x1);
    expect(two.z0).toBeCloseTo(one.z0);
    expect(two.x0).toBeLessThan(one.x0);
    expect(two.z1).toBeGreaterThan(one.z1);
  });

  it('rejects a cell outside the grid', () => {
    expect(() => cellCenter('scout', 7, 0)).toThrow(/outside/);
  });

  it('finds the lanes a stretch of the edge crosses, clamped to the grid', () => {
    const { half } = bodyOf('scout');
    expect(lanesAt('scout', 'column', 0.05, 0.1, 0)).toEqual([3]);
    expect(lanesAt('scout', 'column', -0.1, 0.1, 0)).toEqual([2, 3]);
    expect(lanesAt('scout', 'column', -half.z - 1, half.z + 1, 0)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(lanesAt('scout', 'row', half.x - 0.01, half.x - 0.02, 0)).toEqual([1]);
    expect(lanesAt('scout', 'row', half.x + 0.5, half.x + 0.4, 0)).toEqual([0]);
    expect(lanesAt('scout', 'row', -half.x - 0.5, -half.x - 0.4, 0)).toEqual([13]);
    expect(lanesAt('scout', 'row', 100, -100, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});

describe('row lanes', () => {
  it('gives every inner cell the lane of its own row and the ring rows the lanes outside the body, on every chassis and unit', () => {
    for (const id of ids) {
      const { w, h } = baseGrid(id);
      const { row } = cellSteps(id);
      expect(row, id).toBeCloseTo(GRID_CELL, 9);
      for (let y = 1; y < h - 1; y++) {
        const at = cellCenter(id, Math.floor(w / 2), y);
        expect(lanesAt(id, 'row', at.x, at.x, at.unit), `${id} row ${y}`).toEqual([y]);
      }
    }
  });

  it('counts the body rows without the two ring rows', () => {
    for (const id of ids) expect(bodyRows(id), id).toBe(baseGrid(id).h - 2);
  });
});

describe('model surface', () => {
  it('takes the highest point under the whole rect', () => {
    const rect = cellRect('scout', [{ x: 3, y: 5 }, { x: 3, y: 8 }]);
    const parts = [5, 6, 7, 8].map((y) => surfaceAt('scout', cellRect('scout', [{ x: 3, y }])));
    expect(surfaceAt('scout', rect)).toBeCloseTo(Math.max(...parts));
  });

  it('leaves out a wall that stands over a row edge', () => {
    expect(surfaceAt('scout', cellRect('scout', [{ x: 3, y: 9 }, { x: 3, y: 10 }]))).toBeLessThan(0.1);
    expect(surfaceAt('wagon', cellRect('wagon', [{ x: 3, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 7 }, { x: 4, y: 7 }]))).toBeLessThan(0.7);
  });

  it('reads a rect narrower than a sample cell at its middle', () => {
    const at = cellCenter('scout', 3, 10);
    expect(surfaceAt('scout', { unit: 0, x0: at.x - 0.02, x1: at.x + 0.02, z0: at.z - 0.02, z1: at.z + 0.02 })).toBeLessThan(0.1);
  });

  it('throws when the model has nothing under the rect', () => {
    expect(() => surfaceAt('scout', { unit: 0, x0: 50, x1: 51, z0: 0, z1: 1 })).toThrow(/no surface/);
  });

});

const ENGINE_FOOTPRINT = { across: 2, along: 3 };
const RIM = { gap: 0.05, depth: 0.15, step: 0.05, rise: 0.05 };

describe('shown engines', () => {
  const shown = ids.filter((id) => CHASSIS[id].showsEngine);
  const span = (cells: { x: number; y: number }[], axis: 'x' | 'y') => Math.max(...cells.map((c) => c[axis])) - Math.min(...cells.map((c) => c[axis])) + 1;

  it.each(shown)('%s: lays its engine bay 2 cells across and 3 along, short side to the nose', (id) => {
    const cells = cellsOf(id, 'E');
    expect({ cells: cells.length, across: span(cells, 'x'), along: span(cells, 'y') }).toEqual({ cells: 6, ...ENGINE_FOOTPRINT });
  });

  it.each(shown)('%s: cuts the model hole to the engine bay, clear inside and closed round it', (id) => {
    const bay = engineBay(id);
    const floor = engineFloor(id);
    const inside = highestUnder(id, { ...bay, x0: bay.x0 + RIM.gap, x1: bay.x1 - RIM.gap, z0: bay.z0 + RIM.gap, z1: bay.z1 - RIM.gap });
    expect(inside, `${id} has model above the engine floor inside its bay`).toBeLessThanOrEqual(floor + CLIP_TOLERANCE);
    const strip = (x0: number, x1: number, z0: number, z1: number) => highestUnder(id, { unit: bay.unit, x0, x1, z0, z1 });
    const open: string[] = [];
    for (let x = bay.x0; x < bay.x1 - 1e-9; x += RIM.step) {
      for (const [z0, z1] of [[bay.z0 - RIM.gap - RIM.depth, bay.z0 - RIM.gap], [bay.z1 + RIM.gap, bay.z1 + RIM.gap + RIM.depth]]) {
        if (strip(x, x + RIM.step, z0, z1) < floor + RIM.rise) open.push(`side at x ${x.toFixed(2)}`);
      }
    }
    for (let z = bay.z0; z < bay.z1 - 1e-9; z += RIM.step) {
      for (const [x0, x1] of [[bay.x0 - RIM.gap - RIM.depth, bay.x0 - RIM.gap], [bay.x1 + RIM.gap, bay.x1 + RIM.gap + RIM.depth]]) {
        if (strip(x0, x1, z, z + RIM.step) < floor + RIM.rise) open.push(`end at z ${z.toFixed(2)}`);
      }
    }
    expect(open, `${id} hole runs past its engine bay`).toEqual([]);
  });
});

const OFF_CENTRE_TRANSMISSION = new Set(['van']);

describe('transmissions', () => {
  it('leaves only the van off centre, whose 2 cell tier 1 transmission cannot centre on its 5 cell interior', () => {
    expect(OFF_CENTRE_TRANSMISSION).toEqual(new Set(ids.filter((id) => coreCellsOf(id, 'transmission').length === 4 && (CHASSIS[id].layout[0].length - 2) % 2 === 1)));
  });

  it.each(ids.filter((id) => !OFF_CENTRE_TRANSMISSION.has(id)))('%s: centres the transmission across the truck, between its front and rear axles', (id) => {
    const cells = coreCellsOf(id, 'transmission');
    const width = CHASSIS[id].layout[0].length;
    const left = Math.min(...cells.map((c) => c.x)) - 1;
    const right = width - 2 - Math.max(...cells.map((c) => c.x));
    const middle = (rows: number[]) => (Math.min(...rows) + Math.max(...rows)) / 2;
    const axles = CHASSIS[id].core.filter((c) => (partDef(c.defId) as CoreDef).role === 'wheel').map((c) => {
      const def = partDef(c.defId);
      return c.y + ((c.rot === 1 ? def.w : def.h) - 1) / 2;
    });
    const at = middle(cells.map((c) => c.y));
    expect(left, `${id} transmission margins ${left} left and ${right} right`).toBe(right);
    expect(at >= Math.min(...axles) && at <= Math.max(...axles), `${id} transmission middle on row ${at}, axles on rows ${Math.min(...axles)} and ${Math.max(...axles)}`).toBe(true);
  });
});

const CABIN = { header: 0.45, back: -0.62, crown: 1.66 };
const HATCH = { x: -0.15, z: -0.36, reach: 0.3 };

describe('the convertible antenna', () => {
  it("stands on the cabin's crown, the highest flat spot over the cab cells, clear of the hatch", () => {
    const body = PHYSICS.bodies.convertible;
    const ground = body.wheelY - PHYSICS.truck.suspensionRest - body.wheelRadius;
    const spot = roofSpot('convertible', cellRect('convertible', coreCellsOf('convertible', 'cab')), 0.12);
    expect(spot.x).toBeLessThanOrEqual(CABIN.header);
    expect(spot.x).toBeGreaterThanOrEqual(CABIN.back);
    expect(Math.abs(spot.y - (ground + CABIN.crown))).toBeLessThanOrEqual(CLIP_TOLERANCE);
    expect(Math.hypot(spot.x - HATCH.x, spot.z - HATCH.z)).toBeGreaterThan(HATCH.reach);
  });
});

const HANGS_OVER_MODEL = new Set(['loader 1,9', 'loader 7,9']);
const AXLE_UNDER_COUPLING = new Set(['semi 1,12', 'semi 7,12', 'semi 1,15', 'semi 7,15']);

describe('grid and model correspondence', () => {
  it('stands the transmission and the tank of a chassis that shows them below the cab roof and the model top', () => {
    for (const id of ids.filter((chassis) => CHASSIS[chassis].showsCores)) {
      const inner = CHASSIS[id].layout.flatMap((row, y) => [...row].flatMap((ch, x) => ('DEX'.includes(ch) ? [{ x, y }] : [])));
      const top = Math.max(...inner.map((c) => surfaceAt(id, cellRect(id, [c]))));
      const cab = CHASSIS[id].core.map((c) => partDef(c.defId)).find((d): d is CoreDef => d.kind === 'core' && d.role === 'cab')!;
      const cabTop = cab.tall ? surfaceAt(id, cellRect(id, coreCellsOf(id, 'cab'))) : Infinity;
      for (const role of ['transmission', 'tank'] as const) {
        const surface = surfaceAt(id, cellRect(id, coreCellsOf(id, role)));
        expect(surface, `${id} ${role} stands too high`).toBeLessThanOrEqual(Math.min(top, cabTop) - CLEAR);
      }
    }
  });

  it('seats the engine in its hood hole, well below the model top', () => {
    for (const id of ids) {
      const inner = CHASSIS[id].layout.flatMap((row, y) => [...row].flatMap((ch, x) => ('DEX'.includes(ch) ? [{ x, y }] : [])));
      const top = Math.max(...inner.map((c) => surfaceAt(id, cellRect(id, [c]))));
      expect(top - engineFloor(id), id).toBeGreaterThanOrEqual(CLEAR);
    }
  });

  it.each(ids.filter((id) => CHASSIS[id].showsEngine))('%s: seats the drawn engine on its bay floor, with nothing lower and no air under it', (id) => {
    const bay = engineBay(id);
    const floor = engineFloor(id);
    const step = 0.1;
    const nx = Math.ceil((bay.x1 - bay.x0) / step);
    const nz = Math.ceil((bay.z1 - bay.z0) / step);
    const low: string[] = [];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x0 = bay.x0 + (i * (bay.x1 - bay.x0)) / nx;
        const z0 = bay.z0 + (j * (bay.z1 - bay.z0)) / nz;
        const top = highestUnder(id, { unit: bay.unit, x0, x1: x0 + (bay.x1 - bay.x0) / nx, z0, z1: z0 + (bay.z1 - bay.z0) / nz });
        if (top < floor - CLIP_TOLERANCE) low.push(`${x0.toFixed(2)},${z0.toFixed(2)}: ${top === -Infinity ? 'air' : top.toFixed(2)} under a floor at ${floor.toFixed(2)}`);
      }
    }
    expect(low).toEqual([]);
  });

  it('centres each wheel core of the third layout pass chassis within half a cell of its model wheel along the truck', () => {
    for (const id of ['semi', 'lincoln', 'convertible', 'bus', 'carrier', 'jeep', 'hauler', 'wagon', 'van']) {
      for (const c of CHASSIS[id].core.filter((core) => core.defId.includes('wheel') && !AXLE_UNDER_COUPLING.has(`${id} ${core.x},${core.y}`))) {
        const h = partDef(c.defId).h;
        const first = cellCenter(id, c.x, c.y);
        const last = cellCenter(id, c.x, c.y + h - 1);
        const along = (first.x + last.x) / 2;
        const body = unitBody(id, first.unit);
        const axles = body.tandem === null ? [body.wheelX] : [body.wheelX, body.wheelX - body.tandem];
        const off = Math.min(...axles.map((axle) => Math.abs(Math.abs(along) - axle)));
        expect(off, `${id} wheel ${c.x},${c.y} is off the model wheel`).toBeLessThanOrEqual(GRID_CELL / 2 + 1e-9);
      }
    }
  });

  it('fills the last tractor rows with the semi drive wheels, since its drive tandem reaches under the coupling past them', () => {
    const coupling = CHASSIS.semi.coupling?.row;
    if (coupling === undefined) throw new Error('semi has no coupling');
    const h = partDef('wheelMid').h;
    const rows = [...new Set([...AXLE_UNDER_COUPLING].map((key) => Number(key.split(',')[1])))].sort((a, b) => a - b);
    expect(rows).toEqual([coupling - 2 * h, coupling - h]);
    expect(unitBody('semi', 0).wheelX).toBeGreaterThan(Math.abs(cellCenter('semi', 1, coupling - 1).x) + GRID_CELL / 2);
  });

  it('projects each wheel core into its corner of the truck', () => {
    for (const id of ids) {
            const wheels = CHASSIS[id].core.filter((c) => c.defId.includes('wheel'));
      expect(wheels.length, id).toBe(id === 'semi' ? 10 : 4);
      const corners = new Set<string>();
      for (const c of wheels) {
        const at = cellCenter(id, c.x, c.y);
        const corner = `${Math.sign(at.x)},${Math.sign(at.z)}`;
        expect(Math.abs(at.x), `${id} wheel cell ${c.x},${c.y} is at the middle of the truck`).toBeGreaterThan(0.05);
        expect(Math.abs(at.z), `${id} wheel cell ${c.x},${c.y} is at the middle of the truck`).toBeGreaterThan(0.05);
        corners.add(corner);
      }
      expect(corners.size, `${id} wheel cells do not fill four corners`).toBe(4);
    }
  });

  it('projects every inner cell inside the model outline', () => {
    for (const id of ids) {
      const { w, h } = baseGrid(id);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (CHASSIS[id].layout[y][x] === ' ') continue;
          const rect = cellRect(id, [{ x, y }]);
          const half = { x: unitBody(id, rect.unit).half.x, z: spanOf(id).half.z };
          const hang = GRID_CELL / 2 + 1e-9;
          const inside = rect.x0 >= -half.x - hang && rect.x1 <= half.x + hang && rect.z0 >= -half.z - hang && rect.z1 <= half.z + hang;
          expect(inside, `${id} cell ${x},${y} projects outside the model outline`).toBe(true);
          if ('DECX'.includes(CHASSIS[id].layout[y][x]) && !HANGS_OVER_MODEL.has(`${id} ${x},${y}`)) expect(() => surfaceAt(id, rect), `${id} cell ${x},${y} has no model surface under it`).not.toThrow();
        }
      }
    }
  });
});

describe('resting parts', () => {
  type Map = { cell: number; i0: number; j0: number; top: (number | null)[][] };
  const TOLERANCE = 0.05;
  const SIZES = [[1, 1], [1, 2], [2, 1], [2, 2], [1, 3], [3, 1], [2, 3], [3, 2]];
  const samplesIn = (map: Map, r: { x0: number; x1: number; z0: number; z1: number }) => {
    const range = (lo: number, hi: number) => {
      const first = Math.ceil((lo - 1e-6) / map.cell);
      const last = Math.floor((hi + 1e-6) / map.cell) - 1;
      return Array.from({ length: Math.max(0, last - first + 1) }, (_, k) => first + k);
    };
    return range(r.x0, r.x1).flatMap((i) => range(-r.z1, -r.z0).flatMap((j) => {
      const top = map.top[i - map.i0]?.[j - map.j0];
      return [{ x: (i + 0.5) * map.cell, z: -(j + 0.5) * map.cell, top: typeof top === 'number' ? top / 100 : -Infinity }];
    }));
  };

  it('never cuts into the model and overhangs at most a tenth of its footprint, flat or leaning, on every chassis, cell and size', () => {
    const problems: string[] = [];
    let perched = 0;
    let leaning = 0;
    const floats: number[] = [];
    let total = 0;
    for (const id of Object.keys(CHASSIS)) {
      const { w, h } = baseGrid(id);
      for (const [sw, sh] of SIZES) {
        for (let y = 1; y + sh <= h - 1; y++) {
          for (let x = 1; x + sw <= w - 1; x++) {
            const cells = Array.from({ length: sw * sh }, (_, k) => ({ x: x + (k % sw), y: y + Math.floor(k / sw) }));
            if (unitOfRow(id, y).index !== unitOfRow(id, y + sh - 1).index) continue;
            const rect = cellRect(id, cells);
            const map = (TRUCK_SHAPES as Record<string, { heights: Map }>)[unitsOf(id)[rect.unit].shape].heights;
            const rest = restOn(id, rect);
            total++;
            if (rest.perched) {
              perched++;
              const px = (rest.rect.x0 + rest.rect.x1) / 2;
              const pz = (rest.rect.z0 + rest.rect.z1) / 2;
              floats.push(Math.max(...samplesIn(map, rest.rect).map((sm) => rest.y + rest.slope.x * (sm.x - px) + rest.slope.z * (sm.z - pz) - sm.top)));
              continue;
            }
            const cx = (rest.rect.x0 + rest.rect.x1) / 2;
            const cz = (rest.rect.z0 + rest.rect.z1) / 2;
            const gaps = samplesIn(map, rest.rect).map((sm) => rest.y + rest.slope.x * (sm.x - cx) + rest.slope.z * (sm.z - cz) - sm.top);
            const label = `${id} ${sw}x${sh} at ${x},${y}`;
            if (gaps.some((g) => g < -TOLERANCE - 1e-9)) problems.push(`${label} cuts into the model`);
            if (gaps.filter((g) => g <= TOLERANCE + 1e-9).length < 0.9 * gaps.length) problems.push(`${label} overhangs more than a tenth of its footprint`);
            if (rest.slope.x !== 0 || rest.slope.z !== 0) leaning++;
          }
        }
      }
    }
        console.log(`resting parts: ${leaning} of ${total} footprints lean on a slope, ${perched} find no rest and are hidden unless always drawn, floating ${[0.1, 0.2, 0.4].map((lim) => `${floats.filter((f) => f > lim).length} more than ${lim} m`).join(', ')}`);
    expect(problems).toEqual([]);
  });
});

describe('surface samples', () => {
  it('lists the samples near a cab roof cell with its surface height, all within the radius', () => {
    const rect = cellRect('scout', [{ x: 3, y: 2 }]);
    const center = { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
    const samples = surfaceSamples('scout', 0, center, 0.3);
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) expect(Math.hypot(s.x - center.x, s.z - center.z)).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(Math.max(...samples.map((s) => s.y))).toBeCloseTo(surfaceAt('scout', { unit: 0, x0: center.x - 0.3, x1: center.x + 0.3, z0: center.z - 0.3, z1: center.z + 0.3 }), 1);
  });

  it('leaves out samples over air', () => {
    expect(surfaceSamples('scout', 0, { x: 50, z: 50 }, 1)).toEqual([]);
  });
});

describe('hulk boxes', () => {
  it('stand every chassis on the ground from its chassis bottom', () => {
    for (const id of ids) {
      const boxes = hulkBoxes(id, restBend(id)).map((h) => h.box);
      expect(Math.min(...boxes.map((b) => b.z0)), id).toBeCloseTo(0, 9);
      expect(boxes.every((b) => b.z1 > b.z0), id).toBe(true);
    }
  });

  it('keep each chassis outline, so a bus hulk is longer than a buggy hulk', () => {
    const shapes = TRUCK_SHAPES as unknown as Record<string, { boxes: { x0: number; x1: number; y0: number; y1: number }[] }>;
    const outline = (boxes: readonly { x0: number; x1: number; y0: number; y1: number }[]) => boxes.map((b) => [b.x0, b.x1, b.y0, b.y1]);
    const length = (id: string) => Math.max(...hulkBoxes(id, undefined).map((h) => h.box.x1)) - Math.min(...hulkBoxes(id, undefined).map((h) => h.box.x0));

    for (const id of ids.filter((id) => !isRig(id))) expect(outline(hulkBoxes(id, undefined).map((h) => h.box)), id).toEqual(outline(shapes[`base_${id}`].boxes));
    expect(length('bus')).toBeGreaterThan(length('buggy') + 2);
  });

  it('fold a rig hulk at its bend and throw on a rig without one or a rigid hulk with one', () => {
    const rig = ids.find(isRig)!;
    const straight = hulkBoxes(rig, 0);
    const folded = hulkBoxes(rig, 0.5);
    const rear = unitsOf(rig)[1];
    expect(straight.filter((h) => h.turn === 0).length).toBe(straight.length);
    expect(folded.filter((h) => h.turn === 0.5).length).toBeGreaterThan(0);
    expect(straight.find((h) => h.x !== 0)?.x).toBeCloseTo(rear.offset, 9);
    expect(() => hulkBoxes(rig, undefined)).toThrow(/rig/);
    expect(() => hulkBoxes('scout', 0)).toThrow(/no rig/);
  });
});

describe('rig units', () => {
  const rigs = ids.filter(isRig);

  it('gives a rigid chassis one unit with its whole body and every row', () => {
    for (const id of ids.filter((chassis) => !isRig(chassis))) {
      const all = unitsOf(id);
      expect(all.length, id).toBe(1);
      expect(all[0].body, id).toBe(bodyOf(id));
      expect(all[0].rows, id).toEqual([0, baseGrid(id).h]);
    }
  });

  it('puts every row of a rig on exactly one unit, the rows before the coupling on the front unit', () => {
    for (const id of rigs) {
      const { h } = baseGrid(id);
      const row = CHASSIS[id].coupling!.row;
      for (let y = 0; y < h; y++) expect(unitOfRow(id, y).index, `${id} row ${y}`).toBe(y < row ? 0 : 1);
      expect(unitsOf(id).map((u) => u.rows)).toEqual([[0, row], [row, h]]);
    }
  });

  it('refuses the one-body query on a rig, so no caller treats a rig as its front unit', () => {
    for (const id of rigs) expect(() => bodyOf(id)).toThrow(/rig/);
  });

  it('puts every cell of a straight rig within 5 cm of where the rigid projection over both units would', () => {
    for (const id of rigs) {
      const { w, h } = baseGrid(id);
      const { center, half } = spanOf(id);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (CHASSIS[id].layout[y][x] === ' ') continue;
          const at = cellCenter(id, x, y);
          const straight = at.x + unitsOf(id)[at.unit].offset;
          const rigid = y === 0 ? center + half.x : y === h - 1 ? center - half.x : center + ((h - 2) * GRID_CELL) / 2 - (y - 0.5) * GRID_CELL;
          expect(Math.abs(straight - rigid), `${id} cell ${x},${y}`).toBeLessThan(0.05);
        }
      }
    }
  });

  it('keeps the rows of each unit over its own model', () => {
    for (const id of rigs) {
      const { w, h } = baseGrid(id);
      for (let y = 1; y < h - 1; y++) {
        const rect = cellRect(id, [{ x: Math.floor(w / 2), y }]);
        const { half } = unitBody(id, rect.unit);
        expect(rect.x0, `${id} row ${y}`).toBeGreaterThanOrEqual(-half.x - GRID_CELL / 2 - 1e-9);
        expect(rect.x1, `${id} row ${y}`).toBeLessThanOrEqual(half.x + GRID_CELL / 2 + 1e-9);
      }
    }
  });
});
