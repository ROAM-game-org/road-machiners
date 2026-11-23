
import { MIX, type Bus } from "../data/sounds";

type Mix = typeof MIX;

export class Mixer {
  readonly ctx = new AudioContext();
  private master = this.ctx.createGain();
  private buses: Record<Bus, GainNode>;
  private accent: GainNode;
  private ducked: GainNode;
  private lastDuck = -Infinity;

  constructor(private readonly mix: Mix) {
    this.master.connect(this.ctx.destination);
    const comp = this.compressor(mix);
    this.accent = this.bus("sfx", mix.busVolume.sfx, comp);
    this.ducked = this.bus("sfx", 1, comp);
    this.buses = {
      ui: this.bus("ui", mix.busVolume.ui, this.master),
      sfx: this.bus("sfx", mix.busVolume.sfx, this.ducked),
      ambient: this.bus("ambient", mix.busVolume.ambient, this.master),
      music: this.bus("music", mix.busVolume.music, this.master),
    };
  }

  input(bus: Bus): AudioNode {
    return this.buses[bus];
  }

  accentInput(): AudioNode {
    return this.accent;
  }

  duck(at: number): void {
    const a = this.mix.accent;
    if (at - this.lastDuck < a.minGapMs / 1000) return;
    this.lastDuck = at;
    const g = this.ducked.gain;
    const down = at + a.attackMs / 1000;
    g.cancelScheduledValues(at);
    g.setValueAtTime(1, at);
    g.linearRampToValueAtTime(a.duck, down);
    g.setValueAtTime(a.duck, down + a.holdMs / 1000);
    g.linearRampToValueAtTime(1, down + (a.holdMs + a.releaseMs) / 1000);
  }

  setBusVolume(bus: Bus, volume: number): void {
    this.buses[bus].gain.value = volume;
    if (bus === "sfx") this.accent.gain.value = volume;
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

  private compressor(mix: Mix): AudioNode {
    const c = mix.compressor;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = c.threshold;
    comp.knee.value = c.knee;
    comp.ratio.value = c.ratio;
    comp.attack.value = c.attack;
    comp.release.value = c.release;
    comp.connect(this.master);
    return comp;
  }
}
