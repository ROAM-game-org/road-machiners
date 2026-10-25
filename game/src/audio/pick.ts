
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

export class VoiceLimiter {
  private ends = new Map<string, number[]>();

  admit(cue: string, maxVoices: number, now: number, endsAt: number): boolean {
    const live = (this.ends.get(cue) ?? []).filter((t) => t > now);
    const free = live.length < maxVoices;
    if (free) live.push(endsAt);
    this.ends.set(cue, live);
    return free;
  }
}
