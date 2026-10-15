import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const folder = join(__dirname, '..', '..', 'dashboard');
const read = (name: string) => readFileSync(join(folder, name), 'utf8');
const TYPE_SIZES = ['--text-caption', '--text-dense', '--text-body', '--text-lead', '--text-heading'];

function readRules(css: string): string {
  const root = css.indexOf(':root {');
  const end = css.indexOf('\n}', root);
  if (root < 0 || end < 0) throw new Error('dashboard.css has no :root token block');
  return (css.slice(0, root) + css.slice(end + 2)).replace(/@font-face[^}]*}/g, '').replace(/@media[^{]*\{/g, '');
}
function readTokens(css: string): Map<string, string> {
  const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
  return new Map([...root.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

it('writes raw colors and sizes only in the token block', () => {
  const rules = readRules(read('dashboard.css'));
  expect(rules.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? []).toEqual([]);
  expect(rules.match(/(?<![\w-])(?!1px|2px)\d+(?:\.\d+)?px/g) ?? []).toEqual([]);
});

it('sets every font size from the type scale', () => {
  const css = read('dashboard.css');
  const sizes = [...readRules(css).matchAll(/font(?:-size)?:\s*([^;}]+)/g)].map((match) => match[1]);
  const unknown = sizes.filter((value) => value !== 'inherit' && !TYPE_SIZES.some((token) => value.includes(`var(${token})`)));
  expect(unknown).toEqual([]);
  for (const token of TYPE_SIZES) expect(readTokens(css).has(token)).toBe(true);
});

it('keeps raw colors out of the page script and markup', () => {
  expect(read('dashboard.js').match(/['"]#[0-9a-f]{3,8}['"]/gi) ?? []).toEqual([]);
  expect(read('index.html')).not.toMatch(/style=/);
});

it('explains values only through the shared tooltip and writes no arrow marks', () => {
  expect(read('index.html')).not.toMatch(/\stitle=/);
  expect(read('dashboard.js')).not.toMatch(/\.title\s*=/);
  for (const name of ['index.html', 'dashboard.js']) expect(read(name)).not.toMatch(/[←→↗↘↖↙⇒]/);
});
