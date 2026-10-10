import { describe, expect, it } from 'vitest';
import BUNDLE from '../data/quests.json';
import { parseBundle } from '../sim/quests';
import { compileBundle, compileQuest, compileSources, readQuestSources, withEnglishTwins, type QuestSources } from './quest-compile';

const WORLD = 'VAR heard = false\nEXTERNAL money()\n';

function sources(quest: string): QuestSources {
  return { 'world.ink': WORLD, 'q.ink': `INCLUDE world.ink\n${quest}` };
}

function compile(given: QuestSources): ReturnType<typeof compileQuest> {
  const result = compileQuest('q', withEnglishTwins(given), false);
  return { ...result, errors: result.errors.filter((e) => !e.startsWith('ru/')) };
}

describe('the quest bundle', () => {
  it('matches the ink sources, so npm run quests:build ran after the last edit', () => {
    expect(compileBundle(readQuestSources('src/data/quests')), 'quests.json is stale. Run npm run quests:build').toEqual(BUNDLE);
  });

  it('parses into the typed bundle the game reads', () => {
    expect(parseBundle(BUNDLE).quests.bowl_hattie.checkpoints).toEqual(['start', 'start.hub']);
  });

  it('rejects a bundle variable whose initial value does not match its type', () => {
    const bad = { world: { heard: { type: 'boolean', init: 1 } }, externals: [], quests: {} };
    expect(() => parseBundle(bad)).toThrow('Variable heard of world has a bad declaration');
  });
});

describe('quest top tags', () => {
  const headed = (header: string, quest: string): QuestSources => ({ 'world.ink': WORLD, 'q.ink': `${header}\nINCLUDE world.ink\n${quest}` });
  const BODY = 'VAR watches = 3\nVAR alarm = 0\nVAR seen = false\n=== start ===\n# checkpoint: start\nHi.\n-> END\n';

  it('reads the view, stats and facts from the top of the file', () => {
    const { quest, errors } = compile(headed('# view: page\n# stat: watches Watches\n# stat: alarm Talk: quiet, loud\n# stat: money Money\n# fact: seen Seen: a <b>scar</b>.', BODY));
    expect(errors).toEqual([]);
    expect(quest?.view).toBe('page');
    expect(quest?.text.en).toMatchObject({
      stats: [
        { name: 'watches', label: 'Watches', words: null },
        { name: 'alarm', label: 'Talk', words: ['quiet', 'loud'] },
        { name: 'money', label: 'Money', words: null },
      ],
      facts: [{ name: 'seen', text: 'Seen: a <b>scar</b>.' }],
    });
  });

  it('fails top tags written below the include, which ink would ignore', () => {
    expect(compile(sources(`# view: page\n${BODY}`)).errors).toEqual([expect.stringContaining('Put them all at the very top, above INCLUDE world.ink')]);
  });

  it('gives a quest with no top tags the talk view', () => {
    expect(compile(sources(BODY)).quest).toMatchObject({ view: 'talk', text: { en: { stats: [], facts: [] } } });
  });

  it('fails an unknown tag, a bad view, a stat on no number and a fact on no true or false variable', () => {
    expect(compile(headed('# mood: grim', BODY)).errors).toEqual([expect.stringContaining('# mood: grim is unknown')]);
    expect(compile(headed('# view: scroll', BODY)).errors).toEqual([expect.stringContaining('# view: scroll needs one of talk, page')]);
    expect(compile(headed('# stat: seen Seen', BODY)).errors).toEqual([expect.stringContaining('# stat: seen needs a number variable')]);
    expect(compile(headed('# stat: nothing Nothing', BODY)).errors).toEqual([expect.stringContaining('# stat: nothing needs a number variable')]);
    expect(compile(headed('# fact: watches Watches.', BODY)).errors).toEqual([expect.stringContaining('# fact: watches needs a true or false variable')]);
  });
});

describe('compileQuest', () => {
  it('splits world variables from the quest own variables', () => {
    const { quest } = compile(sources('VAR trust = 2\nVAR name = "Hattie"\n=== start ===\n# checkpoint: start\nHi.\n-> END\n'));
    expect(quest?.vars).toEqual({ name: { type: 'string', init: 'Hattie' }, trust: { type: 'number', init: 2 } });
  });

  it('lists knots and stitches whose checkpoint tag names them', () => {
    const { quest } = compile(sources('=== start ===\n# checkpoint: start\nHi.\n-> talk\n= talk\n# checkpoint: start.talk\nYo.\n-> END\n= aside\nNo tag.\n-> END\n'));
    expect(quest?.checkpoints).toEqual(['start', 'start.talk']);
  });

  it('fails a checkpoint tag that names another section', () => {
    const { quest, errors } = compile(sources('=== start ===\n# checkpoint: begin\nHi.\n-> END\n'));
    expect(quest).toBeNull();
    expect(errors).toEqual(['Section start carries the checkpoint tag of begin. A checkpoint tag names its own section.']);
  });

  it('fails a list variable, which a save cannot hold', () => {
    const { errors } = compile(sources('LIST moods = calm, angry\n=== start ===\nHi.\n-> END\n'));
    expect(errors).toEqual(['List moods cannot be saved. Use int, float, bool or string variables.']);
  });

  it('fails a once-only choice and a visit count read, which a load resets', () => {
    const { quest, errors } = compile(sources('=== start ===\n# checkpoint: start\n* [Once.] -> start\n+ {start > 1} [Again.] -> END\n+ {TURNS_SINCE(-> start) > 0} [Later.] -> END\n'));
    expect(quest).toBeNull();
    expect(errors).toEqual([
      'Line 4: a once-only * choice comes back after a load. Use a sticky + choice with a variable guard.',
      'Line 5: start reads a visit count, which a load resets. Keep the fact in a variable.',
      'Line 6: TURNS_SINCE reads a visit count, which a load resets. Keep the fact in a variable.',
    ]);
  });

  it('reports an ink error with its file and line', () => {
    const { quest, errors } = compile(sources('=== start ===\nHi.\n-> nowhere\n'));
    expect(quest).toBeNull();
    expect(errors.join('\n')).toMatch(/q\.ink.*line 4.*nowhere/);
  });

  it('keeps the English and the Russian text of a quest apart', () => {
    const en = '# fact: seen Seen it.\nINCLUDE world.ink\nVAR seen = false\n=== start ===\n# checkpoint: start\nHi.\n-> END\n';
    const ru = en.replace('Seen it.', 'Видно.').replace('Hi.', 'Привет.');
    const { quest, errors } = compileQuest('q', { 'world.ink': WORLD, 'q.ink': en, 'ru/q.ink': ru }, false);
    expect(errors).toEqual([]);
    expect(quest?.text.en.facts).toEqual([{ name: 'seen', text: 'Seen it.' }]);
    expect(quest?.text.ru.facts).toEqual([{ name: 'seen', text: 'Видно.' }]);
    expect(quest?.text.ru.story).toContain('Привет.');
  });

  it('fails a quest with no Russian twin, and a twin with no English quest', () => {
    const body = 'INCLUDE world.ink\n=== start ===\nHi.\n-> END\n';
    expect(compileQuest('q', { 'world.ink': WORLD, 'q.ink': body }, false).errors).toEqual(['ru/q.ink: No source file ru/q.ink']);
    expect(compileSources({ 'world.ink': WORLD, 'ru/stray.ink': body }, false).errors).toEqual(['ru/stray.ink: no English quest of that name']);
  });

  it('fails a Russian twin whose variables, checkpoints, view, stats or facts differ from the English', () => {
    const en = '# view: page\n# stat: watches Watches\n# fact: seen Seen.\nINCLUDE world.ink\nVAR watches = 3\nVAR seen = false\n=== start ===\n# checkpoint: start\nHi.\n-> END\n';
    const errorsOf = (ru: string) => compileQuest('q', { 'world.ink': WORLD, 'q.ink': en, 'ru/q.ink': ru }, false).errors.join('\n');
    expect(errorsOf(en.replace('VAR watches = 3', 'VAR watches = 4'))).toMatch(/ru\/q\.ink: its variables part does not match/);
    expect(errorsOf(en.replace('# checkpoint: start\n', ''))).toMatch(/ru\/q\.ink: its checkpoints part does not match/);
    expect(errorsOf(en.replace('# view: page\n', ''))).toMatch(/ru\/q\.ink: its view part does not match/);
    expect(errorsOf(en.replace('# stat: watches Watches\n', ''))).toMatch(/ru\/q\.ink: its stats part does not match/);
    expect(errorsOf(en.replace('# fact: seen Seen.\n', ''))).toMatch(/ru\/q\.ink: its facts part does not match/);
  });

  it('fails an include of a file that is no quest source', () => {
    const { errors } = compile({ 'world.ink': WORLD, 'q.ink': 'INCLUDE missing.ink\n=== start ===\nHi.\n-> END\n' });
    expect(errors.join('\n')).toContain('INCLUDE names missing.ink, which is no quest source');
  });
});
