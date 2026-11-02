import { PAL } from '../../../render/palette';
import type { SiteBuilder } from '../sites';
import { addShed } from './shed';

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

const MAST = { x: -2.2, z: -1.6, half: 0.22, height: 6, leg: 0.06, rungEvery: 0.75, rung: 0.04 };
const ROADHOUSE_SHED = { x: 1.6, z: -2.3, yaw: -Math.PI / 2 };
const LEAN_TO = { x: 2.2, z: 1.4, yaw: Math.PI };
const TABLE = { x: -0.2, z: 1.5, length: 1.4, width: 0.5, height: 0.22, top: 0.05 };
const BENCHES = [-0.55, 0.55];
const ROADHOUSE_DRUMS = [
  { x: -3.1, z: 1.2, yaw: 0.4 },
  { x: 3.2, z: -0.6, yaw: 1.9 },
];
const ROADHOUSE_CRATES = { x: -3.0, z: 2.4, yaw: 0.2 };
const ROADHOUSE_LANTERN = { x: 0.8, z: 2.6, yaw: Math.PI / 2 };

export function buildRoadhouse(b: SiteBuilder): void {
  addMast(b);
  addShed(b, 'marshal-post', ROADHOUSE_SHED);
  b.addModel('scrap_shelter_lean', LEAN_TO.x, LEAN_TO.z, LEAN_TO.yaw).name = 'marshal-post-lean-to';
  addHearingTable(b);
  for (const d of ROADHOUSE_DRUMS) b.addModel('drums', d.x, d.z, d.yaw).name = 'marshal-post-drums';
  b.addModel('crates', ROADHOUSE_CRATES.x, ROADHOUSE_CRATES.z, ROADHOUSE_CRATES.yaw).name = 'marshal-post-crates';
  b.addLantern(ROADHOUSE_LANTERN.x, ROADHOUSE_LANTERN.z, ROADHOUSE_LANTERN.yaw);
}

function addMast(b: SiteBuilder): void {
  const { x, z, half, height, leg, rungEvery, rung } = MAST;
  for (const [dx, dz] of [[-half, -half], [half, -half], [half, half], [-half, half]]) {
    b.addBox(x + dx, z + dz, leg, height, leg, PAL.metal).name = 'marshal-post-mast';
  }
  for (let lift = rungEvery; lift < height; lift += rungEvery) {
    b.addBox(x, z - half, half * 2, rung, rung, PAL.rust.dark, lift);
    b.addBox(x, z + half, half * 2, rung, rung, PAL.rust.dark, lift);
    b.addBox(x - half, z, rung, rung, half * 2, PAL.rust.dark, lift);
    b.addBox(x + half, z, rung, rung, half * 2, PAL.rust.dark, lift);
  }
  b.addBox(x, z, half * 2.4, rung * 2, half * 2.4, PAL.metalLight, height);
  b.addLampHead(x, z, height + rung * 2, 0).name = 'marshal-post-mast-lamp';
}

function addHearingTable(b: SiteBuilder): void {
  const { x, z, length, width, height, top } = TABLE;
  b.addBox(x, z, length, top, width, PAL.crate, height);
  for (const end of [-1, 1]) b.addBox(x + (end * (length - 0.1)) / 2, z, 0.06, height, width * 0.8, PAL.rust.dark);
  for (const side of BENCHES) b.addBox(x, z + side, length * 0.9, 0.12, 0.18, PAL.trunk);
}
