import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { excerpt, groundWith, passageLink, readWiki, searchWiki, WIKI_DIR } from './wiki';

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

describe('readWiki', () => {
  it('keeps prose under its page title and heading, with numbers filled in, and skips tables, code and generated blocks', () => {
    const passages = readWiki(tempWiki({ 'mechanics/winch.md': PAGE }));
    expect(passages).toEqual([
      { page: 'mechanics/winch.md', title: 'Winches', heading: 'Winches', anchor: '', text: 'What a winch does. The principles are in DESIGN.md.' },
      { page: 'mechanics/winch.md', title: 'Winches', heading: 'Pulling free', anchor: 'pulling-free', text: 'A winch pulls a stuck truck free in 3 turns. It needs a tree or a wreck within 20 tiles.' },
    ]);
  });

  it('reads a page added to the wiki with no change to the factory', () => {
    const dir = tempWiki({ 'items.md': '# Items\n\nA crate weighs 50 kg.\n' });
    writeFileSync(join(dir, 'radio.md'), '# Radio\n\n## Calling a town\n\nA call to a town costs one turn of the radio.\n');
    const found = searchWiki(readWiki(dir), 'how do I call a town on the radio?', 5);
    expect(found.map((passage) => [passage.page, passage.heading])).toEqual([['radio.md', 'Calling a town']]);
  });

  it('gives every page of the game wiki at least one passage', () => {
    const pages = new Set(readWiki(WIKI_DIR).map((passage) => passage.page));
    expect(markdownPages(WIKI_DIR).filter((page) => !pages.has(page))).toEqual([]);
  });
});

describe('searchWiki', () => {
  const passages = readWiki(tempWiki({
    'truck.md': '# Truck\n\n## Repair\n\nA field repair patches a broken part to half its HP.\n\n## Mass\n\nMass slows the truck on hills.\n',
    'economy.md': '# Economy\n\nShops buy goods at half their value.\n',
  }));

  it('ranks the passages that share the rarest words with the question first, counting the page title and heading', () => {
    expect(searchWiki(passages, 'How do I repair the truck?', 5).map((passage) => passage.heading)).toEqual(['Repair', 'Mass']);
  });

  it('finds nothing for a question that shares no word with the wiki', () => {
    expect(searchWiki(passages, 'When is the next release?', 5)).toEqual([]);
  });

  it('keeps at most the limit', () => {
    expect(searchWiki(passages, 'truck repair mass shops', 2)).toHaveLength(2);
  });
});

describe('groundWith', () => {
  const dir = tempWiki({ 'truck.md': '# Truck\n\n## Repair\n\nA field repair patches a broken part to half its HP.\n' });

  it('returns the passage the pick names and shows the pick only the candidates', async () => {
    const seen: string[][] = [];
    const ground = groundWith(async (_question, candidates) => { seen.push(candidates); return 0; }, dir);
    expect(await ground('how do I repair a broken part?')).toMatchObject({ heading: 'Repair' });
    expect(seen).toEqual([['Truck, Repair: A field repair patches a broken part to half its HP.']]);
  });

  it('returns no passage when the pick finds none that states the answer', async () => {
    expect(await groundWith(async () => null, dir)('how much does a repair cost in the Bowl?')).toBeNull();
  });

  it('throws when the wiki has no passages, so a broken deploy never reads as no answer', async () => {
    await expect(groundWith(async () => 0, tempWiki({}))('how do I repair?')).rejects.toThrow('has no passages');
  });

  it('skips the pick when no passage shares a word with the question', async () => {
    let calls = 0;
    expect(await groundWith(async () => { calls += 1; return 0; }, dir)('when is the next release?')).toBeNull();
    expect(calls).toBe(0);
  });
});

describe('links and excerpts', () => {
  it('links a passage to its section on main', () => {
    const passage = { page: 'mechanics/truck.md', title: 'Truck', heading: 'Field repair', anchor: 'field-repair', text: 'x' };
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
