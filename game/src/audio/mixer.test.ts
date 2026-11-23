import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIX } from "../data/sounds";
import { Mixer } from "./mixer";

class FakeParam {
  value = 0;
  setTargetAtTime = vi.fn();
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}

class FakeNode {
  gain = Object.assign(new FakeParam(), { value: 1 });
  frequency = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  buffer: unknown = null;
  type = "";
  connect(out: unknown) {
    return out;
  }
}

class FakeContext {
  static last: FakeContext;
  state: "suspended" | "running" = "suspended";
  sampleRate = 100;
  destination = new FakeNode();
  currentTime = 0;
  gestured = false;
  resumes = 0;
  gains: FakeNode[] = [];
  constructor() {
    FakeContext.last = this;
  }
  createGain() {
    const g = new FakeNode();
    this.gains.push(g);
    return g;
  }
  createBiquadFilter = () => new FakeNode();
  createDynamicsCompressor = () => new FakeNode();
  convolvers = 0;
  createConvolver = () => {
    this.convolvers++;
    return new FakeNode();
  };
  createBuffer = (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) });
  async resume() {
    this.resumes++;
    if (this.gestured) this.state = "running";
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Mixer", () => {
  beforeEach(() => {
    vi.stubGlobal("AudioContext", FakeContext);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with the master gain open", () => {
    const mixer = new Mixer(MIX);
    expect(FakeContext.last.gains[0].gain.value).toBe(1);
    mixer.setMuted(false);
    expect(FakeContext.last.gains[0].gain.value).toBe(1);
    mixer.setMuted(true);
    expect(FakeContext.last.gains[0].gain.value).toBe(0);
  });

  it("keeps listening after a pointerdown the browser does not count as a gesture", async () => {
    const mixer = new Mixer(MIX);
    const target = new EventTarget();
    mixer.unlockOn(target);
    target.dispatchEvent(new Event("pointerdown"));
    await flush();
    expect(mixer.ctx.state).toBe("suspended");
    FakeContext.last.gestured = true;
    target.dispatchEvent(new Event("pointerup"));
    await flush();
    expect(mixer.ctx.state).toBe("running");
  });

  it("resumes on a key press and then stops listening", async () => {
    const mixer = new Mixer(MIX);
    const target = new EventTarget();
    mixer.unlockOn(target);
    FakeContext.last.gestured = true;
    target.dispatchEvent(new Event("keydown"));
    await flush();
    expect(mixer.ctx.state).toBe("running");
    const resumes = FakeContext.last.resumes;
    target.dispatchEvent(new Event("click"));
    target.dispatchEvent(new Event("pointerup"));
    await flush();
    expect(FakeContext.last.resumes).toBe(resumes);
  });

  it("adds no reverb to world sounds", () => {
    new Mixer(MIX);
    expect(FakeContext.last.convolvers).toBe(0);
  });

  it("ducks world sounds with a drop, a hold and a release, and keeps accents out of the duck", () => {
    const mixer = new Mixer(MIX);
    mixer.duck(2);
    const ramps = FakeContext.last.gains.flatMap((g) => g.gain.linearRampToValueAtTime.mock.calls);
    const a = MIX.accent;
    expect(ramps.map(([v]) => v)).toEqual([a.duck, 1]);
    expect(ramps[0][1]).toBeCloseTo(2 + a.attackMs / 1000);
    expect(ramps[1][1]).toBeCloseTo(2 + (a.attackMs + a.holdMs + a.releaseMs) / 1000);
    expect(mixer.accentInput()).not.toBe(mixer.input("sfx"));
  });

  it("skips a duck that starts inside the gap after the last one", () => {
    const mixer = new Mixer(MIX);
    mixer.duck(2);
    mixer.duck(2 + MIX.accent.minGapMs / 1000 / 2);
    mixer.duck(2 + MIX.accent.minGapMs / 1000);
    const drops = FakeContext.last.gains.flatMap((g) => g.gain.linearRampToValueAtTime.mock.calls).filter(([v]) => v === MIX.accent.duck);
    expect(drops).toHaveLength(2);
  });
});
