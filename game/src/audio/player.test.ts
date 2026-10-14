import { describe, expect, it } from "vitest";
import { MIX, type Cue } from "../data/sounds";
import { SoundPlayer } from "./player";

describe("SoundPlayer.play from a point in the take", () => {
  const setup = (duration: number) => {
    const starts: [number, number | undefined][] = [];
    const ramps: [number, number][] = [];
    const param = () => ({ value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: (v: number, t: number) => ramps.push([v, t]) });
    const node = (extra: object) => ({ connect: (n: unknown) => n, ...extra });
    const ctx = {
      currentTime: 5,
      sampleRate: 1000,
      createBufferSource: () => node({ playbackRate: { value: 1 }, start: (t: number, f?: number) => starts.push([t, f]) }),
      createGain: () => node({ gain: param() }),
      createStereoPanner: () => node({ pan: { value: 0 } }),
    };
    const buffer = { duration, getChannelData: () => new Float32Array(1) };
    const cue = { bus: "music", volume: 1, pitchJitter: 0, maxVoices: 4, loop: false, files: ["a.ogg"], prompts: [] } as unknown as Cue;
    const player = new SoundPlayer({ ctx, input: () => ({}) } as never, { get: () => buffer } as never, { a: cue });
    return { player, starts, ramps };
  };

  it("starts the source at the offset and fades in", () => {
    const { player, starts, ramps } = setup(2);
    player.play("a", { pan: 0, gain: 1 }, 20, { file: "a.ogg", rate: 1, from: 0.4 });
    expect(starts).toEqual([[5.02, 0.4]]);
    expect(ramps[0][1]).toBeCloseTo(5.02 + MIX.score.joinFadeSeconds);
  });

  it("starts at the top without an offset", () => {
    const { player, starts, ramps } = setup(2);
    player.play("a", { pan: 0, gain: 1 }, 0, { file: "a.ogg", rate: 1 });
    expect(starts).toEqual([[5, 0]]);
    expect(ramps).toEqual([]);
  });

  it.each([Number.NaN, -1, 2, 3])("throws on an offset of %s", (from) => {
    const { player } = setup(2);
    expect(() => player.play("a", { pan: 0, gain: 1 }, 0, { file: "a.ogg", rate: 1, from })).toThrow(/cannot start at/);
  });
});
