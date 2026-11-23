import { SOUNDS } from '../src/data/sounds.ts';
import { cueOf, importFile, syncTwins } from './sfx-lib.mjs';

const USAGE = 'Usage: npm run sfx:import -- [--plain] [--level <LUFS>] <cue> <file...>';

function parseArgs(argv) {
  const args = argv.filter((a) => a !== '--');
  const plain = args.includes('--plain');
  const at = args.indexOf('--level');
  const level = at === -1 ? undefined : Number(args[at + 1]);
  if (level !== undefined && !Number.isFinite(level)) throw new Error(`--level needs a number of LUFS. ${USAGE}`);
  const pinned = at === -1 ? [] : [at, at + 1];
  const rest = args.filter((a, i) => a !== '--plain' && !pinned.includes(i));
  return { pins: { plain, level }, id: rest[0], files: rest.slice(1) };
}

const { pins, id, files } = parseArgs(process.argv.slice(2));
if (!id || files.length === 0) throw new Error(USAGE);
const cue = cueOf(SOUNDS, id);
files.forEach((f) => importFile(f, id, cue, pins));
await syncTwins();
