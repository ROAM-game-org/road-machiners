import { NOSE_RISE as R } from '../data/fortress';

export type RiseSample = { height: number; jitter: number };

const DEG = Math.PI / 180;
const C = R.crag;

export function noseRiseAt(x: number, v: number): RiseSample | null {
  const rise = riseSample(x, v);
  const crag = cragSample(x, v);
  if (rise === null || crag === null) return rise ?? crag;
  return crag.height > rise.height ? crag : rise;
}

export function noseRiseReach(): number {
  return R.reach + R.reachWobble;
}

function unit(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function bearing(x: number, v: number): number {
  return (((Math.atan2(v, x) / DEG) % 360) + 360) % 360;
}

function onArc(x: number, v: number): boolean {
  const b = bearing(x, v);
  return b >= R.arc[0] && b <= R.arc[1];
}

function midArc(x: number, v: number): number {
  if (!onArc(x, v)) return 0;
  return Math.sin((Math.PI * (bearing(x, v) - R.arc[0])) / (R.arc[1] - R.arc[0]));
}

function reachAt(x: number, v: number): number {
  if (!onArc(x, v)) return R.clip;
  const a = bearing(x, v) * DEG;
  const wobble = R.reachWobble * (0.6 * Math.sin(3 * a + 0.7) + 0.4 * Math.sin(7 * a + 2.1));
  return R.reachEnds + (R.reach - R.reachEnds) * midArc(x, v) ** 0.6 + wobble;
}

function pastRing(x: number, v: number): number {
  const d = Math.hypot(x, v);
  return d > R.clip ? unit((d - R.clip) / (reachAt(x, v) - R.clip)) : 0;
}

function open(x: number, v: number, front: number): boolean {
  if (v < front || Math.hypot(x - R.gate.x, v - R.gate.v) < R.gate.r) return true;
  const d = Math.hypot(x, v);
  return d > R.clip && !(onArc(x, v) && d < reachAt(x, v));
}

function tipX(): number {
  return R.joint.x + R.tipLength;
}

function riseSample(x: number, v: number): RiseSample | null {
  if (open(x, v, R.frontV - Math.max(0, R.bendX - x) * R.bend)) return null;
  if (x >= tipX() + R.fall && mountain(x, v) <= 0) return null;
  return { height: riseHeight(x, v), jitter: riseJitter(x, v) };
}

function mountain(x: number, v: number): number {
  if (!onArc(x, v)) return 0;
  const peak = R.peak * (R.endShare + (1 - R.endShare) * midArc(x, v));
  const d = Math.hypot(x, v);
  if (d <= R.clip) return peak * R.ringShare * unit((d - R.mountStart) / (R.clip - R.mountStart)) ** R.mountPower;
  const t = pastRing(x, v);
  if (t < R.crest) return peak * (R.ringShare + (1 - R.ringShare) * Math.sin(((t / R.crest) * Math.PI) / 2));
  return R.footZ + (peak - R.footZ) * Math.cos((((t - R.crest) / (1 - R.crest)) * Math.PI) / 2) ** R.footPower;
}

function platformShare(x: number): number {
  return unit(Math.min(x - R.platform[0], R.platform[1] - x) / R.platformFade + 1);
}

function riseHeight(x: number, v: number): number {
  const axisZ = R.joint.z + (x - R.joint.x) * Math.tan(R.pitch * DEG);
  const pastTip = Math.max(0, x - tipX());
  const cradle = Math.min(axisZ - R.hullR, R.cradleTop) + R.cradleLift - Math.max(0, Math.abs(v - R.axisV) - R.cradleHalf) - pastTip;
  const back = R.terraceZ + R.back.rise * unit((v - R.back.from) / R.back.run) ** R.back.power;
  const t = platformShare(x);
  const slope = unit((v - R.frontV) / R.slope.run) * R.slope.rise;
  const front = v < R.platformEnd ? R.terraceZ * t + slope * (1 - t) : 0;
  const fall = unit(1 - pastTip / R.fall);
  return Math.max(Math.max(front, cradle, back) * fall, mountain(x, v), 0.3);
}

function riseJitter(x: number, v: number): number {
  const J = R.jitter;
  if (Math.hypot(x, v) > R.clip) return J.foot + J.footRise * (1 - pastRing(x, v));
  if (v >= R.platformEnd) return J.rubble;
  const t = platformShare(x);
  return J.platform * t + J.rubble * (1 - t);
}

function cragSample(x: number, v: number): RiseSample | null {
  const front = C.near + (C.far - C.near) * unit((C.edgeX - x) / C.farRun);
  if (x > C.edgeX + C.edgePad || open(x, v, front)) return null;
  const near = unit((C.edgeX + C.edgePad - x) / C.nearRun);
  const climb = unit((v - front) / C.climbRun) ** C.climbPower;
  return { height: (C.base + (C.top - C.base) * climb * near) * (1 - C.outFall * pastRing(x, v)), jitter: C.jitter };
}
