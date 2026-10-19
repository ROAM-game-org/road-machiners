import { describe, expect, it } from "vitest";
import { SCORE_BLOCKS } from "../data/sounds";
import { BlockSession, type BlockOutput, type BlockSong, type Part, type VoiceHandle } from "./block-session";
import { COMBAT_SONGS, CombatMusic, type Kit } from "./combat-music";

const BAR_SECONDS = 2;
const CLEAN = [0, 0, 1];
const CUT = [9, 9, 0];
const BARS = 8;
const SONG: BlockSong = {
  title: "Test",
  file: "song-test-1.ogg",
  guitars: "song-test-guitars-1.ogg",
  cymbals: { file: "song-test-cymbals-1.ogg", from: 5, start: 7.5, gain: 3 },
  bpm: 120,
  length: BAR_SECONDS * BARS,
  barTimes: Array.from({ length: BARS + 1 }, (_, i) => i * BAR_SECONDS),
  barPower: Array.from({ length: BARS }, (_, i) => ({ ss: 1, gg: i >= 4 ? 1e-4 : 0.1, sg: 0 })),
  barEntry: [0, 0, 0, 0, 0.3, 0, 0, 0],
  sections: [
    { role: "intro", from: 1, bars: 2 },
    { role: "verse", from: 5, bars: 2 },
  ],
  jumps: { "3": { "1": CUT, "5": CLEAN }, "7": { "1": CUT, "5": CLEAN } },
  quietExits: [],
  end: 7,
};

type Voice = { part: Part; offset: number; when: number; level: number; fades: number[]; release?: { from: number; to: number } };

function recorder() {
  const voices: Voice[] = [];
  const handle = (v: Voice): VoiceHandle => ({ fadeOut: (at) => v.fades.push(at), cut: () => {} });
  const out: BlockOutput = {
    voice: (part, offset, when, _length, _fade, level) => {
      const v = { part, offset, when, level, fades: [] };
      voices.push(v);
      return handle(v);
    },
    lean: (offset, when, length, _scale, level, release) => {
      const v: Voice = { part: "guitars", offset, when, level, fades: [], release: { from: when + length - release, to: when + length } };
      voices.push(v);
      return handle(v);
    },
  };
  return { voices, out };
}

const WALL_SONG: BlockSong = {
  ...SONG,
  barPower: SONG.barPower.map((p) => ({ ...p, gg: 0.1 })),
  sections: [SONG.sections[0], { role: "wall", from: 5, bars: 2 }],
};

function playIntoVerse(song = SONG) {
  const { voices, out } = recorder();
  const session = new BlockSession(song, out, () => 0);
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
    const { session, voices, verseAt } = playIntoVerse(WALL_SONG);
    session.fire("knockout", verseAt + 0.1);
    session.tick(verseAt + 0.1);
    const cymbals = voices.find((v) => v.part === "cymbals")!;
    const beat = BAR_SECONDS / 4;
    expect(cymbals.when).toBeCloseTo(verseAt + beat);
    expect(cymbals.offset).toBeCloseTo(SONG.barTimes[4] + beat - SONG.cymbals.start);
    expect(cymbals.level).toBe(SONG.cymbals.gain * SCORE_BLOCKS.cymbalGain);
  });

  it("leans a wall on its own guitars from the next bar", () => {
    const { session, voices, verseAt } = playIntoVerse(WALL_SONG);
    session.fire("knockout", verseAt + 0.1);
    session.tick(verseAt + 0.1);
    const guitars = voices.find((v) => v.part === "guitars")!;
    expect(guitars.when).toBeCloseTo(verseAt + BAR_SECONDS);
    expect(guitars.offset).toBe(SONG.barTimes[5]);
    expect(guitars.level).toBeLessThan(1);
  });

  it("fades both layers out over the last bar before the phrase ends", () => {
    const { session, voices, verseAt } = playIntoVerse(WALL_SONG);
    session.fire("knockout", verseAt + 0.1);
    session.tick(verseAt + 0.1);
    const phraseEnd = verseAt + 2 * BAR_SECONDS;
    expect(voices.find((v) => v.part === "guitars")!.release).toEqual({ from: phraseEnd - BAR_SECONDS, to: phraseEnd });
    expect(voices.find((v) => v.part === "cymbals")!.fades[0]).toBeCloseTo(phraseEnd - BAR_SECONDS / 2);
  });

  it("adds no guitars to a solo, which already leads with them", () => {
    const sections: BlockSong["sections"] = [SONG.sections[0], { role: "wall", from: 3, bars: 2 }, { role: "solo", from: 5, bars: 2 }];
    const jumps = Object.fromEntries([3, 5, 7].map((exit) => [exit, { "1": CLEAN, "3": CLEAN, "5": CLEAN }]));
    const { voices, out } = recorder();
    const session = new BlockSession({ ...WALL_SONG, sections, jumps }, out, () => 0.999);
    session.start(0);
    const soloAt = SCORE_BLOCKS.startLeadSeconds + 4 * BAR_SECONDS;
    for (let t = 0; t < soloAt; t += 0.5) session.tick(t);
    expect(session.played.map((p) => p.role)).toEqual(["intro", "wall", "solo"]);
    session.fire("knockout", soloAt + 0.1);
    session.tick(soloAt + 0.1);
    expect(voices.some((v) => v.part === "guitars")).toBe(false);
  });

  it("adds no guitars or cymbals to a verse that has none of its own", () => {
    const { session, voices, verseAt } = playIntoVerse();
    session.fire("knockout", verseAt + 0.1);
    session.tick(verseAt + 0.1);
    expect(voices.map((v) => v.part)).toEqual(["song", "song"]);
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
    expect(music.title).toBe(COMBAT_SONGS[names[0]].title);
    await music.ready();
    expect(music.session).toBe(first);
    music.setCombat(true);
    expect(music.session!.inCombat).toBe(true);
    expect(music.title).toBe(COMBAT_SONGS[names[1]].title);
    music.setCombat(false);
  });

  it("switches a fight to the next song on the radio's next key, intro first", async () => {
    const names = Object.keys(COMBAT_SONGS);
    const music = new CombatMusic(fakeCtx(), {} as AudioNode, async (name) => kitOf(name), () => 0, (e) => { throw e; });
    await music.ready();
    music.setCombat(true);
    const first = music.session!;
    music.nextSong();
    await music.ready();
    expect(first.inCombat).toBe(false);
    expect(music.session!.inCombat).toBe(true);
    expect(music.session!.played[0].role).toBe("intro");
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
