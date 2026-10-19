export type SignStage = 'spiral' | 'race' | 'exodus' | 'chaos';
export const SIGN_STAGES: readonly SignStage[] = ['spiral', 'race', 'exodus', 'chaos'];

export const SIGN_VIEWBOX = '-5 -5 110 110';

type Point = readonly [number, number];

const CENTER = 50;
const SPIRAL_RADIUS = 19;
const SPIRAL_ARMS = [0, 120, 240];
const SPIRAL_TURN = 55;
const SPIRAL_SWEEP = 170;
const SPIRAL_CUTS = 7;
const RACE_REACH = 37;
const RACE_ANGLE = -60;
const EXODUS_RAYS = [30, 150, 210, 330];
const EXODUS_FROM = 33;
const EXODUS_TO = 54;
const CHAOS_RADIUS = 43;
const CHAOS_WIDTH = 3.4;
const CHAOS_SIDES = 96;

function polar(radius: number, degrees: number): Point {
  const a = (degrees * Math.PI) / 180;
  return [CENTER + radius * Math.cos(a), CENTER + radius * Math.sin(a)];
}

function fixed(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function outline(points: readonly Point[]): string {
  return `M${points.map(([x, y]) => `${fixed(x)} ${fixed(y)}`).join(' L')} Z`;
}

function cut(points: readonly Point[], startWidth: number, endWidth: number): string {
  const left: Point[] = [];
  const right: Point[] = [];
  points.forEach((p, i) => {
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    const dx = after[0] - before[0];
    const dy = after[1] - before[1];
    const length = Math.hypot(dx, dy);
    const half = (startWidth + ((endWidth - startWidth) * i) / (points.length - 1)) / 2;
    left.push([p[0] - (dy / length) * half, p[1] + (dx / length) * half]);
    right.push([p[0] + (dy / length) * half, p[1] - (dx / length) * half]);
  });
  return outline([...left, ...right.reverse()]);
}

function spiral(): string[] {
  return SPIRAL_ARMS.map((arm) => {
    const points: Point[] = [];
    for (let i = 0; i <= SPIRAL_CUTS; i++) {
      const t = i / SPIRAL_CUTS;
      points.push(polar(SPIRAL_RADIUS * (0.12 + 0.88 * t), arm - 90 + SPIRAL_TURN + t * SPIRAL_SWEEP));
    }
    return cut(points, 1.2, 5);
  });
}

function race(): string[] {
  return [cut([polar(RACE_REACH, RACE_ANGLE + 180), polar(0, 0), polar(RACE_REACH, RACE_ANGLE)], 4, 0.4)];
}

function exodus(): string[] {
  return EXODUS_RAYS.map((a) => cut([polar(EXODUS_FROM, a), polar(EXODUS_TO, a)], 6.5, 0.4));
}

function ring(radius: number): string {
  const points: Point[] = [];
  for (let i = 0; i < CHAOS_SIDES; i++) points.push(polar(radius, (360 * i) / CHAOS_SIDES));
  return outline(points);
}

function chaos(): string[] {
  return [`${ring(CHAOS_RADIUS + CHAOS_WIDTH / 2)} ${ring(CHAOS_RADIUS - CHAOS_WIDTH / 2)}`];
}

const STAGE_PATHS: Record<SignStage, () => string[]> = { spiral, race, exodus, chaos };

export function signPaths(stage: SignStage): string[] {
  return STAGE_PATHS[stage]();
}

export function signStageMarkup(stage: SignStage): string {
  return `<g data-stage="${stage}">${signPaths(stage)
    .map((d) => `<path fill-rule="evenodd" d="${d}"/>`)
    .join('')}</g>`;
}
