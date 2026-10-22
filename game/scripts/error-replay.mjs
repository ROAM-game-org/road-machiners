import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildDrive, captureDrive, freeDrive, initPhysics } from '../src/phys/drive.ts';
import { computeTurn } from '../src/phys/turn.ts';
import { CONFIG, GAME_VERSION } from '../src/config.ts';
import { PHYSICS } from '../src/data/physics.ts';
import { easedStopSteps } from '../src/three/play-clock.ts';
import { loadWorld } from '../src/three/save.ts';
import { memoryBackend, SaveSlots } from '../src/three/save-db.ts';
import { TEST_MAP } from '../src/test/map.ts';

const file = process.argv[2];
if (!file || file.startsWith('--')) throw new Error('Usage: npm run error:replay -- <report.json.gz> [--from world|autosave]');
const fromIndex = process.argv.indexOf('--from');
const from = fromIndex >= 0 ? process.argv[fromIndex + 1] : 'world';
if (from !== 'world' && from !== 'autosave') throw new Error(`--from must be world or autosave, got "${from}"`);

const sent = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
const report = sent.context ? { ...sent.context, drive: null } : sent;
console.log(sent.context ? `Player report, ${sent.kind}: ${sent.text}` : `Report: ${report.error.name}: ${report.error.message}`);
console.log(`Report build ${report.build} ${report.version}, this checkout ${GAME_VERSION}`);
if (report.version !== GAME_VERSION) console.warn('Warning: this checkout is not the report\'s version.');

const save = JSON.parse(savedJson(report, from));
const world = loadWorld(new SaveSlots(memoryBackend(), new Map([['auto', save]])), 'auto', TEST_MAP);
if (!world) throw new Error('The save did not load');
console.log(`Loaded the ${from} at turn ${world.turn}`);

await initPhysics();
const drive = from === 'world' && report.drive ? decodeDrive(report.drive) : freshDrive(world);
const { terrain, ...state } = world;
const tailSteps = easedStopSteps(CONFIG.turnStopMs, PHYSICS.stepsPerSecond);
const turn = computeTurn({ world: state, drive, questLanguage: report.language === 'ru' ? 'ru' : 'en', tailSteps }, terrain);
console.log(`The turn ran with no error and reached turn ${turn.world.turn}.`);

function savedJson(report, from) {
  if (from === 'world') {
    if (!report.world) throw new Error('The report holds no world. The game had not booted.');
    return JSON.stringify(report.world);
  }
  if (report.autosaveIsWorld) throw new Error('The autosave is the world in memory. Use --from world.');
  if (!report.autosave) throw new Error('The report holds no autosave.');
  return report.autosave;
}

function decodeDrive(drive) {
  console.log('Using the drive the failed turn started from.');
  return { ...drive, snapshot: new Uint8Array(Buffer.from(drive.snapshot, 'base64')) };
}

function freshDrive(world) {
  console.warn('Warning: the report holds no drive for this world. Physics starts fresh and may differ from the player\'s run.');
  const built = buildDrive(world);
  const saved = captureDrive(built);
  freeDrive(built);
  return saved;
}
