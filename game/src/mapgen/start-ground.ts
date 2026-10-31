import { REGION } from '../data/region';
import { STORY_WRECKS } from '../data/salvage';
import { reservedGround } from '../sim/start-pose';
import { dist, type Vec } from '../sim/vec';
import type { MapDraft } from './bake';

const RESERVED = [...reservedGround(), ...STORY_WRECKS.map((w) => ({ pos: w.pos, r: w.r }))];

export function onReservedGround(pos: Vec, r: number): boolean {
  return RESERVED.some((spot) => dist(pos, spot.pos) < spot.r + r + REGION.obstacles.gap);
}

export function keepStartClear(d: MapDraft): MapDraft {
  d.props = d.props.filter((p) => !onReservedGround(p.pos, p.r));
  return d;
}
