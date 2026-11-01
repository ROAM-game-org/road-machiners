import { LOOP_CHECK, type CueDef } from "../data/sounds";

export function isFreeLoop(cue: CueDef): boolean {
  return cue.loop && !cue.beat;
}

export function isFreeSfxLoop(cue: CueDef): boolean {
  return isFreeLoop(cue) && cue.bus === "sfx";
}

export type LoopFault = { kind: "hole" | "flam" | "click"; atSeconds: number; amount: number };

const DB_FLOOR = 1e-9;

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

function levelsDb(samples: Float32Array, sampleRate: number): Point[] {
  const window = Math.round(LOOP_CHECK.levelWindowSeconds * sampleRate);
  const step = Math.round(LOOP_CHECK.stepSeconds * sampleRate);
  const out: Point[] = [];
  for (let start = 0; start < samples.length; start += step) {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const v = samples[(start + i) % samples.length];
      sum += v * v;
    }
    out.push({ at: start / sampleRate, value: 20 * Math.log10(Math.sqrt(sum / window) + DB_FLOOR) });
  }
  return out;
}

type Point = { at: number; value: number };

function lowRuns(points: Point[], kind: LoopFault["kind"], drop: number): LoopFault[] {
  const mid = median(points.map((p) => p.value));
  const faults: LoopFault[] = [];
  let previousLow = false;
  for (const { at, value } of points) {
    const low = mid - value > drop;
    const last = faults[faults.length - 1];
    if (low && !previousLow) faults.push({ kind, atSeconds: at, amount: value - mid });
    else if (low && value - mid < last.amount) Object.assign(last, { atSeconds: at, amount: value - mid });
    previousLow = low;
  }
  return faults;
}

function holes(samples: Float32Array, sampleRate: number): LoopFault[] {
  return lowRuns(levelsDb(samples, sampleRate), "hole", LOOP_CHECK.holeDb);
}

function envelope(samples: Float32Array, sampleRate: number): Float32Array {
  const bin = Math.round(LOOP_CHECK.envelopeSeconds * sampleRate);
  const out = new Float32Array(Math.floor(samples.length / bin));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = 0; j < bin; j++) sum += Math.abs(samples[i * bin + j]);
    out[i] = sum / bin;
  }
  return out;
}

function periodicity(env: Float32Array, start: number, width: number, lags: [number, number]): number {
  const x = new Float32Array(width);
  let mean = 0;
  for (let i = 0; i < width; i++) mean += x[i] = env[(start + i) % env.length];
  mean /= width;
  let energy = 1e-12;
  for (let i = 0; i < width; i++) energy += (x[i] -= mean) ** 2;
  let best = -1;
  for (let lag = lags[0]; lag <= lags[1]; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < width; i++) sum += x[i] * x[i + lag];
    best = Math.max(best, sum / energy);
  }
  return best;
}

function flams(samples: Float32Array, sampleRate: number): LoopFault[] {
  const env = envelope(samples, sampleRate);
  const bin = LOOP_CHECK.envelopeSeconds;
  const width = Math.round(LOOP_CHECK.pulseWindowSeconds / bin);
  const step = Math.round(LOOP_CHECK.stepSeconds / bin);
  const lags = LOOP_CHECK.pulseLagSeconds.map((s) => Math.round(s / bin)) as [number, number];
  const scores: Point[] = [];
  for (let start = 0; start < env.length; start += step) scores.push({ at: start * bin, value: periodicity(env, start, width, lags) });
  return lowRuns(scores, "flam", LOOP_CHECK.pulseDrop);
}

export function loopFaults(samples: Float32Array, sampleRate: number): LoopFault[] {
  if (samples.length < LOOP_CHECK.pulseWindowSeconds * sampleRate) throw new Error(`A loop of ${samples.length} samples is shorter than one ${LOOP_CHECK.pulseWindowSeconds} s window`);
  return [...holes(samples, sampleRate), ...flams(samples, sampleRate), ...seamFaults(samples, sampleRate)];
}

export function seamFaults(samples: Float32Array, sampleRate: number): LoopFault[] {
  const steps = new Float32Array(samples.length - 1);
  for (let i = 0; i < steps.length; i++) steps[i] = Math.abs(samples[i + 1] - samples[i]);
  const usual = steps.sort()[Math.floor(LOOP_CHECK.usualStepShare * (steps.length - 1))];
  const ratio = Math.abs(samples[0] - samples[samples.length - 1]) / usual;
  return ratio > LOOP_CHECK.seamStepRatio ? [{ kind: "click", atSeconds: samples.length / sampleRate, amount: ratio }] : [];
}

function correlation(samples: Float32Array, a: number, b: number, length: number): number {
  let ab = 0;
  let aa = 1e-12;
  let bb = 1e-12;
  for (let i = 0; i < length; i += 4) {
    const x = samples[a + i];
    const y = samples[b + i];
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return ab / Math.sqrt(aa * bb);
}

export function alignedLoopEnd(samples: Float32Array, sampleRate: number, startSample: number, endSample: number): number {
  const length = Math.round(LOOP_CHECK.crossfadeSeconds * sampleRate);
  const reach = Math.round(LOOP_CHECK.seamSearchSeconds * sampleRate);
  const first = Math.max(endSample - reach, length);
  const last = Math.min(endSample + reach, samples.length);
  if (first > last || startSample + length > samples.length) throw new Error("The seam search leaves the buffer");
  let best = endSample;
  let bestScore = -Infinity;
  for (let end = first; end <= last; end++) {
    const score = correlation(samples, end - length, startSample, length);
    if (score > bestScore) {
      bestScore = score;
      best = end;
    }
  }
  return best;
}

export function describeFaults(file: string, faults: LoopFault[]): string {
  return faults
    .map((f) => `${file}: ${f.kind} ${faultAmount(f)} at ${f.atSeconds.toFixed(2)} s`)
    .join("\n");
}

function faultAmount(f: LoopFault): string {
  if (f.kind === "hole") return `${f.amount.toFixed(1)} dB`;
  if (f.kind === "flam") return `periodicity ${f.amount.toFixed(2)}`;
  return `seam step ${f.amount.toFixed(1)} times the loop's own steps`;
}
