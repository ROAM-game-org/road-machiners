import { SCORE_BLOCKS } from "../data/sounds";
import type { BlockOutput, Part, VoiceHandle } from "./block-session";

export type KitBuffers = Record<Part, AudioBuffer>;

export class BlockVoices implements BlockOutput {
  private buffers: KitBuffers | null = null;
  private outs: Record<Part, AudioNode>;
  private songDuck: GainNode;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
  ) {
    const songLevel = ctx.createGain();
    songLevel.gain.value = SCORE_BLOCKS.songGain;
    songLevel.connect(out);
    const guitarLevel = ctx.createGain();
    guitarLevel.gain.value = SCORE_BLOCKS.guitarPush;
    guitarLevel.connect(songLevel);
    this.songDuck = ctx.createGain();
    this.songDuck.connect(songLevel);
    this.outs = { song: this.songDuck, guitars: guitarLevel, cymbals: songLevel };
  }

  use(buffers: KitBuffers): void {
    this.buffers = buffers;
  }

  release(): void {
    this.buffers = null;
  }

  voice(part: Part, offset: number, when: number, length: number, fade: number, level: number): VoiceHandle {
    if (!this.buffers) throw new Error("Block voices play before a song kit is loaded");
    const buffer = this.buffers[part];
    const seam = SCORE_BLOCKS.seamSeconds;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, when - fade);
    gain.gain.linearRampToValueAtTime(level, when + fade);
    gain.gain.setValueAtTime(level, when + length - seam);
    gain.gain.linearRampToValueAtTime(0, when + length + seam);
    src.connect(gain).connect(this.outs[part]);
    const from = Math.max(0, offset - fade);
    src.start(when - (offset - from), from);
    src.stop(when + length + seam + SCORE_BLOCKS.jumpFadeSeconds);
    return {
      fadeOut: (at, f) => {
        const held = Math.min(at - f, when + length - seam);
        gain.gain.cancelScheduledValues(held);
        gain.gain.setValueAtTime(level, held);
        gain.gain.setValueAtTime(level, at - f);
        gain.gain.linearRampToValueAtTime(0, at + f);
        src.stop(at + f);
      },
      cut: (at) => {
        if (when >= at) return src.stop(when);
        gain.gain.cancelScheduledValues(at - seam);
        gain.gain.setValueAtTime(level, at - seam);
        gain.gain.linearRampToValueAtTime(0, at + seam);
        src.stop(at + seam);
      },
    };
  }

  lean(offset: number, at: number, length: number, songScale: number, level: number, release: number): VoiceHandle {
    const seam = SCORE_BLOCKS.seamSeconds;
    const end = at + length;
    const guitars = this.voice("guitars", offset, at, length, seam, level);
    guitars.fadeOut(end - release / 2, release / 2);
    const duck = this.songDuck.gain;
    duck.setValueAtTime(1, at - seam);
    duck.linearRampToValueAtTime(songScale, at + seam);
    duck.setValueAtTime(songScale, end - release);
    duck.linearRampToValueAtTime(1, end);
    return {
      fadeOut: (t, f) => {
        guitars.fadeOut(t, f);
        duck.cancelScheduledValues(t - f);
        duck.setValueAtTime(songScale, t - f);
        duck.linearRampToValueAtTime(1, t + f);
      },
      cut: (t) => {
        guitars.cut(t);
        duck.cancelScheduledValues(t - seam);
        duck.setValueAtTime(t > at ? songScale : 1, t - seam);
        duck.linearRampToValueAtTime(1, t + seam);
      },
    };
  }
}
