import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SURFACE_MODELS } from '../src/render/partLooks.ts';
import { SURFACE_MASK } from '../src/three/render/models.ts';

const LOGS = 'tmp/models-bake';
const asked = process.argv.slice(2);
const unknown = asked.filter((name) => !SURFACE_MODELS.includes(name));
if (unknown.length) throw new Error(`Not truck models: ${unknown.join(', ')}. Truck models come from SURFACE_MODELS in src/render/partLooks.ts.`);
const names = asked.length ? asked : SURFACE_MODELS;

mkdirSync(LOGS, { recursive: true });
const failed = [];
names.forEach((name, i) => {
  const file = `public/models/${name}.glb`;
  const args = ['--background', '--python-exit-code', '1', '--python', 'tools/blender/bake_mask.py', '--', file, file, '--version', String(SURFACE_MASK.version), '--texel', String(SURFACE_MASK.metersPerPixel), '--max-side', String(SURFACE_MASK.maxSide)];
  const run = spawnSync('blender', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(`${LOGS}/${name}.log`, `${run.stdout}\n${run.stderr}`);
  const line = run.stdout.split('\n').find((l) => l.startsWith('baked '));
  if (run.status !== 0 || !line) failed.push(name);
  console.log(`${i + 1}/${names.length} ${run.status === 0 && line ? line : `FAILED ${name}, see ${LOGS}/${name}.log`}`);
});
if (failed.length) {
  console.error(`Bake failed for ${failed.join(', ')}`);
  process.exit(1);
}
console.log('Run npm run icons next: icon hashes cover model bytes.');
