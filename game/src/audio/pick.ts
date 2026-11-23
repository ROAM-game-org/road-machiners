import type { Layer, SoundEventId } from "../data/sounds";

export function pickVariant(n: number, last: number | null, roll: number): number {
  if (n < 1) throw new Error(`Cue has no variants`);
  if (n === 1) return 0;
  if (last === null) return Math.floor(roll * n);
  const i = Math.floor(roll * (n - 1));
  return i >= last ? i + 1 : i;
}

export function shuffled<T>(items: readonly T[], roll: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function spatial(screenX: number, width: number, distance: number, halfGainMeters: number, panWidth: number): { pan: number; gain: number } {
  if (!Number.isFinite(screenX) || !Number.isFinite(distance)) throw new Error(`Sound placement needs a finite screen x and distance, got ${screenX}, ${distance}`);
  const side = width > 0 ? Math.min(1, Math.max(-1, (screenX / width) * 2 - 1)) : 0;
  return { pan: side * panWidth, gain: 1 / (1 + distance / halfGainMeters) };
}

export type CrashCurve = { quietImpact: number; fullImpact: number; quietGain: number };

export function crashLevel(impact: number, curve: CrashCurve): number {
  if (!Number.isFinite(impact) || impact < 0) throw new Error(`Bad crash impact ${impact}`);
  const { quietImpact, fullImpact, quietGain } = curve;
  if (!(fullImpact > quietImpact)) throw new Error(`Crash curve needs full impact ${fullImpact} above quiet impact ${quietImpact}`);
  if (!(quietGain > 0 && quietGain <= 1)) throw new Error(`Crash quiet gain ${quietGain} is outside (0, 1]`);
  const share = Math.min(1, Math.max(0, (impact - quietImpact) / (fullImpact - quietImpact)));
  return quietGain + (1 - quietGain) * share;
}

export type VoicePlay = { cue: string; maxVoices: number; budgeted: boolean; now: number; endsAt: number; minGapSec: number };
export type AdmittedVoice = { id: number; cut: number[] };
type Voice = { id: number; cue: string; endsAt: number; budgeted: boolean };

export class VoiceBudget {
  private voices: Voice[] = [];
  private lastStart = new Map<string, number>();
  private nextId = 0;

  constructor(private readonly budget: number) {
    if (!(Number.isInteger(budget) && budget >= 1)) throw new Error(`Voice budget ${budget} must be a whole number of at least 1`);
  }

  admit(play: VoicePlay): AdmittedVoice | null {
    this.voices = this.voices.filter((v) => v.endsAt > play.now);
    const last = this.lastStart.get(play.cue);
    if (last !== undefined && play.now - last < play.minGapSec) return null;
    this.lastStart.set(play.cue, play.now);
    const cut = this.cutAtCap(play.cue, play.maxVoices);
    const voice: Voice = { id: this.nextId++, cue: play.cue, endsAt: play.endsAt, budgeted: play.budgeted };
    this.voices.push(voice);
    if (play.budgeted) cut.push(...this.cutOverBudget(voice.id));
    return { id: voice.id, cut };
  }

  private cutAtCap(cue: string, maxVoices: number): number[] {
    const same = this.voices.filter((v) => v.cue === cue).sort(byAge);
    return same.slice(0, Math.max(0, same.length - maxVoices + 1)).map((v) => this.remove(v));
  }

  private cutOverBudget(newId: number): number[] {
    const cut: number[] = [];
    for (let held = this.budgeted(); held.length > this.budget; held = this.budgeted()) {
      const victim = mostCrowdedOldest(held);
      if (victim.id === newId) throw new Error(`Voice budget ${this.budget} would cut the play it just admitted`);
      cut.push(this.remove(victim));
    }
    return cut;
  }

  private budgeted(): Voice[] {
    return this.voices.filter((v) => v.budgeted);
  }

  private remove(voice: Voice): number {
    this.voices = this.voices.filter((v) => v !== voice);
    return voice.id;
  }
}

function byAge(a: Voice, b: Voice): number {
  return a.id - b.id;
}

function mostCrowdedOldest(voices: readonly Voice[]): Voice {
  const byCue = new Map<string, Voice[]>();
  for (const v of voices) byCue.set(v.cue, [...(byCue.get(v.cue) ?? []), v]);
  const groups = [...byCue.values()].map((g) => [...g].sort(byAge));
  groups.sort((a, b) => b.length - a.length || byAge(a[0], b[0]));
  return groups[0][0];
}

export function layersToPlay(layers: readonly Layer[], roll: () => number): Layer[] {
  for (const l of layers) if (!(l.chance > 0 && l.chance <= 1)) throw new Error(`Layer ${l.cue} has chance ${l.chance}, outside (0, 1]`);
  return layers.filter((l) => roll() < l.chance);
}

export function crashEventOf(impact: number, hardSpeed: number): SoundEventId {
  if (!Number.isFinite(impact) || impact < 0) throw new Error(`Bad crash impact ${impact}`);
  return impact >= hardSpeed ? "crash-hard" : "crash-light";
}
