
import { MIX, type Bus } from "../data/sounds";

type Mix = typeof MIX;

export class Mixer {
  readonly ctx = new AudioContext();
  private master = this.ctx.createGain();
  private buses: Record<Bus, GainNode>;

  constructor(mix: Mix) {
    this.master.connect(this.ctx.destination);
    this.buses = {
      ui: this.bus("ui", mix.busVolume.ui, this.master),
      sfx: this.bus("sfx", mix.busVolume.sfx, this.effectsChain(mix)),
      ambient: this.bus("ambient", mix.busVolume.ambient, this.master),
      music: this.bus("music", mix.busVolume.music, this.master),
    };
  }

  input(bus: Bus): AudioNode {
    return this.buses[bus];
  }

  setBusVolume(bus: Bus, volume: number): void {
    this.buses[bus].gain.value = volume;
  }

  setMuted(muted: boolean): void {
    this.master.gain.value = muted ? 0 : 1;
  }

  unlockOn(target: EventTarget): void {
    const gestures = ["pointerup", "click", "keydown"];
    const unlock = () => {
      if (this.ctx.state === "running") return;
      this.ctx.resume().then(() => {
        if (this.ctx.state === "running") gestures.forEach((g) => target.removeEventListener(g, unlock, true));
      });
    };
    gestures.forEach((g) => target.addEventListener(g, unlock, true));
  }

  private bus(bus: Bus, volume: number, out: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = volume;
    g.connect(out);
    return g;
  }

  private effectsChain(mix: Mix): AudioNode {
    const c = mix.compressor;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = c.threshold;
    comp.knee.value = c.knee;
    comp.ratio.value = c.ratio;
    comp.attack.value = c.attack;
    comp.release.value = c.release;
    comp.connect(this.master);
    const verb = this.ctx.createConvolver();
    verb.buffer = this.impulse(mix.reverb.seconds, mix.reverb.decay);
    const wet = this.ctx.createGain();
    wet.gain.value = mix.reverb.wet;
    comp.connect(verb).connect(wet).connect(this.master);
    return comp;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const n = Math.round(seconds * this.ctx.sampleRate);
    const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }
}
