import { REGION } from '../data/region';
import { deckAt, ICARUS_DECKS } from './bridge';
import { ROAD_INDEX } from './road-index';
import type { Vec } from './vec';

export const SHOULDER_REACH = REGION.roadWidth / 2 + REGION.roadShoulder;

const DECK_PROBES: readonly Vec[] = [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((y) => ({ x: x * (REGION.roadShoulder + 0.5), y: y * (REGION.roadShoulder + 0.5) })));

export function onShoulder(c: Vec): boolean {
  if (ROAD_INDEX.nearestWithin(c.x, c.y, SHOULDER_REACH) >= SHOULDER_REACH) return false;
  return !DECK_PROBES.some((o) => deckAt(ICARUS_DECKS, c.x + o.x, c.y + o.y) !== null);
}
