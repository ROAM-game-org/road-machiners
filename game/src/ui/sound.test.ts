import { describe, expect, it, vi } from "vitest";
import type { Mixer } from "../audio/mixer";
import { MIX } from "../data/sounds";
import { dragged, knobAngle, parseSettings, SoundSettings, turned } from "./sound";

describe("parseSettings", () => {
  it("starts from the mix volumes", () => {
    expect(parseSettings(null)).toEqual({ muted: false, volume: MIX.busVolume });
  });
  it("keeps valid stored settings", () => {
    const s = { muted: true, volume: { ui: 0, sfx: 1, ambient: 0.5, music: 0.2 } };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });
  it("keeps an unmuted profile with custom volumes", () => {
    const s = { muted: false, volume: { ui: 0.3, sfx: 0.6, ambient: 0.1, music: 0.9 } };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });
  it("fails loud on invalid settings", () => {
    expect(() => parseSettings('{"muted":true}')).toThrow();
    expect(() => parseSettings('{"muted":false,"volume":{"ui":2,"sfx":1,"ambient":1,"music":1}}')).toThrow();
  });
});

describe("turned", () => {
  it("steps a twentieth at a time and snaps to whole steps", () => {
    expect(turned(0.5, 1)).toBeCloseTo(0.55);
    expect(turned(0.5, -2)).toBeCloseTo(0.4);
    expect(turned(0.52, 0)).toBeCloseTo(0.5);
  });
  it("gives exact step values, so stored settings hold no float noise", () => {
    expect(turned(0.1, 1)).toBe(0.15);
    expect(turned(0.65, 1)).toBe(0.7);
  });
  it("stops at silence and full", () => {
    expect(turned(0.95, 3)).toBe(1);
    expect(turned(0.05, -3)).toBe(0);
  });
});

describe("dragged", () => {
  it("ignores travel under the dead zone", () => {
    expect(dragged(0.5, 2, 0)).toBe(0.5);
    expect(dragged(0.5, 1, -1)).toBe(0.5);
  });
  it("raises going up or right and lowers going down or left", () => {
    expect(dragged(0, 0, -80)).toBe(0.5);
    expect(dragged(0, 0, -160)).toBe(1);
    expect(dragged(0, 80, 0)).toBe(0.5);
    expect(dragged(1, 0, 160)).toBe(0);
    expect(dragged(1, -80, 0)).toBe(0.5);
  });
  it("stops at silence and full", () => {
    expect(dragged(0.5, 0, -500)).toBe(1);
    expect(dragged(0.5, -500, 0)).toBe(0);
  });
  it("gives whole percents and keeps an off-grid start", () => {
    expect(dragged(0.37, 0, -16)).toBe(0.47);
    expect(dragged(0.37, 3, 0)).toBe(0.39);
  });
});

describe("knobAngle", () => {
  it("swings the pointer through 270 degrees", () => {
    expect(knobAngle(0)).toBe(-135);
    expect(knobAngle(0.5)).toBe(0);
    expect(knobAngle(1)).toBe(135);
  });
});

describe("SoundSettings", () => {
  function settingsOver(stored: string | null) {
    const store = new Map<string, string>(stored === null ? [] : [["roam-sound", stored]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage;
    const mixer = { setBusVolume: vi.fn(), setMuted: vi.fn() };
    return { settings: new SoundSettings(mixer as unknown as Mixer, storage), mixer, store };
  }

  it("applies stored settings to the mixer when built", () => {
    const { mixer, settings } = settingsOver(JSON.stringify({ muted: true, volume: { ui: 0.3, sfx: 0.6, ambient: 0.1, music: 0.9 } }));
    expect(settings.muted()).toBe(true);
    expect(mixer.setMuted).toHaveBeenCalledWith(true);
    expect(mixer.setBusVolume).toHaveBeenCalledWith("music", 0.9);
    expect(settings.volume("ui")).toBe(0.3);
  });

  it("saves a volume and the mute under roam-sound in the shape parseSettings reads", () => {
    const { settings, store, mixer } = settingsOver(null);
    settings.setVolume("music", 0.25);
    settings.toggleMute();
    expect(mixer.setBusVolume).toHaveBeenLastCalledWith("music", 0.25);
    expect(mixer.setMuted).toHaveBeenLastCalledWith(true);
    expect(parseSettings(store.get("roam-sound")!)).toEqual({ muted: true, volume: { ...MIX.busVolume, music: 0.25 } });
  });

  it("tells every listener about a change, and a returned function stops one", () => {
    const { settings } = settingsOver(null);
    const first = vi.fn();
    const second = vi.fn();
    const stop = settings.onChange(first);
    settings.onChange(second);
    settings.setVolume("sfx", 0.1);
    settings.toggleMute();
    stop();
    settings.toggleMute();
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(3);
  });

  it("stays silent and saves nothing for a volume that did not change", () => {
    const { settings, store } = settingsOver(null);
    const listener = vi.fn();
    settings.onChange(listener);
    settings.setVolume("music", settings.volume("music"));
    expect(listener).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it("fails loud on corrupt stored settings", () => {
    expect(() => settingsOver("{")).toThrow();
  });
});
