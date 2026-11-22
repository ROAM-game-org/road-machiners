import { describe, expect, it } from "vitest";
import { CONTROL_CUES, filesOf, SOUND_EVENTS, SOUNDS } from "../data/sounds";

const onDisk = Object.keys(import.meta.glob("/public/sfx/*")).map((p) => p.split("/").pop()!);

describe("sound catalog", () => {
  it("claims every file in public/sfx", () => {
    const claimed = Object.values(SOUNDS).flatMap((c) => c.files);
    expect([...claimed].sort()).toEqual([...onDisk].sort());
  });
  it("gives every sound event layer a one-shot cue with files", () => {
    for (const [id, layers] of Object.entries(SOUND_EVENTS)) {
      for (const layer of layers) {
        expect(SOUNDS[layer.cue].files.length, `${id} ${layer.cue}`).toBeGreaterThan(0);
        expect(SOUNDS[layer.cue].loop, `${id} ${layer.cue}`).toBe(false);
      }
    }
  });
  it("matches variants by exact cue name, in number order", () => {
    const files = ["mg-fire-10.ogg", "mg-fire-2.ogg", "mg-fire-x.ogg", "big-mg-fire-1.ogg", "mg-fire-1.wav"];
    expect(filesOf("mg-fire", files)).toEqual(["mg-fire-2.ogg", "mg-fire-10.ogg"]);
  });
  describe("control cues", () => {
    const others = Object.entries(SOUNDS).filter(([id, c]) => c.bus === "ui" && !(CONTROL_CUES as readonly string[]).includes(id));

    it("sit on the ui bus in the cab setup, one voice each, with files", () => {
      for (const id of CONTROL_CUES) {
        const cue = SOUNDS[id];
        expect(cue.bus, id).toBe("ui");
        expect(cue.setup, id).toBe("cab");
        expect(cue.maxVoices, id).toBe(1);
        expect(cue.files.length, id).toBeGreaterThan(0);
      }
    });

    it("have a different prompt each", () => {
      const prompts = CONTROL_CUES.map((id) => SOUNDS[id].prompts?.join("|"));
      expect(new Set(prompts).size).toBe(CONTROL_CUES.length);
    });

    it("sound under every other ui cue", () => {
      const quietest = Math.min(...others.map(([, c]) => c.volume));
      for (const id of CONTROL_CUES) expect(SOUNDS[id].volume, id).toBeLessThan(quietest);
    });

    it("rate-limit the step cues to 45 ms", () => {
      expect(SOUNDS["knob-step"].minGapMs).toBe(45);
      expect(SOUNDS["wheel-step"].minGapMs).toBe(45);
    });
  });
});
