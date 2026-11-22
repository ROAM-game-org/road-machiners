import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { SOUNDS } from '../src/data/sounds.ts';
import { cueOf, importFile, importTags, isField, SFX_DIR, syncTwins } from './sfx-lib.mjs';

const MANIFEST = 'tmp/sfx-sources.json';

const sourceOf = (file) => {
  const tags = importTags(file);
  if (!tags.source) throw new Error(`${file} has no source tag; import it again by hand`);
  if (!existsSync(tags.source)) throw new Error(`${file} comes from ${tags.source}, which is missing`);
  return tags;
};

const args = process.argv.slice(2).filter((a) => a !== '--');
const picked = () => {
  if (args.length === 0) return Object.keys(SOUNDS);
  if (args.length === 1 && args[0] === 'field') return Object.keys(SOUNDS).filter((id) => isField(SOUNDS[id]));
  args.forEach((id) => cueOf(SOUNDS, id));
  return args;
};

if (!existsSync(MANIFEST)) {
  const sources = Object.fromEntries(picked().map((id) => [id, SOUNDS[id].files.map(sourceOf)]));
  writeFileSync(MANIFEST, JSON.stringify(sources, null, 1));
}
const sources = JSON.parse(readFileSync(MANIFEST, 'utf8'));
for (const [id, srcs] of Object.entries(sources)) {
  const cue = SOUNDS[id];
  cue.files.forEach((f) => unlinkSync(`${SFX_DIR}/${f}`));
  for (const { source, plain, level } of srcs) importFile(source, id, cue, { plain, level });
}
unlinkSync(MANIFEST);
await syncTwins();
console.log(`rebuilt ${Object.keys(sources).join(', ')}`);
