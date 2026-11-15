import { describe, expect, it, vi } from 'vitest';
import { BOOT_SOUNDS, MUSIC_SOUNDS, SOUNDS } from '../data/sounds';
import { SoundBank } from './bank';
import { MusicShelf } from './music-shelf';

const buffer = (name: string) => ({ name }) as unknown as AudioBuffer;

function shelf(load: (file: string) => Promise<AudioBuffer | null>) {
  const bank = new SoundBank(['kick-1.ogg']);
  bank.lend(['music-a-1.ogg', 'music-b-1.ogg']);
  const report = vi.fn();
  return { bank, report, shelf: new MusicShelf(bank, load, report) };
}

describe('the sounds that decode at boot', () => {
  it('hold no music track and no fight song', () => {
    const boot = new Set(Object.values(BOOT_SOUNDS).flatMap((cue) => cue.files));

    for (const cue of Object.values(MUSIC_SOUNDS)) for (const file of cue.files) expect(boot.has(file)).toBe(false);
    expect(Object.keys(MUSIC_SOUNDS).sort()).toEqual(['music-abandoned', 'music-calm', 'music-outpost', 'music-quest', 'music-town']);
    expect(Object.values(BOOT_SOUNDS).every((cue) => cue.bus !== 'music')).toBe(true);
    expect(Object.keys(SOUNDS).length).toBeGreaterThan(Object.keys(BOOT_SOUNDS).length);
  });
});

describe('the music shelf', () => {
  it('loads a track once for two askers and lands it in the bank', async () => {
    const load = vi.fn(() => Promise.resolve(buffer('a')));
    const { bank, shelf: music } = shelf(load);

    const both = await Promise.all([music.want('music-a-1.ogg'), music.want('music-a-1.ogg')]);

    expect(both).toEqual([true, true]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(bank.has('music-a-1.ogg')).toBe(true);
  });

  it('keeps a track until every asker released it, then drops the buffer', async () => {
    const { bank, shelf: music } = shelf(() => Promise.resolve(buffer('a')));
    await music.want('music-a-1.ogg');
    await music.want('music-a-1.ogg');

    music.release('music-a-1.ogg');
    expect(bank.has('music-a-1.ogg')).toBe(true);
    music.release('music-a-1.ogg');
    expect(bank.has('music-a-1.ogg')).toBe(false);
  });

  it('loads a released track again when it is wanted again', async () => {
    const load = vi.fn(() => Promise.resolve(buffer('a')));
    const { shelf: music } = shelf(load);
    await music.want('music-a-1.ogg');
    music.release('music-a-1.ogg');

    await music.want('music-a-1.ogg');

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('answers false for a track that failed and does not try it again', async () => {
    const load = vi.fn(() => Promise.resolve(null));
    const { bank, shelf: music } = shelf(load);

    expect(await music.want('music-b-1.ogg')).toBe(false);
    expect(await music.want('music-b-1.ogg')).toBe(false);

    expect(load).toHaveBeenCalledTimes(1);
    expect(bank.has('music-b-1.ogg')).toBe(false);
  });

  it('reports a load that throws, once, and stays silent', async () => {
    const { shelf: music, report } = shelf(() => Promise.reject(new Error('network')));

    expect(await music.want('music-a-1.ogg')).toBe(false);
    expect(await music.want('music-a-1.ogg')).toBe(false);

    expect(report).toHaveBeenCalledTimes(1);
  });

  it('refuses a file the bank never lent', () => {
    const { bank } = shelf(() => Promise.resolve(null));

    expect(() => bank.get('music-zzz-1.ogg')).toThrow('not in the bank');
  });
});
