import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { START_KITS } from '../src/data/start.ts';
import { UNITS } from '../src/data/units.ts';
import { chooseQuestOption, questProblems, questView, restoreQuest, startQuest } from '../src/sim/quests.ts';
import { defaultSetup } from '../src/sim/settings.ts';
import { newWorld } from '../src/sim/world.ts';
import { TEST_MAP } from '../src/test/map.ts';
import { compileSources, readQuestSources } from '../src/test/quest-compile.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { checkpoint: { type: 'string' }, picks: { type: 'string' }, set: { type: 'string', multiple: true }, save: { type: 'string' }, load: { type: 'string' }, play: { type: 'string' }, pick: { type: 'string' } },
});
if (values.pick !== undefined && !values.play) throw new Error('--pick needs --play <file>');
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

function started(w, run = { set: values.set ?? [], checkpoint: values.checkpoint }) {
  for (const assignment of run.set) setVariable(w, assignment);
  const checkpoint = run.checkpoint ?? bundle.quests[id].checkpoints[0];
  return startQuest(w, bundle, id, checkpoint);
}

function played(w, file) {
  const run = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { quest: id, set: values.set ?? [], checkpoint: values.checkpoint, picks: [] };
  if (run.quest !== id) throw new Error(`${file} plays ${run.quest}, not ${id}`);
  const at = run.picks.reduce((next, number) => chooseQuestOption(next, bundle, choiceIndex(next, number)), started(w, run));
  if (values.pick === undefined) {
    show(at);
  } else {
    pick(at, values.pick);
    run.picks.push(values.pick);
  }
  writeFileSync(file, `${JSON.stringify(run)}\n`);
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
  for (const stat of view.stats) console.log(`  [${stat.label}: ${stat.value}]`);
  for (const fact of view.facts) console.log(`  [fact] ${fact}`);
  view.choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice}${view.costs[index] === null ? '' : `   # cost: ${view.costs[index]}`}${view.locked[index] ? ' (locked)' : ''}`));
  if (view.ended) console.log('(the quest ended)');
  console.log('');
}

function finish(w) {
  const { live: _live, ...saved } = w.player.quests;
  console.log(`World variables: ${JSON.stringify(saved.world)}`);
  console.log(`Quest variables: ${JSON.stringify(saved.local)}`);
  console.log(saved.session ? `Open at checkpoint ${saved.session.checkpoint}` : 'No quest is open');
  console.log(`Money change: ${(w.player.money - startMoney) / UNITS.centsPerM} M`);
  if (values.save) {
    writeFileSync(values.save, `${JSON.stringify(saved, null, 1)}\n`);
    console.log(`Saved the quest state to ${values.save}`);
  }
}
