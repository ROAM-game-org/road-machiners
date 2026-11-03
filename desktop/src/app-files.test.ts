import { describe, expect, it } from 'vitest';
import { fileForUrl, mimeOf } from './app-files';

const ROOT = '/opt/roam/dist';

describe('app files', () => {
  it('maps a path under the root to a file', () => {
    expect(fileForUrl(ROOT, 'app://game/assets/main.js')).toBe('/opt/roam/dist/assets/main.js');
  });

  it('serves index.html for the root', () => {
    expect(fileForUrl(ROOT, 'app://game/')).toBe('/opt/roam/dist/index.html');
  });

  it('keeps dot segments the URL parser folds inside the root', () => {
    expect(fileForUrl(ROOT, 'app://game/../secret')).toBe('/opt/roam/dist/secret');
    expect(fileForUrl(ROOT, 'app://game/%2e%2e/secret')).toBe('/opt/roam/dist/secret');
  });

  it('refuses an encoded slash that climbs out of the root after decoding', () => {
    expect(fileForUrl(ROOT, 'app://game/..%2f..%2fsecret')).toBeNull();
    expect(fileForUrl(ROOT, 'app://game/a%2f..%2f..%2f..%2fsecret')).toBeNull();
    expect(fileForUrl(ROOT, 'app://game/..%2fdist-other%2fx')).toBeNull();
  });

  it('refuses another host and another scheme', () => {
    expect(fileForUrl(ROOT, 'app://elsewhere/index.html')).toBeNull();
    expect(fileForUrl(ROOT, 'file:///etc/passwd')).toBeNull();
  });

  it('names the types module workers and WASM need', () => {
    expect(mimeOf('a/b.js')).toBe('text/javascript; charset=utf-8');
    expect(mimeOf('a/b.mjs')).toBe('text/javascript; charset=utf-8');
    expect(mimeOf('rapier.wasm')).toBe('application/wasm');
    expect(mimeOf('map.bin')).toBe('application/octet-stream');
    expect(mimeOf('unknown.xyz')).toBeNull();
  });
});
