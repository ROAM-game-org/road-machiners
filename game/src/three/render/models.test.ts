import { describe, expect, it } from 'vitest';
import { Mesh, type MeshLambertMaterial } from 'three';
import { publicHashes } from '../../public-files';
import { EDGE_DISTANCE, loadModels, MASK_UV, model, MODEL_GLOW, NAMES, socket } from './models';
import { SURFACE_MODELS } from '../../render/partLooks';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
const progress: [number, number][] = [];
async function readFile(name: string): Promise<ArrayBuffer> {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
}
await loadModels(readFile, (done, total) => progress.push([done, total]));

describe('loadModels progress', () => {
  it('reports 0 first, then one more file each time, ending at the total', () => {
    const total = progress[0][1];
    expect(total).toBe(Object.keys(FILES).length);
    expect(progress.map(([done]) => done)).toEqual(Array.from({ length: total + 1 }, (_, i) => i));
    expect(progress.every(([, t]) => t === total)).toBe(true);
  });
});

function materialsOf(name: Parameters<typeof model>[0]): MeshLambertMaterial[] {
  const found: MeshLambertMaterial[] = [];
  model(name).traverse((o) => {
    if (o instanceof Mesh) found.push(...(Array.isArray(o.material) ? o.material : [o.material]));
  });
  return found;
}

describe('model materials', () => {
  it('lights a glow material with the dim model glow (IV21)', () => {
    const glow = materialsOf('fort_patchwork_tower').filter((m) => m.name === 'glow');
    expect(glow.length).toBeGreaterThan(0);
    for (const m of glow) expect([m.color.getHex(), m.emissive.getHex()]).toEqual([MODEL_GLOW.color, MODEL_GLOW.emissive]);
  });

  it('leaves every other material unlit', () => {
    const plain = materialsOf('fort_patchwork_tower').filter((m) => m.name !== 'glow');
    expect(plain.length).toBeGreaterThan(0);
    for (const m of plain) expect(m.emissive.getHex(), m.name).toBe(0);
  });
});

describe('nose_rise sockets', () => {
  it('holds the ship on two hull-axis points that pitch it 6 to 10 degrees nose-up', () => {
    const front = socket('nose_rise', 'ship_front');
    const rear = socket('nose_rise', 'ship_rear');
    expect(front.x).toBeGreaterThan(rear.x);
    expect(front.z).toBeCloseTo(rear.z, 6);
    const pitch = (Math.atan2(front.y - rear.y, front.x - rear.x) * 180) / Math.PI;
    expect(pitch).toBeGreaterThanOrEqual(6);
    expect(pitch).toBeLessThanOrEqual(10);
  });
});

describe('loadModels failure', () => {
  it('rejects with the error of a read that rejects for a model without a stand-in', async () => {
    const failure = new Error('read failed');
    await expect(loadModels(async () => { throw failure; })).rejects.toBe(failure);
  });

  it('builds a stand-in box for a prop whose file is missing and reports it', async () => {
    const missing = new Error('HTTP 404');
    const failures = await loadModels(async (name) => {
      if (name === 'hull_chunk') throw missing;
      return readFile(name);
    });
    expect(failures).toEqual([{ name: 'hull_chunk', error: missing }]);
    const meshes: Mesh[] = [];
    model('hull_chunk').traverse((o) => o instanceof Mesh && meshes.push(o));
    expect(meshes).toHaveLength(1);
    await loadModels(readFile);
  });

  it('reports no failures when every file loads', async () => {
    expect(await loadModels(readFile)).toEqual([]);
  });

  it('refuses a truck model that lost its surface bake (IV2)', async () => {
    await expect(loadModels(async (name) => readFile(name === 'wheel' ? 'barrel' : name))).rejects.toThrow(/without a surface mask: wheel/);
    await loadModels(readFile);
  });
});

describe('truck surfaces', () => {
  it('gives every truck model mesh atlas UVs and edge distances, one per vertex', () => {
    for (const name of SURFACE_MODELS) {
      model(name).traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const count = o.geometry.getAttribute('position').count;
        expect(o.geometry.getAttribute(MASK_UV)?.count, name).toBe(count);
        expect(o.geometry.getAttribute(EDGE_DISTANCE)?.count, name).toBe(count);
      });
    }
  });
});

describe('model files', () => {
  it('has a file in public/models and a public hash for every model the game asks for', () => {
    const hashes = publicHashes('public');
    const gaps = NAMES.filter((name) => !FILES[`/public/models/${name}.glb`] || !hashes[`models/${name}.glb`]);
    expect(gaps).toEqual([]);
  });
});
