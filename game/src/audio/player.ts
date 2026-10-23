import type { Cue } from "../data/sounds";
import type { Bank } from "./bank";
import type { Mixer } from "./mixer";
import { pickVariant, VoiceLimiter } from "./pick";

export type Placement = { pan: number; gain: number };
export type SoundSelection = { file: string; rate: number };

export type LoopHandle = {
  setGain(gain: number, rampSeconds: number): void;
  set(rate: number, gain: number): void;
  once(points: readonly EnvelopePoint[]): void;
  stop(fadeMs: number): void;
};

export type EnvelopePoint = { at: number; rate: number; gain: number };

const FRAME_SMOOTH_SECONDS = 0.02;

export class SoundPlayer {
  private last = new Map<string, number>();
  private voices = new VoiceLimiter();

  constructor(private mixer: Mixer, private bank: Bank, private sounds: Record<string, Cue>) {}

  play(id: string, at: Placement, delayMs: number, selection?: SoundSelection): void {
    const cue = this.cue(id);
    if (cue.loop) throw new Error(`Sound ${id} is a loop; use loop()`);
    const ctx = this.mixer.ctx;
    const buf = selection ? this.getBuffer(id, cue, selection.file) : this.variant(id, cue);
    const rate = selection ? this.checkedRate(id, selection.rate) : 1 + (Math.random() * 2 - 1) * cue.pitchJitter;
    const start = ctx.currentTime + delayMs / 1000;
    if (!this.voices.admit(id, cue.maxVoices, ctx.currentTime, start + buf.duration / rate)) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    this.chain(src, cue, at);
    src.start(start);
  }

  now(): number {
    return this.mixer.ctx.currentTime;
  }

  loop(id: string, at: Placement, file?: string): LoopHandle {
    const cue = this.loopCue(id);
    const src = this.loopSource(file === undefined ? this.variant(id, cue) : this.getBuffer(id, cue, file));
    const gain = this.chain(src, cue, at);
    src.start();
    return this.loopHandle(src, gain, cue);
  }

  private loopCue(id: string): Cue {
    const cue = this.cue(id);
    if (!cue.loop) throw new Error(`Sound ${id} is not a loop`);
    return cue;
  }

  private loopSource(buffer: AudioBuffer): AudioBufferSourceNode {
    const src = this.mixer.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  private loopHandle(src: AudioBufferSourceNode, gain: GainNode, cue: Cue): LoopHandle {
    const ctx = this.mixer.ctx;
    return {
      setGain: (g, ramp) => gain.gain.setTargetAtTime(cue.volume * g, ctx.currentTime, ramp / 3),
      set: (rate, level) => {
        src.playbackRate.setTargetAtTime(rate, ctx.currentTime, FRAME_SMOOTH_SECONDS);
        gain.gain.setTargetAtTime(cue.volume * level, ctx.currentTime, FRAME_SMOOTH_SECONDS);
      },
      once: (points) => {
        const t = ctx.currentTime;
        const [first, ...rest] = points;
        src.playbackRate.setValueAtTime(first.rate, t + first.at);
        gain.gain.setValueAtTime(cue.volume * first.gain, t + first.at);
        for (const p of rest) {
          src.playbackRate.linearRampToValueAtTime(p.rate, t + p.at);
          gain.gain.linearRampToValueAtTime(cue.volume * p.gain, t + p.at);
        }
        src.stop(t + points[points.length - 1].at);
      },
      stop: (fadeMs) => {
        gain.gain.setTargetAtTime(0, ctx.currentTime, fadeMs / 1000 / 3);
        src.stop(ctx.currentTime + fadeMs / 1000);
      },
    };
  }

  private checkedRate(id: string, rate: number): number {
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Invalid playback rate for ${id}`);
    return rate;
  }

  private getBuffer(id: string, cue: Cue, file: string): AudioBuffer {
    if (!cue.files.includes(file)) throw new Error(`Sound ${id} has no file ${file}`);
    const buffer = this.bank.get(file);
    if (!buffer) throw new Error(`Sound file ${file} was not loaded`);
    return buffer;
  }

  private cue(id: string): Cue {
    const cue = this.sounds[id];
    if (!cue) throw new Error(`Unknown sound ${id}`);
    return cue;
  }

  private nextIndex(id: string, cue: Cue): number {
    const i = pickVariant(cue.files.length, this.last.get(id) ?? null, Math.random());
    this.last.set(id, i);
    return i;
  }

  private variant(id: string, cue: Cue): AudioBuffer {
    const file = cue.files[this.nextIndex(id, cue)];
    const buf = this.bank.get(file);
    if (!buf) throw new Error(`Sound file ${file} was not loaded`);
    return buf;
  }

  private chain(src: AudioNode, cue: Cue, at: Placement): GainNode {
    const ctx = this.mixer.ctx;
    const gain = ctx.createGain();
    gain.gain.value = cue.volume * at.gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = at.pan;
    src.connect(gain).connect(pan).connect(this.mixer.input(cue.bus));
    return gain;
  }
}
