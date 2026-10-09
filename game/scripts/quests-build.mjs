import { writeFileSync } from 'node:fs';
import { compileBundle, readQuestSources } from '../src/test/quest-compile.ts';

const FILE = 'src/data/quests.json';
const bundle = compileBundle(readQuestSources('src/data/quests'));
writeFileSync(FILE, `${JSON.stringify(bundle, null, 1)}\n`);
console.log(`Wrote ${Object.keys(bundle.quests).length} quests to ${FILE}`);
