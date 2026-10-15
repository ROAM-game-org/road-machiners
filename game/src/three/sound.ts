
import { engineFileFor, engineStrainFileFor, hornSoundFor, MIX, SCORE_BLOCKS, SOUNDS, type CueId } from "../data/sounds";
import { shuffled, spatial } from "../audio/pick";
import type {
  Glide,
  LoopHandle,
  Placement,
  SoundPlayer,
} from "../audio/player";
import type { V3, VehicleFrame } from "../phys/frames";
import { PHYSICS } from "../data/physics";
import type { GameEvent, ShotRound } from "../sim/types";
import { isInTerritory, isNearOutpost, isNearTown } from "../sim/sites";
import type { Vec } from "../sim/vec";
import { atlasOf } from "../sim/atlas";
import type { Terrain } from "../sim/terrain";
import type { CameraRig } from "./render/camera";
import type { BlockEvent } from "./block-session";
import type { CombatMusic } from "./combat-music";

const CENTER: Placement = { pan: 0, gain: 1 };
const LOG_SIZE = 100;

const STINGS: {
  cue: CueId;
  match: (e: GameEvent, playerId: string) => boolean;
}[] = [
  { cue: "level-up", match: (e) => e.t === "skillUp" },
  { cue: "discover", match: (e) => e.t === "discover" },
  { cue: "money", match: (e) => e.t === "money" && e.amount > 0 },
];

export function stingOf(events: GameEvent[], playerId: string): CueId | null {
  return (
    STINGS.find((s) => events.some((e) => s.match(e, playerId)))?.cue ?? null
  );
}

export type ScorePick = { kind: BlockEvent; round: number | null };

export function scoreEventOf(e: GameEvent, playerId: string): ScorePick | null {
  if (e.t === "collision") return [e.a, e.b].includes(playerId) ? { kind: "crash", round: null } : null;
  if (e.t === "shot") return volleyEvent(e.rounds, e.shooter === playerId, e.target === playerId);
  return knockoutOf(e, playerId);
}

function knockoutOf(e: GameEvent, playerId: string): ScorePick | null {
  const knocked = (e.t === "npcKnockout" || e.t === "destroyed") && e.by === playerId;
  return knocked ? { kind: "knockout", round: null } : null;
}

const strikes = (r: ShotRound) => r.hit || r.hits.length > 0;

function volleyEvent(rounds: ShotRound[], mine: boolean, atPlayer: boolean): ScorePick | null {
  if (!mine && !atPlayer) return null;
  const crit = rounds.findIndex((r) => r.crit);
  if (crit >= 0) return { kind: "crit", round: crit };
  const struck = rounds.findIndex(strikes);
  const kind = plainEvent(struck >= 0, mine);
  return kind ? { kind, round: Math.max(0, struck) } : null;
}

function plainEvent(struck: boolean, mine: boolean): BlockEvent | null {
  if (mine) return struck ? "hit" : "miss";
  return struck ? "struck" : null;
}

export type CombatSigns = { sighted: boolean };

export class CombatWatch {
  private seen = new Map<string, number>();

  observe(turn: number, hostiles: string[]): CombatSigns {
    const sighted = hostiles.some((id) => (this.seen.get(id) ?? -Infinity) < turn - 1);
    for (const [id, last] of this.seen) if (last < turn - 1) this.seen.delete(id);
    for (const id of hostiles) this.seen.set(id, turn);
    return { sighted };
  }
}

export class SoundDirector {
  readonly log: string[] = [];

  constructor(
    private player: Pick<SoundPlayer, "play">,
    private rig: Pick<CameraRig, "focus" | "screenOf">,
    private music: Pick<CombatMusic, "fire">,
    private now: () => number,
  ) {}

  private due: { kind: BlockEvent; atMs: number }[] = [];

  scoreEvent(kind: BlockEvent, delayMs: number): void {
    const f = this.music.fire(kind, this.now() + delayMs / 1000);
    if (f) this.record(`score ${kind} heat${f.heat.toFixed(1)} surprise${f.surprise.toFixed(1)}${f.lanes ? " lanes" : ""}`);
  }

  timeScoreEvents(events: GameEvent[], playerId: string, atOf: (e: GameEvent) => number | null): void {
    for (const e of events) {
      const pick = scoreEventOf(e, playerId);
      const atMs = pick && atOf(e);
      if (pick && atMs !== null) this.queueScoreEvent(pick.kind, atMs);
    }
  }

  queueScoreEvent(kind: BlockEvent, atMs: number): void {
    this.due.push({ kind, atMs });
  }

  playDueScoreEvents(elapsedMs: number, speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0) throw new Error(`Playback speed ${speed} is not a positive number`);
    const aheadMs = SCORE_BLOCKS.eventLeadSeconds * 1000;
    this.due = this.due.filter((d) => {
      const delay = Math.max(0, (d.atMs - elapsedMs) / speed);
      if (delay > aheadMs) return true;
      this.scoreEvent(d.kind, delay);
      return false;
    });
  }

  clearScoreEvents(): void {
    this.due = [];
  }

  at(cue: CueId, p: V3, delayMs: number): void {
    this.record(cue);
    this.player.play(cue, this.place(p), delayMs);
  }

  honk(p: V3, delayMs: number, chassisId: string): void {
    this.record("horn");
    this.player.play("horn", this.place(p), delayMs, hornSoundFor(chassisId));
  }

  ui(cue: CueId): void {
    this.record(cue);
    this.player.play(cue, CENTER, 0);
  }

  engineStrain(s: Strain): void {
    if (s.from > 0 || s.to > 0) this.record(`engine-strain ${s.from.toFixed(1)}->${s.to.toFixed(1)}`);
  }

  private record(cue: string): void {
    this.log.push(cue);
    if (this.log.length > LOG_SIZE) this.log.shift();
  }

  private place(p: V3): Placement {
    const f = this.rig.focus();
    const distance = Math.hypot(p.x - f.x, p.z - f.z);
    return spatial(
      this.rig.screenOf(p).x,
      window.innerWidth,
      distance,
      MIX.halfGainMeters,
      MIX.panWidth,
    );
  }
}

export type MusicPlace = "town" | "outpost" | "abandoned" | null;

export function musicPlaceAt(t: Terrain, pos: Vec): MusicPlace {
  const atlas = atlasOf(t);
  if (isNearTown(atlas, pos, MIX.music.musicReachTiles)) return "town";
  if (isNearOutpost(atlas, pos, MIX.music.musicReachTiles)) return "outpost";
  return isInTerritory(atlas, pos) ? "abandoned" : null;
}

export type LoopState = { stormShare: number; inCombat: boolean; inQuest: boolean; place: MusicPlace; paused: boolean };

export type LoopLevels = {
  windGain: number;
  calmGain: number;
  questGain: number;
  townGain: number;
  outpostGain: number;
  abandonedGain: number;
  combatGain: number;
  musicCutoffHz: number;
};

function musicOf(s: LoopState): "calm" | "quest" | "combat" | NonNullable<MusicPlace> {
  if (s.inQuest) return "quest";
  if (s.inCombat) return "combat";
  return s.place ?? "calm";
}

export function loopLevels(s: LoopState, mix: typeof MIX): LoopLevels {
  const w = mix.wind;
  const near = s.stormShare;
  const music = musicOf(s);
  return {
    windGain: w.baseGain + (w.stormGain - w.baseGain) * near,
    calmGain: Number(music === "calm"),
    questGain: Number(music === "quest"),
    townGain: Number(music === "town"),
    outpostGain: Number(music === "outpost"),
    abandonedGain: Number(music === "abandoned"),
    combatGain: Number(music === "combat"),
    musicCutoffHz: s.paused && music !== "quest" ? mix.music.pauseCutoffHz : mix.music.openCutoffHz,
  };
}

export function computeEngineGlide(
  frames: VehicleFrame[],
  seconds: number,
  mix: typeof MIX,
  overdrive: boolean,
): ReturnType<typeof engineGlide> {
  return engineGlide(
    computeStepSpeed(frames, 1),
    computeStepSpeed(frames, frames.length - 1),
    seconds,
    mix,
    overdrive,
  );
}

function computeStepSpeed(
  frames: VehicleFrame[] | undefined,
  step: number,
): number {
  if (!frames || step < 1 || step >= frames.length) return 0;
  const a = frames[step - 1].pos;
  const b = frames[step].pos;
  return Math.hypot(b.x - a.x, b.z - a.z) * PHYSICS.stepsPerSecond;
}

export function engineGlide(
  from: number,
  to: number,
  seconds: number,
  mix: typeof MIX,
  overdrive: boolean,
): (Glide & { brake: boolean }) | null {
  const e = mix.engine;
  if (Math.max(from, to) < e.movingMs) return null;
  const share = (v: number) => Math.min(1, v / e.topSpeedMs);
  const rate = (v: number) => e.idleRate + (e.topRate - e.idleRate) * share(v);
  const gain = (v: number) => e.idleGain + (1 - e.idleGain) * share(v);
  const load = Math.max(-1, Math.min(1, (to - from) / e.loadMs));
  const loud = overdrive ? e.overdriveGain : 1;
  return {
    rateFrom: rate(from),
    rateTo: rate(to) + load * (load > 0 ? e.revUp : e.revDown),
    gainFrom: gain(from) * loud,
    gainTo: (gain(to) + load * e.loadGain) * loud,
    seconds,
    fadeSeconds: e.fadeSeconds,
    brake: from - to >= e.brakeMs,
  };
}

export type Strain = { from: number; to: number };

export class EngineStrain {
  private turn: number | null = null;
  private level = 0;

  next(turn: number, damaging: boolean): Strain {
    const before = this.turn === turn - 1 ? this.level : 0;
    const s = damaging ? { from: 1, to: 1 } : { from: before, to: Math.max(0, before - MIX.engine.strainRelease) };
    this.turn = turn;
    this.level = s.to;
    return s;
  }
}

export function strainGlides(g: Glide, s: Strain): { healthy: Glide; strained: Glide } {
  const level = (from: number, to: number): Glide => ({ ...g, gainFrom: g.gainFrom * from, gainTo: g.gainTo * to });
  return { healthy: level(1 - s.from, 1 - s.to), strained: level(s.from, s.to) };
}

class Playlist {
  private files: string[];
  private track = 0;
  private handle: LoopHandle;

  constructor(private player: Pick<SoundPlayer, "loop">, private cue: "music-calm" | "music-quest" | "music-abandoned") {
    this.files = shuffled(SOUNDS[cue].files, Math.random);
    this.handle = player.loop(cue, { pan: 0, gain: 0 }, this.files[0]);
  }

  setGain(gain: number, fadeSeconds: number): void {
    this.handle.setGain(gain, fadeSeconds);
  }

  next(fadeSeconds: number): void {
    this.handle.stop(fadeSeconds * 1000);
    this.track = (this.track + 1) % this.files.length;
    this.handle = this.player.loop(this.cue, { pan: 0, gain: 0 }, this.files[this.track]);
  }
}

export class SoundLoops {
  private engine: { healthy: LoopHandle; strained: LoopHandle } | null = null;
  private engineChassis: string | null = null;
  private player: Pick<SoundPlayer, "loop" | "setBusTone">;
  private wind: LoopHandle;
  private calm: Playlist;
  private quest: Playlist;
  private abandoned: Playlist;
  private places: [LoopHandle, "townGain" | "outpostGain"][];
  private last: LoopLevels | null = null;

  constructor(player: Pick<SoundPlayer, "loop" | "setBusTone">, private music: Pick<CombatMusic, "setCombat">) {
    this.player = player;
    const silent = { pan: 0, gain: 0 };
    this.wind = player.loop("wind", silent);
    this.calm = new Playlist(player, "music-calm");
    this.quest = new Playlist(player, "music-quest");
    this.abandoned = new Playlist(player, "music-abandoned");
    this.places = [
      [player.loop("music-town", silent), "townGain"],
      [player.loop("music-outpost", silent), "outpostGain"],
    ];
  }

  drive(g: Glide, chassisId: string, strain: Strain): void {
    let engine = this.engine;
    if (this.engineChassis !== chassisId || !engine) {
      engine?.healthy.stop(0);
      engine?.strained.stop(0);
      const silent = { pan: 0, gain: 0 };
      engine = {
        healthy: this.player.loop("engine", silent, engineFileFor(chassisId)),
        strained: this.player.loop("engine-strain", silent, engineStrainFileFor(chassisId)),
      };
      this.engine = engine;
      this.engineChassis = chassisId;
    }
    const layers = strainGlides(g, strain);
    engine.healthy.glide(layers.healthy);
    engine.strained.glide(layers.strained);
  }

  rev(chassisId: string): void {
    this.player.loop("engine", { pan: 0, gain: 0 }, engineFileFor(chassisId)).once(MIX.rev);
  }

  update(s: LoopState): void {
    const l = loopLevels(s, MIX);
    const was = this.last;
    this.last = l;
    if (was?.windGain !== l.windGain)
      this.wind.setGain(l.windGain, MIX.wind.fadeSeconds);
    this.updateMusic(l, was);
  }

  private updateMusic(l: LoopLevels, was: LoopLevels | null): void {
    this.updatePlaylists(l, was);
    this.updatePlaces(l, was);
    if (was?.musicCutoffHz !== l.musicCutoffHz) this.player.setBusTone("music", l.musicCutoffHz, MIX.music.toneSeconds);
    if (was?.combatGain !== l.combatGain) this.music.setCombat(l.combatGain > 0);
  }

  private updatePlaylists(l: LoopLevels, was: LoopLevels | null): void {
    const fade = MIX.music.fadeSeconds;
    for (const [playlist, key] of [[this.calm, "calmGain"], [this.quest, "questGain"], [this.abandoned, "abandonedGain"]] as const) {
      if (was?.[key] === l[key]) continue;
      if (was?.[key] === 0) playlist.next(fade);
      playlist.setGain(l[key], fade);
    }
  }

  private updatePlaces(l: LoopLevels, was: LoopLevels | null): void {
    for (const [loop, key] of this.places) if (was?.[key] !== l[key]) loop.setGain(l[key], MIX.music.fadeSeconds);
  }

  nextTrack(): void {
    const fade = MIX.music.fadeSeconds;
    this.calm.next(fade);
    this.calm.setGain(this.last?.calmGain ?? 0, fade);
  }
}
