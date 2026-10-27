import { CRASH, DESCENT_PATH } from '../data/terrain';
import { FALLEN_SUN_POS } from '../data/region';
import { chance, randRange, type Rng } from '../sim/rng';
import { territoryAt } from '../sim/territory';
import type { MapDraft } from './bake';
import { place, prop, ruleRng } from './oldworld';

const APRON_SEED = 1;

export function apronLayer(seed: number, d: MapDraft): MapDraft {
  for (const piece of apronDraws(seed)) if (territoryAt(piece.pos) === null) place(d, piece, 0);
  return d;
}

export function apronDraws(seed: number): ReturnType<typeof prop>[] {
  const rng = ruleRng(seed, CRASH.seedOffset + APRON_SEED);
  const heading = downrangeHeading();
  const out: ReturnType<typeof prop>[] = [];
  for (let t = 0; t < CRASH.apron.tries; t++) {
    const angle = randRange(rng, 0, Math.PI * 2);
    if (!chance(rng, apronShare(angle - heading))) continue;
    const r = apronRange(randRange(rng, 0, 1));
    out.push(rubble(rng, { x: FALLEN_SUN_POS.x + Math.cos(angle) * r, y: FALLEN_SUN_POS.y + Math.sin(angle) * r }, angle));
  }
  return out;
}

function downrangeHeading(): number {
  const [a, b] = DESCENT_PATH.slice(-2);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function apronShare(fromDownrange: number): number {
  const along = Math.cos(fromDownrange);
  if (along < CRASH.apron.bareBelow) return 0;
  return (1 + CRASH.apron.downrange * along) / (1 + CRASH.apron.downrange);
}

export function apronRange(u: number): number {
  const { rim, reach, falloff } = CRASH.apron;
  const power = 2 - falloff;
  return (rim ** power + u * (reach ** power - rim ** power)) ** (1 / power);
}

function rubble(rng: Rng, pos: { x: number; y: number }, angle: number): ReturnType<typeof prop> {
  if (chance(rng, CRASH.apron.shards)) return prop('hullShard', pos, randRange(rng, ...CRASH.apron.radius), angle + randRange(rng, -0.4, 0.4));
  return prop('rimRock', pos, randRange(rng, ...CRASH.apron.radius), randRange(rng, 0, Math.PI * 2));
}
