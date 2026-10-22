import { SOUNDS } from '../src/data/sounds.ts';
import { cueOf, reloopShipped, syncTwins } from './sfx-lib.mjs';

const ids = process.argv.slice(2).filter((a) => a !== '--');
if (ids.length === 0) throw new Error('Usage: npm run sfx:reloop -- <loop cue> [<loop cue>...]');
for (const id of ids) {
  const cue = cueOf(SOUNDS, id);
  if (!cue.loop || cue.beat || cue.bus === 'music') throw new Error(`${id} is not a free sfx loop`);
  cue.files.forEach(reloopShipped);
}
await syncTwins();
console.log(`relooped ${ids.join(', ')}`);
