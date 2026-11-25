import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isPacked, packLayout, writePacks } from '../../scripts/public-packs.mjs';

const roots: string[] = [];

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'public-packs-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('packLayout', () => {
  it('places the members of a packed folder end to end in sorted order', () => {
    const pub = tree({ 'models/b.glb': 'BBB', 'models/a.glb': 'AA', 'hud/x.webp': 'X' });

    const layout = packLayout(pub);

    expect(layout['models/a.glb']).toMatchObject({ offset: 0, length: 2 });
    expect(layout['models/b.glb']).toMatchObject({ offset: 2, length: 3 });
    expect(layout['models/a.glb'].pack).toBe(layout['models/b.glb'].pack);
    expect(layout['hud/x.webp']).toBeUndefined();
  });

  it('gives each packed folder its own pack', () => {
    const pub = tree({ 'models/a.glb': 'A', 'sfx/a.ogg': 'S', 'sfx-m4a/a.m4a': 'M' });

    const packs = new Set(Object.values(packLayout(pub)).map((slice) => slice.pack.split('?')[0]));

    expect(packs).toEqual(new Set(['packs/models.pack', 'packs/sfx.pack', 'packs/sfx-m4a.pack']));
  });

  it('changes the pack version when one member byte changes', () => {
    const before = packLayout(tree({ 'models/a.glb': 'AAAA' }))['models/a.glb'].pack;
    const after = packLayout(tree({ 'models/a.glb': 'AAAB' }))['models/a.glb'].pack;

    expect(after).not.toBe(before);
  });

  it('refuses a folder nested inside a packed folder', () => {
    const pub = tree({ 'models/deep/a.glb': 'A' });

    expect(() => packLayout(pub)).toThrow('models/deep');
  });
});

describe('writePacks', () => {
  it('writes each member at its offset and removes the loose packed folders', () => {
    const pub = tree({ 'models/a.glb': 'AA', 'models/b.glb': 'BBB', 'hud/x.webp': 'X' });
    const out = tree({ 'models/a.glb': 'AA', 'models/b.glb': 'BBB', 'hud/x.webp': 'X' });
    const layout = packLayout(pub);

    writePacks(pub, out, layout);

    const pack = readFileSync(join(out, 'packs/models.pack'));
    const slice = layout['models/b.glb'];
    expect(pack.subarray(slice.offset, slice.offset + slice.length).toString()).toBe('BBB');
    expect(existsSync(join(out, 'models'))).toBe(false);
    expect(readdirSync(join(out, 'hud'))).toEqual(['x.webp']);
  });
});

describe('isPacked', () => {
  it('names files whose top folder is packed', () => {
    expect(isPacked('sfx/a.ogg')).toBe(true);
    expect(isPacked('survey/a.webp')).toBe(false);
  });
});
