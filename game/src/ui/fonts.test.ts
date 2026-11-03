import { afterEach, describe, expect, it, vi } from 'vitest';
import { FONT_FACES, fontsReady } from './fonts';

function stubFonts(load: ((face: string, text: string) => Promise<unknown>) | undefined) {
  vi.stubGlobal('document', { fonts: load ? { load } : {} });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fontsReady', () => {
  it('waits for every face of the language', async () => {
    const asked: string[] = [];
    stubFonts(async (face) => void asked.push(face));
    await fontsReady('ru');
    expect(asked).toEqual(FONT_FACES.ru);
  });

  it('asks for Cyrillic text in Russian', async () => {
    const texts: string[] = [];
    stubFonts(async (_face, text) => void texts.push(text));
    await fontsReady('ru');
    expect(texts.every((text) => /[А-я]/.test(text))).toBe(true);
  });

  it('resolves when a load fails', async () => {
    stubFonts(() => Promise.reject(new Error('network')));
    await expect(fontsReady('en')).resolves.toBeUndefined();
  });

  it('resolves at the timeout when a load never settles', async () => {
    vi.useFakeTimers();
    stubFonts(() => new Promise(() => undefined));
    let done = false;
    void fontsReady('en', 1000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('resolves at once without the font API', async () => {
    stubFonts(undefined);
    await expect(fontsReady('en')).resolves.toBeUndefined();
  });
});
