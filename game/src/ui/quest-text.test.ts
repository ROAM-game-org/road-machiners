import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { QUEST_ART } from '../data/quest-art';
import { TERM_IDS } from '../data/locals';
import { lineStyle, markupProblems, parseMarkup, PLAIN_STYLE, revealUnits, rowCells, termRuns } from './quest-text';

describe('parseMarkup', () => {
  it('splits a line into spans carrying their marks, nested ones included', () => {
    expect(parseMarkup('He <b>leans <color=rust>in</color></b> slowly.')).toEqual([
      { text: 'He ', marks: [], pauses: 0 },
      { text: 'leans ', marks: [{ name: 'b', value: null }], pauses: 0 },
      { text: 'in', marks: [{ name: 'b', value: null }, { name: 'color', value: 'rust' }], pauses: 0 },
      { text: ' slowly.', marks: [], pauses: 0 },
    ]);
  });

  it('keeps plain text whole', () => {
    expect(parseMarkup('Just words.')).toEqual([{ text: 'Just words.', marks: [], pauses: 0 }]);
  });

  it('fails unknown, unclosed, crossed and badly valued markup', () => {
    expect(() => parseMarkup('<blink>x</blink>')).toThrow('Unknown markup <blink>');
    expect(() => parseMarkup('<b>x')).toThrow('Markup <b> is never closed');
    expect(() => parseMarkup('<b><i>x</b></i>')).toThrow('Markup </b> closes <i>');
    expect(() => parseMarkup('<color=pink>x</color>')).toThrow('Markup <color=pink> needs one of');
    expect(() => parseMarkup('<b=big>x</b>')).toThrow('Markup <b> takes no value');
    expect(() => parseMarkup('x<pause>')).toThrow('Markup <pause> has no text after it');
    expect(() => parseMarkup('<pause=long>x')).toThrow('Markup <pause> takes no value');
  });

  it('takes a term only from the glossary', () => {
    const id = TERM_IDS[0];
    expect(parseMarkup(`In <term=${id}>town</term>.`)[1]).toEqual({ text: 'town', marks: [{ name: 'term', value: id }], pauses: 0 });
    expect(() => parseMarkup('<term=atlantis>x</term>')).toThrow('Markup <term=atlantis> needs one of');
  });
});

describe('termRuns', () => {
  it('groups the words of one term and leaves other words alone', () => {
    const [first, second] = TERM_IDS;
    const units = revealUnits(parseMarkup(`The <term=${first}>Glass Flats</term> and <term=${second}>Nose</term>`), lineStyle(['reveal:word']), 0);
    expect(termRuns(units).map((run) => [run.term, run.units.map((u) => u.text).join('')])).toEqual([
      [null, 'The '],
      [first, 'Glass Flats'],
      [null, ' '],
      [null, 'and '],
      [second, 'Nose'],
    ]);
  });
});

describe('lineStyle', () => {
  it('reads reveal, speed, speaker, place and flags from line tags', () => {
    expect(lineStyle(['reveal:char', 'speed:slow', 'speaker:Hattie', 'place: Fuel shed', 'work_offer', 'page'])).toEqual({
      reveal: 'char',
      speed: 'slow',
      img: null,
      speaker: 'Hattie',
      place: 'Fuel shed',
      flags: ['work_offer', 'page'],
    });
  });

  it('takes art only from the art list', () => {
    QUEST_ART.test_gate = { file: 'gate.webp', focusX: 50, focusY: 50 };
    try {
      expect(lineStyle(['img: test_gate']).img).toBe('test_gate');
      expect(() => lineStyle(['img: test_wall'])).toThrow(/Line tag # img: test_wall needs one of .*test_gate/);
    } finally {
      delete QUEST_ART.test_gate;
    }
  });

  it('gives an untagged line the plain style', () => {
    expect(lineStyle([])).toEqual(PLAIN_STYLE);
  });

  it('fails an unknown tag, a bad value and art that does not exist', () => {
    expect(() => lineStyle(['glow'])).toThrow('Unknown line tag # glow');
    expect(() => lineStyle(['reveal:fade'])).toThrow('Line tag # reveal:fade needs one of all, word, char');
    expect(() => lineStyle(['img:wagon'])).toThrow(`Line tag # img:wagon needs one of ${Object.keys(QUEST_ART).join(', ')}`);
  });
});

describe('rowCells', () => {
  it('splits a table row line at semicolons, keeping an empty first cell', () => {
    expect(rowCells('; Sabine; Depot pump')).toEqual(['', 'Sabine', 'Depot pump']);
    expect(rowCells('3rd;2 cans ;Pell')).toEqual(['3rd', '2 cans', 'Pell']);
  });
});

describe('markupProblems', () => {
  it('lists every problem of a line without throwing', () => {
    expect(markupProblems('<b>x', ['glow'])).toEqual([expect.stringContaining('never closed'), expect.stringContaining('Unknown line tag')]);
    expect(markupProblems('<pop>BAM</pop> it fell.', ['reveal:word'])).toEqual([]);
  });
});

describe('revealUnits', () => {
  it('reveals word by word, each word with its trailing space and its marks', () => {
    const units = revealUnits(parseMarkup('A <pop>BIG</pop> door'), lineStyle(['reveal:word']), 100);
    expect(units.map((u) => [u.text, u.delayMs, u.marks.map((m) => m.name)])).toEqual([
      ['A ', 100, []],
      ['BIG', 100 + CONFIG.questWordMs, ['pop']],
      [' ', 100 + 2 * CONFIG.questWordMs, []],
      ['door', 100 + 3 * CONFIG.questWordMs, []],
    ]);
  });

  it('reveals char by char, slower at slow speed', () => {
    const units = revealUnits(parseMarkup('ab'), lineStyle(['reveal:char', 'speed:slow']), 0);
    expect(units.map((u) => u.delayMs)).toEqual([0, 2 * CONFIG.questCharMs]);
  });

  it('shows a whole line at once with reveal all', () => {
    const units = revealUnits(parseMarkup('one <b>two</b>'), lineStyle(['reveal:all']), 40);
    expect(units.map((u) => u.delayMs)).toEqual([40, 40]);
  });

  it('holds every word after a pause back by the pause', () => {
    const units = revealUnits(parseMarkup('And then, <pause>slowly, <pause>it settles.'), lineStyle(['reveal:word']), 0);
    const word = CONFIG.questWordMs;
    const pause = CONFIG.questPauseMs;
    expect(units.map((u) => [u.text, u.delayMs])).toEqual([
      ['And ', 0],
      ['then, ', word],
      ['slowly, ', 2 * word + pause],
      ['it ', 3 * word + 2 * pause],
      ['settles.', 4 * word + 2 * pause],
    ]);
  });

  it('shows now text at once and reveals the rest of the line after it', () => {
    const units = revealUnits(parseMarkup('<now>You twist the key.</now> It quits.'), lineStyle(['reveal:char']), 0);
    expect(units.slice(0, 3).map((u) => [u.text, u.delayMs])).toEqual([
      ['You twist the key.', 0],
      [' ', CONFIG.questCharMs],
      ['I', 2 * CONFIG.questCharMs],
    ]);
  });
});
