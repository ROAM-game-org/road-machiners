import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QUEST_ART } from './quest-art';

describe('quest art', () => {
  it('has a file in public/quest-art/ for every picture', () => {
    const missing = Object.entries(QUEST_ART)
      .filter(([, art]) => !existsSync(`public/quest-art/${art.file}`))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it('gives every picture a whole-percent focus point', () => {
    const bad = Object.entries(QUEST_ART)
      .filter(([, art]) => [art.focusX, art.focusY].some((n) => !Number.isInteger(n) || n < 0 || n > 100))
      .map(([key]) => key);
    expect(bad).toEqual([]);
  });

  it('draws its crop sheet with the numbers the page uses', () => {
    const css = readFileSync('src/ui/tokens.css', 'utf8');
    const python = readFileSync('tools/quest-art/crops.py', 'utf8');
    const cssValue = (name: string) => {
      const found = css.match(new RegExp(`${name}:\\s*([^;]+);`));
      if (!found) throw new Error(`tokens.css has no ${name}`);
      return found[1]!.trim();
    };
    const pyValue = (name: string) => {
      const found = python.match(new RegExp(`^${name} = (.+)$`, 'm'));
      if (!found) throw new Error(`crops.py has no ${name}`);
      return found[1]!.trim();
    };
    const ratio = (text: string) => {
      const [across, down] = text.split('/').map((n) => parseFloat(n));
      return down === undefined ? across! : across! / down;
    };
    expect(ratio(pyValue('COLUMN_RATIO'))).toBeCloseTo(ratio(cssValue('--quest-frame-column')));
    expect(ratio(pyValue('BAND_RATIO'))).toBeCloseTo(ratio(cssValue('--quest-frame-band')));
    expect(parseFloat(pyValue('ZOOM'))).toBe(parseFloat(cssValue('--quest-art-zoom')));
    expect(parseFloat(pyValue('TALK_WIDTH'))).toBe(parseFloat(cssValue('--panel-s')));
  });
});
