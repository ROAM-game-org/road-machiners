import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHASSIS } from '../src/data/chassis.ts';
import { START_KITS } from '../src/data/start.ts';
import { MAPGEN } from '../src/data/terrain.ts';
import { bakeRouteSummary } from '../src/sim/nav/layer.ts';
import { defaultSetup } from '../src/sim/settings.ts';
import { decodeMap, routesFile } from '../src/sim/terrain.ts';
import { newWorld } from '../src/sim/world.ts';

const start = performance.now();
const map = decodeMap(new Uint8Array(readFileSync(join('public', MAPGEN.file))));
const world = newWorld(1, START_KITS.standard, map, defaultSetup('roaming'), false);
const radii = [...new Set(Object.values(CHASSIS).map((c) => c.radius))].sort((a, b) => a - b);
const bytes = bakeRouteSummary(map, world.obstacles, radii);
const file = join('public', routesFile(MAPGEN.file));
writeFileSync(`${file}.tmp`, bytes);
renameSync(`${file}.tmp`, file);
console.log(`${file}: ${bytes.length} bytes for ${radii.length} truck sizes, map ${map.hash}, ${Math.round(performance.now() - start)} ms`);
