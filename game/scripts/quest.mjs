import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { MAX_RANK, SKILL_IDS } from '../src/data/skills.ts';
import { START_KITS } from '../src/data/start.ts';
import { skillLevel } from '../src/sim/progress.ts';
import { QUEST_LANGUAGES } from '../src/data/quests.ts';
import { chooseQuestOption, questProblems, questView, restoreQuest, setQuestLanguage, startQuest } from '../src/sim/quests.ts';
import { entryText } from '../src/text/resolve.ts';
import { defaultSetup } from '../src/sim/settings.ts';
import { newWorld } from '../src/sim/world.ts';
import { TEST_MAP } from '../src/test/map.ts';
import { parkAtLocal } from '../src/test/quest-check.ts';
import { compileSources, readQuestSources } from '../src/test/quest-compile.ts';
import { parseMarkup } from '../src/ui/quest-text.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { lang: { type: 'string', default: 'en' }, checkpoint: { type: 'string' }, picks: { type: 'string' }, set: { type: 'string', multiple: true }, skill: { type: 'string', multiple: true }, save: { type: 'string' }, load: { type: 'string' }, play: { type: 'string' }, pick: { type: 'string' }, from: { type: 'string' } },
});
if (values.pick !== undefined && !values.play) throw new Error('--pick needs --play <file>');
if (!QUEST_LANGUAGES.includes(values.lang)) throw new Error(`--lang ${values.lang} needs one of ${QUEST_LANGUAGES.join(', ')}`);
setQuestLanguage(values.lang);
const termText = (term) => entryText(values.lang, `term.${term}`);
const id = positionals[0];
if (!id) throw new Error('Name a quest: npm run quest -- <quest>, or list them: npm run quest -- list');
const { bundle, errors } = compileSources(readQuestSources('src/data/quests'), false);
if (errors.length > 0) throw new Error(`Quests do not compile:\n${errors.join('\n')}`);
if (id === 'list') {
  console.log(Object.keys(bundle.quests).sort().join('\n'));
  process.exit(0);
}
if (!bundle.quests[id]) throw new Error(`No quest ${id}. Quests: ${Object.keys(bundle.quests).join(', ')}`);

const PARSERS = {
  string: (text) => text,
  boolean: (text) => ({ true: true, false: false })[text],
  number: (text) => (Number.isFinite(Number(text)) && text !== '' ? Number(text) : undefined),
};

const fresh = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
parkAtLocal(fresh, id);
const startMoney = fresh.player.money;
if (values.play) {
  played(fresh, values.play);
  process.exit(0);
}
let world = values.load ? loaded(fresh, values.load) : started(fresh);
show(world);
world = values.picks ? scripted(world, values.picks) : await typed(world);
finish(world);

function loaded(w, file) {
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  const quests = { world: saved.world, local: saved.local, session: saved.session, live: null };
  const problems = questProblems(quests, bundle);
  if (problems.length > 0) throw new Error(`${file} does not fit the current quests:\n${problems.join('\n')}`);
  w.player.quests = quests;
  if (quests.session === null) return started(w);
  if (quests.session.quest !== id) throw new Error(`${file} holds an open session of ${quests.session.quest}, not ${id}`);
  restoreQuest(w, bundle);
  console.log(`Resumed ${id} at checkpoint ${quests.session.checkpoint}\n`);
  return w;
}

function newRun() {
  return { quest: id, world: values.from ? carriedWorld(values.from) : {}, set: values.set ?? [], skills: values.skill ?? [], checkpoint: values.checkpoint, picks: [] };
}

function carriedWorld(file) {
  const before = JSON.parse(readFileSync(file, 'utf8'));
  if (!before.after) throw new Error(`${file} holds no world from a played quest`);
  return before.after;
}

function started(w, run = newRun()) {
  w.player.quests.world = { ...w.player.quests.world, ...run.world };
  for (const assignment of run.set) setVariable(w, assignment);
  for (const assignment of run.skills) setSkill(w, assignment);
  const checkpoint = run.checkpoint ?? bundle.quests[id].checkpoints[0];
  return startQuest(w, bundle, id, checkpoint);
}

function played(w, file) {
  const run = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : newRun();
  if (run.quest !== id) throw new Error(`${file} plays ${run.quest}, not ${id}`);
  const at = run.picks.reduce((next, number) => chooseQuestOption(next, bundle, choiceIndex(next, number)), started(w, run));
  if (values.pick === undefined) {
    showPlayer(at);
    run.after = at.player.quests.world;
  } else {
    const index = choiceIndex(at, values.pick);
    console.log(`> ${questView(at, bundle).choices[index]}\n`);
    const next = chooseQuestOption(at, bundle, index);
    showPlayer(next);
    run.picks.push(values.pick);
    run.after = next.player.quests.world;
  }
  writeFileSync(file, `${JSON.stringify(run)}\n`);
}

function showPlayer(w) {
  const view = questView(w, bundle);
  for (const line of view.lines) console.log(playerLine(line));
  for (const stat of view.stats) console.log(`[${stat.label}: ${stat.value}]`);
  console.log('');
  for (const note of termNotes(view, false)) console.log(note);
  view.choices.forEach((choice, index) => console.log(`${index + 1}. ${withoutTerms(choice)}${checkText(w, view.checks[index])}${view.costs[index] === null ? '' : ` (costs ${view.costs[index]})`}${view.locked[index] ? ' (you cannot afford it)' : ''}`));
  if (view.ended) console.log('(the story ends here)');
}

function checkText(w, check) {
  if (check === null) return '';
  return ` (${check.skill} ${check.level}, yours ${skillLevel(w, check.skill)})`;
}

function playerLine(line) {
  const tag = (name) => line.tags.find((t) => t === name || t.startsWith(`${name}:`))?.slice(name.length + 1).trim();
  const place = tag('place');
  const speaker = tag('speaker');
  const isTable = tag('row') !== undefined || tag('head') !== undefined;
  const text = isTable ? withoutTerms(line.text).split(';').map((cell) => cell.trim()).join(' | ') : withoutTerms(line.text);
  return `${place ? `\n== ${place} ==\n` : ''}${speaker ? `${speaker}: ` : ''}${text}`;
}

function choiceIndex(w, number) {
  const index = Number(number) - 1;
  if (questView(w, bundle).choices[index] === undefined) throw new Error(`No choice ${number}`);
  return index;
}

function setVariable(w, assignment) {
  const [name, text] = assignment.split('=');
  const local = bundle.quests[id].vars[name];
  const decl = local ?? bundle.world[name];
  if (!decl || text === undefined) throw new Error(`--set ${assignment} names no variable of ${id} or the world`);
  const value = parsedValue(decl.type, text, assignment);
  if (local) w.player.quests.local[id] = { ...w.player.quests.local[id], [name]: value };
  else w.player.quests.world[name] = value;
}

function setSkill(w, assignment) {
  const [skill, text] = assignment.split('=');
  const level = Number(text);
  if (!SKILL_IDS.includes(skill) || !Number.isInteger(level) || level < 0 || level > MAX_RANK) throw new Error(`--skill ${assignment} needs <skill>=<level from 0 to ${MAX_RANK}>, skills: ${SKILL_IDS.join(', ')}`);
  w.player.ranks[skill] = level;
}

function parsedValue(type, text, assignment) {
  const value = PARSERS[type](text);
  if (value === undefined) throw new Error(`--set ${assignment} needs a ${type}`);
  return value;
}

function pick(w, number) {
  const index = choiceIndex(w, number);
  console.log(`> ${number}. ${questView(w, bundle).choices[index]}\n`);
  const next = chooseQuestOption(w, bundle, index);
  show(next);
  return next;
}

function scripted(w, picks) {
  return picks.split(',').reduce((at, number) => pick(at, number.trim()), w);
}

async function typed(w) {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  let at = w;
  while (!questView(at, bundle).ended) {
    const answer = (await input.question('Pick a number, or q to stop: ')).trim();
    if (answer === 'q') break;
    at = pick(at, answer);
  }
  input.close();
  return at;
}

function show(w) {
  const view = questView(w, bundle);
  for (const line of view.lines) console.log(line.tags.length > 0 ? `${line.text}   # ${line.tags.join(' # ')}` : line.text);
  for (const side of sideNotes(view)) console.log(`  ${side}`);
  view.choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice}${view.checks[index] === null ? '' : `   # check: ${view.checks[index].skill} ${view.checks[index].level}`}${view.costs[index] === null ? '' : `   # cost: ${view.costs[index]}`}${view.locked[index] ? ' (locked)' : ''}`));
  if (view.ended) console.log('(the quest ended)');
  console.log('');
}

function finish(w) {
  const { live: _live, ...saved } = w.player.quests;
  console.log(`World variables: ${JSON.stringify(saved.world)}`);
  console.log(`Quest variables: ${JSON.stringify(saved.local)}`);
  console.log(saved.session ? `Open at checkpoint ${saved.session.checkpoint}` : 'No quest is open');
  console.log(`Money change: ${w.player.money - startMoney} M`);
  if (values.save) {
    writeFileSync(values.save, `${JSON.stringify(saved, null, 1)}\n`);
    console.log(`Saved the quest state to ${values.save}`);
  }
}

function withoutTerms(text) {
  return text.replace(/<\/?term(=[a-z0-9_-]+)?>/g, '');
}

function termNotes(view, withIds) {
  const terms = new Map();
  for (const text of [...view.lines.map((line) => line.text), ...view.choices]) {
    for (const span of parseMarkup(text)) {
      const id = span.marks.find((mark) => mark.name === 'term')?.value;
      if (id && !terms.has(id)) terms.set(id, span.text);
    }
  }
  return [...terms].map(([id, word]) => `[${withIds ? `term ${id}, ` : ''}hover ${word}: ${termText(id)}]`);
}

function sideNotes(view) {
  return [...view.stats.map((stat) => `[${stat.label}: ${stat.value}]`), ...view.facts.map((fact) => `[fact] ${fact}`), ...termNotes(view, true)];
}
