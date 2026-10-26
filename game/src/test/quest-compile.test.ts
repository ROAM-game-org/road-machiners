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

  it('lists each picture once in the order the source first shows it', () => {
    const { quest } = compile(sources('=== start ===\nRim. # img: rim\nShed. # page # img: shed\nRim again. # img: rim\n-> END\n'));
    expect(quest?.art).toEqual(['rim', 'shed']);
  });

  it('gives each checkpoint the picture and place shown above it, so a load restores them', () => {
    const { quest } = compile(sources('=== start ===\n# checkpoint: start\nRim. # place: The rim # img: rim\n-> hub\n= hub\n# checkpoint: start.hub\n+ [Go.]\n  -> END\n'));
    expect(quest?.text.en.scenes).toEqual({ start: { img: null, place: null }, 'start.hub': { img: 'rim', place: 'The rim' } });
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

  it('fails a Russian twin whose variables, checkpoints, view, art, stats or facts differ from the English', () => {
    const en = '# view: page\n# stat: watches Watches\n# fact: seen Seen.\nINCLUDE world.ink\nVAR watches = 3\nVAR seen = false\n=== start ===\n# checkpoint: start\nHi. # img: rim\n-> END\n';
    const errorsOf = (ru: string) => compileQuest('q', { 'world.ink': WORLD, 'q.ink': en, 'ru/q.ink': ru }, false).errors.join('\n');
    expect(errorsOf(en.replace('VAR watches = 3', 'VAR watches = 4'))).toMatch(/ru\/q\.ink: its variables part does not match/);
    expect(errorsOf(en.replace('# checkpoint: start\n', ''))).toMatch(/ru\/q\.ink: its checkpoints part does not match/);
    expect(errorsOf(en.replace('# view: page\n', ''))).toMatch(/ru\/q\.ink: its view part does not match/);
    expect(errorsOf(en.replace(' # img: rim', ''))).toMatch(/ru\/q\.ink: its art part does not match/);
    expect(errorsOf(en.replace('# stat: watches Watches\n', ''))).toMatch(/ru\/q\.ink: its stats part does not match/);
    expect(errorsOf(en.replace('# fact: seen Seen.\n', ''))).toMatch(/ru\/q\.ink: its facts part does not match/);
  });

  it('fails an include of a file that is no quest source', () => {
    const { errors } = compile({ 'world.ink': WORLD, 'q.ink': 'INCLUDE missing.ink\n=== start ===\nHi.\n-> END\n' });
    expect(errors.join('\n')).toContain('INCLUDE names missing.ink, which is no quest source');
  });
});

describe('quest links', () => {
  const LINK_WORLD = 'VAR thief = "none"\nVAR seen = false\nVAR count = 0\nEXTERNAL note(id)\nEXTERNAL has_note(id)\nEXTERNAL begin(quest)\n';
  const linked = (body: string, header = '') => compile({ 'world.ink': LINK_WORLD, 'q.ink': `${header}INCLUDE world.ink\nVAR mine = 0\n=== start ===\n${body}\n-> END\n` });

  it('lists the world variables a quest reads, the plain values it writes, the notes it gives and tests and the quests it begins', () => {
    const { quest, errors } = linked('{thief == "pell": Pell.}\n~ thief = "vance"\n~ thief = "pell"\n~ seen = true\n~ mine = 2\n~ note("wagonBowl")\n{has_note("greenPit"): Pit.}\n~ begin("other")');
    expect(errors).toEqual([]);
    expect(quest?.links).toEqual({ reads: ['thief'], readsNotes: ['greenPit'], writes: { seen: [true], thief: ['pell', 'vance'] }, notes: ['wagonBowl'], begins: ['other'] });
  });

  it('counts a stat or fact on a world variable as a read', () => {
    const { quest } = linked('Hi.', '# stat: count Count\n# fact: seen Seen it.\n');
    expect(quest?.links.reads).toEqual(['count', 'seen']);
  });

  it('fails a world variable given a worked out value, since a repair could not tell who wrote it', () => {
    expect(linked('~ thief = "x{mine}"').errors).toEqual([expect.stringContaining('world variable thief gets a value worked out in play')]);
    expect(linked('~ count = mine').errors).toEqual([expect.stringContaining('world variable count gets a value worked out in play')]);
  });

  it('fails a note, has_note or begin call on anything but one plain id', () => {
    expect(linked('~ note(thief)').errors).toEqual([expect.stringContaining('note() needs one plain text id')]);
    expect(linked('{has_note(thief): x}').errors).toEqual([expect.stringContaining('has_note() needs one plain text id')]);
    expect(linked('~ begin("a{mine}")').errors).toEqual([expect.stringContaining('begin() needs one plain text id')]);
  });

  it('reads the revision tag, which starts at 1', () => {
    expect(linked('Hi.').quest?.revision).toBe(1);
    expect(linked('Hi.', '# revision: 3\n').quest?.revision).toBe(3);
    expect(linked('Hi.', '# revision: 0\n').errors).toEqual([expect.stringContaining('# revision: 0 needs a whole number from 1 up')]);
    expect(linked('Hi.', '# revision: two\n').errors).toEqual([expect.stringContaining('# revision: two needs a whole number')]);
  });

  it('fails a Russian twin with another revision or other links', () => {
    const en = `INCLUDE world.ink\n=== start ===\n~ thief = "pell"\n-> END\n`;
    const errorsOf = (ru: string) => compileQuest('q', { 'world.ink': LINK_WORLD, 'q.ink': en, 'ru/q.ink': ru }, false).errors.join('\n');
    expect(errorsOf(`# revision: 2\n${en}`)).toMatch(/ru\/q\.ink: its revision part does not match/);
    expect(errorsOf(en.replace('"pell"', '"vance"'))).toMatch(/ru\/q\.ink: its links part does not match/);
  });

  it('links the shipped quests the way their ink does', () => {
    const quests = parseBundle(BUNDLE).quests;
    expect(quests.wagon_bench.links.writes.wagon_fate).toEqual(['admitted', 'buried', 'logged']);
    expect(quests.nose_kovac.links.begins).toEqual(['nose_depot_leak']);
    expect(Object.values(quests).every((q) => q.revision >= 1)).toBe(true);
  });

  it('rejects a bundle whose links name an undeclared variable, an unknown note or an unknown quest', () => {
    const withLinks = (links: object) => ({ ...BUNDLE, quests: { ...BUNDLE.quests, bowl_ruben: { ...BUNDLE.quests.bowl_ruben, links: { ...BUNDLE.quests.bowl_ruben.links, ...links } } } });
    expect(() => parseBundle(withLinks({ reads: ['nowhere'] }))).toThrow('links to world variable nowhere');
    expect(() => parseBundle(withLinks({ notes: ['noSuchNote'] }))).toThrow('links to note noSuchNote');
    expect(() => parseBundle(withLinks({ begins: ['no_quest'] }))).toThrow('begins no_quest, which is no quest');
    expect(() => parseBundle(withLinks({ writes: { wagon_seen: ['yes'] } }))).toThrow('writes a value of the wrong type to wagon_seen');
  });
});
