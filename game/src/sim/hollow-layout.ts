import { HOLLOW, SUNWARD, type HollowPiece } from '../data/sunward';
import { fortressFootprint, fortressPieces, fortressProps, insideCurtain } from './fortress';
import { propObstacle } from './mapgen';
import type { Obstacle, World } from './types';
import { dist, pointInPolygon, polygonEdgeDist, type Vec } from './vec';

let hollowProps: Obstacle[] | null = null;

export function hollowObstacles(): Obstacle[] {
  if (hollowProps === null) {
    checkHollowLayout();
    hollowProps = [...fortressProps(HOLLOW.site).map((p, i) => propObstacle(p, i)), ...HOLLOW.pieces.map(interiorPiece)].map((o, i) => ({ ...o, id: `hollow-${i}` }));
  }
  return hollowProps.map((o) => ({ ...o, pos: { ...o.pos } }));
}

const LAAGER_LOOKS: readonly HollowPiece['look'][] = ['drums', 'woodpile'];

function pieceSpot(p: HollowPiece): Vec {
  return { x: HOLLOW.pos.x + p.at.x, y: HOLLOW.pos.y + p.at.y };
}

function clearOfFort(at: Vec, r: number): boolean {
  return fortressPieces(HOLLOW.site).every((fp) => {
    const outline = fortressFootprint(HOLLOW.site, fp);
    return !pointInPolygon(at, outline) && polygonEdgeDist(at, outline) >= r;
  });
}

function checkHollowLayout(): void {
  const laid = HOLLOW.pieces.map((p) => ({ p, at: pieceSpot(p), laager: LAAGER_LOOKS.includes(p.look) }));
  for (const { p, at, laager } of laid) {
    if (insideCurtain(HOLLOW.site, at, 0.5) === laager) throw new Error(`The Hollow's ${p.look} at ${at.x}, ${at.y} stands ${laager ? 'inside' : 'outside'} the curtain`);
  }
  const bays = hollowBays();
  bays.forEach((b, i) => {
    const need = SUNWARD.memberRadius + HOLLOW.bayGap;
    if (insideCurtain(HOLLOW.site, b, 0) || !clearOfFort(b, need)) throw new Error(`Hollow bay ${i} at ${b.x}, ${b.y} has no clear ground`);
    const crowded = laid.some(({ p, at }) => dist(at, b) < p.r + need) || bays.some((o, k) => k !== i && dist(o, b) < need + SUNWARD.memberRadius);
    if (crowded) throw new Error(`Hollow bay ${i} at ${b.x}, ${b.y} is crowded by a piece or another bay`);
  });
  const reach = farthestReach(discsOf(bays, laid.map((l) => ({ at: l.at, r: l.p.r }))));
  if (reach > HOLLOW.maxReach) throw new Error(`The Hollow and its laager reach ${reach} tiles from the centre, past ${HOLLOW.maxReach}`);
}

export type HollowDisc = { at: Vec; r: number };

function discsOf(bays: Vec[], pieces: HollowDisc[]): HollowDisc[] {
  const fort = fortressProps(HOLLOW.site).map((p) => ({ at: p.pos, r: p.r }));
  return [...bays.map((at) => ({ at, r: SUNWARD.memberRadius })), ...pieces, ...fort];
}

function farthestReach(discs: HollowDisc[]): number {
  return Math.max(...discs.map((d) => dist(d.at, HOLLOW.pos) + d.r));
}

export function hollowDiscs(): HollowDisc[] {
  return discsOf(hollowBays(), HOLLOW.pieces.map((p) => ({ at: pieceSpot(p), r: p.r })));
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

export function isHollowObstacle(o: Obstacle): boolean {
  return /^hollow-\d+$/.test(o.id);
}

export function hollowBays(): Vec[] {
  return HOLLOW.bays.map((b) => ({ x: HOLLOW.pos.x + b.x, y: HOLLOW.pos.y + b.y }));
}

export function bayHeading(index: number): number {
  return HOLLOW.bays[index].heading;
}
