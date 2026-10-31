import './gun-clearance-kit';
import { PAINT } from '../data/chassis';
import { isShield, partDef } from '../data/parts';
import { BODY_PARTS } from '../render/partLooks';
import { unitsOf } from '../sim/body';
import { makePart } from '../sim/factory';
import { gridOf, isMounted, MOUNT_CELLS, mountSpots } from '../sim/grid';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { GridItem, Vehicle } from '../sim/types';
import { hidesInside, VehicleView } from '../three/render/vehicle';
import { stills } from './truck-support-stills';
import { supportFaults, type Piece, type Stand } from './truck-support-kit';

const STANDS: Record<string, Stand> = { mount: 'corners', leg: 'tip', brace: 'brace' };

export function faultsOf(v: Vehicle): string[] {
  stills.length = 0;
  const view = new VehicleView(v, true, PAINT.standard, 'world');
  const units = unitsOf(v.chassisId).length;
  const out: string[] = [];
  stills.slice(0, units).forEach((still, unit) => {
    const [base, ...rest] = still.children;
    const standing = rest.filter((obj) => !sideArmor(v, itemOf(v, obj.name)) && !obj.name.endsWith(' head'));
    const onLegs = (name: string) => standing.some((o) => o.name === `${name} leg` || o.name === `${name} brace`);
    const pieces: Piece[] = standing.map((obj) => ({ name: label(v, obj.name), obj, stand: STANDS[obj.name.split(' ')[1]] ?? (onLegs(obj.name) ? 'corners' : 'underside') }));
    const antenna = view.root.getObjectByName('antenna');
    if (antenna && unit === 0) pieces.push({ name: 'antenna', obj: antenna, stand: 'underside' });
    for (const f of supportFaults(pieces, [base, ...rest.filter((o) => !standing.includes(o))])) {
      out.push(`${v.chassisId} ${v.id} unit ${unit} ${f.name} stands on ${(f.share * 100).toFixed(0)}% with up to ${(f.air * 100).toFixed(1)} cm of air at ${f.at.toArray().map((n) => n.toFixed(2)).join(',')}`);
    }
  });
  const drawn = new Set(stills.slice(0, units).flatMap((still) => still.children.map((o) => o.name.split(' ')[0])));
  for (const item of v.items.filter((it) => mustShow(v, it) && !drawn.has(it.id))) out.push(`${v.chassisId} ${v.id} hides ${label(v, item.id)}`);
  return out;
}

function mustShow(v: Vehicle, item: GridItem): boolean {
  if (item.kind !== 'part' || !isMounted(v.chassisId, item) || hidesInside(v, item)) return false;
  const def = partDef(item.part.defId);
  return !BODY_PARTS.has(def.id) && !(def.kind === 'core' && def.role === 'wheel') && def.kind !== 'weapon';
}

function itemOf(v: Vehicle, name: string): GridItem | undefined {
  const [id] = name.split(' ');
  return v.items.find((it) => it.id === id || (it.kind === 'part' && it.part.id === id));
}

function sideArmor(v: Vehicle, item: GridItem | undefined): boolean {
  return item?.kind === 'part' && isShield(partDef(item.part.defId)) && isMounted(v.chassisId, item);
}

function label(v: Vehicle, name: string): string {
  const item = itemOf(v, name);
  if (!item) return `unnamed ${name}`;
  const role = name.split(' ')[1] ?? '';
  const what = item.kind === 'part' ? partDef(item.part.defId).id : item.kind === 'good' ? item.good : 'parcel';
  const mounted = isMounted(v.chassisId, item) ? 'mounted' : 'loose';
  return `${what} ${role} ${mounted} @${item.x},${item.y} r${item.rot}`;
}

const FLOATING_BOX_CELLS: Record<string, string[]> = {
  wagon: ['wagon unit 0 caltrops  mounted @3,1 r1 stands on 89% with up to 5.0 cm of air at 2.97,0.31,-0.16'],
};

export function boxFaultsOnEveryDeckCell(chassisId: string): { faults: string[]; known: string[] } {
  const faults: string[] = [];
  const w = emptyWorld();
  const base = addVehicle(w, 'scrapjaw', chassisId, [], { x: 40, y: 30 });
  const box = makePart(w, 'caltrops', 0);
  const probe: GridItem = { id: 'probe', kind: 'part', part: box, x: 0, y: 0, rot: 0 };
  for (const spot of mountSpots(gridOf(base), base.items, probe, MOUNT_CELLS.store)) {
    faults.push(...faultsOf({ ...base, items: [...base.items, { ...probe, ...spot }] }).map((f) => f.replace(/ v\d+ /, ' ')));
  }
  return { faults, known: FLOATING_BOX_CELLS[chassisId] ?? [] };
}
