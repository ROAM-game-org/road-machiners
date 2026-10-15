import { BEATS_PER_BAR, MIX, SOUNDS, type Cue } from "../data/sounds";
import type { BeatLoopHandle, Placement, SoundPlayer, SoundSelection } from "../audio/player";
import { CombatScore, SoundDirector, SoundLoops, type AccentCue, type AccentTake, type BaseCue } from "./sound";

export type Line = "lead" | "secondary";
export type Result = "played" | "skipped" | "crowded" | "forced";
export type Sounded = { cue: string; file: string; start: number; end: number; from: number; stab: boolean; gain: number; pan: number; owner: number | null };
export type Offered = { id: number; cue: AccentCue; line: Line; at: number; result: Result; heat: number; from: number };
export type Step = { at: number; value: number };
export type Move = { at: number; target: number; tc: number };
export type Segment = { from: number; at: number; target: number; tc: number };
export type BaseTrace = { id: string; file: string; offset: number; when: number; duration: number; grid: { start: number; beat: number }; gain: Move[]; duck: Move[] };
export type Press = { id: number; cue: AccentCue; at: number };
export type LedgerRow = { id: number; event: string; line: Line; result: Result; heat: number; tails: number; from: number };
export type PlannedBase = { id: string; file: string; volume: number; when: number; offset: number; duration: number; gain: Move[]; duck: Move[] };
export type PlannedPlay = { index: number; cue: string; file: string; start: number; from: number; volume: number; pan: number; stab: boolean; owner: number | null };
export type MixPlan = { bases: PlannedBase[]; plays: PlannedPlay[] };

export type ScorePlayer = Pick<SoundPlayer, "now" | "play" | "beatLoop" | "chooseWithPeak" | "takeWithPeak" | "loop" | "setBusTone">;
export type SessionParts = {
  player: ScorePlayer;
  durationOf: (file: string) => number;
  roll: () => number;
  wallMs: () => number;
};

export const EVENT_LABELS: Record<AccentCue, string> = {
  "accent-sighted": "Sighted",
  "accent-struck": "Hit you",
  "accent-crit": "You crit",
  "accent-crash": "Crash",
  "accent-hit": "You hit",
  "accent-miss": "You miss",
};
export const EVENT_GROUPS: AccentCue[][] = [
  ["accent-sighted", "accent-struck", "accent-crit", "accent-crash"],
  ["accent-hit", "accent-miss"],
];
export const TRACK_ROWS = EVENT_GROUPS.flat();
export const LEDGER_HEAD = ["", "Event", "Line", "Result", "Heat", "Tails", ""];

const UNKNOWN_TAIL_SECONDS = 0.25;
const sounds: Record<string, Cue> = SOUNDS;

const noRig = {
  focus: () => {
    throw new Error("The score lab has no camera");
  },
  screenOf: () => {
    throw new Error("The score lab has no camera");
  },
};

function heardVolume(cue: string): number {
  return sounds[cue].volume * MIX.busVolume[sounds[cue].bus];
}

export function lineOf(cue: string): Line {
  return MIX.score.accents[cue as AccentCue].line;
}

function settle(seg: Segment, t: number): number {
  if (seg.tc === 0) return seg.target;
  return seg.target + (seg.from - seg.target) * Math.exp(-(t - seg.at) / seg.tc);
}

export function levelAt(moves: Move[], initial: number, t: number): number {
  let seg: Segment = { from: initial, at: -Infinity, target: initial, tc: 0 };
  for (const m of moves) {
    if (m.at > t) break;
    seg = { from: settle(seg, m.at), at: m.at, target: m.target, tc: m.tc };
  }
  return settle(seg, t);
}

export function baseLevels(trace: BaseTrace, t: number): { gain: number; heard: number } {
  const gain = levelAt(trace.gain, 0, t);
  return { gain, heard: gain * levelAt(trace.duck, 1, t) };
}

function addMove(moves: Move[], move: Move): void {
  moves.push(move);
  moves.sort((a, b) => a.at - b.at);
}

export function ledgerCells(row: LedgerRow): string[] {
  const note = row.from > 0 ? `starts ${row.from.toFixed(2)} s in` : "";
  return [String(row.id), row.event, row.line, row.result, row.heat.toFixed(1), String(row.tails), note];
}

export class ScoreSession {
  readonly sounded: Sounded[] = [];
  readonly offers: Offered[] = [];
  readonly presses: Press[] = [];
  readonly traces = new Map<string, BaseTrace>();
  readonly leadMs: number;
  lastRaised: string | null = null;
  private heats: Step[] = [];
  private pinnedTakes = new Map<string, string>();
  private idOfTake = new Map<AccentTake, number>();
  private assigning: number[] = [];
  private pressed = 0;
  private combat = false;
  private combatStart: number | null = null;
  private force = false;
  private score: CombatScore;
  private loops: SoundLoops;
  private director: SoundDirector;

  constructor(private parts: SessionParts) {
    const player = parts.player;
    this.score = new CombatScore(
      {
        now: () => player.now(),
        play: (id, at, delayMs, selection) => this.recordPlay(id, at, delayMs, selection),
        beatLoop: (id, file, when, offset) => this.recordBase(id, file, when, offset),
        chooseWithPeak: (id) => this.chooseTake(id),
      },
      parts.roll,
    );
    this.loops = new SoundLoops(player, this.score);
    this.director = new SoundDirector(player, noRig, {
      take: (cue) => this.assignedTake(cue),
      accent: (cue, delayMs, take) => this.recordAccent(cue, delayMs, take),
    });
    this.leadMs = this.landingLeadMs();
  }

  get inCombat(): boolean {
    return this.combat;
  }

  get forced(): boolean {
    return this.force;
  }

  now(): number {
    return this.parts.player.now();
  }

  setForced(on: boolean): void {
    this.force = on;
  }

  flipCombat(): void {
    this.combat = !this.combat;
    this.combatStart = this.combat ? this.parts.wallMs() : null;
    if (!this.combat) this.director.clearAccents();
  }

  frame(): void {
    if (this.combatStart !== null) this.director.playDueAccents(this.clockMs(), 1);
    this.loops.update({ stormShare: 0, inCombat: this.combat, inQuest: false, place: null, paused: false });
  }

  pickBase(id: BaseCue | null): void {
    this.score.preferBase(id);
    if (!this.combat) return;
    this.score.setCombat(false, MIX.music.fadeSeconds);
    this.score.setCombat(true, MIX.music.fadeSeconds);
  }

  pinTake(cue: AccentCue, file: string | null): void {
    if (file === null) this.pinnedTakes.delete(cue);
    else this.pinnedTakes.set(cue, file);
  }

  fire(cue: AccentCue): void {
    if (!this.combat) return;
    const id = ++this.pressed;
    this.presses.push({ id, cue, at: this.now() });
    if (this.force) this.forceStab(cue, id);
    else if (cue === "accent-sighted") this.director.accent(cue, 0, this.tagged(cue, id));
    else this.queueAccent(cue, id);
  }

  heatAt(t: number): number {
    const last = this.heats.filter((h) => h.at <= t).at(-1);
    if (!last) return 0;
    return last.value * 0.5 ** ((t - last.at) / MIX.score.heatHalfLifeSeconds);
  }

  lastTrace(): BaseTrace | undefined {
    return this.lastRaised ? this.traces.get(this.lastRaised) : undefined;
  }

  ledger(): LedgerRow[] {
    return this.offers.map((o) => ({
      id: o.id,
      event: EVENT_LABELS[o.cue],
      line: o.line,
      result: o.result,
      heat: o.heat,
      tails: this.sounded.filter((s) => s.owner === o.id && !s.stab).length,
      from: o.from,
    }));
  }

  mixPlan(): MixPlan {
    const bases = [...this.traces.values()].filter((t) => t.gain.length > 0).map((t) => this.plannedBase(t));
    const plays = this.sounded.map((s, index) => ({
      index,
      cue: s.cue,
      file: s.file,
      start: s.start,
      from: s.from,
      volume: heardVolume(s.cue) * s.gain,
      pan: s.pan,
      stab: s.stab,
      owner: s.owner,
    }));
    return { bases, plays };
  }

  private plannedBase(t: BaseTrace): PlannedBase {
    return { id: t.id, file: t.file, volume: heardVolume(t.id), when: t.when, offset: t.offset, duration: t.duration, gain: t.gain, duck: t.duck };
  }

  private clockMs(): number {
    if (this.combatStart === null) throw new Error("The combat clock runs only in combat");
    return this.parts.wallMs() - this.combatStart;
  }

  private landingLeadMs(): number {
    const peaks = TRACK_ROWS.flatMap((cue) => SOUNDS[cue].files.map((file) => this.parts.player.takeWithPeak(cue, file).peak));
    return (Math.max(...peaks) + MIX.score.offerAheadSeconds) * 1000;
  }

  private latestPlayed(cue: string): Offered | undefined {
    return this.offers.filter((o) => o.cue === cue && o.result === "played").at(-1);
  }

  private ownerOfTail(cue: string): number {
    const owner = this.latestPlayed(cue);
    if (!owner) throw new Error(`A ${cue} tail played with no played ${cue} event behind it`);
    return owner.id;
  }

  private pinnedSelection(id: string): SoundSelection | undefined {
    const pinned = this.pinnedTakes.get(id);
    return pinned === undefined ? undefined : { file: pinned, rate: 1 };
  }

  private recordPlay(id: string, at: Placement, delayMs: number, selection?: SoundSelection): void {
    const known = selection ?? this.pinnedSelection(id);
    const played = known ?? { file: this.parts.player.chooseWithPeak(id).file, rate: 1 };
    const start = this.now() + delayMs / 1000;
    const from = played.from ?? 0;
    const stab = selection !== undefined;
    const owner = stab ? null : this.ownerOfTail(id);
    const length = known ? this.parts.durationOf(played.file) - from : UNKNOWN_TAIL_SECONDS;
    this.sounded.push({ cue: id, file: played.file, start, end: start + length, from, stab, gain: at.gain, pan: at.pan, owner });
    this.parts.player.play(id, at, delayMs, played);
  }

  private chooseTake(id: string): AccentTake {
    const pinned = this.pinnedTakes.get(id);
    return pinned === undefined ? this.parts.player.chooseWithPeak(id) : this.parts.player.takeWithPeak(id, pinned);
  }

  private recordBase(id: string, file: string, when: number, offset: number): BeatLoopHandle {
    const player = this.parts.player;
    const loop = player.beatLoop(id, file, when, offset);
    const beat = SOUNDS[id as BaseCue].beat;
    if (!beat) throw new Error(`Score base ${id} needs a beat`);
    const trace: BaseTrace = { id, file, offset, when, duration: loop.duration, grid: { start: when, beat: loop.duration / (beat.bars * BEATS_PER_BAR) }, gain: [], duck: [] };
    this.traces.set(id, trace);
    return {
      ...loop,
      duration: loop.duration,
      setGain: (gain, ramp) => {
        if (gain > 0) this.lastRaised = id;
        addMove(trace.gain, { at: player.now(), target: gain, tc: ramp / 3 });
        loop.setGain(gain, ramp);
      },
      duck: (time, level, attack, release) => {
        addMove(trace.duck, { at: time, target: level, tc: attack / 3 });
        addMove(trace.duck, { at: time + attack, target: 1, tc: release / 3 });
        loop.duck(time, level, attack, release);
      },
    };
  }

  private tagged(cue: AccentCue, id: number): AccentTake {
    const take = this.score.take(cue);
    this.idOfTake.set(take, id);
    return take;
  }

  private assignedTake(cue: AccentCue): AccentTake {
    const take = this.score.take(cue);
    const id = this.assigning.shift();
    if (id !== undefined) this.idOfTake.set(take, id);
    return take;
  }

  private pressOf(cue: AccentCue, take?: AccentTake): number {
    if (!take) throw new Error("The score lab always plays an accent with a take");
    const id = this.idOfTake.get(take);
    if (id === undefined) throw new Error(`A ${cue} take came in with no press behind it`);
    return id;
  }

  private stabAfter(before: number, cue: AccentCue): Sounded {
    const stab = this.sounded[before];
    if (!stab) throw new Error(`A played ${cue} left no stab`);
    return stab;
  }

  private recordAccent(cue: AccentCue, delayMs: number, take?: AccentTake): ReturnType<CombatScore["accent"]> {
    const id = this.pressOf(cue, take);
    const before = this.sounded.length;
    const r = this.score.accent(cue, delayMs, take);
    if (!r) return r;
    const stab = r.offer === "played" ? this.stabAfter(before, cue) : null;
    if (stab) stab.owner = id;
    this.offers.push({ id, cue, line: lineOf(cue), at: this.now() + delayMs / 1000, result: r.offer, heat: r.heat, from: stab?.from ?? 0 });
    this.heats.push({ at: this.now(), value: r.heat });
    return r;
  }

  private forceStab(cue: AccentCue, id: number): void {
    const take = this.tagged(cue, id);
    this.recordPlay(cue, { pan: 0, gain: 1 }, this.leadMs - take.peak * 1000, { file: take.file, rate: 1 });
    this.stabAfter(this.sounded.length - 1, cue).owner = id;
    const now = this.now();
    this.offers.push({ id, cue, line: lineOf(cue), at: now + this.leadMs / 1000, result: "forced", heat: this.heatAt(now), from: 0 });
  }

  private queueAccent(cue: AccentCue, id: number): void {
    this.assigning.push(id);
    this.director.queueAccent(cue, this.clockMs() + this.leadMs);
  }
}
