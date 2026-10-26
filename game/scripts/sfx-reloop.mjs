import { isFreeSfxLoop, SOUNDS } from '../src/data/sounds.ts';
import { cueOf, reloopShipped, syncTwins } from './sfx-lib.mjs';

function filesOf(arg) {
  const byFile = Object.values(SOUNDS).find((cue) => isFreeSfxLoop(cue) && cue.files.includes(arg));
  if (byFile) return [arg];
  const cue = cueOf(SOUNDS, arg);
  if (!isFreeSfxLoop(cue)) throw new Error(`${arg} is not a free sfx loop`);
  return cue.files;
}

const args = process.argv.slice(2).filter((a) => a !== '--');
if (args.length === 0) throw new Error('Usage: npm run sfx:reloop -- <loop cue or file> [<loop cue or file>...]');
args.flatMap(filesOf).forEach(reloopShipped);
await syncTwins();
console.log(`relooped ${args.join(', ')}`);
