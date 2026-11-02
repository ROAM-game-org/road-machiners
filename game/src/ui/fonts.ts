export type FontLanguage = 'en' | 'ru';

const MONO = ["400 14px 'IBM Plex Mono'", "700 14px 'IBM Plex Mono'"];

export const FONT_FACES: Record<FontLanguage, string[]> = {
  en: ["400 14px 'Barlow Semi Condensed'", "700 14px 'Barlow Semi Condensed'", ...MONO],
  ru: ["400 14px 'Fira Sans Condensed'", "700 14px 'Fira Sans Condensed'", ...MONO],
};

const SAMPLE: Record<FontLanguage, string> = { en: 'Road Machiners 0123456789', ru: 'Дорожные машинисты 0123456789' };

export const FONT_TIMEOUT_MS = 2500;

export function fontsReady(lang: FontLanguage, timeoutMs = FONT_TIMEOUT_MS): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts?.load) return Promise.resolve();
  const loaded = Promise.all(FONT_FACES[lang].map((face) => fonts.load(face, SAMPLE[lang]))).then(
    () => undefined,
    () => undefined,
  );
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    void loaded.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
