import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function tokenValue(name: string): string {
  const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token ${name} is missing`);
  return match[1];
}

function topLevelLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) {
      layers.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers;
}

describe('screen glass', () => {
  const layers = topLevelLayers(tokenValue('hud-screen-glass'));

  it('keeps every glass layer inside the brass rim', () => {
    const glass = layers.slice(0, -1);
    expect(glass).toHaveLength(4);
    for (const layer of glass) expect(layer).toContain('var(--hud-screen-inset) var(--hud-screen-inset) no-repeat');
  });

  it('puts a full-size brass underlay under the rim', () => {
    expect(layers.at(-1)).toBe('linear-gradient(var(--hud-brass), var(--hud-brass))');
  });

  it('insets by the rim on both sides', () => {
    expect(tokenValue('hud-screen-inset')).toBe('calc(100% - 2 * var(--hud-screen-rim))');
  });
});
