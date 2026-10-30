import { REGION } from '../data/region';
import { HOLLOW, type HollowPiece } from '../data/sunward';
import { fortressProps, insideCurtain } from './fortress';
import { propBoxes, propObstacle, type PosedBox } from './mapgen';
import { sitePads } from './sites';
import type { Obstacle, World } from './types';
import { dist, type Vec } from './vec';

let hollowProps: Obstacle[] | null = null;

export function hollowObstacles(): Obstacle[] {
  if (hollowProps === null) {
    const laid = [...fortressProps(HOLLOW.site).map((p, i) => propObstacle(p, i)), ...HOLLOW.pieces.map(interiorPiece)].map((o, i) => ({ ...o, id: `hollow-${i}` }));
    checkHollowLayout(laid);
    hollowProps = laid;
  }
  return hollowProps.map((o) => ({ ...o, pos: { ...o.pos } }));
}

const LAAGER_LOOKS: readonly HollowPiece['look'][] = ['drums', 'woodpile'];

function pieceSpot(p: HollowPiece): Vec {
  return { x: HOLLOW.pos.x + p.at.x, y: HOLLOW.pos.y + p.at.y };
}

const PAD_SAMPLES = { along: 10, across: 14 };

function checkHollowLayout(laid: Obstacle[]): void {
  checkLaager();
  const blocked = padSamples().find((p) => laid.some((o) => propBoxes(o).some((b) => inBox(p, b))));
  if (blocked) throw new Error(`The Hollow's pad at ${blocked.x}, ${blocked.y} is crowded by a piece of the fort or its laager`);
  const reach = farthestReach(hollowDiscs());
  if (reach > HOLLOW.maxReach) throw new Error(`The Hollow, its laager and its pad reach ${reach} tiles from the centre, past ${HOLLOW.maxReach}`);
}

function checkLaager(): void {
  for (const p of HOLLOW.pieces) {
    const at = pieceSpot(p);
    const laager = LAAGER_LOOKS.includes(p.look);
    if (insideCurtain(HOLLOW.site, at, 0.5) === laager) throw new Error(`The Hollow's ${p.look} at ${at.x}, ${at.y} stands ${laager ? 'inside' : 'outside'} the curtain`);
  }
}

function padSamples(): Vec[] {
  const pad = hollowPad();
  const { length, width } = REGION.sites.pad;
  const out = { x: (pad.x - HOLLOW.pos.x) / dist(pad, HOLLOW.pos), y: (pad.y - HOLLOW.pos.y) / dist(pad, HOLLOW.pos) };
  return Array.from({ length: (PAD_SAMPLES.along + 1) * (PAD_SAMPLES.across + 1) }, (_, k) => {
    const u = (Math.floor(k / (PAD_SAMPLES.across + 1)) / PAD_SAMPLES.along - 0.5) * length;
    const v = ((k % (PAD_SAMPLES.across + 1)) / PAD_SAMPLES.across - 0.5) * width;
    return { x: pad.x + out.x * u - out.y * v, y: pad.y + out.y * u + out.x * v };
  });
}

function inBox(p: Vec, b: PosedBox): boolean {
  const dx = p.x - b.center.x;
  const dy = p.y - b.center.y;
  return Math.abs(dx * b.axis.x + dy * b.axis.y) < b.half.x && Math.abs(-dx * b.axis.y + dy * b.axis.x) < b.half.y;
}

export type HollowDisc = { at: Vec; r: number };


function farthestReach(discs: HollowDisc[]): number {
  return Math.max(...discs.map((d) => dist(d.at, HOLLOW.pos) + d.r));
}

export function hollowDiscs(): HollowDisc[] {
  const fort = fortressProps(HOLLOW.site).map((p) => ({ at: p.pos, r: p.r }));
  const pad = { at: hollowPad(), r: Math.hypot(REGION.sites.pad.length, REGION.sites.pad.width) / 2 };
  return [pad, ...HOLLOW.pieces.map((p) => ({ at: pieceSpot(p), r: p.r })), ...fort];
}

let reachCache: number | null = null;

export function hollowReach(): number {
  reachCache ??= farthestReach(hollowDiscs());
  return reachCache;
}

function interiorPiece(p: HollowPiece): Obstacle {
  return { id: p.look, kind: 'landmark', look: p.look, pos: pieceSpot(p), r: p.r, yaw: p.yaw };
}

export function hollowObstaclesFor(world: Pick<World, 'sunward'>): Obstacle[] {
  return world.sunward ? hollowObstacles() : [];
}

export function hollowSitesFor(world: Pick<World, 'sunward'>): (typeof HOLLOW.site)[] {
  return world.sunward ? [HOLLOW.site] : [];
}

export function isHollowObstacle(o: Obstacle): boolean {
  return /^hollow-\d+$/.test(o.id);
}

export function hollowPad(): Vec {
  const [pad] = sitePads(HOLLOW.site);
  if (!pad) throw new Error('The Hollow has no pad before its gate');
  return { ...pad };
}
