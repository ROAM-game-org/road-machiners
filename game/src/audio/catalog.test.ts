import { describe, expect, it } from "vitest";
import { beatLoopSeconds, filesOf, SOUND_FRAME_RATE, SOUND_FRAMES, SOUNDS } from "../data/sounds";

const onDisk = Object.keys(import.meta.glob("/public/sfx/*")).map((p) => p.split("/").pop()!);
const oggs = onDisk.filter((f) => f.endsWith(".ogg"));
const claimed = Object.values(SOUNDS).flatMap((c) => c.files);

describe("sound catalog", () => {
  it("claims every ogg file in public/sfx", () => {
    expect([...claimed].sort()).toEqual([...oggs].sort());
  });
  it("every sound has an m4a fallback", () => {
    const fallbacks = onDisk.filter((f) => f.endsWith(".m4a"));
    expect(fallbacks.sort()).toEqual(oggs.map((f) => f.replace(/\.ogg$/, ".m4a")).sort());
    expect(onDisk).toHaveLength(oggs.length * 2);
  });
  it("every sound has one length", () => {
    expect(Object.keys(SOUND_FRAMES).sort()).toEqual([...claimed].sort());
    for (const frames of Object.values(SOUND_FRAMES)) expect(Number.isInteger(frames) && frames > 0).toBe(true);
  });
  it("beat loops keep their bar length", () => {
    for (const cue of Object.values(SOUNDS)) {
      if (!("beat" in cue) || !cue.beat) continue;
      for (const file of cue.files) expect(Math.abs(SOUND_FRAMES[file] - beatLoopSeconds(cue.beat) * SOUND_FRAME_RATE)).toBeLessThanOrEqual(1);
    }
  });
  it("matches variants by exact cue name, in number order", () => {
    const files = ["mg-fire-10.ogg", "mg-fire-2.ogg", "mg-fire-x.ogg", "big-mg-fire-1.ogg", "mg-fire-1.wav"];
    expect(filesOf("mg-fire", files)).toEqual(["mg-fire-2.ogg", "mg-fire-10.ogg"]);
  });
});
