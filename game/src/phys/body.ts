import { axlesOf, type Body } from '../sim/body';

export function wheelMounts(b: Body, unit: number): { x: number; y: number; z: number }[] {
  const axles = axlesOf(b);
  const rear = [
    { x: axles.rear, y: b.wheelY, z: -b.wheelZ },
    { x: axles.rear, y: b.wheelY, z: b.wheelZ },
  ];
  if (unit > 0) return rear;
  return [
    { x: axles.front, y: b.wheelY, z: -b.wheelZ },
    { x: axles.front, y: b.wheelY, z: b.wheelZ },
    ...rear,
  ];
}
