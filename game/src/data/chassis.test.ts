import { describe, expect, it } from 'vitest';
import { CHASSIS, CHASSIS_FEATURES, CHASSIS_PRICE_MODIFIERS, chassisFeature, HAULER_CHASSIS, isTruckPaint, PAINT, PAINT_SCHEMES, PALETTE, PALETTE_IDS, PLAYER_CHASSIS, TOWN_CHASSIS, type ChassisDef, type PaletteId } from './chassis';
import { GANG_PAINT, TEMPLATE_PAINT } from '../render/palette';
import { FURY_ROAD } from './modes';
import { NPCS } from './npcs';
import { PARTS, partDef } from './parts';
import { cargoCellsGained } from '../sim/grid';

type Cell = { x: number; y: number };

const ARMOR = 'FBLR';

function letterAt(c: ChassisDef, x: number, y: number): string {
  return c.layout[y]?.[x] ?? ' ';
}

function engineCells(c: ChassisDef): Cell[] {
  return c.layout.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'E' ? [{ x, y }] : [])));
}

function coreCells(c: ChassisDef, role: string): Cell[] {
  return c.core.flatMap((core) => {
    const def = partDef(core.defId);
    if (def.kind !== 'core' || def.role !== role) return [];
    const w = core.rot === 1 ? def.h : def.w;
    const h = core.rot === 1 ? def.w : def.h;
    return Array.from({ length: w * h }, (_, i) => ({ x: core.x + (i % w), y: core.y + Math.floor(i / w) }));
  });
}

function armorTouched(c: ChassisDef, cells: Cell[]): Set<string> {
  const touched = new Set<string>();
  for (const { x, y } of cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const letter = letterAt(c, x + dx, y + dy);
      if (ARMOR.includes(letter)) touched.add(letter);
    }
  }
  return touched;
}

const FRONT_ENGINE: readonly string[] = ['longbed', 'tractor'];

const TANK_BESIDE_WHEELS: Record<string, string> = {
  courier: 'With the cab and transmission off the wheel columns and the 2x2 deck block kept, a wheel column is the only place left for the tank.',
};

const SMALL_CAR = 'A small car whose 5 inner columns were 4 before odd fronts. A 3x2 cab would fill its middle and leave no deck block.';

const WIDENED = ['buggy', 'courier', 'jeep', 'niva', 'bus', 'carrier', 'wagon'];

const OPEN_NEW_COLUMN: Record<string, string> = {
  jeep: 'Its tank shields the engine from the rear. Moving it into the new column would open the engine to rear fire.',
  carrier: 'Its tank shields the cab from the rear. Moving it into the new column would open the cab to rear fire.',
};

const SEAT_CAB: Record<string, string> = {
  buggy: SMALL_CAR,
  courier: SMALL_CAR,
  jeep: SMALL_CAR,
  niva: SMALL_CAR,
};

const VALUES = {
  scout: 84267, hauler: 129734, buggy: 64267, wagon: 100733, courier: 77333, van: 105466, longbed: 186666,
  carrier: 162534, tractor: 146067, jeep: 72867, convertible: 99734, bus: 133867, loader: 169600, niva: 104934, bukhanka: 115000, lincoln: 142933, semi: 140000,
  sorokonoga: 176567,
};

const NO_DECK_BLOCK: Record<string, string> = {
  semi: 'The hauler grid has cargo bay cells and no deck cells, so no gun can mount on it.',
  scout: 'A cab clear of the wheels on 5 columns leaves only single deck columns.',
};

const RATED_MASS = 3840;

const columns = (cells: Cell[]) => new Set(cells.map((cell) => cell.x));

describe('chassis grids', () => {
  it('keeps cabs, transmissions and engine bays out of the wheel columns', () => {
    for (const [id, c] of Object.entries(CHASSIS)) {
      const wheels = columns(coreCells(c, 'wheel'));
      const parts = [...coreCells(c, 'cab'), ...coreCells(c, 'transmission'), ...engineCells(c)];
      expect(parts.filter((cell) => wheels.has(cell.x)), id).toEqual([]);
    }
  });

  it('covers the middle column or columns with the transmission', () => {
    for (const [id, c] of Object.entries(CHASSIS)) {
      const inner = c.layout[0].length - 2;
      const middle = inner % 2 ? [1 + (inner - 1) / 2] : [inner / 2, inner / 2 + 1];
      const covered = columns(coreCells(c, 'transmission'));
      expect(middle.every((m) => covered.has(m)), id).toBe(true);
    }
  });

  it('keeps tanks out of the wheel columns but on the chassis listed', () => {
    for (const [id, c] of Object.entries(CHASSIS)) {
      const wheels = columns(coreCells(c, 'wheel'));
      const shared = coreCells(c, 'tank').some((cell) => wheels.has(cell.x));
      expect(shared, id).toBe(id in TANK_BESIDE_WHEELS);
    }
  });

  it('gives the listed small cars the open seat and every other chassis a 3x2 cab', () => {
    for (const [id, c] of Object.entries(CHASSIS)) {
      const cabs = c.core.filter((part) => { const def = partDef(part.defId); return def.kind === 'core' && def.role === 'cab'; });
      expect(cabs.map((part) => part.defId === 'cab'), id).toEqual([id in SEAT_CAB]);
    }
  });

  it('gives every front and back edge an odd number of cells, so a 3-cell ram sits centered', () => {
    for (const [id, c] of Object.entries(CHASSIS)) {
      const edges = [c.layout[0], c.layout[c.layout.length - 1]].map((row) => [...row].filter((ch) => ch === 'F' || ch === 'B').length);
      for (const cells of edges.filter((n) => n > 0)) expect(cells % 2, id).toBe(1);
    }
  });

  it('puts a built-in part or the engine bay in every column of a widened truck but those listed, so its new column does not let front shots through', () => {
    const open = WIDENED.filter((id) => {
      const c = CHASSIS[id];
      const roles = c.core.map((core) => partDef(core.defId)).flatMap((def) => (def.kind === 'core' ? [def.role] : []));
      const filled = columns([...new Set(roles)].flatMap((role) => coreCells(c, role)).concat(engineCells(c)));
      return Array.from({ length: c.layout[0].length - 2 }, (_, i) => i + 1).some((x) => !filled.has(x));
    });
    expect(open).toEqual(Object.keys(OPEN_NEW_COLUMN));
  });

  it('keeps every chassis value at its value before the layout rules', () => {
    expect(Object.fromEntries(Object.entries(CHASSIS).map(([id, c]) => [id, c.value]))).toEqual(VALUES);
  });

  it('keeps the scout worth what it was before its cab moved', () => {
    expect(CHASSIS.scout.value).toBe(84267);
    expect(CHASSIS.scout.ratedMass).toBe(RATED_MASS);
  });

  it('keeps the scout grid the same size with the same cells', () => {
    const before = [' FFFFF ', 'LXEEDXR', 'LXEEDXR', 'LXXXDDR', 'LXXXDDR', 'LXXXXXR', 'LXXXXXR', ' BBBBB '];
    const count = (rows: readonly string[]) => {
      const n: Record<string, number> = {};
      for (const ch of rows.join('')) n[ch] = (n[ch] ?? 0) + 1;
      return n;
    };
    expect(CHASSIS.scout.layout.length).toBe(before.length);
    expect(CHASSIS.scout.layout.every((row) => row.length === before[0].length)).toBe(true);
    expect(count(CHASSIS.scout.layout)).toEqual(count(before));
  });

  it('keeps every armor column outside the model and every armor row full width', () => {
    for (const [id, c] of Object.entries(CHASSIS)) {
      const w = c.layout[0].length;
      const last = c.layout.length - 1;
      expect(c.layout[0], id).toBe(` ${'F'.repeat(w - 2)} `);
      expect(c.layout[last], id).toBe(` ${'B'.repeat(w - 2)} `);
      for (const row of c.layout.slice(1, last)) {
        expect(row.length, id).toBe(w);
        expect(row[0] + row[w - 1], id).toBe('LR');
        expect(row.slice(1, -1), id).not.toMatch(/[FBLR ]/);
      }
    }
  });

  it('puts the wheels, two cells long each, one column in from the side armor', () => {
    for (const [id, c] of Object.entries(CHASSIS)) {
      const w = c.layout[0].length;
      const wheels = coreCells(c, 'wheel');
      expect(wheels.map((cell) => cell.x).sort(), id).toEqual([1, 1, 1, 1, w - 2, w - 2, w - 2, w - 2].sort());
    }
  });

  it('marks exactly the cells of the core parts as built-in', () => {
    for (const [id, c] of Object.entries(CHASSIS)) {
      const core = c.core.flatMap((part) => coreCells(c, partDef(part.defId).kind === 'core' ? (partDef(part.defId) as { role: string }).role : ''));
      const marked = c.layout.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'X' ? [`${x},${y}`] : [])));
      expect(new Set(core.map((cell) => `${cell.x},${cell.y}`)), id).toEqual(new Set(marked));
    }
  });

  it('lets a tier 2 engine touch armor cells on one side at most', () => {
    for (const [id, c] of Object.entries(CHASSIS).filter(([, ch]) => ch.tier === 2)) {
      expect(armorTouched(c, engineCells(c)).size, id).toBeLessThanOrEqual(1);
    }
  });

  it('keeps a cell that is not armor between every tier 3 critical part and the armor', () => {
    for (const [id, c] of Object.entries(CHASSIS).filter(([, ch]) => ch.tier === 3)) {
      const allowed = FRONT_ENGINE.includes(id) ? new Set(['F']) : new Set<string>();
      expect([...armorTouched(c, engineCells(c))].filter((l) => !allowed.has(l)), `${id} engine`).toEqual([]);
      expect([...armorTouched(c, coreCells(c, 'cab'))], `${id} cab`).toEqual([]);
      expect([...armorTouched(c, coreCells(c, 'tank'))], `${id} tank`).toEqual([]);
    }
  });
});

function hasDeckBlock(c: ChassisDef, w: number, h: number): boolean {
  for (let y = 0; y + h <= c.layout.length; y++) {
    for (let x = 0; x + w <= c.layout[0].length; x++) {
      const cells = Array.from({ length: w * h }, (_, i) => letterAt(c, x + (i % w), y + Math.floor(i / w)));
      if (cells.every((ch) => ch === 'D')) return true;
    }
  }
  return false;
}

describe('core part sizes', () => {
  const parts = Object.values(PARTS);

  it('sizes every cab 1x2 or 3x2', () => {
    for (const p of parts.filter((d) => d.kind === 'core' && d.role === 'cab')) expect([p.w, p.h].join('x'), p.id).toMatch(/^(1x2|3x2)$/);
  });

  it('gives every transmission 2 by 2 cells', () => {
    for (const p of parts.filter((d) => d.kind === 'core' && d.role === 'transmission')) expect([p.w, p.h], p.id).toEqual([2, 2]);
  });

  it('gives every fuel tank two cells along the truck', () => {
    for (const p of parts.filter((d) => d.kind === 'core' && d.role === 'tank')) expect([p.w, p.h], p.id).toEqual([1, 2]);
  });

  it('gives every engine at least 2 by 2 cells', () => {
    for (const p of parts.filter((d) => d.kind === 'engine')) {
      expect(p.w, p.id).toBeGreaterThanOrEqual(2);
      expect(p.h, p.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives every chassis an engine bay that holds the biggest engine', () => {
    const engines = parts.filter((d) => d.kind === 'engine');
    const w = Math.max(...engines.map((d) => d.w));
    const h = Math.max(...engines.map((d) => d.h));
    for (const [id, c] of Object.entries(CHASSIS)) {
      const bay = new Set(engineCells(c).map((cell) => `${cell.x},${cell.y}`));
      const fits = [...bay].some((key) => {
        const [x, y] = key.split(',').map(Number);
        return Array.from({ length: w * h }, (_, i) => `${x + (i % w)},${y + Math.floor(i / w)}`).every((k) => bay.has(k));
      });
      expect(fits, id).toBe(true);
    }
  });
});

describe('deck blocks for the bigger guns', () => {
  it('keeps a free 2 by 2 block of deck cells on every chassis but those listed', () => {
    for (const [id, c] of Object.entries(CHASSIS)) expect(hasDeckBlock(c, 2, 2), id).toBe(!(id in NO_DECK_BLOCK));
  });

  it('keeps a free 2 across by 3 along block of deck cells on every tier 2 and 3 chassis', () => {
    for (const [id, c] of Object.entries(CHASSIS).filter(([id, ch]) => ch.tier >= 2 && !(id in NO_DECK_BLOCK))) expect(hasDeckBlock(c, 2, 3), id).toBe(true);
  });
});

describe('shown cores', () => {
  it('shows the transmission and the tank on the junk-built trucks and hides them on the others', () => {
    const shown = Object.entries(CHASSIS).filter(([, c]) => c.showsCores).map(([id]) => id).sort();
    expect(shown).toEqual(['courier', 'scout', 'wagon']);
  });
});

describe('chassis tradeoffs', () => {
  const count = (c: ChassisDef, letter: string): number => c.layout.reduce((n, row) => n + [...row].filter((ch) => ch === letter).length, 0);
  const armorCells = (c: ChassisDef): number => [...ARMOR].reduce((n, letter) => n + count(c, letter), 0);
  const coreHp = (c: ChassisDef): number => c.core.reduce((n, core) => n + partDef(core.defId).hp, 0);
  const axes = (c: ChassisDef): number[] => [c.maxSpeed, c.accel, c.brake, c.turnSlow, c.turnFast, count(c, 'D'), armorCells(c), c.ratedMass, coreHp(c), c.fuelCap / c.fuelPerTile, c.bedRows];

  function chassisDominates(a: ChassisDef, b: ChassisDef): boolean {
    const x = axes(a);
    const y = axes(b);
    return x.every((v, i) => v >= y[i]) && x.some((v, i) => v > y[i]);
  }

  it('flags a strictly better copy of a chassis', () => {
    const better = { ...CHASSIS.van, maxSpeed: CHASSIS.van.maxSpeed + 1 };
    expect(chassisDominates(better, CHASSIS.van)).toBe(true);
    expect(chassisDominates(CHASSIS.van, better)).toBe(false);
  });

  it('keeps every player chassis from matching or beating another of its tier on every stat', () => {
    for (const id of PLAYER_CHASSIS) {
      for (const other of PLAYER_CHASSIS.map((o) => CHASSIS[o]).filter((c) => c.tier === CHASSIS[id].tier && c.id !== id)) {
        expect(chassisDominates(CHASSIS[id], other), `${id} beats ${other.id}`).toBe(false);
        expect(chassisDominates(other, CHASSIS[id]), `${other.id} beats ${id}`).toBe(false);
        expect(axes(CHASSIS[id]), `${id} matches ${other.id}`).not.toEqual(axes(other));
      }
    }
  });
});

describe('chassis features', () => {
  it('gives every player chassis one feature, the semi none, and uses every feature', () => {
    for (const id of PLAYER_CHASSIS) expect(chassisFeature(id), id).not.toBeNull();
    expect(chassisFeature('semi')).toBeNull();
    const used = new Set(PLAYER_CHASSIS.map((id) => chassisFeature(id)));
    expect([...used].sort()).toEqual(Object.keys(CHASSIS_FEATURES).sort());
  });
});

describe('the semi', () => {
  it('has cargo bay cells and no deck cells, so a gun, scanner, utility or store part never mounts', () => {
    const cells = CHASSIS.semi.layout.join('');
    expect(cells).not.toContain('D');
    expect(cells).toContain('C');
  });

  it('is in no outpost offer and no NPC template', () => {
    expect(FURY_ROAD.trucks.pool).not.toContain('semi');
    expect(PLAYER_CHASSIS).not.toContain('semi');
    for (const tpl of Object.values(NPCS)) expect(tpl.loadout.chassis.map((c) => c.value)).not.toContain('semi');
  });

  it('weighs over ten scouts and over twice any other chassis, so its rams land massive hits', () => {
    expect(CHASSIS.semi.mass / CHASSIS.scout.mass).toBeGreaterThan(10);
    for (const def of Object.values(CHASSIS)) if (def.id !== 'semi') expect(CHASSIS.semi.mass / def.mass, def.id).toBeGreaterThan(2);
  });
});

describe('town garage lineups', () => {
  const lineups = Object.entries(TOWN_CHASSIS);

  it('gives every town a cheap truck and a truck of each tier', () => {
    for (const [town, ids] of lineups) {
      expect(ids, town).toEqual(expect.arrayContaining(['scout', 'buggy', 'courier']));
      for (const tier of [1, 2, 3]) expect(ids.some((id) => CHASSIS[id].tier === tier), `${town} tier ${tier}`).toBe(true);
    }
  });

  it('sells every player chassis somewhere and never the hauler semi', () => {
    const sold = new Set(lineups.flatMap(([, ids]) => ids));
    expect([...sold].sort()).toEqual([...PLAYER_CHASSIS].sort());
    expect(sold.has(HAULER_CHASSIS)).toBe(false);
  });

  it('lets each town lawman roll only trucks its garage sells', () => {
    for (const npc of Object.values(NPCS).filter((n) => n.traits.includes('lawman'))) {
      if (npc.spawn.kind !== 'sites' || npc.spawn.ids.length !== 1) continue;
      const town = npc.spawn.ids[0];
      for (const c of npc.loadout.chassis) expect(TOWN_CHASSIS[town], `${npc.id} ${c.value}`).toContain(c.value);
    }
  });
});

function lab(color: number): [number, number, number] {
  const [r, g, b] = [16, 8, 0].map((shift) => linear(((color >> shift) & 0xff) / 255));
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  return [116 * labCurve(y) - 16, 500 * (labCurve(x) - labCurve(y)), 200 * (labCurve(y) - labCurve(z))];
}

function linear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function labCurve(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function deltaE(a: number, b: number): number {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const ROLE_TOPS = [...Object.values(GANG_PAINT), ...Object.values(TEMPLATE_PAINT)].map((p) => p.top);
const OLD_STANDARD = new Set<PaletteId>(['tan', 'olive']);
const NEW_COLORS = PALETTE_IDS.filter((id) => !OLD_STANDARD.has(id));

function lch(color: number): { light: number; chroma: number; hue: number } {
  const [light, a, b] = lab(color);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  return { light, chroma: Math.hypot(a, b), hue: hue < 0 ? hue + 360 : hue };
}

function isEarthHue(hue: number): boolean {
  return hue >= PAINT.earthHue[0] && hue <= PAINT.earthHue[1];
}

describe('the paint palette', () => {
  it('keeps the standard paint equal to the paint every player truck had before paint jobs', () => {
    expect(PALETTE[PAINT.standard.body]).toBe(0x9c7a3e);
    expect(PALETTE[PAINT.standard.cab]).toBe(0x7e8a5a);
    expect(PAINT.standard.gear).toBe(PAINT.standard.body);
  });

  it('offers nine colors for every surface', () => {
    expect(PALETTE_IDS).toHaveLength(9);
    expect(Object.keys(PALETTE).sort()).toEqual([...PALETTE_IDS].sort());
    expect(PAINT.minApart).toBeGreaterThanOrEqual(15);
  });

  it.each(PALETTE_IDS)('keeps %s a muted paint, saturated only in an earth hue', (id) => {
    const { chroma, hue } = lch(PALETTE[id]);
    expect(chroma).toBeLessThanOrEqual(isEarthHue(hue) ? PAINT.earthChroma : PAINT.coolChroma);
  });

  it.each(PALETTE_IDS)('keeps %s neither black nor white, and pale only as sand or bone', (id) => {
    const { light, hue } = lch(PALETTE[id]);
    expect(light).toBeGreaterThanOrEqual(PAINT.minLight);
    expect(light).toBeLessThanOrEqual(PAINT.maxLight);
    if (light > PAINT.paleLight) expect(hue).toBeGreaterThanOrEqual(PAINT.paleMinHue);
  });

  it('turns down the candy tones the committee rejected', () => {
    const rejected = [0x6e3a64, 0xc48a8a, 0xe0a0c0, 0xb8a0e0, 0xa0dcb4, 0x26346a];
    for (const color of rejected) {
      const { light, chroma, hue } = lch(color);
      const tooBright = chroma > (isEarthHue(hue) ? PAINT.earthChroma : PAINT.coolChroma);
      const palePink = light > PAINT.paleLight && hue < PAINT.paleMinHue;
      expect(tooBright || palePink, color.toString(16)).toBe(true);
    }
  });

  it.each(NEW_COLORS)('keeps %s apart from every role body paint', (id) => {
    for (const role of ROLE_TOPS) expect(deltaE(PALETTE[id], role)).toBeGreaterThanOrEqual(PAINT.minApart);
  });

  it('keeps every two palette colors apart', () => {
    for (const [i, a] of PALETTE_IDS.entries()) {
      for (const b of PALETTE_IDS.slice(i + 1)) expect(deltaE(PALETTE[a], PALETTE[b]), `${a} ${b}`).toBeGreaterThanOrEqual(PAINT.minBetween);
    }
  });

  it('knows a paint only when each of its three slots is a palette id', () => {
    expect(isTruckPaint(PAINT.standard)).toBe(true);
    expect(isTruckPaint({ body: 'oxblood', cab: 'slate', gear: 'chalk' })).toBe(true);
    expect(isTruckPaint({ body: 'oxblood', cab: 'gold', gear: 'chalk' })).toBe(false);
    expect(isTruckPaint({ body: 'oxblood', cab: 'slate' })).toBe(false);
    expect(isTruckPaint('oxblood')).toBe(false);
    expect(isTruckPaint(null)).toBe(false);
  });
});

describe('the paint schemes', () => {
  it('starts with the standard paint', () => {
    expect(PAINT_SCHEMES[0]).toEqual(PAINT.standard);
  });

  it('offers six schemes made of palette colors', () => {
    expect(PAINT_SCHEMES).toHaveLength(6);
    for (const scheme of PAINT_SCHEMES) expect(isTruckPaint(scheme), JSON.stringify(scheme)).toBe(true);
  });

  it.each(PAINT_SCHEMES.map((scheme) => [`${scheme.body} ${scheme.cab} ${scheme.gear}`, scheme] as const))('keeps the body and cab of %s apart', (_, scheme) => {
    expect(deltaE(PALETTE[scheme.body], PALETTE[scheme.cab])).toBeGreaterThanOrEqual(PAINT.schemeContrast);
  });

  it('never repeats a scheme', () => {
    const keys = PAINT_SCHEMES.map((scheme) => `${scheme.body} ${scheme.cab} ${scheme.gear}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('bed rows', () => {
  const BED_ROWS: Record<string, number> = { scout: 1, van: 1, hauler: 2, longbed: 2, bus: 2 };
  const bedChassis = Object.values(CHASSIS).filter((c) => c.bedRows > 0);
  const cargoParts = Object.values(PARTS).filter((p) => p.kind === 'cargo');

  it('gives each chassis its fixed whole number of rows', () => {
    expect(Object.fromEntries(Object.values(CHASSIS).map((c) => [c.id, c.bedRows]))).toEqual(
      Object.fromEntries(Object.keys(CHASSIS).map((id) => [id, BED_ROWS[id] ?? 0])),
    );
  });

  it('prices a bed cell inside what cargo parts cost per cell they gain on every bed chassis', () => {
    const perBedCell = CHASSIS_PRICE_MODIFIERS.perBedCell;
    const perCell = (c: ChassisDef) => cargoParts.map((p) => p.value / cargoCellsGained(c.id, p.id));
    expect(perBedCell).toBeGreaterThanOrEqual(Math.max(...bedChassis.map((c) => Math.min(...perCell(c)))));
    expect(perBedCell).toBeLessThanOrEqual(Math.min(...bedChassis.map((c) => Math.max(...perCell(c)))));
  });
});
