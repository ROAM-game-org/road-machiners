import { describe, expect, it } from "vitest";
import type { GameEvent, ShotRound } from "../sim/types";
import { CHASSIS } from "../data/chassis";
import { engineFileFor, engineStrainFileFor, hornSoundFor, MIX, SCORE_BLOCKS, SOUNDS } from "../data/sounds";
import type { SoundPlayer } from "../audio/player";
import { REGION } from "../data/region";
import { OUTPOSTS, siteGates } from "../sim/sites";
import { engineGlide, EngineStrain, glideAt, loopLevels, musicPlaceAt, scoreEventOf, SoundDirector, SoundLoops, stingOf, strainGlides } from "./sound";
import type { BlockEvent } from "./block-session";
import type { CameraRig } from "./render/camera";
import { TEST_MAP } from '../test/map';

describe("stingOf", () => {
  it("plays the most important result only", () => {
    const events: GameEvent[] = [
      { t: "money", amount: 20, reason: { kind: "contract" } },
      { t: "skillUp", skill: "driving", level: 2 },
      { t: "discover", location: "oasis" },
    ];
    expect(stingOf(events, "p")).toBe("level-up");
  });
  it("ignores spending and arrivals", () => {
    const events: GameEvent[] = [
      { t: "money", amount: -5, reason: { kind: "towing", vehicle: "npc1" } },
      { t: "arrived", vehicle: "npc1" },
    ];
    expect(stingOf(events, "p")).toBeNull();
    expect(stingOf([{ t: "arrived", vehicle: "p" }], "p")).toBeNull();
  });
  it("warns softly when a heatwave starts, ahead of money", () => {
    const heatwave = { id: "h1", kind: "heatwave" as const, turnsLeft: 10 };
    const started: GameEvent = { t: "weather", event: heatwave, outcome: "started" };
    expect(stingOf([started], "p")).toBe("heatwave-warning");
    expect(stingOf([{ t: "money", amount: 20, reason: { kind: "contract" } }, started], "p")).toBe("heatwave-warning");
    expect(stingOf([{ t: "weather", event: heatwave, outcome: "ended" }], "p")).toBeNull();
  });
  it("gives no sting for a storm or overcast starting", () => {
    const storm = { id: "s1", kind: "storm" as const, pos: { x: 1, y: 1 }, radius: 5, vel: { x: 1, y: 0 }, turnsLeft: 5, born: 0 };
    const overcast = { id: "o1", kind: "overcast" as const, turnsLeft: 5 };
    expect(stingOf([{ t: "weather", event: storm, outcome: "started" }], "p")).toBeNull();
    expect(stingOf([{ t: "weather", event: overcast, outcome: "started" }], "p")).toBeNull();
  });
  it("plays no sting on a knockout, which is only a log line and a mark", () => {
    expect(stingOf([{ t: "knockout", crash: false }], "p")).toBeNull();
  });
});

describe("loopLevels", () => {
  const calm = { stormShare: 0, inCombat: false, inQuest: false, place: null } as const;
  const gains = (l: ReturnType<typeof loopLevels>) => [l.calmGain, l.townGain, l.outpostGain, l.abandonedGain, l.combatGain];
  it("plays quest music over every other music while a quest is open", () => {
    for (const place of [null, "town", "outpost", "abandoned"] as const)
      for (const inCombat of [true, false]) {
        const l = loopLevels({ ...calm, place, inCombat, inQuest: true }, MIX);
        expect([l.questGain, ...gains(l)]).toEqual([1, 0, 0, 0, 0, 0]);
      }
    expect(loopLevels(calm, MIX).questGain).toBe(0);
  });
  it("raises the wind with the player's storm share", () => {
    expect(loopLevels(calm, MIX).windGain).toBe(MIX.wind.baseGain);
    expect(loopLevels({ ...calm, stormShare: 0.5 }, MIX).windGain).toBeCloseTo((MIX.wind.baseGain + MIX.wind.stormGain) / 2);
    expect(loopLevels({ ...calm, stormShare: 1 }, MIX).windGain).toBe(MIX.wind.stormGain);
  });
  it("switches music to combat while in combat", () => {
    expect(gains(loopLevels({ ...calm, inCombat: true }, MIX))).toEqual([0, 0, 0, 0, 1]);
    expect(gains(loopLevels(calm, MIX))).toEqual([1, 0, 0, 0, 0]);
  });
  it("finds the music place of a town, an outpost, a territory and the open road", () => {
    const territory = (id: string) => REGION.locations.find((l) => l.id === id)!.pos;
    expect(musicPlaceAt(TEST_MAP.terrain, siteGates(REGION.towns[0])[0])).toBe("town");
    expect(musicPlaceAt(TEST_MAP.terrain, siteGates(OUTPOSTS[0])[0])).toBe("outpost");
    expect(musicPlaceAt(TEST_MAP.terrain, territory("fallen-sun"))).toBe("abandoned");
    expect(musicPlaceAt(TEST_MAP.terrain, territory("orchard"))).toBe("abandoned");
    expect(musicPlaceAt(TEST_MAP.terrain, { x: 0, y: 0 })).toBeNull();
  });
  it("plays each place's own music, and combat music over it", () => {
    expect(gains(loopLevels({ ...calm, place: "town" }, MIX))).toEqual([0, 1, 0, 0, 0]);
    expect(gains(loopLevels({ ...calm, place: "outpost" }, MIX))).toEqual([0, 0, 1, 0, 0]);
    expect(gains(loopLevels({ ...calm, place: "abandoned" }, MIX))).toEqual([0, 0, 0, 1, 0]);
    for (const place of ["town", "outpost", "abandoned"] as const)
      expect(gains(loopLevels({ ...calm, place, inCombat: true }, MIX))).toEqual([0, 0, 0, 0, 1]);
  });
  it("keeps the music choice near storms", () => {
    for (const inCombat of [true, false]) {
      const base = loopLevels({ ...calm, inCombat }, MIX);
      const other = loopLevels({ ...calm, inCombat, stormShare: 1 }, MIX);
      expect([other.calmGain, other.combatGain]).toEqual([base.calmGain, base.combatGain]);
    }
  });
});

describe("scoreEventOf", () => {
  const round = (hit: boolean, crit = false): ShotRound => ({ hit, crit, offset: 0, struck: hit ? "n" : null, hits: [], blast: [], burst: null });
  const shot = (shooter: string, target: string, rounds: ShotRound[]): GameEvent => ({
    t: "shot", shooter, weapon: "w", target, aim: "body", chance: 0.5, damageChance: 0.5, side: "front", rounds,
  });
  it("answers the player's volleys with hit, miss or crit", () => {
    expect(scoreEventOf(shot("p", "n", [round(false), round(true)]), "p")?.kind).toBe("hit");
    expect(scoreEventOf(shot("p", "n", [round(false), round(false)]), "p")?.kind).toBe("miss");
    expect(scoreEventOf(shot("p", "n", [round(true), round(true, true)]), "p")?.kind).toBe("crit");
  });
  it("names the round that earns the event", () => {
    expect(scoreEventOf(shot("p", "n", [round(false), round(true)]), "p")).toEqual({ kind: "hit", round: 1 });
    expect(scoreEventOf(shot("p", "n", [round(true), round(true, true)]), "p")).toEqual({ kind: "crit", round: 1 });
    expect(scoreEventOf(shot("p", "n", [round(false), round(false)]), "p")).toEqual({ kind: "miss", round: 0 });
    expect(scoreEventOf(shot("n", "p", [round(false), round(true)]), "p")).toEqual({ kind: "struck", round: 1 });
    expect(scoreEventOf({ t: "collision", a: "n", b: "p", impact: 3, hitsA: [], hitsB: [] }, "p")).toEqual({ kind: "crash", round: null });
  });
  it("answers volleys at the player with struck or crit, and enemy misses with nothing", () => {
    expect(scoreEventOf(shot("n", "p", [round(true)]), "p")?.kind).toBe("struck");
    expect(scoreEventOf(shot("n", "p", [round(true, true)]), "p")?.kind).toBe("crit");
    expect(scoreEventOf(shot("n", "p", [round(false)]), "p")).toBeNull();
  });
  it("counts a round that strikes parts without a clean hit as struck", () => {
    const grazing: ShotRound = { hit: false, crit: false, offset: 0, struck: "n", hits: [{ part: "armor", damage: 3 }], blast: [], burst: null };
    expect(scoreEventOf(shot("p", "n", [grazing]), "p")?.kind).toBe("hit");
  });
  it("ignores fights between other trucks and answers the player's crashes", () => {
    expect(scoreEventOf(shot("a", "b", [round(true, true)]), "p")).toBeNull();
    expect(scoreEventOf({ t: "collision", a: "n", b: "p", impact: 3, hitsA: [], hitsB: [] }, "p")?.kind).toBe("crash");
    expect(scoreEventOf({ t: "collision", a: "n", b: "m", impact: 3, hitsA: [], hitsB: [] }, "p")).toBeNull();
  });
  it("answers the player's knockouts and wrecks, and nobody else's", () => {
    expect(scoreEventOf({ t: "npcKnockout", vehicle: "n", by: "p" }, "p")?.kind).toBe("knockout");
    expect(scoreEventOf({ t: "destroyed", vehicle: "n", by: "p" }, "p")?.kind).toBe("knockout");
    expect(scoreEventOf({ t: "npcKnockout", vehicle: "n", by: "m" }, "p")).toBeNull();
  });
});

describe("engine sound assignment", () => {
  it("assigns an existing recording to every chassis", () => {
    for (const id of Object.keys(CHASSIS)) {
      expect(SOUNDS.engine.files).toContain(engineFileFor(id));
    }
    expect(engineFileFor("scout")).not.toBe(engineFileFor("hauler"));
    expect(() => engineFileFor("unknown")).toThrow("Unknown chassis");
  });

  it("gives light trucks and heavy trucks different strained loops", () => {
    for (const id of Object.keys(CHASSIS)) expect(SOUNDS["engine-strain"].files).toContain(engineStrainFileFor(id));
    expect(engineStrainFileFor("scout")).not.toBe(engineStrainFileFor("hauler"));
    expect(() => engineStrainFileFor("unknown")).toThrow("Unknown chassis");
  });

  it("changes the healthy and strained engine loops together, and only when the chassis changes", () => {
    const started: string[] = [];
    const stopped: string[] = [];
    const gains: Record<string, number[]> = {};
    const player = {
      loop: (id: string, _at: unknown, file?: string) => {
        const name = file ?? id;
        if (id === "engine" || id === "engine-strain") started.push(name);
        return {
          set: (_rate: number, gain: number) => (gains[name] ??= []).push(gain),
          once: () => {},
          setGain: () => {},
          stop: () => stopped.push(name),
        };
      },
    } as unknown as SoundPlayer;
    const loops = new SoundLoops(player, { setCombat: () => {}, nextSong: () => {} });
    const glide = { ...engineGlide(0, 10, 1, MIX, false)!, starts: false };
    const drive = (chassis: string, strain: { from: number; to: number }) => {
      loops.drive(glide, chassis, strain);
      loops.engineAt(1);
    };

    drive("scout", { from: 0, to: 0 });
    drive("scout", { from: 1, to: 1 });
    drive("scout", { from: 1, to: 0.5 });
    drive("hauler", { from: 0, to: 0 });

    expect(started).toEqual([
      engineFileFor("scout"),
      engineStrainFileFor("scout"),
      engineFileFor("hauler"),
      engineStrainFileFor("hauler"),
    ]);
    expect(stopped).toEqual([engineFileFor("scout"), engineStrainFileFor("scout")]);
    expect(gains[engineFileFor("scout")].map((g) => g / glide.gainTo)).toEqual([1, 0, 0.5]);
    expect(gains[engineStrainFileFor("scout")].map((g) => g / glide.gainTo)).toEqual([0, 1, 0.5]);
    expect(gains[engineFileFor("hauler")].map((g) => g / glide.gainTo)).toEqual([1]);
  });

  it("carries pitch and level from one turn into the next while the truck keeps accelerating, so no turn restarts the rev", () => {
    const sets: { rate: number; gain: number }[] = [];
    const player = { loop: () => ({ set: (rate: number, gain: number) => sets.push({ rate, gain }), once: () => {}, setGain: () => {}, stop: () => {} }) } as unknown as SoundPlayer;
    const loops = new SoundLoops(player, { setCombat: () => {}, nextSong: () => {} });
    const last = () => sets[sets.length - 2];
    const calm = { from: 0, to: 0 };

    loops.drive(engineGlide(5, 8, 1, MIX, false)!, "scout", calm);
    loops.engineAt(1);
    const end = last();
    loops.drive(engineGlide(8, 11, 1, MIX, false)!, "scout", calm);
    loops.engineAt(0);
    expect(last().rate).toBeCloseTo(end.rate, 9);
    expect(last().gain).toBeCloseTo(end.gain, 9);
    loops.engineAt(1);
    expect(last()).toEqual(glideAt(engineGlide(8, 11, 1, MIX, false)!, 1));
  });

  it("moves the engine by the turn's world time, holds it while the world rests, and fades it only for a real stop or a parked turn", () => {
    const sets: { rate: number; gain: number }[] = [];
    const player = { loop: () => ({ set: (rate: number, gain: number) => sets.push({ rate, gain }), once: () => {}, setGain: () => {}, stop: () => {} }) } as unknown as SoundPlayer;
    const loops = new SoundLoops(player, { setCombat: () => {}, nextSong: () => {} });
    const cruise = engineGlide(10, 12, 1, MIX, false)!;
    const last = () => sets[sets.length - 2];

    loops.drive(cruise, "scout", { from: 0, to: 0 });
    loops.engineAt(0.5);
    const half = last();
    loops.engineAt(0.5);
    expect(last()).toEqual(half);
    loops.engineAt(1);
    expect(last()).toEqual(glideAt(cruise, 1));
    expect(last().gain).toBeGreaterThan(0);

    loops.drive(null, "scout", { from: 0, to: 0 });
    loops.engineAt(0);
    expect(last().gain).toBeCloseTo(glideAt(cruise, 1).gain);
    loops.engineAt(1);
    expect(last().gain).toBe(0);

    loops.drive(engineGlide(10, 0, 1, MIX, false)!, "scout", { from: 0, to: 0 });
    loops.engineAt(1);
    expect(last().gain).toBe(0);
  });

  it("plays the strained engine on the engine's bus and loop, about 3 dB quieter, so overheating tells by tone", () => {
    expect(SOUNDS["engine-strain"].bus).toBe(SOUNDS.engine.bus);
    expect(SOUNDS["engine-strain"].volume).toBeLessThan(SOUNDS.engine.volume * 10 ** (-3 / 20));
    expect(SOUNDS["engine-strain"].loop).toBe(true);
  });
});

describe("engine strain", () => {
  const run = (turns: [number, boolean][]) => {
    const strain = new EngineStrain();
    return turns.map(([turn, damaging]) => strain.next(turn, damaging));
  };

  it("strains fully from the start of the first damaging turn", () => {
    expect(run([[5, true]])).toEqual([{ from: 1, to: 1 }]);
  });

  it("falls back to healthy over two turns once damage stops, then stays healthy", () => {
    expect(run([[1, true], [2, false], [3, false], [4, false]])).toEqual([
      { from: 1, to: 1 },
      { from: 1, to: 1 - MIX.engine.strainRelease },
      { from: 0.5, to: 0 },
      { from: 0, to: 0 },
    ]);
  });

  it("never drops to none and back to full when damage flips every turn", () => {
    const levels = run([[1, true], [2, false], [3, true], [4, false]]);
    expect(levels.map((s) => s.to)).toEqual([1, 0.5, 1, 0.5]);
    expect(levels.every((s) => s.from > 0)).toBe(true);
  });

  it("starts healthy after a gap in turns, like a parked turn or a loaded save", () => {
    expect(run([[1, true], [3, false]])).toEqual([{ from: 1, to: 1 }, { from: 0, to: 0 }]);
    expect(run([[9, true], [2, false]])).toEqual([{ from: 1, to: 1 }, { from: 0, to: 0 }]);
  });

  it("never strains a turn without heat damage", () => {
    expect(run([[1, false], [2, false], [3, false]]).every((s) => s.from === 0 && s.to === 0)).toBe(true);
  });
});

describe("strainGlides", () => {
  const g = engineGlide(5, 15, 1, MIX, true)!;

  it("splits the engine level between the layers and keeps both rates", () => {
    const { healthy, strained } = strainGlides(g, { from: 1, to: 0.5 });
    expect(healthy.gainFrom + strained.gainFrom).toBeCloseTo(g.gainFrom);
    expect(healthy.gainTo + strained.gainTo).toBeCloseTo(g.gainTo);
    expect(strained.gainFrom).toBeCloseTo(g.gainFrom);
    expect(strained.gainTo).toBeCloseTo(g.gainTo / 2);
    for (const layer of [healthy, strained]) {
      expect([layer.rateFrom, layer.rateTo, layer.seconds, layer.fadeSeconds]).toEqual([g.rateFrom, g.rateTo, g.seconds, g.fadeSeconds]);
    }
  });

  it("leaves the strained layer silent without strain", () => {
    const { healthy, strained } = strainGlides(g, { from: 0, to: 0 });
    expect([strained.gainFrom, strained.gainTo]).toEqual([0, 0]);
    expect([healthy.gainFrom, healthy.gainTo]).toEqual([g.gainFrom, g.gainTo]);
  });
});

describe("atLevel", () => {
  const rig: Pick<CameraRig, "focus" | "screenOf"> = { focus: () => ({ x: 0, y: 0, z: 0 }), screenOf: () => ({ x: 50, y: 50 }) };
  const withWindow = (run: () => void) => {
    const width = globalThis.window?.innerWidth;
    Object.defineProperty(globalThis, "window", { value: { innerWidth: 100 }, configurable: true });
    try {
      run();
    } finally {
      if (width === undefined) Reflect.deleteProperty(globalThis, "window");
      else Object.defineProperty(globalThis, "window", { value: { innerWidth: width }, configurable: true });
    }
  };

  it("scales the placement gain by the level and logs it", () => {
    const calls: unknown[][] = [];
    withWindow(() => {
      const director = new SoundDirector({ play: (...args) => { calls.push(args); } }, rig, { fire: () => null }, () => 0);
      director.atLevel("crash", { x: 0, y: 0, z: 0 }, 0, 0.4);
      expect(calls).toEqual([["crash", { pan: 0, gain: 0.4 }, 0]]);
      expect(director.log).toEqual(["crash 0.40"]);
    });
  });

  it("throws on a level outside (0, 1]", () => {
    withWindow(() => {
      const director = new SoundDirector({ play: () => {} }, rig, { fire: () => null }, () => 0);
      for (const level of [0, -0.1, 1.01, NaN]) expect(() => director.atLevel("crash", { x: 0, y: 0, z: 0 }, 0, level)).toThrow();
      expect(director.log).toEqual([]);
    });
  });
});

describe("engine strain log", () => {
  it("logs strain only on turns that have some", () => {
    const rig: Pick<CameraRig, "focus" | "screenOf"> = { focus: () => ({ x: 0, y: 0, z: 0 }), screenOf: () => ({ x: 0, y: 0 }) };
    const director = new SoundDirector({ play: () => {} }, rig, { fire: () => null }, () => 0);
    director.engineStrain({ from: 0, to: 0 });
    director.engineStrain({ from: 1, to: 0.5 });
    director.engineStrain({ from: 0.5, to: 0 });
    expect(director.log).toEqual(["engine-strain 1.0->0.5", "engine-strain 0.5->0.0"]);
  });
});

describe("next track", () => {
  const fake = () => {
    const calm: { file?: string; gains: number[]; stops: number[] }[] = [];
    const quest: { file?: string; gains: number[]; stops: number[] }[] = [];
    const abandoned: { file?: string; gains: number[]; stops: number[] }[] = [];
    const player = {
      loop: (id: string, _at: unknown, file?: string) => {
        const handle = { file, gains: [] as number[], stops: [] as number[] };
        if (id === "music-calm") calm.push(handle);
        if (id === "music-quest") quest.push(handle);
        if (id === "music-abandoned") abandoned.push(handle);
        return { set: () => {}, once: () => {}, setGain: (g: number) => handle.gains.push(g), stop: (ms: number) => handle.stops.push(ms) };
      },
    } as unknown as SoundPlayer;
    const songs: string[] = [];
    return { calm, quest, abandoned, songs, loops: new SoundLoops(player, { setCombat: () => {}, nextSong: () => songs.push("next") }) };
  };
  const road = { stormShare: 1, inCombat: false, inQuest: false, place: null } as const;

  it("starts the next quest track on each quest and fades the calm music under it", () => {
    const { calm, quest, loops } = fake();
    loops.update(road);
    loops.update({ ...road, inQuest: true });
    loops.update(road);
    loops.update({ ...road, inQuest: true });
    expect(quest.map((q) => q.gains)).toEqual([[0], [1, 0], [1]]);
    expect(quest[0].stops).toEqual([MIX.music.fadeSeconds * 1000]);
    expect(new Set(quest.slice(0, 3).map((q) => q.file)).size).toBe(SOUNDS["music-quest"].files.length);
    expect(calm[0].gains).toEqual([1, 0]);
    expect(calm[1].gains).toEqual([1, 0]);
  });

  it("starts the next ruin track each time the player enters a territory", () => {
    const { abandoned, loops } = fake();
    const ruins = { ...road, place: "abandoned" } as const;
    loops.update(road);
    loops.update(ruins);
    loops.update(road);
    loops.update(ruins);
    loops.update(road);
    loops.update(ruins);
    expect(abandoned.map((a) => a.gains)).toEqual([[0], [1, 0], [1, 0], [1]]);
    expect(new Set(abandoned.slice(0, 3).map((a) => a.file)).size).toBe(SOUNDS["music-abandoned"].files.length);
  });

  it("crossfades the calm music to a new track at its current level", () => {
    const { calm, loops } = fake();
    loops.update(road);
    loops.nextTrack();
    expect(calm).toHaveLength(2);
    expect(calm[0].stops).toEqual([MIX.music.fadeSeconds * 1000]);
    expect(calm[1].gains).toEqual([1]);
  });

  it("plays every calm track once before any repeats", () => {
    const { calm, loops } = fake();
    const files = SOUNDS["music-calm"].files;
    for (let i = 0; i < files.length; i++) loops.nextTrack();
    const cycle = calm.slice(0, files.length).map((c) => c.file);
    expect([...cycle].sort()).toEqual([...files].sort());
    expect(calm[files.length].file).toBe(cycle[0]);
  });

  it("moves combat to the next song and leaves the calm music alone", () => {
    const { calm, songs, loops } = fake();
    loops.update({ ...road, inCombat: true });
    loops.nextTrack();
    expect(songs).toEqual(["next"]);
    expect(calm).toHaveLength(1);
  });

  it("changes the quest or ruin track that is playing", () => {
    const { quest, abandoned, songs, loops } = fake();
    loops.update({ ...road, inQuest: true, inCombat: true });
    const quests = quest.length;
    loops.nextTrack();
    expect(quest).toHaveLength(quests + 1);
    expect(quest.at(-1)!.gains).toEqual([1]);
    loops.update({ ...road, place: "abandoned" });
    const ruins = abandoned.length;
    loops.nextTrack();
    expect(abandoned).toHaveLength(ruins + 1);
    expect(abandoned.at(-1)!.gains).toEqual([1]);
    expect(songs).toEqual([]);
  });
});

describe("horn sound assignment", () => {
  it("gives every chassis a distinct, loaded horn and rejects unknown chassis", () => {
    const sounds = Object.keys(CHASSIS).map((id) => hornSoundFor(id));
    expect(sounds.every((sound) => SOUNDS.horn.files.includes(sound.file))).toBe(true);
    expect(new Set(sounds.map((sound) => `${sound.file}:${sound.rate}`)).size).toBe(sounds.length);
    expect(() => hornSoundFor("unknown")).toThrow("Unknown chassis");
  });

  it("plays the assigned horn at the vehicle's position after its delay", () => {
    const calls: unknown[][] = [];
    const player: Pick<SoundPlayer, "play"> = { play: (...args) => { calls.push(args); } };
    const rig: Pick<CameraRig, "focus" | "screenOf"> = {
      focus: () => ({ x: 0, y: 0, z: 0 }),
      screenOf: () => ({ x: 50, y: 50 }),
    };
    const width = globalThis.window?.innerWidth;
    Object.defineProperty(globalThis, "window", { value: { innerWidth: 100 }, configurable: true });
    try {
      const director = new SoundDirector(player, rig, { fire: () => { throw new Error("no score event here"); } }, () => 0);
      director.honk({ x: 0, y: 0, z: 0 }, 500, "scout");
      expect(calls).toEqual([["horn", { pan: 0, gain: 1 }, 500, hornSoundFor("scout")]]);
    } finally {
      if (width === undefined) Reflect.deleteProperty(globalThis, "window");
      else Object.defineProperty(globalThis, "window", { value: { innerWidth: width }, configurable: true });
    }
  });
});

describe("engineGlide", () => {
  const e = MIX.engine;
  it("stays silent while standing still", () => {
    expect(engineGlide(0, 0, 1, MIX, false)).toBeNull();
  });
  it("revs up while speeding up and holds while cruising", () => {
    const up = engineGlide(0, e.topSpeedMs * 2, 1, MIX, false)!;
    expect([up.rateFrom, up.rateTo]).toEqual([e.idleRate, e.topRate + e.revUp]);
    expect([up.gainFrom, up.gainTo]).toEqual([e.idleGain, 1 + e.loadGain]);
    expect(up.brake).toBe(false);
    const cruise = engineGlide(10, 10, 1, MIX, false)!;
    expect(cruise.rateTo).toBe(cruise.rateFrom);
  });
  it("drops revs while slowing", () => {
    const g = engineGlide(10, 10 - e.loadMs, 1, MIX, false)!;
    expect(g.rateFrom - g.rateTo).toBeGreaterThan(e.revDown);
  });
  it("adds the air brake on a hard slowdown only", () => {
    expect(engineGlide(10, 10 - e.brakeMs, 1, MIX, false)!.brake).toBe(true);
    expect(engineGlide(10, 10 - e.brakeMs / 2, 1, MIX, false)!.brake).toBe(false);
  });
  it("is louder in overdrive at the same revs", () => {
    const normal = engineGlide(5, 10, 1, MIX, false)!;
    const over = engineGlide(5, 10, 1, MIX, true)!;
    expect(over.rateTo).toBe(normal.rateTo);
    expect(over.gainFrom).toBeCloseTo(normal.gainFrom * e.overdriveGain);
    expect(over.gainTo).toBeCloseTo(normal.gainTo * e.overdriveGain);
  });
});

describe("SoundDirector score timing", () => {
  const rig: Pick<CameraRig, "focus" | "screenOf"> = { focus: () => ({ x: 0, y: 0, z: 0 }), screenOf: () => ({ x: 0, y: 0 }) };
  const NOW = 10;
  const setup = () => {
    const calls: [string, number][] = [];
    const music = { fire: (kind: BlockEvent, at: number) => (calls.push([kind, Math.round((at - NOW) * 1000)]), { kind, at, heat: 1, surprise: 1, lanes: true }) };
    const director = new SoundDirector({ play: () => {} }, rig, music, () => NOW);
    return { calls, director };
  };
  const lead = SCORE_BLOCKS.eventLeadSeconds * 1000;

  it("hands an event to the music just before it lands, once", () => {
    const { calls, director } = setup();
    director.queueScoreEvent("hit", 600);
    director.playDueScoreEvents(0, 1);
    expect(calls).toEqual([]);
    director.playDueScoreEvents(600 - lead, 1);
    expect(calls).toEqual([["hit", lead]]);
    director.playDueScoreEvents(590, 1);
    expect(calls).toHaveLength(1);
    expect(director.log.at(-1)).toBe("score hit heat1.0 surprise1.0 lanes");
  });

  it("hands it over earlier at fast speed, with the delay in real time", () => {
    const { calls, director } = setup();
    director.queueScoreEvent("hit", 1000);
    director.playDueScoreEvents(0, 4);
    expect(calls).toEqual([]);
    director.playDueScoreEvents(1000 - lead * 4, 4);
    expect(calls[0][1]).toBe(lead);
  });

  it("hands over an event already past with no delay", () => {
    const { calls, director } = setup();
    director.queueScoreEvent("hit", 600);
    director.playDueScoreEvents(700, 1);
    expect(calls[0][1]).toBe(0);
  });

  it("drops the last turn's events when playback is cleared", () => {
    const { calls, director } = setup();
    director.queueScoreEvent("hit", 600);
    director.clearScoreEvents();
    director.playDueScoreEvents(700, 1);
    expect(calls).toEqual([]);
  });

  it("times a crash and leaves shots to the volley", () => {
    const { calls, director } = setup();
    const crash: GameEvent = { t: "collision", a: "n", b: "p", impact: 3, hitsA: [], hitsB: [] };
    const shot = { t: "shot", shooter: "p", weapon: "w", target: "n", aim: "body", chance: 1, damageChance: 1, side: "front", rounds: [] } as unknown as GameEvent;
    director.timeScoreEvents([crash, shot], "p", (e) => (e === crash ? 400 : null));
    director.playDueScoreEvents(400, 1);
    expect(calls.map((c) => c[0])).toEqual(["crash"]);
  });

  it("throws on a speed that is not positive and finite", () => {
    const { director } = setup();
    expect(() => director.playDueScoreEvents(0, 0)).toThrow(/speed/);
    expect(() => director.playDueScoreEvents(0, Number.NaN)).toThrow(/speed/);
  });
});

