import { afterEach, describe, expect, it, vi } from 'vitest';

const SUPPORT = { ogg: 'probably', m4a: 'maybe' };
const ctx = { sampleRate: 100, state: 'suspended', createBuffer: (_c: number, length: number) => ({ length, duration: length / 100 }), decodeAudioData: async () => ({ length: 100 }) } as unknown as BaseAudioContext;
const EXPECTED = Object.fromEntries(
  ['song-clash-a', 'song-clash-a-guitars', 'song-clash-a-cymbals'].flatMap((name) => [1, 2].flatMap((n) => ['ogg', 'm4a'].map((ext) => [`${name}-${n}.${ext}`, 24]))),
);
const page = 'https://game.test/index.html';

function host(pageStatus: number) {
  vi.stubGlobal('location', { href: page });
  vi.stubGlobal('fetch', async (url: string) => new Response('', { status: url === page ? pageStatus : 404, statusText: 'No' }));
}

async function loadClash() {
  vi.resetModules();
  const { bankKitLoader } = await import('./combat-music');
  const report = vi.fn();
  const kit = await bankKitLoader(ctx, { expectedBytes: EXPECTED, support: SUPPORT }, report)('clash-a');
  return { kit, report };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bankKitLoader', () => {
  it('keeps the last song and reports nothing when the build is gone from the host', async () => {
    host(404);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { kit, report } = await loadClash();
    expect(kit).toBeNull();
    expect(report).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reports a file missing from a served build with its class and status', async () => {
    host(200);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { kit, report } = await loadClash();
    expect(kit).toBeNull();
    expect(report).toHaveBeenCalledTimes(1);
    const failure = report.mock.calls[0][0] as Error;
    expect(failure.name).toBe('SoundDecodeFailure');
    expect(failure.message).toContain('(fetch)');
    expect(failure.message).toContain('HTTP 404');
  });
});
