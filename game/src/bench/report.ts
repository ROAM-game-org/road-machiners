export type FrameStats = { median: number; p99: number; worst: number; over33: number; over100: number; frames: number };
export type PassStats = { real: FrameStats; tickCpu: FrameStats; renderCpu: FrameStats; gpu: FrameStats | null };
export type RenderPass = 'main' | 'shadow';
export type BenchSystem = 'terrain' | 'props' | 'vehicles' | 'lights' | 'effects' | 'overlays' | 'other';
export type DrawCount = { draws: number; triangles: number };
export type SlowFrames = { count: number; renderMs: number; tickRestMs: number; timers: Record<string, number>; uploadBytes: number; chunkBuilds: number; over100WithChunkBuild: number };
export type SceneReport = {
  id: 'town-day' | 'town-day-far' | 'town-night' | 'town-night-far' | 'fight' | 'drive';
  passes: PassStats[];
  frame: PassStats;
  spread: number;
  bound: 'cpu' | 'gpu' | null;
  longTasks: number;
  draws: { total: number; rendererCalls: number; byPass: Record<RenderPass, DrawCount>; bySystem: Record<BenchSystem, Record<RenderPass, DrawCount>>; other: Record<string, number> };
  slowFrames: SlowFrames;
  savings: Record<string, number> | null;
  check: { name: string; passed: boolean; detail: string };
};
export type BenchReport = {
  schema: 1;
  version: string;
  renderer: string;
  viewport: { width: number; height: number };
  pixelRatio: number;
  renderScale: number;
  gpuTimer: boolean;
  town: string;
  scenes: SceneReport[];
  turns: { waitMs: FrameStats; workerTurnMs: FrameStats; previewMs: FrameStats; steps: Record<string, { total: number; calls: number; max: number }> };
  bootMs: number;
};

export type FrameRecord = {
  real: number;
  tick: number;
  render: number;
  gpu: number | null;
  uploadBytes: number;
  chunkBuilds: number;
  timers: Record<string, number>;
};

export const SLOW_FRAME_MS = 33.3;
export const HITCH_MS = 100;

export const SYSTEMS: readonly BenchSystem[] = ['terrain', 'props', 'vehicles', 'lights', 'effects', 'overlays', 'other'];
export const PASSES: readonly RenderPass[] = ['main', 'shadow'];

function sortedSamples(samples: readonly number[]): number[] {
  if (samples.length === 0) throw new Error('Frame stats need at least one sample');
  if (samples.some((s) => !Number.isFinite(s))) throw new Error('Frame stats got a sample that is not a finite number');
  return [...samples].sort((a, b) => a - b);
}

function medianOf(sorted: readonly number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function nearestRank(sorted: readonly number[], share: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * share) - 1)];
}

export function frameStats(samples: readonly number[]): FrameStats {
  const sorted = sortedSamples(samples);
  return {
    median: medianOf(sorted),
    p99: nearestRank(sorted, 0.99),
    worst: sorted[sorted.length - 1],
    over33: sorted.filter((s) => s > SLOW_FRAME_MS).length,
    over100: sorted.filter((s) => s > HITCH_MS).length,
    frames: sorted.length,
  };
}

function gpuStats(frames: readonly FrameRecord[]): FrameStats | null {
  const times = frames.map((f) => f.gpu).filter((g): g is number => g !== null);
  if (times.length === 0) return null;
  if (times.length !== frames.length) throw new Error(`${frames.length - times.length} of ${frames.length} frames have no GPU time while the others do`);
  return frameStats(times);
}

export function passStats(frames: readonly FrameRecord[]): PassStats {
  return {
    real: frameStats(frames.map((f) => f.real)),
    tickCpu: frameStats(frames.map((f) => f.tick)),
    renderCpu: frameStats(frames.map((f) => f.render)),
    gpu: gpuStats(frames),
  };
}

export function poolFrames(passes: readonly (readonly FrameRecord[])[]): FrameRecord[] {
  return passes.flat();
}

export function spreadOf(passes: readonly PassStats[]): number {
  if (passes.length !== 2) throw new Error(`Spread needs exactly 2 passes, got ${passes.length}`);
  const [a, b] = passes.map((p) => p.real.median);
  const smaller = Math.min(a, b);
  if (!(smaller > 0)) throw new Error(`Spread needs positive medians, got ${a} and ${b}`);
  return Math.abs(a - b) / smaller;
}

export function boundOf(frame: PassStats): 'cpu' | 'gpu' | null {
  if (frame.gpu === null) return null;
  return frame.gpu.median > frame.tickCpu.median ? 'gpu' : 'cpu';
}

export function savingOf(baselineMedian: number, toggledMedian: number): number {
  return baselineMedian - toggledMedian;
}

function addTimers(into: Record<string, number>, timers: Record<string, number>): void {
  for (const [name, ms] of Object.entries(timers)) into[name] = (into[name] ?? 0) + ms;
}

export function slowFrameSums(frames: readonly FrameRecord[]): SlowFrames {
  const sums: SlowFrames = { count: 0, renderMs: 0, tickRestMs: 0, timers: {}, uploadBytes: 0, chunkBuilds: 0, over100WithChunkBuild: 0 };
  for (const f of frames.filter((x) => x.real > SLOW_FRAME_MS)) {
    sums.count++;
    sums.renderMs += f.render;
    sums.tickRestMs += f.tick - f.render;
    sums.uploadBytes += f.uploadBytes;
    sums.chunkBuilds += f.chunkBuilds;
    if (f.real > HITCH_MS && f.chunkBuilds > 0) sums.over100WithChunkBuild++;
    addTimers(sums.timers, f.timers);
  }
  return sums;
}

export function emptyDrawCount(): DrawCount {
  return { draws: 0, triangles: 0 };
}

export function emptyBySystem(): Record<BenchSystem, Record<RenderPass, DrawCount>> {
  const entries = SYSTEMS.map((s) => [s, { main: emptyDrawCount(), shadow: emptyDrawCount() }]);
  return Object.fromEntries(entries) as Record<BenchSystem, Record<RenderPass, DrawCount>>;
}

export function drawTotals(bySystem: Record<BenchSystem, Record<RenderPass, DrawCount>>): { total: number; byPass: Record<RenderPass, DrawCount> } {
  const byPass = { main: emptyDrawCount(), shadow: emptyDrawCount() };
  for (const system of SYSTEMS) {
    for (const pass of PASSES) {
      byPass[pass].draws += bySystem[system][pass].draws;
      byPass[pass].triangles += bySystem[system][pass].triangles;
    }
  }
  return { total: byPass.main.draws + byPass.shadow.draws, byPass };
}
