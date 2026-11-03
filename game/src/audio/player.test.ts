import { describe, expect, it, vi } from 'vitest';
import type { Cue } from '../data/sounds';
import { SoundBank } from './bank';
import type { Mixer } from './mixer';
import { SoundPlayer } from './player';

const SOUNDS = {
  hit: { files: ['hit.ogg'], bus: 'sfx', volume: 1, pitchJitter: 0, maxVoices: 4 },
  wind: { files: ['wind.ogg'], bus: 'sfx', volume: 0.5, pitchJitter: 0, maxVoices: 1, loop: true },
} as unknown as Record<string, Cue>;
const buffer = { duration: 1 } as unknown as AudioBuffer;

function param() {
  return { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
}

function setup() {
  const sources: { buffer: AudioBuffer | null; loop: boolean; playbackRate: ReturnType<typeof param>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> }[] = [];
  const gains: { gain: ReturnType<typeof param>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const node = () => ({ connect: vi.fn((to) => to), disconnect: vi.fn() });
  const ctx = {
    currentTime: 0,
    createBufferSource: () => {
      const src = { ...node(), buffer: null, loop: false, playbackRate: param(), start: vi.fn(), stop: vi.fn() };
      sources.push(src);
      return src;
    },
    createGain: () => {
      const gain = { ...node(), gain: param() };
      gains.push(gain);
      return gain;
    },
    createStereoPanner: () => ({ ...node(), pan: { value: 0 } }),
  };
  const mixer = { ctx, input: () => ({}) } as unknown as Mixer;
  const bank = new SoundBank(['hit.ogg', 'wind.ogg']);
  return { sources, gains, bank, player: new SoundPlayer(mixer, bank, SOUNDS) };
}

const at = { pan: 0, gain: 1 };

describe('SoundPlayer with a pending file', () => {
  it('plays nothing for a one-shot, even after the file arrives', () => {
    const { sources, bank, player } = setup();
    player.play('hit', at, 0);
    bank.set('hit.ogg', buffer);
    expect(sources).toHaveLength(0);
  });

  it('plays a one-shot whose file is here', () => {
    const { sources, bank, player } = setup();
    bank.set('hit.ogg', buffer);
    player.play('hit', at, 0);
    expect(sources).toHaveLength(1);
    expect(sources[0].start).toHaveBeenCalled();
  });

  it('starts a pending loop on arrival at its last rate and gain', () => {
    const { sources, gains, bank, player } = setup();
    const handle = player.loop('wind', at);
    handle.set(1.5, 0.4);
    expect(sources).toHaveLength(0);
    bank.set('wind.ogg', buffer);
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(true);
    expect(sources[0].playbackRate.value).toBe(1.5);
    expect(sources[0].start).toHaveBeenCalled();
    expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5 * 0.4, 0, expect.any(Number));
  });

  it('does not start a pending loop that was stopped', () => {
    const { sources, bank, player } = setup();
    player.loop('wind', at).stop(100);
    bank.set('wind.ogg', buffer);
    expect(sources).toHaveLength(0);
  });

  it('does not start a pending loop that was given a one-time envelope', () => {
    const { sources, bank, player } = setup();
    player.loop('wind', at).once([{ at: 0, rate: 1, gain: 1 }]);
    bank.set('wind.ogg', buffer);
    expect(sources).toHaveLength(0);
  });

  it('forwards calls to the started loop after arrival', () => {
    const { sources, bank, player } = setup();
    const handle = player.loop('wind', at);
    bank.set('wind.ogg', buffer);
    handle.stop(100);
    expect(sources[0].stop).toHaveBeenCalled();
  });
});
