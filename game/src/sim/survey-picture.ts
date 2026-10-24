import { hashId } from './rng';
import type { SurveySite } from './survey';
import type { Vec } from './vec';

const KEY_DECIMALS = 100;

function rounded(n: number): number {
  return Math.round(n * KEY_DECIMALS) / KEY_DECIMALS;
}

export function surveyPictureKey(site: SurveySite): string {
  const props = site.props.map((p) => `${p.id}@${rounded(p.pos.x)},${rounded(p.pos.y)}r${rounded(p.reach)}`);
  return hashId([site.id, ...props].join('|')).toString(16);
}

export function surveyPictureCenter(site: SurveySite): Vec {
  if (site.props.length === 0) throw new Error(`Survey site ${site.id} has no props`);
  const xs = site.props.flatMap((p) => [p.pos.x - p.reach, p.pos.x + p.reach]);
  const ys = site.props.flatMap((p) => [p.pos.y - p.reach, p.pos.y + p.reach]);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}
