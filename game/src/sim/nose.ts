// Nose's ship frame and its rock masses. The colony ship came down on a mountain, and the town's ring was built up to
// its flanks. The mountain is two baked props, nose_rise and nose_crag, that block trucks and sight by their boxes like
// any rock. Both models and the ship are authored in one frame, fixed by NOSE_FRONT, so it stays put wherever the gates stand

import { NOSE_FRONT } from '../data/fortress';
import { PHYSICS } from '../data/physics';
import { fortressGates, type FortGate } from './fortress';
import { propShape } from './mapgen';
import type { Site } from './sites';
import type { BakedProp, PropKind } from './terrain';
import type { Vec } from './vec';

export type NoseFrame = { u: Vec; v: Vec; yaw: number; south: FortGate; west: FortGate };

const ROCKS = { noseRise: 'nose_rise', noseCrag: 'nose_crag' } as const satisfies Partial<Record<PropKind, string>>;

export function noseFrame(site: Site): NoseFrame {
  const gates = fortressGates(site);
  if (gates.length !== 2) throw new Error(`Nose has ${gates.length} gates, and its frame is laid out for two`);
  const g = { x: Math.cos((NOSE_FRONT * Math.PI) / 180), y: Math.sin((NOSE_FRONT * Math.PI) / 180) };
  const u = { x: -g.y, y: g.x };
  const sides = gates.map((gate) => (gate.face.x - site.pos.x) * u.x + (gate.face.y - site.pos.y) * u.y);
  if (sides.filter((side) => side > 0).length !== 1 || sides.filter((side) => side < 0).length !== 1) {
    throw new Error(`Nose needs one gate on each side of its front axis, and its gates lie at u ${sides.map((side) => side.toFixed(1)).join(' and ')}`);
  }
  const [west, south] = sides[0] > 0 ? gates : [gates[1], gates[0]];
  return { u, v: { x: -g.x, y: -g.y }, yaw: Math.atan2(g.x, -g.y), south, west };
}

export function noseRocks(site: Site): BakedProp[] {
  const { yaw } = noseFrame(site);
  return (Object.keys(ROCKS) as (keyof typeof ROCKS)[]).map((kind) => ({ kind, pos: { ...site.pos }, r: boxReach(ROCKS[kind]), yaw, group: 0, step: 0 }));
}

function boxReach(model: string): number {
  const far = Math.max(...propShape(model).flatMap((b) => [Math.hypot(b.x0, b.y0), Math.hypot(b.x0, b.y1), Math.hypot(b.x1, b.y0), Math.hypot(b.x1, b.y1)]));
  return far / PHYSICS.metersPerTile;
}
