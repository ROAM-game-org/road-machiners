import type { Body } from '../sim/body';

export function wheelMounts(b: Body, unit: number): { x: number; y: number; z: number }[] {
  const rear = [
    { x: -b.wheelX, y: b.wheelY, z: -b.wheelZ },
    { x: -b.wheelX, y: b.wheelY, z: b.wheelZ },
  ];
  if (unit > 0) return rear;
  return [
    { x: b.wheelX, y: b.wheelY, z: -b.wheelZ },
    { x: b.wheelX, y: b.wheelY, z: b.wheelZ },
    ...rear,
  ];
}
