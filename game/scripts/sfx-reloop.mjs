import { isFreeLoop } from '../src/audio/loop-check.ts';
import { SOUNDS } from '../src/data/sounds.ts';
import { cueOf, reloopShipped, syncTwins } from './sfx-lib.mjs';

function filesOf(arg) {
  const byFile = Object.values(SOUNDS).find((cue) => isFreeLoop(cue) && cue.files.includes(arg));
  if (byFile) return [{ file: arg, cue: byFile }];
  const cue = cueOf(SOUNDS, arg);
  if (!isFreeLoop(cue)) throw new Error(`${arg} is not a loop without a beat`);
  return cue.files.map((file) => ({ file, cue }));
}

const args = process.argv.slice(2).filter((a) => a !== '--');
if (args.length === 0) throw new Error('Usage: npm run sfx:reloop -- <loop cue or file> [<loop cue or file>...]');
args.flatMap(filesOf).forEach(({ file, cue }) => reloopShipped(file, cue));
await syncTwins();
console.log(`relooped ${args.join(', ')}`);
