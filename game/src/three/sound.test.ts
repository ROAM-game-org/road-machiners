import { describe, expect, it, vi } from "vitest";
import type { GameEvent, ShotRound } from "../sim/types";
import { CHASSIS } from "../data/chassis";
import { engineFileFor, engineStrainFileFor, hornSoundFor, MIX, SCORE_BLOCKS, SOUND_EVENTS, SOUNDS } from "../data/sounds";
import type { SoundPlayer } from "../audio/player";
import type { MusicTracks } from "../audio/music-shelf";
import { REGION } from "../data/region";
import { OUTPOSTS, siteGates } from "../sim/sites";
import { ACCENT, engineGlide, EngineStrain, glideAt, loopLevels, musicPlaceAt, PLAIN, scoreEventOf, SoundDirector, SoundLoops, stingOf, strainGlides, panelCue, PanelSounds, utilityCue } from "./sound";
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
        const l = loopLevels({ ...calm, place, inCombat, inQuest: true }, MIX, false);
        expect([l.questGain, ...gains(l)]).toEqual([1, 0, 0, 0, 0, 0]);
      }
    expect(loopLevels(calm, MIX, false).questGain).toBe(0);
  });
  it("raises the wind with the player's storm share", () => {
    expect(loopLevels(calm, MIX, false).windGain).toBe(MIX.wind.baseGain);
    expect(loopLevels({ ...calm, stormShare: 0.5 }, MIX, false).windGain).toBeCloseTo((MIX.wind.baseGain + MIX.wind.stormGain) / 2);
    expect(loopLevels({ ...calm, stormShare: 1 }, MIX, false).windGain).toBe(MIX.wind.stormGain);
  });
  it("switches music to combat while in combat", () => {
    expect(gains(loopLevels({ ...calm, inCombat: true }, MIX, false))).toEqual([0, 0, 0, 0, 1]);
    expect(gains(loopLevels(calm, MIX, false))).toEqual([1, 0, 0, 0, 0]);
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
    expect(gains(loopLevels({ ...calm, place: "town" }, MIX, false))).toEqual([0, 1, 0, 0, 0]);
    expect(gains(loopLevels({ ...calm, place: "outpost" }, MIX, false))).toEqual([0, 0, 1, 0, 0]);
    expect(gains(loopLevels({ ...calm, place: "abandoned" }, MIX, false))).toEqual([0, 0, 0, 1, 0]);
    for (const place of ["town", "outpost", "abandoned"] as const)
      expect(gains(loopLevels({ ...calm, place, inCombat: true }, MIX, false))).toEqual([0, 0, 0, 0, 1]);
  });
  it("keeps the music choice near storms", () => {
    for (const inCombat of [true, false]) {
      const base = loopLevels({ ...calm, inCombat }, MIX, false);
      const other = loopLevels({ ...calm, inCombat, stormShare: 1 }, MIX, false);
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
    const loops = new SoundLoops(player, { setCombat: () => {}, nextSong: () => {} }, instantTracks, Math.random);
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
    const loops = new SoundLoops(player, { setCombat: () => {}, nextSong: () => {} }, instantTracks, Math.random);
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
    const loops = new SoundLoops(player, { setCombat: () => {}, nextSong: () => {} }, instantTracks, Math.random);
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

describe("SoundDirector events", () => {
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

  it("plays each layer of an event at its own delay and gain, scaled by the level", () => {
    const calls: unknown[][] = [];
    withWindow(() => {
      const director = new SoundDirector({ play: (...args) => { calls.push(args); }, duck: () => {} }, rig, { fire: () => null }, () => 0, () => 0);
      director.event("crash-hard", { x: 0, y: 0, z: 0 }, 50, 0.5, PLAIN);
      expect(calls).toEqual(SOUND_EVENTS["crash-hard"].map((l) => [l.cue, { pan: 0, gain: 0.5 * l.gain }, 50 + l.delayMs]));
      expect(director.log).toEqual([`crash-hard 0.50 world ${SOUND_EVENTS["crash-hard"].map((l) => l.cue).join(" ")}`]);
    });
  });

  it("plays the player's side up and the enemy side down by the focus gains", () => {
    const gains: number[] = [];
    withWindow(() => {
      const director = new SoundDirector({ play: (_c, at) => { gains.push(at.gain); }, duck: () => {} }, rig, { fire: () => null }, () => 0, () => 0);
      director.event("shot-mg", { x: 0, y: 0, z: 0 }, 0, 1, { side: "mine", accent: false });
      director.event("shot-mg", { x: 0, y: 0, z: 0 }, 0, 1, { side: "theirs", accent: false });
      const shot = SOUND_EVENTS["shot-mg"][0].gain;
      expect(gains).toEqual([shot * MIX.focus.mine, shot * MIX.focus.theirs]);
    });
  });

  it("ducks at an accent's delay and routes its layers past the duck, and a plain event does neither", () => {
    const ducks: number[] = [];
    const accents: (true | undefined)[] = [];
    withWindow(() => {
      const director = new SoundDirector({ play: (_c, at) => { accents.push(at.accent); }, duck: (d) => { ducks.push(d); } }, rig, { fire: () => null }, () => 0, () => 0);
      director.event("explosion", { x: 0, y: 0, z: 0 }, 120, 1, ACCENT);
      expect(ducks).toEqual([120]);
      expect(accents.every((a) => a === true)).toBe(true);
      accents.length = 0;
      director.event("shot-mg", { x: 0, y: 0, z: 0 }, 0, 1, PLAIN);
      expect(ducks).toEqual([120]);
      expect(accents).toEqual([undefined]);
      expect(director.log[0]).toMatch(/^explosion 1\.00 world accent /);
    });
  });

  it("spreads a miss's level by its roll and leaves other events at their level", () => {
    const gains: number[] = [];
    withWindow(() => {
      const director = new SoundDirector({ play: (_c, at) => { gains.push(at.gain); }, duck: () => {} }, rig, { fire: () => null }, () => 0, () => 0.999);
      director.event("miss", { x: 0, y: 0, z: 0 }, 0, 1, PLAIN);
      director.event("shot-mg", { x: 0, y: 0, z: 0 }, 0, 1, PLAIN);
      expect(gains[0]).toBeCloseTo(SOUND_EVENTS["miss"][0].gain * (1 - MIX.spread.miss! * 0.999));
      expect(gains[1]).toBe(SOUND_EVENTS["shot-mg"][0].gain);
    });
  });

  it("skips the chance layers whose roll misses", () => {
    const calls: unknown[][] = [];
    withWindow(() => {
      const director = new SoundDirector({ play: (...args) => { calls.push(args); }, duck: () => {} }, rig, { fire: () => null }, () => 0, () => 0.999);
      director.event("crash-hard", { x: 0, y: 0, z: 0 }, 0, 1, PLAIN);
      expect(calls.map((c) => c[0])).toEqual(SOUND_EVENTS["crash-hard"].filter((l) => l.chance === 1).map((l) => l.cue));
    });
  });

  it("logs a road horn with its cause and truck, and a reply horn bare", () => {
    withWindow(() => {
      const director = new SoundDirector({ play: () => {}, duck: () => {} }, rig, { fire: () => null }, () => 0, () => 0);
      director.honk({ x: 0, y: 0, z: 0 }, 0, "scout", "brake npc-1");
      director.honk({ x: 0, y: 0, z: 0 }, 0, "scout");
      expect(director.log).toEqual(["horn brake npc-1", "horn"]);
    });
  });

  it("throws on a level outside (0, 1]", () => {
    withWindow(() => {
      const director = new SoundDirector({ play: () => {}, duck: () => {} }, rig, { fire: () => null }, () => 0, () => 0);
      for (const level of [0, -0.1, 1.01, NaN]) expect(() => director.event("crash-hard", { x: 0, y: 0, z: 0 }, 0, level, PLAIN)).toThrow();
      expect(director.log).toEqual([]);
    });
  });
});

describe("engine strain log", () => {
  it("logs strain only on turns that have some", () => {
    const rig: Pick<CameraRig, "focus" | "screenOf"> = { focus: () => ({ x: 0, y: 0, z: 0 }), screenOf: () => ({ x: 0, y: 0 }) };
    const director = new SoundDirector({ play: () => {}, duck: () => {} }, rig, { fire: () => null }, () => 0, () => 0);
    director.engineStrain({ from: 0, to: 0 });
    director.engineStrain({ from: 1, to: 0.5 });
    director.engineStrain({ from: 0.5, to: 0 });
    expect(director.log).toEqual(["engine-strain 1.0->0.5", "engine-strain 0.5->0.0"]);
  });
});

const instantTracks: MusicTracks = { want: () => Promise.resolve(true), release: () => {} };

const landed = () => new Promise<void>((resolve) => setTimeout(resolve));

type Opened = { file?: string; gains: number[]; stops: number[] };

describe("music on demand", () => {
  const road = { stormShare: 1, inCombat: false, inQuest: false, place: null } as const;

  const fake = (lands: (file: string) => Promise<boolean> = () => Promise.resolve(true), random: () => number = () => 0.5) => {
    const opened: Record<string, Opened[]> = {};
    const clock = { now: 0 };
    const wanted: string[] = [];
    const released: string[] = [];
    const player = {
      now: () => clock.now,
      loop: (id: string, _at: unknown, file?: string) => {
        const handle: Opened = { file, gains: [], stops: [] };
        (opened[id] ??= []).push(handle);
        return { set: () => {}, once: () => {}, setGain: (g: number) => handle.gains.push(g), stop: (ms: number) => handle.stops.push(ms) };
      },
    } as unknown as SoundPlayer;
    const tracks: MusicTracks = {
      want: (file) => {
        wanted.push(file);
        return lands(file);
      },
      release: (file) => void released.push(file),
    };
    const songs: string[] = [];
    const combat: boolean[] = [];
    const loops = new SoundLoops(player, { setCombat: (on) => void combat.push(on), nextSong: () => songs.push("next") }, tracks, random);
    return { clock, combat, opened, wanted, released, songs, loops, calm: () => opened["music-calm"] ?? [], quest: () => opened["music-quest"] ?? [], abandoned: () => opened["music-abandoned"] ?? [] };
  };

  it("loads nothing until a track is about to play", async () => {
    const { wanted, loops } = fake();
    expect(wanted).toEqual([]);

    loops.update({ ...road, place: "town" });
    await landed();

    expect(wanted).toEqual([SOUNDS["music-town"].files[0]]);
  });

  it("plays a track that lands late at the current level, and keeps the old one until it does", async () => {
    let land!: () => void;
    const late = new Promise<boolean>((resolve) => (land = () => resolve(true)));
    const files = SOUNDS["music-calm"].files;
    let asked = 0;
    const { calm, loops } = fake(() => (asked++ === 0 ? Promise.resolve(true) : late));
    loops.update(road);
    await landed();
    expect(calm()).toHaveLength(1);

    loops.nextTrack();
    await landed();
    expect(calm()).toHaveLength(1);
    expect(calm()[0].stops).toEqual([]);

    land();
    await landed();
    expect(calm()).toHaveLength(2);
    expect(calm()[1].gains).toEqual([1]);
    expect(calm()[0].stops).toEqual([MIX.music.fadeSeconds * 1000]);
    expect(files.length).toBeGreaterThan(1);
  });

  it("drops a track that lands after the music moved on, and plays nothing for it", async () => {
    let land!: () => void;
    const late = new Promise<boolean>((resolve) => (land = () => resolve(true)));
    const { calm, wanted, released, loops } = fake(() => late);
    loops.update(road);
    loops.update({ ...road, place: "town" });
    land();
    await landed();

    expect(calm()).toEqual([]);
    expect(released).toContain(wanted[0]);
  });

  it("releases a track after its fade ends and not before", async () => {
    const { released, calm, loops } = fake();
    loops.update(road);
    await landed();
    vi.useFakeTimers();
    try {
      loops.update({ ...road, inQuest: true });
      await vi.advanceTimersByTimeAsync(MIX.music.fadeSeconds * 1000 - 1);
      expect(released).toEqual([]);
      await vi.advanceTimersByTimeAsync(2000);
      expect(released).toContain(calm()[0].file);
      expect(calm()[0].stops).toEqual([0]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a place track that fades back in before its release", async () => {
    const { released, opened, loops } = fake();
    const town = { ...road, place: "town" } as const;
    loops.update(town);
    await landed();
    vi.useFakeTimers();
    try {
      loops.update(road);
      loops.update(town);
      await vi.advanceTimersByTimeAsync(MIX.music.fadeSeconds * 1000 + 2000);
      expect(released.filter((file) => file.startsWith("music-town"))).toEqual([]);
      expect(opened["music-town"]).toHaveLength(1);
      expect(opened["music-town"][0].stops).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays silent and plays nothing when a track fails to load", async () => {
    const { calm, released, wanted, loops } = fake(() => Promise.resolve(false));
    loops.update(road);
    await landed();

    expect(calm()).toEqual([]);
    expect(released).toEqual(wanted);
  });

  it("starts the next quest track on each quest and fades the calm music under it", async () => {
    const { calm, quest, loops } = fake();
    loops.update(road);
    await landed();
    loops.update({ ...road, inQuest: true });
    await landed();
    loops.update(road);
    await landed();
    loops.update({ ...road, inQuest: true });
    await landed();
    expect(quest().map((q) => q.gains)).toEqual([[1, 0], [1]]);
    expect(new Set(quest().map((q) => q.file)).size).toBe(2);
    expect(calm()[0].gains).toEqual([1, 0]);
  });

  it("starts the next ruin track each time the player enters a territory", async () => {
    const { abandoned, loops } = fake();
    const ruins = { ...road, place: "abandoned" } as const;
    for (const place of [ruins, road, ruins, road, ruins]) {
      loops.update(place);
      await landed();
    }
    expect(abandoned().map((a) => a.file)).toHaveLength(3);
    expect(new Set(abandoned().map((a) => a.file)).size).toBe(3);
  });

  it("crossfades the calm music to a new track at its current level", async () => {
    const { calm, loops } = fake();
    loops.update(road);
    await landed();
    loops.nextTrack();
    await landed();
    expect(calm()).toHaveLength(2);
    expect(calm()[0].stops).toEqual([MIX.music.fadeSeconds * 1000]);
    expect(calm()[1].gains).toEqual([1]);
  });

  it("plays every calm track once before any repeats", async () => {
    const { calm, loops } = fake();
    const files = SOUNDS["music-calm"].files;
    loops.update(road);
    await landed();
    for (let i = 1; i < files.length; i++) {
      loops.nextTrack();
      await landed();
    }
    const cycle = calm().slice(0, files.length).map((c) => c.file);
    expect([...cycle].sort()).toEqual([...files].sort());
    loops.nextTrack();
    await landed();
    expect(calm()[files.length].file).toBe(cycle[0]);
  });

  it("moves combat to the next song and leaves the calm music alone", async () => {
    const { calm, songs, loops } = fake();
    loops.update({ ...road, inCombat: true });
    await landed();
    loops.nextTrack();
    await landed();
    expect(songs).toEqual(["next"]);
    expect(calm()).toHaveLength(0);
  });

  it("changes the quest or ruin track that is playing", async () => {
    const { quest, abandoned, songs, loops } = fake();
    loops.update({ ...road, inQuest: true, inCombat: true });
    await landed();
    const quests = quest().length;
    loops.nextTrack();
    await landed();
    expect(quest()).toHaveLength(quests + 1);
    loops.update({ ...road, place: "abandoned" });
    await landed();
    const ruins = abandoned().length;
    loops.nextTrack();
    await landed();
    expect(abandoned()).toHaveLength(ruins + 1);
    expect(abandoned().at(-1)!.gains).toEqual([1]);
    expect(songs).toEqual([]);
  });
  describe("rests", () => {
    const spell = MIX.music.spellSeconds;
    const restEnd = spell + MIX.music.restSeconds;

    it("fades the calm music out at the end of a spell and releases it after the fade", async () => {
      const { clock, calm, released, loops } = fake();
      loops.update(road);
      await landed();
      vi.useFakeTimers();
      try {
        clock.now = spell - 1;
        loops.update(road);
        expect(calm()[0].gains).toEqual([1]);
        clock.now = spell;
        loops.update(road);
        expect(calm()[0].gains).toEqual([1, 0]);
        await vi.advanceTimersByTimeAsync(MIX.music.fadeSeconds * 1000 + 600);
        expect(released).toContain(calm()[0].file);
        expect(calm()[0].stops).toEqual([0]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("opens the next shuffled calm track when the rest ends", async () => {
      const { clock, calm, loops } = fake();
      loops.update(road);
      await landed();
      clock.now = spell;
      loops.update(road);
      clock.now = restEnd;
      loops.update(road);
      await landed();
      expect(calm()).toHaveLength(2);
      expect(calm()[1].file).not.toBe(calm()[0].file);
      expect(calm()[1].gains).toEqual([1]);
    });

    it("opens the same town track again after a rest", async () => {
      const { clock, opened, loops } = fake();
      const town = { ...road, place: "town" } as const;
      loops.update(town);
      await landed();
      vi.useFakeTimers();
      try {
        clock.now = spell;
        loops.update(town);
        await vi.advanceTimersByTimeAsync(MIX.music.fadeSeconds * 1000 + 600);
        clock.now = restEnd;
        loops.update(town);
        await vi.advanceTimersByTimeAsync(10);
      } finally {
        vi.useRealTimers();
      }
      const town1 = opened["music-town"];
      expect(town1).toHaveLength(2);
      expect(town1[1].file).toBe(town1[0].file);
      expect(town1[1].gains).toEqual([1]);
    });

    it("starts the combat song at once during a rest and the next calm track after the fight", async () => {
      const { clock, combat, calm, loops } = fake();
      loops.update(road);
      await landed();
      clock.now = spell;
      loops.update(road);
      clock.now = spell + 5;
      loops.update({ ...road, inCombat: true });
      expect(combat).toEqual([false, true]);
      clock.now = spell + 10;
      loops.update(road);
      await landed();
      expect(combat).toEqual([false, true, false]);
      expect(calm()).toHaveLength(2);
      expect(calm()[1].gains).toEqual([1]);
    });

    it("plays town music and quest music at once during a calm rest", async () => {
      const { clock, opened, loops } = fake();
      loops.update(road);
      await landed();
      clock.now = spell;
      loops.update(road);
      loops.update({ ...road, place: "town" });
      await landed();
      expect(opened["music-town"][0].gains).toEqual([1]);
      loops.update(road);
      clock.now = spell + 100;
      loops.update(road);
      clock.now = spell + 100 + spell;
      loops.update(road);
      loops.update({ ...road, inQuest: true });
      await landed();
      expect(opened["music-quest"][0].gains).toEqual([1]);
    });

    it("ends a rest with the next key by opening one track and starting a new spell", async () => {
      const { clock, calm, loops } = fake();
      loops.update(road);
      await landed();
      clock.now = spell;
      loops.update(road);
      clock.now = spell + 10;
      loops.nextTrack();
      await landed();
      expect(calm()).toHaveLength(2);
      expect(calm()[1].gains).toEqual([1]);
      clock.now = spell + 10 + spell - 1;
      loops.update(road);
      expect(calm()[1].gains).toEqual([1]);
      clock.now = spell + 10 + spell;
      loops.update(road);
      expect(calm()[1].gains).toEqual([1, 0]);
    });

    it("restarts the spell when the next key changes the track in a spell", async () => {
      const { clock, calm, loops } = fake();
      loops.update(road);
      await landed();
      clock.now = spell - 5;
      loops.nextTrack();
      await landed();
      clock.now = spell + 5;
      loops.update(road);
      expect(calm()[1].gains).toEqual([1]);
    });

    it("still moves only the combat song with the next key in a fight", async () => {
      const { clock, calm, songs, loops } = fake();
      loops.update({ ...road, inCombat: true });
      clock.now = spell * 3;
      loops.update({ ...road, inCombat: true });
      loops.nextTrack();
      await landed();
      expect(songs).toEqual(["next"]);
      expect(calm()).toEqual([]);
    });

    it("plays music for 65 to 75 percent of two hours on the road", async () => {
      let seed = 12345;
      const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
      const { clock, calm, loops } = fake(() => Promise.resolve(true), random);
      const playing = () => {
        const handles = calm();
        return handles.length > 0 && handles.some((h) => h.gains.at(-1) === 1);
      };
      let audible = 0;
      const total = 7200;
      for (let t = 0; t < total; t++) {
        clock.now = t;
        loops.update(road);
        await Promise.resolve();
        await Promise.resolve();
        if (playing()) audible++;
      }
      expect(audible / total).toBeGreaterThan(0.65);
      expect(audible / total).toBeLessThan(0.75);
    });
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
    const player: Pick<SoundPlayer, "play" | "duck"> = { play: (...args) => { calls.push(args); }, duck: () => {} };
    const rig: Pick<CameraRig, "focus" | "screenOf"> = {
      focus: () => ({ x: 0, y: 0, z: 0 }),
      screenOf: () => ({ x: 50, y: 50 }),
    };
    const width = globalThis.window?.innerWidth;
    Object.defineProperty(globalThis, "window", { value: { innerWidth: 100 }, configurable: true });
    try {
      const director = new SoundDirector(player, rig, { fire: () => { throw new Error("no score event here"); } }, () => 0, () => 0);
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
    const director = new SoundDirector({ play: () => {}, duck: () => {} }, rig, music, () => NOW, () => 0);
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


describe("panelCue", () => {
  it("opens and closes a radio call with its own cues", () => {
    expect(panelCue(true, true)).toBe("radio");
    expect(panelCue(false, true)).toBe("radio-end");
  });

  it("opens and closes other panels with the panel cues", () => {
    expect(panelCue(true, false)).toBe("ui-open");
    expect(panelCue(false, false)).toBe("ui-close");
  });

  it("plays the radio end when a call closes, and nothing while the open state holds", () => {
    const panels = new PanelSounds();
    expect(panels.change(true, true)).toBe("radio");
    expect(panels.change(true, true)).toBeNull();
    expect(panels.change(false, false)).toBe("radio-end");
  });
});

describe("utilityCue", () => {
  const idle = { armed: false, recharging: false };
  const recharging = { armed: false, recharging: true };
  const armed = { armed: true, recharging: false };

  it("sounds armed when a utility arms", () => {
    expect(utilityCue(idle, armed)).toBe("utility-armed");
  });

  it("sounds ready when a recharge ends", () => {
    expect(utilityCue(recharging, idle)).toBe("utility-ready");
  });

  it("stays quiet when nothing changed or the part is new", () => {
    expect(utilityCue(idle, idle)).toBeNull();
    expect(utilityCue(armed, armed)).toBeNull();
    expect(utilityCue(undefined, armed)).toBeNull();
  });
});
