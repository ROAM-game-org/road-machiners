import { PAL } from '../../../render/palette';
import type { SiteBuilder } from '../sites';

const STRIP = 6.15;
const DRUM_CLUSTERS = [
  { x: -STRIP, z: -4.4, yaw: 0.3 },
  { x: -STRIP + 0.1, z: -3.2, yaw: 1.1 },
  { x: -STRIP, z: 3.8, yaw: 2.2 },
] as const;
const CRATES = [
  { x: -STRIP, z: 4.9, yaw: 0.1 },
  { x: STRIP + 0.1, z: 4.6, yaw: -0.2 },
] as const;
const SHED = { x: STRIP + 0.2, z: -4.2, yaw: Math.PI / 2 };
const RACK = { x: STRIP, z: 1.1, length: 1.6, depth: 0.35, height: 0.6, shelves: 3 };
const LANTERN = { x: STRIP + 0.4, z: 3.6 };

export function buildOutpost(b: SiteBuilder): void {
  for (const d of DRUM_CLUSTERS) b.addModel('drums', d.x, d.z, d.yaw).name = 'outpost-drums';
  for (const c of CRATES) b.addModel('crates', c.x, c.z, c.yaw).name = 'outpost-crates';
  b.addModel('shack', SHED.x, SHED.z, SHED.yaw).name = 'outpost-shed';
  addRack(b);
  addLantern(b);
}

function addRack(b: SiteBuilder): void {
  const { x, z, length, depth, height, shelves } = RACK;
  for (const end of [-1, 1]) b.addBox(x, z + (end * length) / 2, depth, height, 0.06, PAL.metal);
  for (let i = 0; i < shelves; i++) {
    const lift = ((i + 1) / shelves) * height - 0.04;
    b.addBox(x, z, depth, 0.04, length, PAL.metalLight, lift);
    b.addBox(x, z + (i - 1) * 0.35, depth * 0.7, 0.12, 0.28, i % 2 === 0 ? PAL.rust.top : PAL.crate, lift + 0.04);
  }
}

function addLantern(b: SiteBuilder): void {
  b.addLantern(LANTERN.x, LANTERN.z, Math.PI);
}
