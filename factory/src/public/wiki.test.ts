import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_DIR, excerpt, passageLink, readDocs, searchDocs } from './wiki';

const PAGE = `# Winches

What a winch does. The principles are in [DESIGN.md](../DESIGN.md).

## Pulling free

A winch pulls a stuck truck free in \`RULES.winchTurns\` turns. It needs a tree or a wreck within 20 tiles.

| part | cells |
| --- | --- |
| winch | 2 |

\`\`\`
winch.pull()
\`\`\`

<!-- wiki:winch-table -->
| winch | cost |
| --- | --- |
| light | 300 |
<!-- /wiki:winch-table -->

## Numbers

<!-- wiki:numbers -->
| path | value |
| --- | --- |
| \`RULES.winchTurns\` | 3 |
<!-- /wiki:numbers -->
`;

function tempWiki(pages: Record<string, string>): string {
  const dir = mkdtempSync('tmp/wiki-');
  for (const [path, text] of Object.entries(pages)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function markdownPages(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.md')).map((path) => path.split(sep).join('/')).sort();
}

describe('readDocs', () => {
  it('keeps prose under its page title and heading with numbers filled in, gives each table row with its header, and skips code and the numbers block', () => {
    const passages = readDocs(tempWiki({ 'wiki/mechanics/winch.md': PAGE }));
    const section = { page: 'wiki/mechanics/winch.md', title: 'Winches', heading: 'Pulling free', anchor: 'pulling-free' };
    expect(passages).toEqual([
      { page: 'wiki/mechanics/winch.md', title: 'Winches', heading: 'Winches', anchor: '', text: 'What a winch does. The principles are in DESIGN.md.' },
      { ...section, text: 'A winch pulls a stuck truck free in 3 turns. It needs a tree or a wreck within 20 tiles.' },
      { ...section, text: 'part: winch; cells: 2' },
      { ...section, text: 'winch: light; cost: 300' },
    ]);
  });

  it('reads a page added to the wiki with no change to the factory', () => {
    const dir = tempWiki({ 'items.md': '# Items\n\nA crate weighs 50 kg.\n' });
    writeFileSync(join(dir, 'radio.md'), '# Radio\n\n## Calling a town\n\nA call to a town costs one turn of the radio.\n');
    const found = searchDocs(readDocs(dir), 'how do I call a town on the radio?', 5);
    expect(found.map((passage) => [passage.page, passage.heading])).toEqual([['radio.md', 'Calling a town']]);
  });

  it('gives every page of the game docs at least one passage, the wiki and the design notes alike', () => {
    const pages = new Set(readDocs(DOCS_DIR).map((passage) => passage.page));
    expect(markdownPages(DOCS_DIR).filter((page) => !pages.has(page))).toEqual([]);
  });
});

describe('searchDocs', () => {
  const passages = readDocs(tempWiki({
    'truck.md': '# Truck\n\n## Repair\n\nA field repair patches a broken part to half its HP.\n\n## Mass\n\nMass slows the truck on hills.\n',
    'economy.md': '# Economy\n\nShops buy goods at half their value.\n',
  }));

  it('ranks the passages that share the rarest words with the question first, counting the page title and heading', () => {
    expect(searchDocs(passages, 'How do I repair the truck?', 5).map((passage) => passage.heading)).toEqual(['Repair', 'Mass']);
  });

  it('finds nothing for a question that shares no word with the wiki', () => {
    expect(searchDocs(passages, 'When is the next release?', 5)).toEqual([]);
  });

  it('keeps at most the limit', () => {
    expect(searchDocs(passages, 'truck repair mass shops', 2)).toHaveLength(2);
  });
});

describe('links and excerpts', () => {
  it('links a passage to its section on main', () => {
    const passage = { page: 'wiki/mechanics/truck.md', title: 'Truck', heading: 'Field repair', anchor: 'field-repair', text: 'x' };
    expect(passageLink('o/r', passage)).toBe('https://github.com/o/r/blob/main/game/docs/wiki/mechanics/truck.md#field-repair');
    expect(passageLink('o/r', { ...passage, anchor: '' })).toBe('https://github.com/o/r/blob/main/game/docs/wiki/mechanics/truck.md');
  });

  it('cuts a long passage at the last sentence that fits', () => {
    const text = `${'A short sentence. '.repeat(40)}`.trim();
    const cut = excerpt(text, 100);
    expect(cut.length).toBeLessThanOrEqual(101);
    expect(cut).toMatch(/sentence\. …$/);
    expect(excerpt('Short.', 100)).toBe('Short.');
  });
});
