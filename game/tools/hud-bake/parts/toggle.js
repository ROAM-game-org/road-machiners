import { THREE, lit } from './dashlib.js';

const RING = 0.85, LEVER = 1.75, LEVER_W = 1.25, TILT = 0.75;
const BASE = '#9a9a92', HOLE = '#2a2017', BRASS = '#a87a3c', BRASS_DEEP = '#5e4220';
const RING_PROFILE = [[2.4, 0], [2.4, 0.5], [2.9, 1.3], [4.2, 1.4], [4.8, 0.9], [4.9, 0]];
const LEVER_LENGTH = 8;

function flutedStem(radius, length, flutes) {
  const g = new THREE.CylinderGeometry(radius, radius * 0.92, length, flutes * 4, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) < 1e-5) continue;
    const k = 0.88 + 0.12 * Math.abs(Math.cos(Math.atan2(z, x) * flutes / 2));
    pos.setX(i, x * k); pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function buildToggle({ len, at, eye, scale = 1, leverScale = scale }) {
  const u = (v) => len(v * RING * scale), ul = (v) => len(v * LEVER * leverScale), uw = (v) => len(v * LEVER_W * scale);
  const brass = lit(BRASS), brassDeep = lit(BRASS_DEEP);
  const profile = RING_PROFILE.map(([x, y]) => new THREE.Vector2(u(x), u(y)));
  const ring = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), lit(BASE, { side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2; ring.position.set(at.x, at.y, at.z);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(u(2.4), 32), new THREE.MeshBasicMaterial({ color: HOLE }));
  hole.position.set(at.x, at.y, at.z + 0.0015);
  const pivot = new THREE.Group();
  pivot.matrixAutoUpdate = false;
  const pivotAt = new THREE.Vector3(at.x, at.y, at.z + 0.002);
  const shear = new THREE.Matrix4().set(1, 0, -(pivotAt.x - eye.x) / eye.z, 0, 0, 1, -(pivotAt.y - eye.y) / eye.z, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const length = ul(LEVER_LENGTH);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(uw(1.2), uw(1.2), ul(2), 16), brassDeep);
  neck.position.y = ul(0.5);
  const stem = new THREE.Mesh(flutedStem(uw(1.7), length, 16), brass);
  stem.position.y = length / 2 + ul(1);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(uw(1.35), uw(1.65), uw(1.1), 28), brass);
  capTop.position.y = length + ul(1) + uw(0.55);
  pivot.add(neck, stem, capTop);
  for (const m of [ring, stem, capTop, neck]) { m.castShadow = true; m.receiveShadow = true; }
  const set = (on) => {
    const rot = new THREE.Matrix4().makeRotationX(on ? Math.PI / 2 - TILT : Math.PI / 2 + TILT);
    pivot.matrix.copy(new THREE.Matrix4().makeTranslation(pivotAt.x, pivotAt.y, pivotAt.z).multiply(shear).multiply(rot));
  };
  set(false);
  return { parts: [hole, ring, pivot], set };
}
