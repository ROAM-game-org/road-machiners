import { describe, expect, it } from "vitest";
import { SCORE_BLOCKS } from "../data/sounds";
import { BlockSession, type BlockOutput, type BlockSong, type Part, type VoiceHandle } from "./block-session";
import { COMBAT_SONGS, CombatMusic, type Kit } from "./combat-music";

const BAR_SECONDS = 2;
const BARS = 8;
const SONG: BlockSong = {
  title: "Test",
  file: "song-test-1.ogg",
  guitars: "song-test-guitars-1.ogg",
  cymbals: { file: "song-test-cymbals-1.ogg", from: 5, start: 7.5, gain: 3 },
  bpm: 120,
  length: BAR_SECONDS * BARS,
  barTimes: Array.from({ length: BARS + 1 }, (_, i) => i * BAR_SECONDS),
  barPower: Array.from({ length: BARS }, () => ({ ss: 1, gg: 0.1, sg: 0.1 })),
  barEntry: [0, 0, 0, 0, 0.3, 0, 0, 0],
  sections: [
    { role: "intro", from: 1, bars: 2 },
    { role: "verse", from: 5, bars: 2 },
  ],
  end: 7,
};

type Voice = { part: Part; offset: number; when: number; level: number; fades: number[] };

function recorder() {
  const voices: Voice[] = [];
  const handle = (v: Voice): VoiceHandle => ({ fadeOut: (at) => v.fades.push(at), cut: () => {} });
  const out: BlockOutput = {
    voice: (part, offset, when, _length, _fade, level) => {
      const v = { part, offset, when, level, fades: [] };
      voices.push(v);
      return handle(v);
    },
    lean: (offset, when, _length, _scale, level) => {
      const v: Voice = { part: "guitars", offset, when, level, fades: [] };
      voices.push(v);
      return handle(v);
    },
  };
  return { voices, out };
}

function playIntoVerse() {
  const { voices, out } = recorder();
  const session = new BlockSession(SONG, out, () => 0);
  session.start(0);
  const verseAt = SCORE_BLOCKS.startLeadSeconds + 2 * BAR_SECONDS;
  session.tick(verseAt - 1);
  return { session, voices, verseAt };
}

describe("BlockSession", () => {
  it("lets the old block ring on into a jump until the new bar's sound starts", () => {
    const { voices, verseAt } = playIntoVerse();
    expect(voices.map((v) => [v.part, v.when])).toEqual([["song", SCORE_BLOCKS.startLeadSeconds], ["song", verseAt]]);
    expect(voices[0].fades[0]).toBeCloseTo(verseAt + 0.3);
  });

  it("plays the cymbal lane from its own file, at the song's cymbal level", () => {
    const { session, voices, verseAt } = playIntoVerse();
    session.fire("knockout", verseAt + 0.1);
    session.tick(verseAt + 0.1);
    const cymbals = voices.find((v) => v.part === "cymbals")!;
    const beat = BAR_SECONDS / 4;
    expect(cymbals.when).toBeCloseTo(verseAt + beat);
    expect(cymbals.offset).toBeCloseTo(SONG.barTimes[4] + beat - SONG.cymbals.start);
    expect(cymbals.level).toBe(SONG.cymbals.gain * SCORE_BLOCKS.cymbalGain);
  });
});

describe("CombatMusic", () => {
  const fakeCtx = () => {
    const param = { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, cancelScheduledValues: () => {} };
    const node = () => ({ gain: param, connect: (n: unknown) => n, buffer: null, start: () => {}, stop: () => {} });
    return { currentTime: 1, createGain: node, createBufferSource: node } as unknown as BaseAudioContext;
  };
  const buffer = { duration: 300 } as AudioBuffer;
  const kitOf = (name: string): Kit => ({ name, song: COMBAT_SONGS[name], buffers: { song: buffer, guitars: buffer, cymbals: buffer } });

  it("keeps one song for the whole fight and plays the next one only from the next start", async () => {
    const names = Object.keys(COMBAT_SONGS);
    let pick = 0;
    const music = new CombatMusic(fakeCtx(), {} as AudioNode, async (name) => kitOf(name), () => pick / names.length, (e) => { throw e; });
    await music.ready();
    music.setCombat(true);
    const first = music.session!;
    pick = 1;
    music.setCombat(false);
    await music.ready();
    expect(music.session).toBe(first);
    music.setCombat(true);
    expect(music.session!.inCombat).toBe(true);
    expect(music.title).toBe(COMBAT_SONGS[names[1]].title);
    music.setCombat(false);
  });

  it("boots and stays silent in combat when no song loads", async () => {
    const errors: unknown[] = [];
    const music = new CombatMusic(fakeCtx(), {} as AudioNode, async () => { throw new Error("no song"); }, () => 0, (e) => errors.push(e));
    await music.ready();
    music.setCombat(true);
    expect(music.inCombat).toBe(false);
    expect(errors).toHaveLength(1);
  });
});
