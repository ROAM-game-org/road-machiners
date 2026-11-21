
import { engineFileFor, engineStrainFileFor, hornSoundFor, MIX, SCORE_BLOCKS, SOUNDS, type CueId } from "../data/sounds";
import { shuffled, spatial } from "../audio/pick";
import type {
  LoopHandle,
  Placement,
  SoundPlayer,
} from "../audio/player";

export type Glide = { rateFrom: number; rateTo: number; gainFrom: number; gainTo: number; seconds: number; fadeSeconds: number; starts: boolean; stops: boolean };

export function glideAt(g: Glide, share: number): { rate: number; gain: number } {
  const s = Math.min(1, Math.max(0, share));
  const fadeIn = g.starts ? Math.min(1, (s * g.seconds) / g.fadeSeconds) : 1;
  const fadeOut = g.stops ? Math.min(1, ((1 - s) * g.seconds) / g.fadeSeconds) : 1;
  return { rate: g.rateFrom + (g.rateTo - g.rateFrom) * s, gain: (g.gainFrom + (g.gainTo - g.gainFrom) * s) * fadeIn * fadeOut };
}
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
import type { MusicTracks } from "../audio/music-shelf";
import { MusicPace, type PacedMusic } from "../audio/music-pace";

const CENTER: Placement = { pan: 0, gain: 1 };
const LOG_SIZE = 100;

const STINGS: {
  cue: CueId;
  match: (e: GameEvent, playerId: string) => boolean;
}[] = [
  { cue: "heatwave-warning", match: (e) => e.t === "weather" && e.outcome === "started" && e.event.kind === "heatwave" },
  { cue: "level-up", match: (e) => e.t === "skillUp" },
  { cue: "discover", match: (e) => e.t === "discover" },
  { cue: "money", match: (e) => e.t === "money" && e.amount > 0 },
];

export function panelCue(open: boolean, call: boolean): CueId {
  if (call) return open ? "radio" : "radio-end";
  return open ? "ui-open" : "ui-close";
}

export class PanelSounds {
  private open = false;
  private call = false;

  change(open: boolean, call: boolean): CueId | null {
    const cue = open === this.open ? null : panelCue(open, open ? call : this.call);
    this.open = open;
    this.call = call;
    return cue;
  }
}

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

  atLevel(cue: CueId, p: V3, delayMs: number, level: number): void {
    if (!(level > 0 && level <= 1)) throw new Error(`Sound level ${level} is outside (0, 1]`);
    this.record(`${cue} ${level.toFixed(2)}`);
    const placed = this.place(p);
    this.player.play(cue, { pan: placed.pan, gain: placed.gain * level }, delayMs);
  }

  honk(p: V3, delayMs: number, chassisId: string, label = ""): void {
    this.record(label ? `horn ${label}` : "horn");
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

export type LoopState = { stormShare: number; inCombat: boolean; inQuest: boolean; place: MusicPlace };

export type LoopLevels = {
  windGain: number;
  calmGain: number;
  questGain: number;
  townGain: number;
  outpostGain: number;
  abandonedGain: number;
  combatGain: number;
};

function musicOf(s: LoopState): "calm" | "quest" | "combat" | NonNullable<MusicPlace> {
  if (s.inQuest) return "quest";
  if (s.inCombat) return "combat";
  return s.place ?? "calm";
}

function pacedOf(s: LoopState): PacedMusic | null {
  const music = musicOf(s);
  return music === "combat" ? null : music;
}

export function loopLevels(s: LoopState, mix: typeof MIX, resting: boolean): LoopLevels {
  const w = mix.wind;
  const near = s.stormShare;
  const music = musicOf(s);
  const plays = (cue: typeof music) => Number(music === cue && !(resting && cue !== "combat"));
  return {
    windGain: w.baseGain + (w.stormGain - w.baseGain) * near,
    calmGain: plays("calm"),
    questGain: plays("quest"),
    townGain: plays("town"),
    outpostGain: plays("outpost"),
    abandonedGain: plays("abandoned"),
    combatGain: plays("combat"),
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
    starts: from < e.movingMs,
    stops: to < e.movingMs,
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

type Track = { file: string; handle: LoopHandle };

class Playlist {
  private files: string[];
  private track = 0;
  private gain = 0;
  private fade = 0;
  private current: Track | null = null;
  private opening: { file: string; id: number } | null = null;
  private opened = 0;

  constructor(private player: Pick<SoundPlayer, "loop">, private tracks: MusicTracks, private cue: "music-calm" | "music-quest" | "music-abandoned" | "music-town" | "music-outpost", shuffle: boolean) {
    this.files = shuffle ? shuffled(SOUNDS[cue].files, Math.random) : SOUNDS[cue].files;
  }

  setGain(gain: number, fadeSeconds: number): void {
    this.gain = gain;
    this.fade = fadeSeconds;
    if (this.current && (gain === 0 || this.current.file === this.files[this.track])) this.current.handle.setGain(gain, fadeSeconds);
    if (gain === 0) this.opening = null;
    this.ensure();
    if (gain === 0) this.closeWhenSilent(fadeSeconds);
  }

  next(): void {
    this.track = (this.track + 1) % this.files.length;
    this.ensure();
  }

  private ensure(): void {
    if (this.gain === 0) return;
    const file = this.files[this.track];
    if (this.current?.file === file || this.opening?.file === file) return;
    this.open(file);
  }

  private open(file: string): void {
    const id = ++this.opened;
    this.opening = { file, id };
    void this.tracks.want(file).then((landed) => {
      if (this.opening?.id !== id || !landed) {
        if (this.opening?.id === id) this.opening = null;
        return this.tracks.release(file);
      }
      this.opening = null;
      this.swapTo({ file, handle: this.player.loop(this.cue, { pan: 0, gain: 0 }, file) });
    });
  }

  private swapTo(track: Track): void {
    const old = this.current;
    this.current = track;
    track.handle.setGain(this.gain, this.fade);
    if (!old) return;
    old.handle.stop(this.fade * 1000);
    this.tracks.release(old.file);
  }

  private closeWhenSilent(fadeSeconds: number): void {
    const track = this.current;
    if (!track) return;
    setTimeout(() => {
      if (this.gain !== 0 || this.current !== track) return;
      track.handle.stop(0);
      this.tracks.release(track.file);
      this.current = null;
    }, (fadeSeconds + CLOSE_MARGIN_SECONDS) * 1000);
  }
}

const CLOSE_MARGIN_SECONDS = 0.5;

export class SoundLoops {
  private engine: { healthy: LoopHandle; strained: LoopHandle } | null = null;
  private engineChassis: string | null = null;
  private engineGlides: { healthy: Glide; strained: Glide } | null = null;
  private engineLevel: { rate: number; healthy: number; strained: number } | null = null;
  private player: Pick<SoundPlayer, "loop" | "now">;
  private pace: MusicPace;
  private state: LoopState | null = null;
  private wind: LoopHandle;
  private calm: Playlist;
  private quest: Playlist;
  private abandoned: Playlist;
  private places: [Playlist, "townGain" | "outpostGain"][];
  private last: LoopLevels | null = null;

  constructor(player: Pick<SoundPlayer, "loop" | "now">, private music: Pick<CombatMusic, "setCombat" | "nextSong">, tracks: MusicTracks, random: () => number) {
    this.player = player;
    this.pace = new MusicPace(MIX.music, random);
    const silent = { pan: 0, gain: 0 };
    this.wind = player.loop("wind", silent);
    this.calm = new Playlist(player, tracks, "music-calm", true);
    this.quest = new Playlist(player, tracks, "music-quest", true);
    this.abandoned = new Playlist(player, tracks, "music-abandoned", true);
    this.places = [
      [new Playlist(player, tracks, "music-town", false), "townGain"],
      [new Playlist(player, tracks, "music-outpost", false), "outpostGain"],
    ];
  }

  drive(g: Glide | null, chassisId: string, strain: Strain): void {
    if (!g) return this.parkEngine();
    this.useEngine(chassisId);
    const layers = strainGlides(g, strain);
    const level = this.engineLevel;
    this.engineGlides = level ? { healthy: { ...layers.healthy, rateFrom: level.rate, gainFrom: level.healthy }, strained: { ...layers.strained, rateFrom: level.rate, gainFrom: level.strained } } : layers;
  }

  private useEngine(chassisId: string): void {
    if (this.engineChassis === chassisId && this.engine) return;
    this.engine?.healthy.stop(0);
    this.engine?.strained.stop(0);
    const silent = { pan: 0, gain: 0 };
    this.engine = {
      healthy: this.player.loop("engine", silent, engineFileFor(chassisId)),
      strained: this.player.loop("engine-strain", silent, engineStrainFileFor(chassisId)),
    };
    this.engineChassis = chassisId;
    this.engineLevel = null;
  }

  private parkEngine(): void {
    const level = this.engineLevel;
    if (!level) return;
    const fade = (gain: number): Glide => ({ rateFrom: level.rate, rateTo: level.rate, gainFrom: gain, gainTo: 0, seconds: 1, fadeSeconds: 1, starts: false, stops: false });
    this.engineGlides = { healthy: fade(level.healthy), strained: fade(level.strained) };
  }

  engineAt(share: number): void {
    if (!this.engine || !this.engineGlides) return;
    const healthy = glideAt(this.engineGlides.healthy, share);
    const strained = glideAt(this.engineGlides.strained, share);
    this.engine.healthy.set(healthy.rate, healthy.gain);
    this.engine.strained.set(strained.rate, strained.gain);
    this.engineLevel = { rate: healthy.rate, healthy: healthy.gain, strained: strained.gain };
  }

  rev(chassisId: string): void {
    this.player.loop("engine", { pan: 0, gain: 0 }, engineFileFor(chassisId)).once(MIX.rev);
  }

  update(s: LoopState): void {
    this.state = s;
    this.pace.advance(pacedOf(s), this.player.now());
    const l = loopLevels(s, MIX, this.pace.resting);
    const was = this.last;
    this.last = l;
    if (was?.windGain !== l.windGain)
      this.wind.setGain(l.windGain, MIX.wind.fadeSeconds);
    this.updateMusic(l, was);
  }

  private updateMusic(l: LoopLevels, was: LoopLevels | null): void {
    this.updatePlaylists(l, was);
    this.updatePlaces(l, was);
    if (was?.combatGain !== l.combatGain) this.music.setCombat(l.combatGain > 0);
  }

  private updatePlaylists(l: LoopLevels, was: LoopLevels | null): void {
    const fade = MIX.music.fadeSeconds;
    for (const [playlist, key] of [[this.calm, "calmGain"], [this.quest, "questGain"], [this.abandoned, "abandonedGain"]] as const) {
      if (was?.[key] === l[key]) continue;
      if (was?.[key] === 0) playlist.next();
      playlist.setGain(l[key], fade);
    }
  }

  private updatePlaces(l: LoopLevels, was: LoopLevels | null): void {
    for (const [loop, key] of this.places) if (was?.[key] !== l[key]) loop.setGain(l[key], MIX.music.fadeSeconds);
  }

  nextTrack(): void {
    const l = this.last;
    if (l?.combatGain && !l.questGain) return this.music.nextSong();
    if (this.pace.resting && this.state) {
      this.pace.wake(this.player.now());
      return this.update(this.state);
    }
    const fade = MIX.music.fadeSeconds;
    const [playlist, key] = this.playingList(l);
    playlist.next();
    playlist.setGain(l?.[key] ?? 0, fade);
    if (l?.[key]) this.pace.wake(this.player.now());
  }

  private playingList(l: LoopLevels | null): [Playlist, "calmGain" | "questGain" | "abandonedGain"] {
    if (l?.questGain) return [this.quest, "questGain"];
    if (l?.abandonedGain) return [this.abandoned, "abandonedGain"];
    return [this.calm, "calmGain"];
  }
}
