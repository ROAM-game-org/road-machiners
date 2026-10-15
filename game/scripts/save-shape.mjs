import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { SAVE_FORMAT } from '../src/three/save-migrations.ts';
import { brokenLinks, lostQuestNames, newGameShape, questLinks, questNames, raisedQuests, revisionReach } from '../src/test/save-shape.ts';
import { QUESTS } from '../src/sim/quests.ts';

const FILE = 'src/three/save-shape.json';
const format = `${SAVE_FORMAT.major}.${SAVE_FORMAT.minor}`;
const shape = newGameShape();
const quests = questNames(QUESTS);
const links = questLinks(QUESTS);
const compatible = process.argv.flatMap((arg, i) => (process.argv[i - 1] === '--compatible' ? [arg] : []));

const unknown = compatible.filter((id) => !QUESTS.quests[id]);
if (unknown.length > 0) throw new Error(`--compatible names no quest: ${unknown.join(', ')}`);

if (existsSync(FILE)) {
  const recorded = JSON.parse(readFileSync(FILE, 'utf8'));
  const sameFormat = recorded.format === format;
  if (sameFormat && JSON.stringify(recorded.shape) !== JSON.stringify(shape)) {
    throw new Error(`The saved shape changed under save format ${format}. Add a migration step or bump SAVE_MAJOR in src/three/save-migrations.ts first.`);
  }
  const recordedLinks = sameFormat && recorded.questLinks ? recorded.questLinks : {};
  const lost = sameFormat && recorded.quests ? lostQuestNames(recorded.quests, quests, raisedQuests(recordedLinks, links)) : [];
  if (lost.length > 0) {
    throw new Error(`Saved quest names changed under save format ${format}: ${lost.join(', ')}. Add a migration step with the quest helpers in src/three/save-migrations.ts, or raise the quest's # revision: so a load resets it.`);
  }
  const broken = brokenLinks(recordedLinks, links, compatible);
  if (broken.length > 0) {
    const changed = [...new Set(broken.map((change) => change.split(' ')[1]))];
    const reach = changed.map((id) => `${id} resets at most ${revisionReach(QUESTS, id).join(', ')}`);
    throw new Error([
      `Quest links changed in a way old saves may not follow: ${broken.join('; ')}.`,
      'If old progress in the quest no longer makes sense, raise its # revision: tag. A load then resets it and the quests that stand on it.',
      `If old progress still makes sense, run npm run save:shape -- ${changed.map((id) => `--compatible ${id}`).join(' ')}.`,
      `A raised revision: ${reach.join('; ')}.`,
    ].join('\n'));
  }
}
writeFileSync(FILE, `${JSON.stringify({ format, shape, quests, questLinks: links }, null, 1)}\n`);
console.log(`Wrote the save format ${format} shape to ${FILE}`);
